/**
 * OX B9.2 LIVE-INTEGRATION CANDIDATE: durable, READ-ONLY multi-story inventory.
 * Uses the existing Player Worker, B92_AUDIT_DB and scheduled handler; no Queue,
 * KV, new Worker, R2, or upload. Never publishes a catalog. ALL revisions of
 * page cursors and inventories remain private in D1. Cron use is opt-in.
 *
 * One cron tick handles at most 5 resolver pages, preserving CPU headroom.
 * B92_AUDIT_DB is isolated from B92_POINTER_DB until the Player is validated for promotion.
 * The first full audit is a baseline observation, NOT proof of a Drive snapshot.
 */
import {fetchDrivePage,assertPage} from './b92-audit-reader.js';
const STORY=/^[a-z0-9][a-z0-9._-]{0,159}$/;
const ROOT=/^[A-Za-z0-9_-]{10,}$/;
const SRC=/^[a-f0-9]{12}$/;
const MINUTE=60000;
const MAX_ATTEMPTS=15;
const MAX_FOLDERS=60, MAX_TRACKS=20000, MAX_PAGES=1600;
const e=code=>{throw Object.assign(new Error(code),{code});};
const raw=x=>String(x??'').trim();
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
const one=(db,sql,...args)=>q(db,sql,...args).first();
const exec=(db,sql,...args)=>q(db,sql,...args).run();
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const dateLA=d=>{
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};
function positive(n,min,max){return Number.isSafeInteger(n)&&n>=min&&n<=max;}
function stateOf(job){
  let s;try{s=JSON.parse(job.state_json);}catch{e('AUDIT_CHECKPOINT_CORRUPT');}
  if(!s||!Array.isArray(s.queue)||!Array.isArray(s.known)||s.queue.length>MAX_FOLDERS+1||s.known.length>MAX_FOLDERS+1||
     s.queue.some(x=>!ROOT.test(x?.id||'')||!positive(x.page,0,1000)||typeof x.cursor!=='string'||x.cursor.length>30000||
        (x.page===0&&x.cursor||x.page>0&&!x.cursor)||!positive(x.depth,0,12)||
        !positive(x.cursorStartedMs,0,Number.MAX_SAFE_INTEGER))||
     s.known.some(x=>!ROOT.test(x)))e('AUDIT_CHECKPOINT_CORRUPT');
  if(new Set(s.known).size!==s.known.length||s.known[0]!==job.root_id)e('AUDIT_CHECKPOINT_CORRUPT');
  return s;
}
export function validateRoster(stories){
  if(!Array.isArray(stories)||stories.length<1||stories.length>1500)e('INVALID_LIBRARY_ROSTER');
  const ids=new Set(),roots=new Set();
  return stories.map(x=>{
    if(!STORY.test(x?.id||'')||!ROOT.test(x?.folderId||'')||(x.sourceVersion!==undefined&&!SRC.test(x.sourceVersion))||
       ids.has(x.id)||roots.has(x.folderId))e('INVALID_LIBRARY_ROSTER');
    ids.add(x.id);roots.add(x.folderId);
    return {id:x.id,root:x.folderId,...(x.sourceVersion?{sourceVersion:x.sourceVersion}:{})};
  }).sort((a,b)=>a.id.localeCompare(b.id));
}
export async function fetchTrustedRoster(env,{http=fetch}={}){
  const key=raw(env.OX_PLAYER_SYNC_KEY),url='https://oxnovels.top/api/internal/player-library';
  if(key.length<32)e('OX_ROSTER_KEY_MISSING');
  // Never follow an authorization-bearing request to a different destination.
  // manual redirect yields a safe 3xx response and avoids hiding it as a fetch exception.
  const aborter=new AbortController();
  const timer=setTimeout(()=>aborter.abort(),20000);
  let r;
  try{
    r=await http(url,{headers:{Authorization:`Bearer ${key}`,Accept:'application/json'},
      redirect:'manual',signal:aborter.signal});
  }catch(error){
    // Redact URLs, Bearer headers and opaque values from Cloudflare log output.
    // Never emit request headers, shared keys, story roots, response bodies, or the env object.
    const name=String(error?.name||'Error').replace(/[^A-Za-z]/g,'').slice(0,32);
    const detail=String(error?.message||'').replace(/https?:\/\/[^\s)]+/gi,'[URL]')
      .replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]')
      .replace(/[A-Za-z0-9_-]{22,}/g,'[REDACTED]')
      .replace(/[\r\n\t]/g,' ').slice(0,140);
    const cause=String(error?.cause?.code||'').replace(/[^A-Za-z0-9_]/g,'').slice(0,32);
    console.warn('[B92_ROSTER_FETCH_DIAGNOSTIC]',JSON.stringify({name,detail,cause}));
    e('OX_ROSTER_FETCH_FAILED');
  }finally{clearTimeout(timer);}
  // Failed redirects and HTTP statuses fail closed. Never follow or forward the key.
  if(!r.ok)e(Number.isInteger(r.status)&&r.status>=100&&r.status<=599
    ? 'OX_ROSTER_HTTP_'+r.status : 'OX_ROSTER_HTTP_INVALID');
  let data;try{data=await r.json();}catch{e('OX_ROSTER_INVALID');}
  if(data?.ok!==true)e('OX_ROSTER_INVALID');
  // The OX website authenticates root/story mapping; calculate the source hash
  // only for the 32-story D1 seed chunk, not 242 times each cron tick.
  if(!Array.isArray(data.stories))e('OX_ROSTER_INVALID');
  const sources=[];
  for(const x of data.stories){
    if(!ROOT.test(x?.folderId||'') && x?.visible===false)continue;
    if(!STORY.test(x?.id||'')||!ROOT.test(x?.folderId||''))e('OX_ROSTER_INVALID');
    sources.push({id:x.id,folderId:x.folderId});
  }
  const roster=validateRoster(sources);
  const canary=raw(env.B92_AUDIT_CANARY_STORY);
  if(canary){
    if(!STORY.test(canary))e('AUDIT_CANARY_INVALID');
    const selected=roster.filter(x=>x.id===canary);
    if(selected.length!==1)e('AUDIT_CANARY_NOT_IN_ROSTER');
    return selected;
  }
  return roster;
}
async function seedCycle(env,cycle,nowMs,{getRoster=fetchTrustedRoster}={}){
  const db=env.B92_AUDIT_DB;
  let stored=await one(db,'SELECT cycle_id,roster_count FROM b92_audit_cycles WHERE cycle_id=?',cycle);
  if(!stored){
    const roster=await getRoster(env);
    // Cycle first, then resumable roster chunks; no scan until all stories exist.
    await exec(db,`INSERT OR IGNORE INTO b92_audit_cycles(cycle_id,started_ms,roster_count) VALUES(?,?,?)`,cycle,nowMs,roster.length);
    stored={cycle_id:cycle,roster_count:roster.length};
  }
  const n=(await one(db,'SELECT COUNT(*) AS n FROM b92_audit_jobs WHERE cycle_id=?',cycle)).n;
  if(n>=stored.roster_count)return {ready:true,count:n};
  const roster=await getRoster(env);
  if(roster.length!==stored.roster_count)e('ROSTER_CHANGED_DURING_SEED');
  const chunk=roster.slice(n,n+32); // stay inside low per-invocation D1 query limits
  const sources=await Promise.all(chunk.map(s=>sha(s.root)));
  const statements=chunk.map((s,i)=>{
    if(s.sourceVersion && s.sourceVersion!==sources[i].slice(0,12))e('SOURCE_VERSION_MISMATCH');
    const state={queue:[{id:s.root,page:0,cursor:'',depth:0,cursorStartedMs:0}],known:[s.root]};
    return q(db,`INSERT OR IGNORE INTO b92_audit_jobs
       (cycle_id,story_id,root_id,source_version,ordinal,updated_ms,state_json)
       VALUES(?,?,?,?,?,?,?)`,cycle,s.id,s.root,sources[i].slice(0,12),n+i,nowMs,JSON.stringify(state));
  });
  if(statements.length)await db.batch(statements);
  return {ready:n+chunk.length>=roster.length,count:n+chunk.length};
}
async function claim(db,cycle,nowMs){
  const job=await one(db,`SELECT * FROM b92_audit_jobs WHERE cycle_id=? AND status IN ('READY','WAITING','RUNNING')
    AND due_ms<=? AND lease_until_ms<=? ORDER BY ordinal LIMIT 1`,cycle,nowMs,nowMs);
  if(!job)return null;
  const lease='l_'+crypto.randomUUID().replaceAll('-','');
  const res=await exec(db,`UPDATE b92_audit_jobs SET lease=?,lease_until_ms=?,status='RUNNING',updated_ms=?
    WHERE cycle_id=? AND story_id=? AND lease_until_ms<=? AND status IN ('READY','WAITING','RUNNING')`,
    lease,nowMs+10*MINUTE,nowMs,cycle,job.story_id,nowMs);
  if(res?.meta?.changes!==1)return null;
  return {...job,lease,status:'RUNNING'};
}
async function processPage(db,job,page,nowMs){
  const s=stateOf(job),current=s.queue[0];
  if(!current||current.page>1000||job.page_count>=MAX_PAGES)e('AUDIT_PAGE_BUDGET');
  const {folderId,storyId}= {folderId:current.id,storyId:job.story_id};
  const scope={storyId,rootId:job.root_id,folderId,pageNo:current.page,cursor:current.cursor};
  const body=JSON.stringify(page),hash=await sha(body);
  if(body.length>400000)e('AUDIT_PAGE_TOO_LARGE');
  // No double counting on restart; fail closed if a page changes under the same page ID.
  const existing=await one(db,`SELECT page_hash FROM b92_audit_pages
    WHERE cycle_id=? AND story_id=? AND folder_id=? AND page_no=?`,job.cycle_id,storyId,folderId,current.page);
  if(existing&&existing.page_hash!==hash)e('AUDIT_PAGE_REPLAY_CHANGED');
  const next={queue:s.queue.map(x=>({...x})),known:[...s.known]};
  for(const child of page.folders){
    if(next.known.includes(child.id)||next.known.length>=MAX_FOLDERS+1)e('AUDIT_DUPLICATE_OR_EXCESS_FOLDER');
    next.known.push(child.id);
    if(current.depth>=12)e('AUDIT_FOLDER_DEPTH_LIMIT');
    next.queue.push({id:child.id,page:0,cursor:'',depth:current.depth+1,cursorStartedMs:0});
  }
  if(page.complete)next.queue.shift();
  else{next.queue[0].page++;next.queue[0].cursor=page.nextCursor;
    if(!next.queue[0].cursorStartedMs)next.queue[0].cursorStartedMs=nowMs;}
  const newTracks=job.track_count+page.tracks.length;
  if(newTracks>MAX_TRACKS)e('AUDIT_TRACK_BUDGET');
  // CAS by lease + exact old checkpoint, so a stale cron cannot advance state.
  const saved=await db.batch([
    q(db,`INSERT OR IGNORE INTO b92_audit_pages
       (cycle_id,story_id,folder_id,page_no,body_json,page_hash)
       VALUES(?,?,?,?,?,?)`,job.cycle_id,storyId,folderId,current.page,body,hash),
    q(db,`UPDATE b92_audit_jobs SET state_json=?,page_count=page_count+1,track_count=?,
       folder_count=?,updated_ms=? WHERE cycle_id=? AND story_id=? AND status='RUNNING'
       AND lease=? AND state_json=? AND lease_until_ms>?`,
      JSON.stringify(next),newTracks,next.known.length,nowMs,job.cycle_id,storyId,job.lease,job.state_json,nowMs)
  ]);
  if(saved[1]?.meta?.changes!==1)e('AUDIT_LEASE_OR_CHECKPOINT_LOST');
  job.state_json=JSON.stringify(next);
  job.track_count=newTracks;job.folder_count=next.known.length;job.page_count++;
  if(next.queue.length===0){
    await exec(db,`UPDATE b92_audit_jobs SET status='OBSERVED_UNPINNED',result_code='COMPLETE_NO_SNAPSHOT',
       lease='',lease_until_ms=0,updated_ms=? WHERE cycle_id=? AND story_id=? AND lease=? AND status='RUNNING'`,
      nowMs,job.cycle_id,storyId,job.lease);
    job.status='OBSERVED_UNPINNED';
  }
  return scope;
}
async function failed(db,job,code,nowMs){
  const tries=job.attempts+1;
  const exhausted=tries>=MAX_ATTEMPTS;
  const delay=Math.min(3600000,Math.round(10000*1.7**(tries-1)));
  // Continuation tokens expire after 20m. An interrupted story must restart,
  // never continue an expired cursor and silently omit files.
  const reset=code==='AUDIT_CURSOR_EXPIRED'||delay>=12*MINUTE;
  const original={queue:[{id:job.root_id,page:0,cursor:'',depth:0,cursorStartedMs:0}],known:[job.root_id]};
  const update=q(db,`UPDATE b92_audit_jobs SET attempts=?,status=?,due_ms=?,lease='',lease_until_ms=0,
    state_json=CASE WHEN ? THEN ? ELSE state_json END,
    page_count=CASE WHEN ? THEN 0 ELSE page_count END,
    track_count=CASE WHEN ? THEN 0 ELSE track_count END,
    folder_count=CASE WHEN ? THEN 0 ELSE folder_count END,
    result_code=?,updated_ms=? WHERE cycle_id=? AND story_id=? AND lease=?`,
    tries,exhausted?'FAILED':'WAITING',exhausted?0:nowMs+delay,reset?1:0,JSON.stringify(original),reset?1:0,reset?1:0,reset?1:0,
    'RETRY_OR_STALE_CURSOR',nowMs,job.cycle_id,job.story_id,job.lease);
  if (reset) {
    // Both operations are in the same D1 transaction. A crash may not keep
    // stale page evidence while restoring a fresh cursor, or the reverse.
    const result=await db.batch([update,q(db,`DELETE FROM b92_audit_pages
      WHERE cycle_id=? AND story_id=? AND EXISTS(
       SELECT 1 FROM b92_audit_jobs WHERE cycle_id=? AND story_id=? AND
       status IN ('WAITING','FAILED') AND lease='')`,
       job.cycle_id,job.story_id,job.cycle_id,job.story_id)]);
    if(result[0]?.meta?.changes!==1)e('AUDIT_RETRY_FENCE_LOST');
  } else {
    const result=await update.run();
    if(result?.meta?.changes!==1)e('AUDIT_RETRY_FENCE_LOST');
  }
  return {status:exhausted?'FAILED':'WAITING',code,attempts:tries};
}
export async function auditTick(env,{time=Date.now(),clock=Date.now,getRoster=fetchTrustedRoster,readPage=fetchDrivePage,maxPages=5}={}){
  if(raw(env?.B92_AUDIT_MODE)!=='readonly')return {status:'DISABLED'};
  if(!env?.B92_AUDIT_DB||!positive(maxPages,1,5))e('AUDIT_CONFIG_INVALID');
  const db=env.B92_AUDIT_DB,nowMs=Number(time),today='pacific-'+dateLA(new Date(nowMs));
  if(!Number.isSafeInteger(nowMs))e('AUDIT_CLOCK_INVALID');
  // Continue yesterday's unfinished cycle before creating today's: no silent
  // abandonment at Pacific midnight. Only one cycle is scanned at a time.
  const oldest=await one(db,`SELECT cycle_id FROM b92_audit_cycles WHERE status='RUNNING' ORDER BY started_ms LIMIT 1`);
  const cycle=oldest?.cycle_id||today;
  const seeded=await seedCycle(env,cycle,nowMs,{getRoster});
  if(!seeded.ready)return {status:'ROSTER_SEEDING',inserted:seeded.count};
  const job=await claim(db,cycle,nowMs);
  if(!job){
    const remaining=(await one(db,`SELECT COUNT(*) AS n FROM b92_audit_jobs
      WHERE cycle_id=? AND status NOT IN ('OBSERVED_UNPINNED','FAILED')`,cycle)).n;
    if(remaining===0){
      await exec(db,`UPDATE b92_audit_cycles SET status='COMPLETE' WHERE cycle_id=? AND status='RUNNING'`,cycle);
      return {status:'CYCLE_FINISHED',publication:false};
    }
    return {status:'WAITING_FOR_RETRY',publication:false};
  }
  try{
    for(let i=0;i<maxPages;i++){
      const s=stateOf(job),next=s.queue[0];
      if(!next)break;
      const scope={storyId:job.story_id,rootId:job.root_id,folderId:next.id,pageNo:next.page,cursor:next.cursor};
      if(next.page>0 && nowMs-next.cursorStartedMs>=18*MINUTE)e('AUDIT_CURSOR_EXPIRED');
      // Pace real Apps Script metadata reads; synthetic tests stay fast.
      if(i>0 && readPage===fetchDrivePage) await new Promise(r=>setTimeout(r,1200));
      const data=await readPage(env,scope);
      // The protocol is always verified, including test-injected transports.
      assertPage(data,scope);
      const currentNow=clock();
      if(currentNow>nowMs+9*MINUTE)e('AUDIT_LEASE_EXPIRED');
      await processPage(db,job,data,nowMs);
      if(job.status==='OBSERVED_UNPINNED')break;
    }
    if(job.status!=='OBSERVED_UNPINNED'){
      await exec(db,`UPDATE b92_audit_jobs SET status='WAITING',lease='',lease_until_ms=0,due_ms=?,updated_ms=?
        WHERE cycle_id=? AND story_id=? AND lease=? AND status='RUNNING'`,
        nowMs,nowMs,job.cycle_id,job.story_id,job.lease);
    }
    return {status:job.status==='OBSERVED_UNPINNED'?'OBSERVED_UNPINNED':'IN_PROGRESS',
      pages:job.page_count,storyCompleted:job.status==='OBSERVED_UNPINNED',publication:false};
  }catch(ex){
    // Never disclose source IDs, cursor strings, Drive URLs or exception bodies.
    return {...await failed(db,job,raw(ex?.code)||'AUDIT_ERROR',nowMs),publication:false};
  }
}
export async function runAuditCron(_controller,env){
  if(raw(env?.B92_AUDIT_MODE)!=='readonly')return;
  // Only one callback. No Queue, writes to production catalogs or Drive mutations.
  return auditTick(env);
}
export const auditCapabilities=Object.freeze({multiStory:true,durable:true,paginated:true,
  publication:false,atomicSnapshot:false,automaticUpdate:false,productionApproved:false});

/** Safe, aggregate-only status for the authenticated existing Player admin. */
export async function auditStatus(env){
  if(raw(env?.B92_AUDIT_MODE)!=='readonly'||!env?.B92_AUDIT_DB)
    return {enabled:false,publication:false};
  const db=env.B92_AUDIT_DB;
  const cycle=await one(db,'SELECT cycle_id,roster_count,status FROM b92_audit_cycles ORDER BY started_ms DESC LIMIT 1');
  if(!cycle)return {enabled:true,publication:false,cycle:'NOT_STARTED'};
  const counts=await q(db,'SELECT status,COUNT(*) AS total FROM b92_audit_jobs WHERE cycle_id=? GROUP BY status',cycle.cycle_id).all();
  return {enabled:true,publication:false,cycle:cycle.cycle_id,
    roster:cycle.roster_count,status:cycle.status,
    jobs:Object.fromEntries((counts.results||[]).map(r=>[r.status,r.total]))};
}
