/** Step K one bounded production-isolated synthetic-only benchmark. No mutations. */
const base='https://ox-b92-step-k-index-stage.ox-audio-player.workers.dev';
const token=process.env.B92_STEP_K_TOKEN;
if(typeof token!=='string'||token.length<32){console.error('MISSING_STEP_K_STAGE_TOKEN');process.exit(1);}
const request=async(path,method='GET',payload)=>{
 const begun=performance.now();
 const r=await fetch(base+path,{method,redirect:'error',headers:{
 'Authorization':'Bearer '+token,'Content-Type':'application/json'},
 body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(15000)});
 const j=await r.json();if(!r.ok||j.ok!==true)throw Error('STAGING_READ_FAILED');
 return {json:j,wallMs:performance.now()-begun};
};
try{
 const health=await fetch(base+'/health',{redirect:'error',signal:AbortSignal.timeout(15000)}).then(r=>r.json());
 if(!health.ok||!health.stageOnly||!health.membershipIndexOnly||!health.publicationDisabled||health.playback!==false)
   throw Error('WRONG_STAGE_WORKER');
 const status=(await request('/v1/status')).json;
 if(status.memberRows!==1069||status.revision!==2)throw Error('STAGING_INDEX_NOT_INITIALIZED');
 const latency=[];let seen=0;
 for(let i=0;i<24;i++){
  const sample=['current','previous','missing'][i%3];
  const response=await request('/v1/benchmark','POST',{sample});
  if(response.json.sample!==sample||response.json.matched!==(sample!=='missing')||
     response.json.publicationDisabled!==true || response.json.indexedD1Queries!==1)throw Error('INDEX_REPLY_INCONSISTENT');
  seen++;latency.push(response.wallMs);
 }
 latency.sort((a,b)=>a-b);
 const percentile=(p)=>latency[Math.min(latency.length-1,Math.ceil(latency.length*p)-1)].toFixed(1);
 console.log('OX B9.2 — STEP K / LIVE SYNTHETIC INDEX BENCHMARK');
 console.log('Stage-only authorization        : PASS');
 console.log('Synthetic membership rows       : 1,069');
 console.log('Current / previous / missing    : PASS / PASS / DENIED');
 console.log('Indexed D1 membership reads     : 24');
 console.log('Worker requests                 : 26 (health + status + 24 reads)');
 console.log(`Client network latency p50/p95  : ${percentile(.5)} / ${percentile(.95)} ms`);
 console.log('Worker CPU p95/p99              : NOT MEASURED — USE CLOUDFLARE METRICS');
 console.log('Real Player sessions / decryption: NOT TESTED');
 console.log('Production/catalog changes      : NONE');
 console.log('CHECK STATUS                    : STEP K SYNTHETIC INDEX READS PASSED');
}catch{console.error('STEP K REMOTE BENCH FAILED — STOP, DO NOT AUTOMATICALLY REPEAT');process.exit(1);}
