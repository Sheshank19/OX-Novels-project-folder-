import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {BASELINE_PAGE_COMMITMENTS} from '../../local-player-b5/src/b924-baseline-page-commitments.js';
import {commitCompactPage,finalizeCompactScan} from '../../local-player-b5/src/b924-compact-checkpoints.js';
import {makeLocalSnapshotResolver,validateBeginEnvelope,validateEndEnvelope} from '../../local-player-b5/src/b925-resolver-protocol.js';
import {registerLocalSchedule,claimLocalStep,acknowledgeLocalPage,acknowledgeLocalSeal,inspectLocalSchedule,runOneLocalStep,estimateLocalScheduler} from '../../local-player-b5/src/b925-durable-scheduler.js';

const root=path.resolve(import.meta.dirname,'../..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'local-player-b5/B5-PUBLISHED-CATALOGS.json'),'utf8')).catalogs;
const entry=manifest.find(x=>x.storyId==='a-luna-s-broken-bond');
const bigEntry=manifest.find(x=>x.storyId==='the-outcast-s-rise');
const source=JSON.parse(fs.readFileSync(path.join(root,'local-audio-lab/cache',entry.sourceCatalogFile),'utf8'));
const schema=['0002_b924_METADATA_TEST_ONLY.sql','0003_b925_SCHEDULER_LOCAL_ONLY.sql','0004_b926_FENCING_LOCAL_ONLY.sql'].map(n=>fs.readFileSync(path.join(root,'local-player-b9.2/migrations',n),'utf8')).join('\n');
function openDB(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');sqlite.exec(schema);
 const db={sqlite,close:()=>sqlite.close(),prepare(q){return{bind(...args){return{
  async first(){return sqlite.prepare(q).get(...args)||null;},
  async all(){return{results:sqlite.prepare(q).all(...args)}},
  async run(){const x=sqlite.prepare(q).run(...args);return{meta:{changes:x.changes}}},
  _execute(){return sqlite.prepare(q).run(...args)}
 }}}},async batch(cmds){sqlite.exec('BEGIN IMMEDIATE');try{for(const x of cmds)x._execute();sqlite.exec('COMMIT')}catch(e){sqlite.exec('ROLLBACK');throw e}}
 };
 return db;
}
let next=0;
async function init(item=entry){
 const src=item===entry?source:JSON.parse(fs.readFileSync(path.join(root,'local-audio-lab/cache',item.sourceCatalogFile),'utf8'));
 const db=openDB();const scanId=`B926_scanner_${String(++next).padStart(8,'0')}`;
 const args={scanId,storyId:item.storyId,rootFolderId:src.rootFolderId,sourceVersion:item.sourceVersion,snapshotRevision:'localSnapshot-001'};
 const resolver=makeLocalSnapshotResolver(src,{revision:args.snapshotRevision,startedAtMs:1000});
 const session=validateBeginEnvelope(await resolver.begin(args.rootFolderId),{rootFolderId:args.rootFolderId});
 await registerLocalSchedule(db,args,{nowMs:1000});
 const lease=await claimLocalStep(db,scanId,{nowMs:1000,leaseMs:1000});
 assert.equal(lease.kind,'page');
 const page=await resolver.page({folderId:lease.page.folderId,pageNo:lease.page.pageNo,snapshotRevision:args.snapshotRevision});
 const commit=(claim,checkedAtMs,p=page,db0=db)=>commitCompactPage(db0,scanId,claim.page.folderId,p,{snapshotRevision:args.snapshotRevision,fence:{leaseToken:claim.leaseToken,leaseEpoch:claim.leaseEpoch,checkedAtMs}});
 const pages=()=>db.sqlite.prepare('SELECT COUNT(*) AS n FROM b924_pages').get().n;
 const snapshot=()=>({pages:pages(),folders:db.sqlite.prepare('SELECT COUNT(*) AS n FROM b924_folders').get().n,track:db.sqlite.prepare('SELECT track_count AS n FROM b924_scans WHERE scan_id=?').get(scanId).n,
  assertions:db.sqlite.prepare('SELECT COUNT(*) AS n FROM b926_fence_assertions').get().n});
 return {db,scanId,args,lease,page,commit,pages,snapshot,resolver,session,src};
}
const fence=(lease,checkedAtMs)=>({leaseToken:lease.leaseToken,leaseEpoch:lease.leaseEpoch,checkedAtMs});

test('B9.2.6 valid lease commits one page atomically and leaves no guard rows',async()=>{
 const x=await init();try{
  const out=await x.commit(x.lease,1000);
  assert.equal(out.replayed,false);assert.equal(x.pages(),1);
  assert.equal(x.snapshot().assertions,0);
  assert.equal((await acknowledgeLocalPage(x.db,x.lease,{nowMs:1001})).stepsCompleted,1);
 }finally{x.db.close()}
});
test('B9.2.6 stolen lease cannot write any old page after reclaim',async()=>{
 const x=await init();try{
  const newer=await claimLocalStep(x.db,x.scanId,{nowMs:2000,leaseMs:1000});
  assert.equal(newer.kind,'page');assert.ok(newer.leaseEpoch>x.lease.leaseEpoch);
  const before=x.snapshot();
  await assert.rejects(x.commit(x.lease,1999),/B926_STALE_LEASE/);
  assert.deepEqual(x.snapshot(),before);
  await x.commit(newer,2000);
  assert.equal(x.pages(),1);
 }finally{x.db.close()}
});
test('B9.2.6 expiry by itself rejects a write even without a second claimant',async()=>{
 const x=await init();try{
  const before=x.snapshot();await assert.rejects(x.commit(x.lease,2000),/B926_STALE_LEASE/);
  assert.deepEqual(x.snapshot(),before);
 }finally{x.db.close()}
});
test('B9.2.6 wrong token, epoch and timestamp are rejected before mutation',async()=>{
 const x=await init();try{
  for(const f of [
   {leaseToken:'another_lease_token_98765',leaseEpoch:x.lease.leaseEpoch,checkedAtMs:1000},
   {leaseToken:x.lease.leaseToken,leaseEpoch:x.lease.leaseEpoch+1,checkedAtMs:1000},
   {leaseToken:x.lease.leaseToken,leaseEpoch:x.lease.leaseEpoch,checkedAtMs:999},
  ]){
   const before=x.snapshot();
   await assert.rejects(commitCompactPage(x.db,x.scanId,x.lease.page.folderId,x.page,{snapshotRevision:x.args.snapshotRevision,fence:f}),/B926_STALE_LEASE/);
   assert.deepEqual(x.snapshot(),before);
  }
 }finally{x.db.close()}
});
test('B9.2.6 invalid caller-controlled fencing fields cannot bypass assertion',async()=>{
 const x=await init();try{
  for(const f of [
    {leaseToken:'',leaseEpoch:1,checkedAtMs:1000},
    {leaseToken:x.lease.leaseToken,leaseEpoch:0,checkedAtMs:1000},
    {leaseToken:x.lease.leaseToken,leaseEpoch:1,checkedAtMs:-1},
    {leaseToken:x.lease.leaseToken,leaseEpoch:1,checkedAtMs:NaN}
   ])await assert.rejects(commitCompactPage(x.db,x.scanId,x.lease.page.folderId,x.page,{snapshotRevision:x.args.snapshotRevision,fence:f}),/Invalid/);
   assert.equal(x.pages(),0);
 }finally{x.db.close()}
});
test('B9.2.6 race after JavaScript validation but before SQL batch is fenced',async()=>{
 const x=await init();try{
  const before=x.snapshot();let newer;
  const racing={...x.db,batch:async commands=>{
   newer=await claimLocalStep(x.db,x.scanId,{nowMs:2000,leaseMs:1000});
   return x.db.batch(commands);
  }};
  await assert.rejects(x.commit(x.lease,1999,x.page,racing),/B926_STALE_LEASE/);
  assert.equal(newer.kind,'page');assert.deepEqual(x.snapshot(),before);
  await x.commit(newer,2000);
  assert.equal(x.pages(),1);
 }finally{x.db.close()}
});
test('B9.2.6 second-page write detects stale claimant without discarding first committed page',async()=>{
 const x=await init(bigEntry);try{
  await x.commit(x.lease,1000);await acknowledgeLocalPage(x.db,x.lease,{nowMs:1001});
  const claim=await claimLocalStep(x.db,x.scanId,{nowMs:1002,leaseMs:1000});
  const page=await x.resolver.page({folderId:claim.page.folderId,pageNo:claim.page.pageNo,snapshotRevision:x.args.snapshotRevision});
  const before=x.snapshot();const newer=await claimLocalStep(x.db,x.scanId,{nowMs:2002,leaseMs:1000});
  await assert.rejects(x.commit(claim,2001,page),/B926_STALE_LEASE/);
  assert.deepEqual(x.snapshot(),before);
  await x.commit(newer,2002,page);assert.equal(x.pages(),2);
 }finally{x.db.close()}
});
test('B9.2.6 damaged metadata fails without partial folder/page/scan writes',async()=>{
 const x=await init();try{
  const broken={...x.page,folders:[{id:'SomeValidFolderID778899',name:'x'},{id:'SomeValidFolderID778899',name:'y'}]};
  const before=x.snapshot();await assert.rejects(x.commit(x.lease,1000,broken),/Repeated folder/);assert.deepEqual(x.snapshot(),before);
  const invalid={...x.page,complete:false};await assert.rejects(x.commit(x.lease,1000,invalid),/Unverified/);assert.deepEqual(x.snapshot(),before);
 }finally{x.db.close()}
});
test('B9.2.6 can seal complete unchanged story only with the current lease',async()=>{
 const x=await init();try{
  await x.commit(x.lease,1000);await acknowledgeLocalPage(x.db,x.lease,{nowMs:1001});
  const out=await runOneLocalStep(x.db,x.args,x.resolver,x.session,{nowMs:1002,baseline:BASELINE_PAGE_COMMITMENTS[entry.storyId]});
  assert.equal(out.status,'unchanged');
  assert.equal(x.db.sqlite.prepare('SELECT phase FROM b924_scans').get().phase,'UNCHANGED');
  assert.equal(x.snapshot().assertions,0);
 }finally{x.db.close()}
});
test('B9.2.6 stolen seal lease cannot finalize, but new lease may finalize unchanged',async()=>{
 const x=await init();try{
  await x.commit(x.lease,1000);await acknowledgeLocalPage(x.db,x.lease,{nowMs:1001});
  const seal=await claimLocalStep(x.db,x.scanId,{nowMs:1002,leaseMs:1000});assert.equal(seal.kind,'seal');
  const endProof=validateEndEnvelope(await x.resolver.end(x.args.rootFolderId),x.session,{nowMs:1002});
  const newer=await claimLocalStep(x.db,x.scanId,{nowMs:2002,leaseMs:1000});assert.equal(newer.kind,'seal');
  const before=x.snapshot();
  await assert.rejects(finalizeCompactScan(x.db,x.scanId,{baseline:BASELINE_PAGE_COMMITMENTS[entry.storyId],...endProof,fence:fence(seal,2001)}),/B926_STALE_LEASE/);
  assert.deepEqual(x.snapshot(),before);
  assert.equal(x.db.sqlite.prepare('SELECT phase FROM b924_scans').get().phase,'SCANNING');
  const result=await finalizeCompactScan(x.db,x.scanId,{baseline:BASELINE_PAGE_COMMITMENTS[entry.storyId],...endProof,fence:fence(newer,2002)});
  assert.equal(result.status,'unchanged');
  const done=await acknowledgeLocalSeal(x.db,newer,{nowMs:2003});assert.equal(done.status,'DONE');
  assert.equal(x.snapshot().assertions,0);
 }finally{x.db.close()}
});

test('B9.2.6 SQL failure in the middle of a batch rolls back the guard AND every metadata write',async()=>{
 const x=await init();try{
  x.db.sqlite.exec(`CREATE TRIGGER inject_rollback_test BEFORE UPDATE ON b924_scans BEGIN SELECT RAISE(ABORT,'INJECTED_SCAN_UPDATE_FAILURE'); END;`);
  const before=x.snapshot();
  await assert.rejects(x.commit(x.lease,1000),/INJECTED_SCAN_UPDATE_FAILURE/);
  assert.deepEqual(x.snapshot(),before);
  x.db.sqlite.exec('DROP TRIGGER inject_rollback_test');
  await x.commit(x.lease,1001);
  assert.equal(x.pages(),1);
 }finally{x.db.close()}
});
test('B9.2.6 expired previous lease is reclaimed before one verified page commits',async()=>{
 const x=await init();try{
  const out=await runOneLocalStep(x.db,x.args,x.resolver,x.session,{nowMs:2000,leaseMs:1000,baseline:BASELINE_PAGE_COMMITMENTS[entry.storyId]});
  assert.equal(out.status,'page'); // previous lease was reclaimable at 2000; new claim owns page
  assert.equal(x.pages(),1);
 }finally{x.db.close()}
});
test('B9.2.6 local injected clock catches lease expiry after beginning a resolver request',async()=>{
 const x=await init();try{
  // Claim in runOneLocalStep at 2000 (after the first claim expires), then
  // advance the simulated trusted clock past this new lease before the write.
  const out=await runOneLocalStep(x.db,x.args,x.resolver,x.session,{nowMs:2000,leaseMs:1000,
   commitClock:()=>3000,baseline:BASELINE_PAGE_COMMITMENTS[entry.storyId]});
  assert.equal(out.status,'lease-lost');
  assert.equal(x.pages(),0);
  assert.equal((await inspectLocalSchedule(x.db,x.scanId)).stepsCompleted,0);
 }finally{x.db.close()}
});
test('B9.2.6 conservative quota lower bound includes transient lease assertion writes',()=>{
 const actual=estimateLocalScheduler({stories:242,pages:4978,queueOpsUsed:0,workerRequestsUsed:0,d1RowsWritten:0});
 assert.equal(actual.d1RowWritesLowerBound,3*(4978+242));
 assert.equal(actual.productionApproved,false);
 const nearLimit=estimateLocalScheduler({stories:242,pages:4978,queueOpsUsed:0,workerRequestsUsed:0,d1RowsWritten:70000});
 assert.equal(nearLimit.withinLowerBoundBudget,false);
});
test('B9.2.6 on restart no remote endpoints or secrets have been added to test-only modules',()=>{
 const p=path.join(root,'local-player-b5/src');
 for(const filename of ['b924-compact-checkpoints.js','b925-durable-scheduler.js']){
  const s=fs.readFileSync(path.join(p,filename),'utf8');
  assert.ok(!/wrangler deploy|fetch\(\s*['"]https?:\/\//i.test(s));
  assert.ok(!/\.dev\.vars|\.env\.player-handoff|resolver\.local\.json/.test(s));
 }
});
