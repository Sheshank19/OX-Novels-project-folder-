import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {stepECandidateGate,assertQuarantineReceipt,catalogSemantics,
  rehearseCandidate} from '../src/candidate-gate.mjs';
import {inventoryCommitments,sealedBaselineMac,buildProtectedCatalog,
  assertProtectedCatalog} from '../../staging/catalog-compat.mjs';
const root='testRootFolder_AAAAA',child='testChildFolder_BBBBB',other='testThirdFolder_DDDDD';
const secret='local-only-example-stage-secret-never-a-real-secret';
const key=crypto.randomBytes(32);
const story={id:'story-test',sourceVersion:crypto.createHash('sha256').update(root).digest('hex').slice(0,12),folderId:root};
const upd='2026-10-15T10:00:00.000Z';
const track=(id,n)=>({id,name:`Episode ${n}.mp3`,mimeType:'audio/mpeg',size:100+n,modifiedAt:upd});
const original=()=>({
  [root]:{name:'Demo',folders:[{id:child,name:'1-100'}],tracks:[],truncated:false},
  [child]:{name:'1-100',folders:[],tracks:[track('audioFile_AAAAAAAAA',1)],truncated:false}
});
function modified(){const n=original();n[child].tracks.push(track('audioFile_BBBBBBBBB',2));return n;}
function withFolder(){const n=original();n[root].folders.push({id:other,name:'101-200'});n[other]={name:'101-200',folders:[],tracks:[track('audioFile_ZZZZZZZZZ',101)],truncated:false};return n;}
function seal(nodes=original()){
  const i=inventoryCommitments(secret,root,nodes);
  const b={schema:1,stageVersion:'ox-stage-readonly-v1',rootMac:i.rootMac,
    folderCount:Object.keys(i.folders).length,trackCount:Object.keys(i.tracks).length,
    folders:i.folders,tracks:i.tracks};b.mac=sealedBaselineMac(secret,b);return b;
}
const cat=(nodes,gen)=>buildProtectedCatalog({story,root,nodes,key,
  generationId:gen,builtAt:'2026-10-15T10:00:00.000Z'});
const staticCatalog=cat(original(),'g_static_prev_001');
const scratch=()=>fs.mkdtempSync(path.join(os.tmpdir(),'b92-step-e-'));
const run=({nodes=original(),baseline=seal(),prev=staticCatalog,readPass,
  dir,now=1234567890,playerKey=key}={})=>
    stepECandidateGate({root,secret,baseline,
      readPass:readPass||(async()=>({nodes:structuredClone(nodes),pages:2})),
      story,key:playerKey,staticCatalog:prev,quarantineDir:dir,now});

