/**
 * AFTER explicit deployment approval only. Stage synthetic-fixture checks.
 * Requires B92_STEP_C_URL and B92_STEP_C_TOKEN as local process environment vars.
 * Never prints URL/token/response body; no access to production. One-time only.
 */
const endpoint=process.env.B92_STEP_C_URL;
const token=process.env.B92_STEP_C_TOKEN;
function abort(category){throw Object.assign(new Error(category),{code:category});}
if(!endpoint||!token||token.length<32)abort('STAGE_ENV_MISSING');
let base;
try{base=new URL(endpoint);}catch{abort('STAGE_URL_INVALID');}
if(base.protocol!=='https:'||base.pathname!=='/'||base.search||base.hash||
  !base.hostname.endsWith('.workers.dev')||!base.hostname.startsWith('ox-b92-step-c-synthetic-stage.'))
  abort('STAGE_WORKER_HOST_MISMATCH');
let count=0;
async function request(path,method='GET',data=null){
  const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),20000);
  try{
    const headers={Authorization:'Bearer '+token};
    if(data!==null)headers['Content-Type']='application/json';
    const resp=await fetch(new URL(path,base),{method,headers,body:data===null?undefined:JSON.stringify(data),signal:ctrl.signal});
    count++;let obj;try{obj=await resp.json();}catch{abort('BAD_STAGE_JSON');}
    if(!resp.ok||!obj?.ok)abort('REMOTE_STAGE_REJECTED_'+path.replaceAll('/','_'));
    return obj;
  }finally{clearTimeout(timeout);}
}
(async()=>{
  const health=await request('/health');
  if(!health.stageOnly||!health.publicationDisabled||health.playback!==false)abort('NOT_SAFE_STAGE');
  const before=await request('/v1/status');
  if(before.initialized)abort('STAGE_ALREADY_USED_START_WITH_FRESH_DB');
  const boot=await request('/v1/bootstrap','POST',{});
  if(!boot.created||boot.state.revision!==0)abort('BOOTSTRAP_FAILED');
  const prep=await request('/v1/prepare','POST',{});
  if(!prep.prepared)abort('PREPARE_FAILED');
  const promoted=await request('/v1/promote','POST',{expectedRevision:0});
  if(promoted.state.revision!==1||promoted.state.acceptedGenerations.length!==2)abort('PROMOTE_FAILED');
  const integrity=await request('/v1/integrity');
  if(integrity.verified!=='CURRENT_AND_PREVIOUS_SYNTHETIC_BLOBS')abort('INTEGRITY_FAILED');
  const rolled=await request('/v1/rollback','POST',{expectedRevision:1});
  if(rolled.state.revision!==2||rolled.state.currentGeneration!=='g_b92_seed_00001')abort('ROLLBACK_FAILED');
  const after=await request('/v1/status');
  if(after.state.revision!==2)abort('FINAL_STATE_FAILED');
  console.log('OX B9.2 - STEP C SYNTHETIC CLOUDFLARE STAGING RESULTS');
  console.log('Bootstrap / versioned KV   : PASS');
  console.log('D1 pointer promotion CAS   : PASS (sequential single-writer scenario)');
  console.log('Previous generation logic  : PASS (control-plane only)');
  console.log('KV blob digest validation   : PASS (same-region observations only)');
  console.log('D1 guarded rollback        : PASS');
  console.log('Stage Worker requests      : '+count);
  console.log('CF Worker CPU / global KV  : NOT PROVEN; inspect Cloudflare analytics');
  console.log('Production Player changes  : NONE');
  console.log('CHECK STATUS               : STEP C SYNTHETIC REMOTE SMOKE PASSED');
})().catch(e=>{console.error('CHECK STATUS: STAGING INCOMPLETE');console.error('Safe reason: '+(e.code||'NETWORK_OR_REMOTE_ERROR'));process.exitCode=1;});
