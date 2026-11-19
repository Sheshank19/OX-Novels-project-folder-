import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {assessSingleStory, trustedBaseline, preparePrivateCandidate} from '../staging/sync-one-story-local.mjs';
import {inventoryCommitments,sealedBaselineMac,buildProtectedCatalog,
  assertProtectedCatalog} from '../staging/catalog-compat.mjs';
const root='testRootFolder_AAAAA',child='testChildFolder_BBBBB';
const story={id:'fictional-story',sourceVersion:crypto.createHash('sha256').update(root).digest('hex').slice(0,12),folderId:root};
const file1='testAudioFile_CCCCC';
const file2='testAudioFile_DDDDD';
const secret='fake-stage-secret-do-not-use-in-real-deploy-0123456789';
const key=crypto.randomBytes(32);
const updated='2026-10-15T10:00:00.000Z';
const node=({second=false,rename=false}={})=>({
  [root]:{name:'Demo',folders:[{id:child,name:'01-100'}],tracks:[],truncated:false},
  [child]:{name:'01-100',folders:[],tracks:[{id:file1,name:'Episode 1.mp3',mimeType:'audio/mpeg',size:100,modifiedAt:updated},
    ...(second?[{id:file2,name:rename?'Episode 3.mp3':'Episode 2.mp3',mimeType:'audio/mpeg',size:200,modifiedAt:updated}]:[])],truncated:false}
});
const original=node();
const seal=(nodes=original)=>{const i=inventoryCommitments(secret,root,nodes);const b={schema:1,stageVersion:'ox-stage-readonly-v1',rootMac:i.rootMac,folderCount:Object.keys(i.folders).length,trackCount:Object.keys(i.tracks).length,folders:i.folders,tracks:i.tracks};b.mac=sealedBaselineMac(secret,b);return b;};
const read=(nodes,pages=2)=>({nodes:structuredClone(nodes),pages});
test('unchanged first pass avoids second scan and candidate',async()=>{
  let calls=0;const r=await assessSingleStory({root,secret,baseline:seal(),readPass:async()=>{calls++;return read(original);}});
  assert.equal(r.status,'UNCHANGED');assert.equal(calls,1);assert.equal(r.passes,1);assert.equal(r.tracks,1);
});
test('new episode forces two matching passes',async()=>{
  let calls=0;const r=await assessSingleStory({root,secret,baseline:seal(),readPass:async()=>{calls++;return read(node({second:true}));}});
  assert.equal(r.status,'CHANGED_PREPARE_ONLY');assert.equal(calls,2);
  assert.deepEqual(r.diffTracks,{added:1,removed:0,modified:0});assert.equal(r.tracks,2);
});
test('new direct child folder and track are detected together',async()=>{
  const modified=node();
  const addedFolder='newChildFolder_EEEEE';
  modified[root].folders.push({id:addedFolder,name:'101-200'});
  modified[addedFolder]={name:'101-200',folders:[],tracks:[
    {id:'newTrackFile_FFFFFFF',name:'Episode 101.mp3',mimeType:'audio/mpeg',size:105,modifiedAt:updated}],truncated:false};
  const r=await assessSingleStory({root,secret,baseline:seal(),readPass:async()=>read(modified)});
  assert.deepEqual(r.diffFolders,{added:1,removed:0,modified:0});
  assert.deepEqual(r.diffTracks,{added:1,removed:0,modified:0});
  assert.equal(r.folders,3);
});
test('deleted episode is detected and double-checked',async()=>{
  const r=await assessSingleStory({root,secret,baseline:seal(node({second:true})),readPass:async()=>read(original)});
  assert.deepEqual(r.diffTracks,{added:0,removed:1,modified:0});
});
test('metadata rename is detected as modified, not new',async()=>{
  const r=await assessSingleStory({root,secret,baseline:seal(node({second:true})),readPass:async()=>read(node({second:true,rename:true}))});
  assert.deepEqual(r.diffTracks,{added:0,removed:0,modified:1});
});
test('different first and second reads fail closed',async()=>{
  let i=0;
  await assert.rejects(assessSingleStory({root,secret,baseline:seal(),readPass:async()=>read(++i===1?node({second:true}):original)}),e=>e.code==='SCAN_PASSES_DISAGREE');
});
test('network failure on second pass aborts',async()=>{
  let i=0;
  await assert.rejects(assessSingleStory({root,secret,baseline:seal(),readPass:async()=>{if(++i===2)throw Error('mock network 404');return read(node({second:true}));}}),/mock network 404/);
});
test('invalid folder scope is rejected',async()=>{
  const bad=node();bad[child].folders.push({id:'nestedChildFolder_AAAAA',name:'nested'});
  await assert.rejects(assessSingleStory({root,secret,baseline:seal(),readPass:async()=>read(bad)}));
});
test('audit baseline MAC must match before any scan',async()=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'b92-audit-'));
  try {
    const f=path.join(d,'baseline.local.json');const b=seal();
    fs.writeFileSync(f,JSON.stringify(b));assert.deepEqual(trustedBaseline(secret,root,f),b);
    b.trackCount=23;fs.writeFileSync(f,JSON.stringify(b));
    assert.throws(()=>trustedBaseline(secret,root,f),e=>e.code==='SAVED_BASELINE_INVALID');
  } finally {fs.rmSync(d,{recursive:true,force:true});}
});
test('private candidate encrypts new metadata; no raw Drive IDs',()=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'b92-prepared-'));
  try {
    const previousCatalog=buildProtectedCatalog({story,root,nodes:original,key,generationId:'g_test_previous',builtAt:updated});
    const r=preparePrivateCandidate({story,root,nodes:node({second:true}),key,previousCatalog,outputDir:d});
    assert.equal(r.trackCount,2);
    const names=fs.readdirSync(d);assert.equal(names.length,1);
    const bytes=fs.readFileSync(path.join(d,names[0]),'utf8');
    assert.ok(!bytes.includes(file1)&&!bytes.includes(file2)&&!bytes.includes(root)&&!bytes.includes(child));
    const c=JSON.parse(bytes);assert.equal(assertProtectedCatalog(c,key,{id:story.id,sourceVersion:story.sourceVersion}),2);
  } finally {fs.rmSync(d,{recursive:true,force:true});}
});
test('wrong Player encryption key causes no private candidate',()=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'b92-prepared-'));
  try {
    const previousCatalog=buildProtectedCatalog({story,root,nodes:original,key,generationId:'g_test_previous',builtAt:updated});
    assert.throws(()=>preparePrivateCandidate({story,root,nodes:original,key:crypto.randomBytes(32),previousCatalog,outputDir:d}),e=>e.code==='STATIC_CATALOG_INVALID');
    assert.deepEqual(fs.readdirSync(d),[]);
  }finally{fs.rmSync(d,{recursive:true,force:true});}
});
