/**
 * Step K: isolated Cloudflare Free D1 read benchmark for Step J indexed membership.
 * NO real users, session authentication, Drive, audio streaming, catalog upload,
 * catalog activation, or remote mutation endpoints. All data is fabricated.
 * This benchmark DOES NOT certify production authentication/streaming or p99 CPU.
 */
import {d1MembershipReader,membershipDigest} from './step-j-index-gate.mjs';
import {STORY,SOURCE,CURRENT,PREVIOUS,syntheticToken,syntheticMissingToken,
        CURRENT_COUNT,PREVIOUS_COUNT} from './synthetic-fixture.mjs';

const fixedHost='ox-b92-step-k-index-stage.ox-audio-player.workers.dev';
const json=(obj,code=200)=>new Response(JSON.stringify(obj),{
 status:code,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}
});
class Reject extends Error{constructor(msg,status){super(msg);this.status=status;}}
const reject=(msg,status=400)=>{throw new Reject(msg,status);};
function secureEqual(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}
function authenticate(req,env){
 if(typeof env.STAGE_BENCH_TOKEN!=='string'||env.STAGE_BENCH_TOKEN.length<32) reject('STAGE_NOT_CONFIGURED',503);
 if(!secureEqual(req.headers.get('authorization')||'','Bearer '+env.STAGE_BENCH_TOKEN))reject('UNAUTHORIZED',401);
 if(req.headers.has('origin'))reject('BROWSER_REQUEST_DISALLOWED',403);
}
async function run(req,env){
 const url=new URL(req.url);
 if(url.hostname!==fixedHost && url.hostname!=='localhost' && url.hostname!=='127.0.0.1')reject('WRONG_STAGE_HOST',403);
 if(url.search)reject('QUERIES_DISALLOWED');
 if(url.pathname==='/health' && req.method==='GET')return json({
  ok:true,service:'OX B9.2 Step K synthetic indexed D1 benchmark',stageOnly:true,
  membershipIndexOnly:true,publicationDisabled:true,playback:false,driveAccess:false,
  realTokensAccepted:false,realSessionVerification:false
 });
 if(env.STAGE_MODE!=='index-benchmark-only'||!env.INDEX_STAGE_DB || typeof env.INDEX_STAGE_DB.withSession!=='function')
   reject('STAGE_NOT_CONFIGURED',503);
 authenticate(req,env);
 if(url.pathname==='/v1/status' && req.method==='GET'){
   // Status is staging-only, exactly two small D1 read queries.
   const db=env.INDEX_STAGE_DB.withSession('first-primary');
   const ptr=await db.prepare('SELECT revision,current_generation,previous_generation FROM b92_j_pointers WHERE story_id=?')
      .bind(STORY).first();
   const count=await db.prepare('SELECT COUNT(*) AS n FROM b92_j_members WHERE story_id=?')
      .bind(STORY).first();
   return json({ok:true,syntheticOnly:true,initialized:Boolean(ptr),
    currentGeneration:ptr?.current_generation||null,previousGeneration:ptr?.previous_generation||null,
    revision:ptr?.revision??null,memberRows:count?.n??null,
    expectedRows:CURRENT_COUNT+PREVIOUS_COUNT,publicationDisabled:true});
 }
 if(url.pathname!=='/v1/benchmark'||req.method!=='POST')reject('NOT_FOUND',404);
 if(req.headers.get('content-length') && Number(req.headers.get('content-length'))>128)reject('REQUEST_TOO_LARGE',413);
 const raw=await req.text();if(raw.length>128)reject('REQUEST_TOO_LARGE',413);
 let body;try{body=JSON.parse(raw);}catch{reject('INVALID_BODY');}
 if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).length!==1 ||
    !['current','previous','missing'].includes(body.sample))reject('INVALID_SAMPLE');
 // Server-selected test values: no supplied tokens, story IDs, generations or D1 SQL.
 const generation=body.sample==='previous'?PREVIOUS:CURRENT;
 const token=body.sample==='missing'?syntheticMissingToken:syntheticToken(generation,0);
 const digest=await membershipDigest(token);
 const db=env.INDEX_STAGE_DB.withSession('first-primary');
 const row=await d1MembershipReader(db,{storyId:STORY,generationId:generation,
     sourceVersion:SOURCE,tokenDigest:digest,now:Date.now()});
 if(row && (row.role!==body.sample||row.revision!==2))reject('INVALID_INDEX_RESULT',503);
 if(body.sample==='missing'&&row)reject('MISSING_TOKEN_ACCEPTED',503);
 if(body.sample!=='missing'&&!row)reject('INDEX_NOT_READY',503);
 return json({ok:true,syntheticOnly:true,sample:body.sample,matched:Boolean(row),
  role:row?.role||null,indexedD1Queries:1,realTokenDecrypted:false,realSessionVerified:false,
  publicationDisabled:true,workerCpuNotProven:true});
}
export default {async fetch(req,env){
 try{return await run(req,env);}catch(e){
  if(e instanceof Reject)return json({ok:false,error:e.message},e.status);
  return json({ok:false,error:'STAGING_INDEX_ERROR'},503);
 }
}};
