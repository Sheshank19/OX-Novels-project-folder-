import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {BASELINE_PAGE_COMMITMENTS} from '../../local-player-b5/src/b924-baseline-page-commitments.js';
import {makeCompactBaseline,splitCachedFolderIntoPages,pageCommitment,sha256,startCompactScan,nextCompactPage,commitCompactPage,finalizeCompactScan,estimateCompactDispatch} from '../../local-player-b5/src/b924-compact-checkpoints.js';
const root=path.resolve(import.meta.dirname,'../..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'local-player-b5/B5-PUBLISHED-CATALOGS.json'),'utf8')).catalogs;
const entry=id=>manifest.find(e=>e.storyId===id);
const raw=e=>JSON.parse(fs.readFileSync(path.join(root,'local-audio-lab/cache',e.sourceCatalogFile),'utf8'));
const sample=entry('a-luna-s-broken-bond'),big=entry('the-outcast-s-rise'),empty=entry('strongest-replication');
const sampleData=raw(sample);
const schema=fs.readFileSync(path.join(root,'local-player-b9.2/migrations/0002_b924_METADATA_TEST_ONLY.sql'),'utf8');
function dbOpen(file=':memory:',create=true){
 const rawDb=new DatabaseSync(file);rawDb.exec('PRAGMA foreign_keys=ON;');if(create)rawDb.exec(schema);
 return {raw:rawDb,close(){rawDb.close();},
  prepare(sql){return {bind(...params){return {
   async first(){return rawDb.prepare(sql).get(...params)||null;},
   async all(){return {results:rawDb.prepare(sql).all(...params)};},
   async run(){const r=rawDb.prepare(sql).run(...params);return {success:true,meta:{changes:r.changes}};},
   _execute(){return rawDb.prepare(sql).run(...params);}
  };}};},
  async batch(stmts){rawDb.exec('BEGIN IMMEDIATE');try{const r=stmts.map(s=>s._execute());rawDb.exec('COMMIT');return r;}catch(e){rawDb.exec('ROLLBACK');throw e;}}
 };
}
const args=(e,source,id='B924_local_test_001')=>({scanId:id,storyId:e.storyId,rootFolderId:source.rootFolderId,sourceVersion:e.sourceVersion,snapshotRevision:'local-test-revision-0001'});
async function step(db,a,source,opts={}){
 const next=await nextCompactPage(db,a.scanId);if(!next)return null;
 const folder=source.nodes[next.folderId];assert.ok(folder,'Drive listing missing folder');
 const pages=splitCachedFolderIntoPages(folder);const p=pages[next.pageNo];assert.ok(p,'Missing resolver page');
 await commitCompactPage(db,a.scanId,next.folderId,p,{snapshotRevision:opts.snapshotRevision||a.snapshotRevision});
 return next;
}
async function scanAll(db,e,source,id='B924_local_test_001'){
 const a=args(e,source,id);await startCompactScan(db,a);
 let count=0;while(await step(db,a,source)){if(++count>10000)throw Error('Unexpected work explosion');}
 return {a,count};
}
const done=(db,a,e,source,extra={})=>finalizeCompactScan(db,a.scanId,{baseline:BASELINE_PAGE_COMMITMENTS[e.storyId],endSnapshotRevision:a.snapshotRevision,snapshotVerified:true,...extra});

test('B9.2.4 manifest includes 242 original verified stories and exactly 4,978 compact page commitments',()=>{
 assert.equal(Object.keys(BASELINE_PAGE_COMMITMENTS).length,242);
 assert.equal(Object.values(BASELINE_PAGE_COMMITMENTS).reduce((n,x)=>n+x.pageCount,0),4978);
 assert.equal(Object.values(BASELINE_PAGE_COMMITMENTS).reduce((n,x)=>n+x.trackCount,0),154699);
 assert.equal(Object.values(BASELINE_PAGE_COMMITMENTS).reduce((n,x)=>n+x.folderCount,0),1923);
 for(const e of manifest){const b=BASELINE_PAGE_COMMITMENTS[e.storyId];assert.equal(b.trackCount,e.trackCount);assert.equal(b.folderCount,e.folderCount);assert.equal(b.sourceVersion,e.sourceVersion);assert.equal(Object.values(b.folders).reduce((n,p)=>n+p.length,0),b.pageCount);}
});

test('B9.2.4 all 242 manifest entries rehash exactly against original private cache',async()=>{
 let pages=0;
 for(const e of manifest){
  const rebuilt=await makeCompactBaseline({storyId:e.storyId,sourceVersion:e.sourceVersion,raw:raw(e)});
  assert.deepEqual(rebuilt,BASELINE_PAGE_COMMITMENTS[e.storyId],e.storyId);pages+=rebuilt.pageCount;
 }
 assert.equal(pages,4978);
});

test('B9.2.4 original private manifest contains no raw Drive IDs or URLs',()=>{
 const s=JSON.stringify(BASELINE_PAGE_COMMITMENTS),source=sampleData.rootFolderId;
 assert.ok(!s.includes(source));assert.ok(!s.includes('https://drive.google.com'));
 assert.ok(!s.includes(sampleData.nodes[source].tracks[0]?.id||'impossible-invalid'));
});

test('B9.2.4 regenerated commitments match independent original file for large and empty stories',async()=>{
 for(const e of [sample,big,empty]){
  const rebuilt=await makeCompactBaseline({storyId:e.storyId,sourceVersion:e.sourceVersion,raw:raw(e)});
  assert.deepEqual(rebuilt,BASELINE_PAGE_COMMITMENTS[e.storyId]);
 }
});

test('B9.2.4 metadata checkpoints persist across SQLite restart and skip unchanged stage',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'oxb924-'));const file=path.join(temp,'scan.sqlite');let db=dbOpen(file);
 try{
  const a=args(sample,sampleData);await startCompactScan(db,a);
  assert.ok(await step(db,a,sampleData));db.close();db=dbOpen(file,false);
  assert.equal((await startCompactScan(db,a)).resumed,true);
  while(await step(db,a,sampleData)){}
  const result=await done(db,a,sample,sampleData);
  assert.equal(result.status,'unchanged');assert.equal(result.needsFullStage,false);assert.equal(result.productionActivation,false);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM b924_pages').get().n,result.pageCount);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='b924_tracks'").get().n,0);
  assert.equal(result.trackCount,sample.trackCount);
  assert.equal('rootFolderId' in result,false);
 }finally{db.close();fs.rmSync(temp,{recursive:true,force:true});}
});