test('unchanged story stops after one pass, no quarantine or promotion',async()=>{
  const d=scratch();let calls=0;
  try{const x=await run({dir:d,readPass:async()=>{calls++;return {nodes:original(),pages:2};}});
    assert.equal(x.state,'UNCHANGED');assert.equal(calls,1);assert.deepEqual(fs.readdirSync(d),[]);
  }finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('real changed two-pass inventory yields integrity-sealed PRIVATE pair',async()=>{
  const d=scratch();let calls=0;
  try{
    const x=await run({dir:d,nodes:modified(),readPass:async()=>{calls++;return {nodes:modified(),pages:2};}});
    assert.equal(calls,2);assert.equal(x.state,'QUARANTINED');assert.equal(x.prepared,true);
    assert.equal(x.receipt.publicationAllowed,false);
    assert.equal(x.receipt.pinnedSnapshotProven,false);
    assert.equal(x.receipt.hasAutomaticApproval,false);
    assert.deepEqual(x.receipt.trackChanges,{added:1,removed:0,modified:0});
    assert.equal(fs.readdirSync(d).length,2);
    const candidate=JSON.parse(fs.readFileSync(x.catalogPath,'utf8'));
    const receipt=JSON.parse(fs.readFileSync(x.receiptPath,'utf8'));
    assertQuarantineReceipt({secret,receipt,candidate,baseline:seal()});
    assert.equal(assertProtectedCatalog(candidate,key,{id:story.id,sourceVersion:story.sourceVersion}),2);
    assert.equal(fs.readFileSync(x.receiptPath,'utf8').includes('audioFile_'),false);
    assert.equal(fs.readFileSync(x.receiptPath,'utf8').includes('Episode'),false);
  }finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('added folder and episode quarantines with correct changes',async()=>{
  const d=scratch();try{
    const x=await run({nodes:withFolder(),dir:d});
    assert.equal(x.state,'QUARANTINED');
    assert.deepEqual(x.receipt.folderChanges,{added:1,removed:0,modified:0});
    assert.equal(x.receipt.folderCount,3);
  }finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('deleted audio quarantines but preserves previous Player catalog',async()=>{
  const d=scratch();try{
    const before=modified(),prev=cat(before,'g_static_prev_002');
    const x=await run({dir:d,baseline:seal(before),prev,nodes:original()});
    assert.equal(x.state,'QUARANTINED');
    assert.deepEqual(x.receipt.trackChanges,{added:0,removed:1,modified:0});
    assert.equal(prev.trackCount,2);
  }finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('generation-only difference does not prepare another catalog',async()=>{
  const d=scratch();try{
    const x=await run({dir:d,baseline:seal(modified()),prev:cat(original(),'g_other_gen_001'),nodes:original()});
    // Updated baseline contains an episode that older static catalog did not;
    // Drive now matches static again: no unnecessary new generation.
    assert.equal(x.state,'SAME_AS_STATIC');assert.deepEqual(fs.readdirSync(d),[]);
  }finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('new generation alone has identical semantic digest',()=>{
  assert.equal(catalogSemantics(staticCatalog,key),catalogSemantics(cat(original(),'g_different_002'),key));
  assert.notEqual(catalogSemantics(staticCatalog,key),catalogSemantics(cat(modified(),'g_different_002'),key));
});
test('two disagreeing Drive scans fail closed and create zero output',async()=>{
  const d=scratch();let call=0;
  try{
    await assert.rejects(run({dir:d,readPass:async()=>({nodes:++call===1?modified():original(),pages:2})}),e=>e.code==='SCAN_PASSES_DISAGREE');
    assert.deepEqual(fs.readdirSync(d),[]);
  }finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('second-pass network failure leaves zero candidate files',async()=>{
  const d=scratch();let call=0;
  try{
    await assert.rejects(run({dir:d,readPass:async()=>{if(++call===2)throw Error('mock Google 404');return {nodes:modified(),pages:2};}}),/mock Google 404/);
    assert.deepEqual(fs.readdirSync(d),[]);
  }finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('wrong Player key fails before any Drive reads',async()=>{
  const d=scratch();let reads=0;
  try{
    await assert.rejects(run({dir:d,playerKey:crypto.randomBytes(32),readPass:async()=>{reads++;return {nodes:modified(),pages:2};}}),e=>e.code==='STATIC_OR_PLAYER_KEY_INVALID');
    assert.equal(reads,0);assert.deepEqual(fs.readdirSync(d),[]);
  }finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('private receipt rejects tampering with protected blob and seal',async()=>{
  const d=scratch();try{
    const x=await run({dir:d,nodes:modified()});
    assert.throws(()=>assertQuarantineReceipt({secret,receipt:{...x.receipt,trackCount:999},candidate:x.candidate,baseline:seal()}),e=>e.code==='RECEIPT_INTEGRITY_FAILED');
    assert.throws(()=>assertQuarantineReceipt({secret,receipt:x.receipt,candidate:{...x.candidate,trackCount:999},baseline:seal()}),e=>e.code==='RECEIPT_INTEGRITY_FAILED');
    assert.throws(()=>assertQuarantineReceipt({secret,receipt:x.receipt,candidate:x.candidate,baseline:seal(modified())}),e=>e.code==='RECEIPT_INTEGRITY_FAILED');
  }finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('rehearsal promotes and rolls back real protected in-memory candidate',async()=>{
  assert.equal(await rehearseCandidate({candidate:cat(modified(),'g_candidate_001'),staticCatalog,key}),true);
});
test('rejects invalid changed catalog without storing',async()=>{
  const d=scratch();const bad=modified();bad[child].tracks.push({...bad[child].tracks[0]});
  try{
    await assert.rejects(run({dir:d,nodes:bad}));assert.deepEqual(fs.readdirSync(d),[]);
  }finally{fs.rmSync(d,{recursive:true,force:true});}
});
