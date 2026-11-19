import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {BASELINE_PAGE_COMMITMENTS} from '../../local-player-b5/src/b924-baseline-page-commitments.js';
import {splitCachedFolderIntoPages,commitCompactPage,nextCompactPage,finalizeCompactScan} from '../../local-player-b5/src/b924-compact-checkpoints.js';
import {makeLocalSnapshotResolver,validateBeginEnvelope,validatePageEnvelope,validateEndEnvelope} from '../../local-player-b5/src/b925-resolver-protocol.js';
import {registerLocalSchedule,claimLocalStep,acknowledgeLocalPage,acknowledgeLocalSeal,rejectLocalStep,inspectLocalSchedule,runOneLocalStep,estimateLocalScheduler} from '../../local-player-b5/src/b925-durable-scheduler.js';
const root=path.resolve(import.meta.dirname,'../..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'local-player-b5/B5-PUBLISHED-CATALOGS.json'),'utf8')).catalogs;
const entry=id=>manifest.find(e=>e.storyId===id);
const cached=e=>JSON.parse(fs.readFileSync(path.join(root,'local-audio-lab/cache',e.sourceCatalogFile),'utf8'));
const e=entry('a-luna-s-broken-bond'),source=cached(e),big=entry('the-outcast-s-rise'),bigSource=cached(big);
const schema=['0002_b924_METADATA_TEST_ONLY.sql','0003_b925_SCHEDULER_LOCAL_ONLY.sql','0004_b926_FENCING_LOCAL_ONLY.sql'].map(x=>fs.readFileSync(path.join(root,'local-player-b9.2/migrations',x),'utf8')).join('\n');
function openDB(file=':memory:',init=true){
 const sq=new DatabaseSync(file);sq.exec('PRAGMA foreign_keys=ON');if(init)sq.exec(schema);
 return {sql:sq,close(){sq.close()},prepare(q){return{bind(...params){return{
  async first(){return sq.prepare(q).get(...params)||null;},async all(){return{results:sq.prepare(q).all(...params)};},
  async run(){const o=sq.prepare(q).run(...params);return{meta:{changes:o.changes}}},
  _execute(){return sq.prepare(q).run(...params)}
 }}}},async batch(commands){sq.exec('BEGIN IMMEDIATE');try{for(const c of commands)c._execute();sq.exec('COMMIT')}catch(err){sq.exec('ROLLBACK');throw err}}
 };
}
const args=(item,src,id)=>({scanId:id,storyId:item.storyId,rootFolderId:src.rootFolderId,sourceVersion:item.sourceVersion,snapshotRevision:'localSnapshot-001'});
const make=async(src=source,item=e,id='B925_local_test_001',db=openDB(),options={})=>{
 const a=args(item,src,id),client=makeLocalSnapshotResolver(src,{revision:a.snapshotRevision,startedAtMs:1000,ttlMs:options.ttlMs||3600000});
 const session=validateBeginEnvelope(await client.begin(a.rootFolderId),{rootFolderId:a.rootFolderId});
 await registerLocalSchedule(db,a,{nowMs:1000});return {a,client,session,db};
};
async function steps(bundle,baseline=BASELINE_PAGE_COMMITMENTS[bundle.a.storyId]){
 for(let i=0;i<10000;i++){
  const out=await runOneLocalStep(bundle.db,bundle.a,bundle.client,bundle.session,{nowMs:1000+i*10,baseline});
  if(out.status==='unchanged'||out.status==='changed'||out.status==='new')return {out,iterations:i+1};
  assert.equal(out.status,'page',`Unexpected scheduler outcome: ${JSON.stringify(out)}`);
 }
 throw Error('Unbounded scan');
}
test('B9.2.5 beginning contract insists on complete pinned Drive snapshot and correct root',async()=>{
 const resolver=makeLocalSnapshotResolver(source),ok=await resolver.begin(source.rootFolderId);
 assert.equal(validateBeginEnvelope(ok,{rootFolderId:source.rootFolderId}).snapshotRevision,'localSnapshot-001');
 for(const bad of [{...ok,stableSnapshot:false},{...ok,complete:false},{...ok,rootFolderId:'B925WrongRootABCDE'},{...ok,snapshotRevision:'bad'}]){
  assert.throws(()=>validateBeginEnvelope(bad,{rootFolderId:source.rootFolderId}));
 }
});
test('B9.2.5 page contract rejects missing/truncated/reordered/revision-drift/wrong folder',async()=>{
 const b=await make();try{
  const page=await b.client.page({folderId:source.rootFolderId,pageNo:0,snapshotRevision:b.session.snapshotRevision});
  assert.equal(validatePageEnvelope(page,b.session,{folderId:source.rootFolderId,pageNo:0,nowMs:1000}).page.pageNo,0);
  for(const bad of [{...page,truncated:true},{...page,pageNo:2},{...page,snapshotRevision:'different-revision'},{...page,folderId:'AnotherDriveFolder112233'},{...page,tracks:null}]){
   assert.throws(()=>validatePageEnvelope(bad,b.session,{folderId:source.rootFolderId,pageNo:0,nowMs:1000}));
  }
  assert.throws(()=>validatePageEnvelope(page,b.session,{folderId:source.rootFolderId,pageNo:0,nowMs:b.session.expiresAtMs}));
 }finally{b.db.close()}
});
test('B9.2.5 final proof rejects invalidation and expiry',async()=>{
 const b=await make();try{
  assert.equal(validateEndEnvelope(await b.client.end(source.rootFolderId),b.session,{nowMs:1001}).snapshotVerified,true);
  b.client.invalidate();const invalid=await b.client.end(source.rootFolderId);assert.throws(()=>validateEndEnvelope(invalid,b.session,{nowMs:1001}));
  assert.throws(()=>validateEndEnvelope(invalid,b.session,{nowMs:b.session.expiresAtMs}));
 }finally{b.db.close()}
});
test('B9.2.5 registers safely and claiming a step locks out second worker',async()=>{
 const b=await make();try{
  const a=await claimLocalStep(b.db,b.a.scanId,{nowMs:1000});assert.equal(a.kind,'page');
  assert.equal((await claimLocalStep(b.db,b.a.scanId,{nowMs:1001})).kind,'busy');
  assert.equal((await registerLocalSchedule(b.db,b.a,{nowMs:1002})).stepsCompleted,0);
  assert.equal((await inspectLocalSchedule(b.db,b.a.scanId)).status,'RUNNING');
 }finally{b.db.close()}
});
test('B9.2.5 never acknowledges a page that has not been durably committed',async()=>{
 const b=await make();try{
  const claim=await claimLocalStep(b.db,b.a.scanId,{nowMs:1000});
  await assert.rejects(acknowledgeLocalPage(b.db,claim,{nowMs:1000}),/uncommitted/);
  assert.equal((await inspectLocalSchedule(b.db,b.a.scanId)).stepsCompleted,0);
 }finally{b.db.close()}
});
test('B9.2.5 lease expiry permits reclaim but stale worker cannot acknowledge',async()=>{
 const b=await make();try{
  const lease=await claimLocalStep(b.db,b.a.scanId,{nowMs:1000,leaseMs:1000});
  assert.equal((await claimLocalStep(b.db,b.a.scanId,{nowMs:1999})).kind,'busy');
  const newLease=await claimLocalStep(b.db,b.a.scanId,{nowMs:2000,leaseMs:1000});
  assert.equal(newLease.kind,'page');assert.notEqual(newLease.leaseToken,lease.leaseToken);
  assert.ok(newLease.leaseEpoch>lease.leaseEpoch);
  await assert.rejects(rejectLocalStep(b.db,lease,'stale',{nowMs:2001}),/Stale/);
  assert.equal((await inspectLocalSchedule(b.db,b.a.scanId)).attempts,0);
 }finally{b.db.close()}
});
test('B9.2.5 resilient re-run commits exactly one page per invocation',async()=>{
 const b=await make();try{
  const r=await runOneLocalStep(b.db,b.a,b.client,b.session,{nowMs:1000,baseline:BASELINE_PAGE_COMMITMENTS[e.storyId]});
  assert.equal(r.status,'page');assert.equal(r.stepsCompleted,1);
  assert.equal(b.db.sql.prepare('SELECT COUNT(*) AS n FROM b924_pages').get().n,1);
 }finally{b.db.close()}
});
test('B9.2.5 changed-only scheduler finishes source unchanged with zero track staging',async()=>{
 const b=await make();try{
  const {out,iterations}=await steps(b);
  assert.equal(out.status,'unchanged');assert.ok(iterations>1);
  assert.equal((await inspectLocalSchedule(b.db,b.a.scanId)).status,'DONE');
  assert.equal(b.db.sql.prepare('SELECT COUNT(*) AS n FROM sqlite_master WHERE name=?').get('b924_tracks').n,0);
 }finally{b.db.close()}
});
test('B9.2.5 large 2,848-track story scans one bounded page per invocation',async()=>{
 const b=await make(bigSource,big,'B925_large_story_001');try{
  const {out,iterations}=await steps(b);assert.equal(out.status,'unchanged');assert.ok(iterations>30);
  assert.equal((await inspectLocalSchedule(b.db,b.a.scanId)).stepsCompleted,iterations-1);
  assert.equal(b.db.sql.prepare('SELECT COUNT(*) AS n FROM b924_pages').get().n,iterations-1);
 }finally{b.db.close()}
});
test('B9.2.5 restarts a partially complete scan from disk without duplicate metadata',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'oxb925-')),file=path.join(tmp,'test.sqlite');let db=openDB(file);
 try{
  const b=await make(source,e,'B925_restart_case_01',db);
  for(let n=0;n<1;n++)assert.equal((await runOneLocalStep(db,b.a,b.client,b.session,{nowMs:1000+n*10})).status,'page');
  db.close();db=openDB(file,false);b.db=db;
  assert.equal((await inspectLocalSchedule(db,b.a.scanId)).stepsCompleted,1);
  assert.equal((await steps(b)).out.status,'unchanged');
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM b924_pages').get().n,(await inspectLocalSchedule(db,b.a.scanId)).stepsCompleted);
 }finally{db.close();fs.rmSync(tmp,{recursive:true,force:true})}
});
test('B9.2.5 crash after page DB commit but before ACK advances without replay corruption',async()=>{
 const b=await make();try{
  const lease=await claimLocalStep(b.db,b.a.scanId,{nowMs:1000,leaseMs:1000});
  const page=splitCachedFolderIntoPages(source.nodes[lease.page.folderId])[lease.page.pageNo];
  await commitCompactPage(b.db,b.a.scanId,lease.page.folderId,page,{snapshotRevision:b.a.snapshotRevision});
  assert.equal((await inspectLocalSchedule(b.db,b.a.scanId)).stepsCompleted,0);
  const next=await claimLocalStep(b.db,b.a.scanId,{nowMs:2000,leaseMs:1000});
  assert.notDeepEqual(next.page,lease.page);
  await assert.rejects(acknowledgeLocalPage(b.db,lease,{nowMs:2000}),/Stale/);
 }finally{b.db.close()}
});
test('B9.2.5 modified episode requires separate full stage and does not publish',async()=>{
 const altered=structuredClone(source);altered.nodes[altered.rootFolderId].tracks[0].name='An updated title.mp3';
 const b=await make(altered,e,'B925_changed_story_01');try{
  const {out}=await steps(b);assert.equal(out.status,'changed');assert.equal(out.needsFullStage,true);assert.equal(out.productionActivation,false);
  assert.equal(b.db.sql.prepare('SELECT phase FROM b924_scans').get().phase,'NEEDS_FULL_STAGE');
 }finally{b.db.close()}
});
test('B9.2.5 detects added folder and episode without changing active catalog',async()=>{
 const altered=structuredClone(source),newId='B925_newFolder_ID1234';altered.nodes[altered.rootFolderId].folders.push({id:newId,name:'New range'});
 altered.nodes[newId]={name:'New range',folders:[],tracks:[{id:'B925_newTrack_123456',name:'201.mp3',mimeType:'audio/mpeg',size:555,modifiedAt:'2026-10-10'}]};
 const b=await make(altered,e,'B925_added_folder_01');try{assert.equal((await steps(b)).out.status,'changed');}
 finally{b.db.close()}
});
test('B9.2.5 on snapshot changed before seal queues bounded retry, never finalizes',async()=>{
 const b=await make();try{
  for(let n=0;n<500;n++){
   const next=await nextCompactPage(b.db,b.a.scanId);if(!next)break;
   assert.equal((await runOneLocalStep(b.db,b.a,b.client,b.session,{nowMs:1000+n})).status,'page');
  }
  b.client.invalidate();const out=await runOneLocalStep(b.db,b.a,b.client,b.session,{nowMs:4000});
  assert.equal(out.status,'WAITING');assert.equal(out.attempts,1);
  assert.equal(b.db.sql.prepare('SELECT phase FROM b924_scans').get().phase,'SCANNING');
  assert.equal((await inspectLocalSchedule(b.db,b.a.scanId)).status,'WAITING');
 }finally{b.db.close()}
});
test('B9.2.5 exactly 15 failures exhaust retries and preserve old catalog',async()=>{
 const b=await make();try{
  let t=1000;for(let n=1;n<=15;n++){
   const lease=await claimLocalStep(b.db,b.a.scanId,{nowMs:t});assert.equal(lease.kind,'page');
   const res=await rejectLocalStep(b.db,lease,`private id ${source.rootFolderId}`,{nowMs:t});
   assert.equal(res.attempts,n);assert.equal(res.status,n===15?'FAILED':'WAITING');
   t=res.retryAtMs;
  }
  const state=await inspectLocalSchedule(b.db,b.a.scanId);
  assert.equal(state.status,'FAILED');assert.equal(state.attempts,15);
  assert.ok(!JSON.stringify(state).includes(source.rootFolderId));
  assert.equal(b.db.sql.prepare('SELECT phase FROM b924_scans').get().phase,'FAILED');
 }finally{b.db.close()}
});
test('B9.2.5 new and empty baseline cannot be silently activated',async()=>{
 const b=await make(source,e,'B925_new_story_001');try{
  const {out}=await steps(b,null);assert.equal(out.status,'new');assert.equal(out.needsFullStage,true);
 }finally{b.db.close()}
});
test('B9.2.5 completed scan is recovered if DB crashes after finalizing before ACK',async()=>{
 const b=await make();try{
  for(let i=0;i<500;i++){if(!(await nextCompactPage(b.db,b.a.scanId)))break;
   await runOneLocalStep(b.db,b.a,b.client,b.session,{nowMs:1000+i});}
  const lease=await claimLocalStep(b.db,b.a.scanId,{nowMs:2000});assert.equal(lease.kind,'seal');
  await finalizeCompactScan(b.db,b.a.scanId,{baseline:BASELINE_PAGE_COMMITMENTS[e.storyId],endSnapshotRevision:b.a.snapshotRevision,snapshotVerified:true});
  assert.equal((await claimLocalStep(b.db,b.a.scanId,{nowMs:2001})).kind,'done');
  assert.equal((await inspectLocalSchedule(b.db,b.a.scanId)).status,'DONE');
 }finally{b.db.close()}
});
test('B9.2.5 budget model denies missing usage and does not promise CPU proof',()=>{
 const unknown=estimateLocalScheduler();assert.equal(unknown.accountUsageKnown,false);assert.equal(unknown.productionApproved,false);
 assert.equal(unknown.workerRequestsMinimum,4978+242);
 const known=estimateLocalScheduler({queueOpsUsed:0,workerRequestsUsed:10000,d1RowsWritten:0});
 assert.equal(known.queueOperationsEstimate,726);assert.equal(known.withinLowerBoundBudget,true);assert.equal(known.stagingApproved,false);
 const blocked=estimateLocalScheduler({queueOpsUsed:9000,workerRequestsUsed:0,d1RowsWritten:0});assert.equal(blocked.withinLowerBoundBudget,false);
});
test('B9.2.5 simulator does not import secrets or contain a remote deployment path',()=>{
 const files=['local-player-b5/src/b925-resolver-protocol.js','local-player-b5/src/b925-durable-scheduler.js'];
 for(const file of files){const s=fs.readFileSync(path.join(root,file),'utf8');assert.ok(!s.includes('script.google.com/macros/s/'));assert.ok(!s.includes('wrangler deploy'));
  assert.ok(!s.includes('.dev.vars.live-backup'));}
});
