/**
 * Local-only, PRIVATE staging catalog preparation. No Worker/KV/D1/Drive writes.
 * Requirements: staging Apps Script requestBinding=nonce-echo-v1, saved successful
 * stage-story-baseline.local.json and the existing B5 Player encryption key.
 * Output is an encrypted-token PREPARED candidate, NOT authorization to publish.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inventoryCommitments, identicalCommitments, sealedBaselineMac,
  buildProtectedCatalog, assertProtectedCatalog, validateInventory, assertPlayerKeyMatchesStatic} from './catalog-compat.mjs';

const dir=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(dir,'..','..');
const STAGE_CONFIG=path.join(dir,'resolver-stage.local.json');
const BASELINE=path.join(dir,'stage-story-baseline.local.json');
const HANDOFF_KEY=path.join(ROOT,'local-player-handoff','.env.player-handoff');
const OUTPUT_DIR=path.join(dir,'_PRIVATE_PREPARED_DO_NOT_DEPLOY');
const ID=/^[A-Za-z0-9_-]{10,}$/;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const say=(k,v)=>console.log(String(k).padEnd(30)+': '+String(v));
function fail(code){throw Object.assign(new Error(code),{code});}
const allowedErrors=new Set(['STAGE_CONFIG_NOT_FOUND','INVALID_STAGING_CONFIG','STAGING_VERSION_MISMATCH',
  'REQUEST_BUDGET','BAD_HTTP_RESPONSE','GOOGLE_CONTENT_404','TRANSPORT_FAILED','BAD_JSON',
  'STAGE_REJECTED','RESPONSE_BINDING_MISMATCH','INVALID_PAGE','INVALID_TRACK','FOLDER_MISMATCH',
  'TOO_MANY_PAGES','TOO_MANY_FOLDERS','TOO_MANY_TRACKS','NO_LOCAL_D1_STORY','AMBIGUOUS_DRIVE_ROOT',
  'SAVED_BASELINE_REQUIRED','BASELINE_UNTRUSTED_OR_OLD','SCAN_PASSES_DISAGREE','BASELINE_CONTENT_CHANGED',
  'PLAYER_KEY_MISSING','PLAYER_KEY_INVALID','STATIC_CATALOG_NOT_VERIFIED','PLAYER_KEY_DOES_NOT_MATCH_STATIC','CATALOG_COMPATIBILITY_FAILED','LOCAL_FILE_ERROR']);
function safeEndpoint(s) {
  let u;
  try {u=new URL(String(s||''));}catch {fail('INVALID_STAGING_CONFIG');}
  if(u.protocol!=='https:'||u.hostname!=='script.google.com'||
    !/^\/macros\/s\/[^/]+\/exec\/?$/.test(u.pathname)||u.search||u.hash) fail('INVALID_STAGING_CONFIG');
  return u.toString();
}
function idFromConfig(s) {
  const str=String(s || '').trim();
  const match=str.match(/(?:drive\/folders|folders)\/([A-Za-z0-9_-]{10,})/i) ||
      str.match(/[?&]id=([A-Za-z0-9_-]{10,})/i);
  const id=match?match[1]:ID.test(str)?str:'';if(!ID.test(id)) fail('INVALID_STAGING_CONFIG');return id;
}
function loadConfig(){
  if(!fs.existsSync(STAGE_CONFIG)) fail('STAGE_CONFIG_NOT_FOUND');
  let config;try{config=JSON.parse(fs.readFileSync(STAGE_CONFIG,'utf8'));}catch {fail('INVALID_STAGING_CONFIG');}
  const secret=String(config.resolverSecret||'');
  if(secret.length<32) fail('INVALID_STAGING_CONFIG');
  return {endpoint:safeEndpoint(config.resolverUrl),secret,root:idFromConfig(config.testStoryDriveUrl)};
}
function checkBaseline(secret,root,current){
  if(!fs.existsSync(BASELINE)) fail('SAVED_BASELINE_REQUIRED');
  let b;try{b=JSON.parse(fs.readFileSync(BASELINE,'utf8'));}catch {fail('BASELINE_UNTRUSTED_OR_OLD');}
  const rootMac=inventoryCommitments(secret,root,{[root]:{folders:[],tracks:[]}}).rootMac;
  if(b?.schema!==1 || b.stageVersion!=='ox-stage-readonly-v1' || b.rootMac!==rootMac ||
     !b.folders || !b.tracks || b.mac!==sealedBaselineMac(secret,b) ||
     typeof b.folderCount!=='number'||typeof b.trackCount!=='number') fail('BASELINE_UNTRUSTED_OR_OLD');
  if(!identicalCommitments(current,{folders:b.folders,tracks:b.tracks}) ||
     Object.keys(current.folders).length!==b.folderCount || Object.keys(current.tracks).length!==b.trackCount)
    fail('BASELINE_CONTENT_CHANGED');
  return b;
}
function loadKey(){
  if(!fs.existsSync(HANDOFF_KEY)) fail('PLAYER_KEY_MISSING');
  // Exact read-only interpretation used by the existing local-player-b5/scripts/build-b5.mjs.
  let key;
  try {key=Buffer.from(fs.readFileSync(HANDOFF_KEY,'utf8').trim().replace(/-/g,'+').replace(/_/g,'/'),'base64');}
  catch {fail('PLAYER_KEY_INVALID');}
  if(key?.length!==32) fail('PLAYER_KEY_INVALID');
  return key;
}
export function requestClient(endpoint,secret){
  let count=0,retries=0,content404s=0,lastRequest=0;
  const httpRetry=new Set([408,429,500,502,503,504]);
  return {
    metrics(){return {count,retries,content404s};},
    async call(payload){
      for(let attempt=1;attempt<=3;attempt++){
        if(++count>180) fail('REQUEST_BUDGET');
        const gap=1200-(Date.now()-lastRequest);if(gap>0)await sleep(gap);
        const nonce=payload?crypto.randomBytes(16).toString('hex'):null;
        const request=payload?{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({...payload,requestNonce:nonce,secret}),cache:'no-store'}:{};
        let r,body;
        try {r=await fetch(endpoint,{...request,redirect:'follow',signal:AbortSignal.timeout(45000)});
             lastRequest=Date.now();}
        catch {
          lastRequest=Date.now();
          if(attempt<3){retries++;await sleep(900*attempt);continue;}
          fail('TRANSPORT_FAILED');
        }
        let host;try{host=new URL(r.url).hostname;}catch{fail('BAD_HTTP_RESPONSE');}
        if(host!=='script.googleusercontent.com'&&host!=='script.google.com')fail('BAD_HTTP_RESPONSE');
        const content404=r.status===404 && host==='script.googleusercontent.com'&&r.redirected;
        if(content404)content404s++;
        if(r.status!==200){
          if((content404||httpRetry.has(r.status))&&attempt<3){retries++;await sleep(1800*attempt);continue;}
          fail(content404?'GOOGLE_CONTENT_404':'BAD_HTTP_RESPONSE');
        }
        try {
          const s=await r.text();if(s.length>2_000_000)fail('BAD_JSON');
          body=JSON.parse(s);
        }catch(err){if(err?.code)throw err;fail('BAD_JSON');}
        if(!body||typeof body!=='object'||Array.isArray(body))fail('BAD_JSON');
        if(body.ok!==true)fail('STAGE_REJECTED');
        if(payload&&(body.requestNonce!==nonce || body.folderId!==payload.folderId || body.pageNo!==payload.pageNo)){
          if(attempt<3){retries++;await sleep(1800*attempt);continue;}
          fail('RESPONSE_BINDING_MISMATCH');
        }
        return body;
      }
      fail('TRANSPORT_FAILED');
    }
  };
}
export async function traversePass(root,readPage){
  const nodes={}, seenIds=new Set([root]), seenTracks=new Set();
  let pages=0,childIds=[];
  const childNames=new Map();
  async function scan(id,isRoot){
    let cursor=null,done=false,allFolders=[],allTracks=[];
    for(let pageNo=0;pageNo<80;pageNo++){
      const p=await readPage({mode:'list_children_page',folderId:id,pageNo,
        ...(cursor?{cursor}:{})});
      if(!p||p.ok!==true||p.version!=='ox-stage-readonly-v1'||p.folderId!==id||p.pageNo!==pageNo||
          p.readOnly!==true||p.publishAllowed!==false||p.pinnedSnapshot!==false||p.stableSnapshot!==false||
          !Array.isArray(p.folders)||!Array.isArray(p.tracks)||p.folders.length>20||p.tracks.length>40||
          typeof p.complete!=='boolean'||p.hasMore!==!p.complete ||
          (p.complete ? p.nextCursor!==null:!p.nextCursor||typeof p.nextCursor!=='string'))fail('INVALID_PAGE');
      for(const f of p.folders){
        if(!isRoot||!ID.test(f?.id||'')||!f.name||f.type!=='folder'||seenIds.has(f.id)||seenTracks.has(f.id))fail('FOLDER_MISMATCH');
        seenIds.add(f.id);allFolders.push({id:f.id,name:String(f.name)});childIds.push(f.id);childNames.set(f.id,String(f.name));
      }
      for(const t of p.tracks){
        if(!ID.test(t?.id||'')||t.type!=='track'||!t.name||typeof t.mimeType!=='string'||
          !Number.isSafeInteger(t.size)||t.size<0||!Number.isFinite(Date.parse(t.modifiedAt))||
          seenTracks.has(t.id)||seenIds.has(t.id))fail('INVALID_TRACK');
        seenTracks.add(t.id);
        allTracks.push({id:t.id,name:String(t.name),mimeType:t.mimeType,size:t.size,modifiedAt:t.modifiedAt});
      }
      pages++;
      if(seenTracks.size>20000)fail('TOO_MANY_TRACKS');
      if(childIds.length>60)fail('TOO_MANY_FOLDERS');
      if(p.complete){done=true;break;}
      cursor=p.nextCursor;
    }
    if(!done)fail('TOO_MANY_PAGES');
    const natural=(a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'});
    nodes[id]={name:isRoot?'Story': childNames.get(id),folders:allFolders.sort(natural),tracks:allTracks.sort(natural),truncated:false};
  }
  await scan(root,true);
  for(const id of childIds)await scan(id,false);
  validateInventory(root,nodes);
  return {nodes,pages};
}
async function main(){
  say('Mode','LOCAL PREPARE ONLY — NO PUBLICATION');
  say('Drive access','READ ONLY');
  say('Cloudflare/Apps Script writes','NONE');
  const cfg=loadConfig();
  let listStories;try{({listStories}=await import('../../local-player-b5/scripts/common.mjs'));}
  catch{fail('NO_LOCAL_D1_STORY');}
  let all;try{all=listStories().filter(s=>s.folderId===cfg.root);}catch{fail('NO_LOCAL_D1_STORY');}
  if(all.length===0)fail('NO_LOCAL_D1_STORY');
  if(all.length!==1)fail('AMBIGUOUS_DRIVE_ROOT');
  const story=all[0];
  if(story.sourceVersion!==crypto.createHash('sha256').update(cfg.root).digest('hex').slice(0,12))fail('NO_LOCAL_D1_STORY');
  const key=loadKey();
  const staticName=String(story.id).replace(/[^a-z0-9._-]+/gi,'-')+'.json';
  const staticPath=path.join(ROOT,'local-player-b5','public','catalogs',staticName);
  let previousCatalog;
  try {previousCatalog=JSON.parse(fs.readFileSync(staticPath,'utf8'));}
  catch {fail('STATIC_CATALOG_NOT_VERIFIED');}
  try {assertPlayerKeyMatchesStatic(previousCatalog,key,story);}
  catch(err){fail(err?.message==='PLAYER_KEY_DOES_NOT_MATCH_STATIC'?'PLAYER_KEY_DOES_NOT_MATCH_STATIC':'STATIC_CATALOG_NOT_VERIFIED');}
  // Fast path: the original B5 private raw catalog may already contain the
  // identical metadata that the user verified in the most recent real Drive
  // audit. Compare every keyed record against the HMAC-sealed saved baseline.
  // A matching cache means ZERO new Apps Script calls for format preparation.
  let preparedNodes=null, source='NOT_VERIFIED', pagesText='0 / 0';
  let m={count:0,retries:0,content404s:0};
  const rawCache=path.join(ROOT,'local-audio-lab','cache',
    String(story.id).replace(/[^a-z0-9._-]+/gi,'-')+'-'+story.sourceVersion+'.json');
  if(fs.existsSync(rawCache)){
    let c;
    try{c=JSON.parse(fs.readFileSync(rawCache,'utf8'));}catch{}
    if(c && c.storyId===story.id && c.sourceVersion===story.sourceVersion &&
       c.rootFolderId===cfg.root && c.nodes?.[cfg.root]){
      try{
        validateInventory(cfg.root,c.nodes);
        checkBaseline(cfg.secret,cfg.root,inventoryCommitments(cfg.secret,cfg.root,c.nodes));
        preparedNodes=c.nodes;
        source='EXISTING CACHE / SAVED LIVE BASELINE MATCH';
      }catch(err){
        if(err?.code==='SAVED_BASELINE_REQUIRED'||err?.code==='BASELINE_UNTRUSTED_OR_OLD')throw err;
        // Incomplete, old, or changed cache: do not trust it. Use read-only
        // staging Drive reads and the saved baseline instead.
      }
    }
  }
  if(!preparedNodes){
    say('Cache preflight','NO EXACT MATCH — RECHECKING DRIVE');
    const client=requestClient(cfg.endpoint,cfg.secret);
    const ping=await client.call();
    if(ping.version!=='ox-stage-readonly-v1'||ping.requestBinding!=='nonce-echo-v1'||
        ping.configured!==true||ping.writesEnabled!==false||ping.pinnedSnapshot!==false)
      fail('STAGING_VERSION_MISMATCH');
    const read=payload=>client.call(payload);
    const first=await traversePass(cfg.root,read);
    say('First complete pass','VERIFIED');
    const second=await traversePass(cfg.root,read);
    first.nodes[cfg.root].name=story.title;
    second.nodes[cfg.root].name=story.title;
    const a=inventoryCommitments(cfg.secret,cfg.root,first.nodes),
          b=inventoryCommitments(cfg.secret,cfg.root,second.nodes);
    if(!identicalCommitments(a,b))fail('SCAN_PASSES_DISAGREE');
    checkBaseline(cfg.secret,cfg.root,b);
    preparedNodes=second.nodes;
    pagesText=`${first.pages} / ${second.pages}`;
    source='TWO COMPLETE STAGING DRIVE READS';
    m=client.metrics();
  }
  const gen='g_stage_'+Date.now().toString(36)+'_'+crypto.randomBytes(5).toString('hex');
  let safe;
  try {
    safe=buildProtectedCatalog({story,root:cfg.root,nodes:preparedNodes,key,generationId:gen,builtAt:new Date().toISOString()});
    assertProtectedCatalog(safe,key,{id:story.id,sourceVersion:story.sourceVersion});
  }catch{fail('CATALOG_COMPATIBILITY_FAILED');}
  const raw=JSON.stringify(safe);
  if(raw.includes(cfg.root))fail('CATALOG_COMPATIBILITY_FAILED');
  fs.mkdirSync(OUTPUT_DIR,{recursive:true,mode:0o700});
  const file=path.join(OUTPUT_DIR,`prepared-${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}.PREPARED-DO-NOT-DEPLOY.json`);
  const temp=file+'.tmp';
  try {
    fs.writeFileSync(temp,raw,{encoding:'utf8',mode:0o600,flag:'wx'});
    fs.renameSync(temp,file);
  }catch {try{fs.rmSync(temp,{force:true});}catch{} fail('LOCAL_FILE_ERROR');}
  say('Preparation source',source);
  say('Story folders incl. root',safe.folderCount);
  say('Audio tracks',safe.trackCount);
  say('Metadata pages (passes)',pagesText);
  say('Resolver requests',m.count);
  say('Temporary retries',m.retries);
  say('Google redirected 404s',m.content404s);
  say('Encrypted t1 track tokens','VALIDATED');
  say('Private saved baseline','MATCHED / UNCHANGED');
  say('Pinned Drive snapshot','NOT PROVEN');
  say('Catalog activation','DISABLED');
  say('Private candidate file','CREATED — KEEP LOCAL');
  say('CHECK STATUS','STAGING CATALOG PREPARED — NOT PUBLISHABLE');
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
console.log('\nOX B9.2 — PRIVATE ONE-STORY CATALOG PREPARATION\n');
main().catch(e=>{
  say('CHECK STATUS','INCOMPLETE / NOTHING PUBLISHED');
  say('Reason',allowedErrors.has(e?.code)?e.code:'LOCAL_VALIDATION_FAILED');
  process.exitCode=1;
});
}
