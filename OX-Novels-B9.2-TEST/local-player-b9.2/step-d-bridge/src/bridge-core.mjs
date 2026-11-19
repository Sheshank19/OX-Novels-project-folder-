/**
 * OX B9.2 Step D — staging-only REAL scan signal bridge.
 * ONLY forwards `unchanged` / `change_quarantined` and a random event nonce.
 * Does NOT forward story IDs, file IDs, names, catalog, track counts, encryption
 * keys, Drive addresses, baseline MACs or other private content.
 * No catalog, Worker, KV, D1 pointer, or production publication is triggered.
 */

const EXPECTED_HOST='ox-b92-step-c-synthetic-stage.ox-audio-player.workers.dev';
function abort(code){throw Object.assign(new Error(code),{code});}

export function validateStageEndpoint(endpoint){
  let u;
  try {u=new URL(endpoint);}catch {abort('STAGE_URL_INVALID');}
  if(u.protocol!=='https:' || u.hostname!==EXPECTED_HOST || u.username || u.password ||
     u.port || u.pathname!=='/' || u.search || u.hash) abort('STAGE_URL_NOT_ISOLATED');
  return u;
}
export function signalFromAssessment(assessment,signalId){
  if(typeof signalId!=='string'||!/^[a-f0-9]{32}$/.test(signalId))abort('INVALID_SIGNAL_ID');
  if(!assessment||!Number.isSafeInteger(assessment.passes)||
     !Number.isSafeInteger(assessment.pages)||assessment.pages<1)
    abort('SCAN_RESULT_INVALID');
  if(assessment.status==='UNCHANGED'){
    if(assessment.passes!==1 || assessment.nodes!==undefined)abort('SCAN_RESULT_INVALID');
    return {signalId,state:'unchanged'};
  }
  if(assessment.status==='CHANGED_PREPARE_ONLY'){
    if(assessment.passes!==2 || !assessment.nodes || typeof assessment.nodes!=='object')
      abort('SCAN_RESULT_INVALID');
    // Even matching two real Drive passes are not pinned snapshot proof.
    return {signalId,state:'change_quarantined'};
  }
  abort('SCAN_RESULT_NOT_AUTHORIZED');
}
export async function bridgeScanToJournal({scan,stage,signalId}){
  if(typeof scan!=='function'||!stage || typeof stage.health!=='function'||
     typeof stage.status!=='function'||typeof stage.signal!=='function')abort('BRIDGE_CONFIG_INVALID');
  // Fail before costly real Drive scan if stage is not safely configured.
  const health=await stage.health();
  if(health?.ok!==true || health.stageOnly!==true || health.publicationDisabled!==true ||
     health.driveAccess!==false || health.playback!==false)
    abort('REMOTE_STAGE_HEALTH_UNSAFE');
  const before=await stage.status();
  if(before?.ok!==true || before.stageOnly!==true || before.signalsOnly!==true ||
     before.catalogPublicationDisabled!==true ||
     !Number.isSafeInteger(before.signalCount)||before.signalCount<0)
    abort('REMOTE_STAGE_NOT_UPGRADED');
  const assessment=await scan();
  const payload=signalFromAssessment(assessment,signalId);
  const ack=await stage.signal(payload);
  if(ack?.ok!==true||ack?.stageOnly!==true||ack?.signalsOnly!==true||
     ack?.catalogPointerUnchanged!==true||ack?.publicationDisabled!==true||
     ack?.created!==true || ack?.duplicate!==false)
    abort('REMOTE_STAGE_SIGNAL_INCONCLUSIVE');
  const after=await stage.status();
  if(after?.ok!==true || after?.stageOnly!==true || after?.signalsOnly!==true ||
     after?.catalogPublicationDisabled!==true || after.signalCount!==before.signalCount+1 ||
     after.lastSignal!==payload.state)
    abort('REMOTE_STAGE_READBACK_INCONCLUSIVE');
  return {signal:payload.state,journalCountIncreased:true,activation:false,
    publication:false,driveSnapshotPinned:false};
}

export function createRemoteStage({endpoint,token,fetchFn=fetch}){
  const base=validateStageEndpoint(endpoint);
  if(typeof token!=='string'||token.length<32||token.length>512)abort('STAGE_TOKEN_MISSING');
  async function request(route,{method='GET',body,authorized=true}={}){
    const headers={'Accept':'application/json'};
    if(authorized)headers.authorization='Bearer '+token;
    if(body)headers['Content-Type']='application/json';
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),20000);
    try {
      const response=await fetchFn(new URL(route,base).toString(),{method,headers,
        body:body?JSON.stringify(body):undefined,redirect:'error',signal:controller.signal});
      if(response.status!==200)abort('REMOTE_STAGE_REQUEST_REJECTED');
      let data;
      try {data=await response.json();}catch {abort('REMOTE_STAGE_RESPONSE_INVALID');}
      return data;
    } catch(e){
      if(e?.code)throw e;
      abort('REMOTE_STAGE_TRANSPORT_ERROR');
    } finally {clearTimeout(timeout);}
  }
  return {
    health:()=>request('/health',{authorized:false}),
    status:()=>request('/v1/sync-status'),
    signal:(value)=>request('/v1/sync-signal',{method:'POST',body:value})
  };
}