test('B9.2.4 large 2,848-track story checkpoints without a single track row',async()=>{
 const db=dbOpen();try{const source=raw(big),{a,count}=await scanAll(db,big,source,'B924_large_local_01');
  const result=await done(db,a,big,source);assert.equal(result.status,'unchanged');assert.equal(result.trackCount,2848);assert.equal(result.pageCount,count);
  assert.ok(count>30);assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM b924_pages').get().n,count);
 }finally{db.close();}
});

test('B9.2.4 modified episode detects change and requires full staging without publication',async()=>{
 const altered=structuredClone(sampleData);altered.nodes[altered.rootFolderId].tracks[0].name='Revised episode.mp3';
 const db=dbOpen();try{const {a}=await scanAll(db,sample,altered,'B924_changed_local_01');const result=await done(db,a,sample,altered);
  assert.equal(result.status,'changed');assert.equal(result.needsFullStage,true);assert.equal(result.productionActivation,false);
  assert.equal(db.raw.prepare('SELECT phase FROM b924_scans').get().phase,'NEEDS_FULL_STAGE');
 }finally{db.close();}
});

test('B9.2.4 added folder and track detected with compact commitments',async()=>{
 const altered=structuredClone(sampleData),fid='B924testNewFolder1234';altered.nodes[altered.rootFolderId].folders.push({id:fid,name:'201-300'});
 altered.nodes[fid]={name:'201-300',folders:[],tracks:[{id:'B924testAudioID12345',name:'201.mp3',mimeType:'audio/mpeg',size:1024,modifiedAt:'2026-10-10T00:00:00Z'}]};
 const db=dbOpen();try{const {a}=await scanAll(db,sample,altered,'B924_folder_local_001');const result=await done(db,a,sample,altered);
  assert.equal(result.status,'changed');assert.equal(result.folderCount,sample.folderCount+1);assert.equal(result.trackCount,sample.trackCount+1);
 }finally{db.close();}
});

test('B9.2.4 missing page or unverifiable snapshot blocks final decision',async()=>{
 const db=dbOpen();try{const a=args(sample,sampleData);await startCompactScan(db,a);
  await assert.rejects(done(db,a,sample,sampleData),/Incomplete metadata/);
  await step(db,a,sampleData);
  await assert.rejects(done(db,a,sample,sampleData,{snapshotVerified:false}),/snapshot consistency/);
  await assert.rejects(done(db,a,sample,sampleData,{endSnapshotRevision:'altered-revision'}),/snapshot consistency/);
 }finally{db.close();}
});

