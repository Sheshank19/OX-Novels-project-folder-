import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {stepECandidateGate,assertQuarantineReceipt,catalogSemantics} from '../../step-e-quarantine/src/candidate-gate.mjs';
import {inventoryCommitments,sealedBaselineMac,buildProtectedCatalog,assertProtectedCatalog} from '../../staging/catalog-compat.mjs';
import {createManifest,assembleAndVerify} from '../src/vault-core.mjs';
const root='root_test_BBBBBBBBBBBB',child='folder_test_CCCCCCCC';
const secret='fixture-secret-is-not-production-use-for-test-1234';
const key=crypto.randomBytes(32);
const story={id:'story-test',folderId:root,sourceVersion:crypto.createHash('sha256').update(root).digest('hex').slice(0,12)};
const track=(id,i)=>({id,name:'Episode '+i+'.mp3',mimeType:'audio/mpeg',size:i+100,modifiedAt:'2026-10-15T12:00:00.000Z'});
const inventory=added=>({
 [root]:{name:'Root',folders:[{id:child,name:'Episodes'}],tracks:[],truncated:false},
 [child]:{name:'Episodes',folders:[],tracks:[track('file_AAAAAAAAAA',1),...(added?[track('file_BBBBBBBBBB',2)]:[])],truncated:false}
});
function baseline(nodes){
 const c=inventoryCommitments(secret,root,nodes);
 const b={schema:1,stageVersion:'ox-stage-readonly-v1',rootMac:c.rootMac,
   folderCount:Object.keys(c.folders).length,trackCount:Object.keys(c.tracks).length,
   folders:c.folders,tracks:c.tracks};b.mac=sealedBaselineMac(secret,b);return b;
}
const initial=buildProtectedCatalog({story,root,nodes:inventory(false),key,generationId:'g_static_test_0001',builtAt:'2026-10-15T12:00:00Z'});
function tmp(){return fs.mkdtempSync(path.join(os.tmpdir(),'b92-g-receipt-'));}
async function gate(directory,modified){return stepECandidateGate({root,secret,
 baseline:baseline(inventory(false)),readPass:async()=>({nodes:inventory(modified),pages:1}),
 story,key,staticCatalog:initial,quarantineDir:directory});}
test('unchanged story supplies no upload-capable Step E receipt',async()=>{
 const folder=tmp();try{const x=await gate(folder,false);assert.equal(x.prepared,false);
   assert.equal(fs.readdirSync(folder).length,0);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('changed Step E pair produces exact quarantined manifest and local reconstruction',async()=>{
 const folder=tmp();try{
  const x=await gate(folder,true);assert.equal(x.prepared,true);
  const candidateBytes=fs.readFileSync(x.catalogPath);
  const receiptBytes=fs.readFileSync(x.receiptPath);
  const candidate=JSON.parse(candidateBytes),receipt=JSON.parse(receiptBytes);
  const b=baseline(inventory(false));
  assertQuarantineReceipt({secret,receipt,candidate,baseline:b});
  assert.equal(assertProtectedCatalog(candidate,key,{id:story.id,sourceVersion:story.sourceVersion}),2);
  assert.notEqual(catalogSemantics(candidate,key),catalogSemantics(initial,key));
  assert.equal(receipt.previousCatalogDigest,crypto.createHash('sha256').update(JSON.stringify(initial)).digest('hex'));
  const {manifest,parts}=await createManifest({candidateBytes,receiptBytes,
    previousBytes:Buffer.from(JSON.stringify(initial)),trackCount:candidate.trackCount,folderCount:candidate.folderCount});
  assert.deepEqual(await assembleAndVerify(manifest,parts),new Uint8Array(candidateBytes));
  assert.equal(manifest.publicationAllowed,false);
  assert.equal(manifest.pinnedSnapshotProven,false);
  assert.ok(!JSON.stringify(manifest).includes('Episode'));
  assert.ok(!JSON.stringify(manifest).includes('file_BBBBB'));
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('changed receipt integrity violation stops before any transport manifest',async()=>{
 const folder=tmp();try{const x=await gate(folder,true);
  const bad={...x.receipt,publicationAllowed:true};
  assert.throws(()=>assertQuarantineReceipt({secret,receipt:bad,candidate:x.candidate,
    baseline:baseline(inventory(false))}),/RECEIPT_INTEGRITY_FAILED/);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
