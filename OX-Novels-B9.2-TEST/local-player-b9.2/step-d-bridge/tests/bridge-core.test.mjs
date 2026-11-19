import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bridgeScanToJournal,createRemoteStage,validateStageEndpoint,signalFromAssessment} from '../src/bridge-core.mjs';
const id='c'.repeat(32);
const stageUrl='https://ox-b92-step-c-synthetic-stage.ox-audio-player.workers.dev/';
const token='s'.repeat(50);
const unchanged={status:'UNCHANGED',passes:1,pages:17,folders:7,tracks:534};
const changed={status:'CHANGED_PREPARE_ONLY',passes:2,pages:34,folders:8,tracks:535,
  nodes:{'PRIVATE_DRIVE_IDENTIFIER':{tracks:[],folders:[]}}};
function client(){
  let rows=0,last=null;let record=null;
  return {get record(){return record;},health:async()=>({ok:true,stageOnly:true,publicationDisabled:true,driveAccess:false,playback:false}),
    status:async()=>({ok:true,stageOnly:true,signalsOnly:true,catalogPublicationDisabled:true,signalCount:rows,lastSignal:last}),
    signal:async v=>{record=v;rows++;last=v.state;return {ok:true,stageOnly:true,signalsOnly:true,catalogPointerUnchanged:true,publicationDisabled:true,created:true,duplicate:false};}};
}
test('staging endpoint cannot target production, foreign hosts, or include query',()=>{
  assert.equal(validateStageEndpoint(stageUrl).hostname,'ox-b92-step-c-synthetic-stage.ox-audio-player.workers.dev');
  for(const url of ['http://'+stageUrl.slice(8),'https://listen.ox-audio-player.workers.dev/',
    stageUrl+'?story=private','https://evil.example/','https://'+stageUrl.slice(8)+'@evil.example/',stageUrl+'admin'])
    assert.throws(()=>validateStageEndpoint(url));
});
test('only two whitelist scan states translate, with 32-hex random marker',()=>{
  assert.deepEqual(signalFromAssessment(unchanged,id),{signalId:id,state:'unchanged'});
  assert.deepEqual(signalFromAssessment(changed,id),{signalId:id,state:'change_quarantined'});
  assert.throws(()=>signalFromAssessment({...changed,passes:1},id));
  assert.throws(()=>signalFromAssessment({...unchanged,passes:2},id));
  assert.throws(()=>signalFromAssessment({...unchanged,status:'FAILED'},id));
  assert.throws(()=>signalFromAssessment(changed,'not-hex'));
});
test('unchanged REAL reader signal sends no story data or catalog content',async()=>{
  const stage=client();const r=await bridgeScanToJournal({scan:async()=>unchanged,stage,signalId:id});
  assert.equal(r.signal,'unchanged');assert.deepEqual(stage.record,{signalId:id,state:'unchanged'});
  assert.equal(r.publication,false);assert.equal(r.driveSnapshotPinned,false);
});
test('changed twice-verified reading is journaled as quarantined, never promoted',async()=>{
  const stage=client();const r=await bridgeScanToJournal({scan:async()=>changed,stage,signalId:id});
  assert.equal(r.signal,'change_quarantined');assert.equal(r.activation,false);
  assert.deepEqual(Object.keys(stage.record),['signalId','state']);
  assert.ok(!JSON.stringify(stage.record).includes('PRIVATE_DRIVE_IDENTIFIER'));
});
test('wrong staging server fails before expensive Drive scan',async()=>{
  const s=client();s.health=async()=>({ok:true,publicationDisabled:false});let n=0;
  await assert.rejects(()=>bridgeScanToJournal({scan:async()=>{n++;return unchanged;},stage:s,signalId:id}));
  assert.equal(n,0);
});
test('old worker missing new capabilities fails before Drive scan',async()=>{
  const s=client();s.status=async()=>({ok:false});let n=0;
  await assert.rejects(()=>bridgeScanToJournal({scan:async()=>{n++;return unchanged;},stage:s,signalId:id}));
  assert.equal(n,0);
});
test('failed/inconsistent scan sends no journal signal',async()=>{
  const s=client();let touched=0;
  s.signal=async()=>{touched++;throw Error('should-not-send');};
  await assert.rejects(()=>bridgeScanToJournal({scan:async()=>{throw Error('FOLDER_ID_MISMATCH');},stage:s,signalId:id}));
  assert.equal(touched,0);
});
test('staging acknowledgement must promise no pointer update',async()=>{
  const s=client();s.signal=async()=>({ok:true,created:true,publicationDisabled:true});
  await assert.rejects(()=>bridgeScanToJournal({scan:async()=>unchanged,stage:s,signalId:id}));
});
test('HTTP adapter refuses unauthorized URLs and never follows redirects',async()=>{
  assert.throws(()=>createRemoteStage({endpoint:'https://listen.ox-audio-player.workers.dev/',token}));
  const calls=[];const fetchFn=async (url,opts)=>{
    calls.push({url,method:opts.method,redirect:opts.redirect,headers:Object.keys(opts.headers)});
    return {status:200,json:async()=>({ok:true})};
  };
  const remote=createRemoteStage({endpoint:stageUrl,token,fetchFn});
  await remote.health();await remote.signal({signalId:id,state:'unchanged'});
  assert.equal(calls.length,2);assert.equal(calls[0].redirect,'error');
  assert.ok(!calls[0].headers.includes('authorization'));
  assert.ok(calls[1].headers.includes('authorization'));
  assert.ok(!calls.some(x=>x.url.includes(token)));
});