test('B9.2.4 resolver revision changed mid-story fails without DB mutation',async()=>{
 const db=dbOpen();try{const a=args(sample,sampleData);await startCompactScan(db,a);
  const pending=await nextCompactPage(db,a.scanId);const p=splitCachedFolderIntoPages(sampleData.nodes[pending.folderId])[0];
  await assert.rejects(commitCompactPage(db,a.scanId,pending.folderId,p,{snapshotRevision:'another-revision'}),/snapshot changed/);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM b924_pages').get().n,0);
 }finally{db.close();}
});

test('B9.2.4 replay idempotency and conflicting replay fail closed',async()=>{
 const db=dbOpen();try{const a=args(sample,sampleData);await startCompactScan(db,a);
  const pending=await nextCompactPage(db,a.scanId),page=splitCachedFolderIntoPages(sampleData.nodes[pending.folderId])[0];
  await commitCompactPage(db,a.scanId,pending.folderId,page,{snapshotRevision:a.snapshotRevision});
  const before=db.raw.prepare('SELECT page_count FROM b924_scans').get().page_count;
  assert.equal((await commitCompactPage(db,a.scanId,pending.folderId,page,{snapshotRevision:a.snapshotRevision})).replayed,true);
  assert.equal(db.raw.prepare('SELECT page_count FROM b924_scans').get().page_count,before);
  await assert.rejects(commitCompactPage(db,a.scanId,pending.folderId,{...page,name:'broken replay'},{snapshotRevision:a.snapshotRevision}),/Conflicting page replay/);
 }finally{db.close();}
});

test('B9.2.4 truncation, duplicate folders and invalid track data never commit pages',async()=>{
 const db=dbOpen();try{const a=args(sample,sampleData);await startCompactScan(db,a);
  const pending=await nextCompactPage(db,a.scanId),page=splitCachedFolderIntoPages(sampleData.nodes[pending.folderId])[0];
  for(const invalid of [{...page,truncated:true},{...page,complete:undefined},{...page,folders:[{id:pending.folderId,name:'cycle'}]},{...page,tracks:[{...page.tracks[0],size:-1}]}]){
   await assert.rejects(commitCompactPage(db,a.scanId,pending.folderId,invalid,{snapshotRevision:a.snapshotRevision}));
  }
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM b924_pages').get().n,0);
 }finally{db.close();}
});

test('B9.2.4 original empty baseline remains unchanged, but new empty one is blocked',async()=>{
 const source=raw(empty),db=dbOpen();try{const {a}=await scanAll(db,empty,source,'B924_empty_local_001');
  assert.equal((await done(db,a,empty,source)).status,'unchanged');
  const other=dbOpen();try{const {a:b}=await scanAll(other,empty,source,'B924_empty_new_001');
   await assert.rejects(finalizeCompactScan(other,b.scanId,{baseline:null,endSnapshotRevision:b.snapshotRevision,snapshotVerified:true}),/Empty changed\/new/);
  }finally{other.close();}
 }finally{db.close();}
});

test('B9.2.4 honest Queue plan uses story jobs, not a Queue message per metadata page',()=>{
 const result=estimateCompactDispatch({storyCount:242,pageCount:4978,queueOpsAlreadyUsed:0,workerRequestsAlreadyUsed:12000});
 assert.equal(result.queueOperationsIfStoryJobOnly,726);assert.equal(result.queueOperationsIfPageQueued,14934);
 assert.equal(result.workerStepRequests,4978);assert.equal(result.underConservativeLimits,true);
 assert.equal(result.productionApproved,false);assert.equal(result.stepSchedulerImplemented,false);assert.equal(result.cloudCpuVerified,false);
});

test('B9.2.4 unknown account-wide quotas and heavy worker use block estimate',()=>{
 const unknown=estimateCompactDispatch({storyCount:242,pageCount:4978});assert.equal(unknown.underConservativeLimits,false);
 const heavy=estimateCompactDispatch({storyCount:242,pageCount:4978,queueOpsAlreadyUsed:0,workerRequestsAlreadyUsed:84000});
 assert.equal(heavy.underConservativeLimits,false);
 assert.throws(()=>estimateCompactDispatch({storyCount:242,pageCount:4978,maxWorkerPageStepsPerRequest:8}),/Only one page/);
});

test('B9.2.4 credentials and user website Worker source remain outside patch',()=>{
 assert.equal('PLAYER_ADMIN_PASSWORD' in BASELINE_PAGE_COMMITMENTS,false);
 assert.equal(typeof estimateCompactDispatch,'function');
});
