import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {auditTick} from '../src/b92-audit-scheduler.js';
import {describeCompletedAudit,compareAuditObservations} from '../src/b92-audit-integrity.js';
const schema=readFileSync(new URL('../sql/0002_b92_resumable_readonly_audit.sql',import.meta.url),'utf8');
const ROOT='ABCDEFGHIJKLMNO1234',CHILD='ChildFolderABC1234',SID='first-story';
const when=Date.UTC(2026,9,18,18,0,0),M=60000;
const roster=async()=>[{id:SID,root:ROOT}];
function setup(){
 const db=new DatabaseSync(':memory:');db.exec(schema);
 const binding={prepare(sql){return{bind(...args){const stmt=db.prepare(sql);return{
  first:async()=>stmt.get(...args)||null,
  run:async()=>{const r=stmt.run(...args);return{success:true,meta:{changes:Number(r.changes)}};},
  all:async()=>({results:stmt.all(...args)})
 };}};},async batch(stmts){db.exec('BEGIN');try{const a=[];for(const s of stmts)a.push(await s.run());db.exec('COMMIT');return a;}catch(e){db.exec('ROLLBACK');throw e;}}};
 return {db,env:{B92_AUDIT_MODE:'readonly',B92_POINTER_DB:binding}};
}
const track=id=>({id,type:'track',name:'Episode One',size:123,modifiedAt:'2026-10-01T12:00:00.000Z',mimeType:'audio/mpeg'});
const pg=(s,{done=true,folders=[],tracks=[]}={})=>({ok:true,version:'ox-stage-multiroot-v2',readOnly:true,
 publishAllowed:false,pinnedSnapshot:false,stableSnapshot:false,storyId:s.storyId,
 storyRootId:s.rootId,folderId:s.folderId,pageNo:s.pageNo,complete:done,hasMore:!done,
 nextCursor:done?null:'signed-cursor',folders,tracks});
async function tick(env,cycleTime,reader,maxPages=5){return auditTick(env,{time:cycleTime,clock:()=>cycleTime,
 getRoster:roster,readPage:reader,maxPages});}
const cycle='pacific-2026-10-18';
test('fully persisted nested inventory is independently verified; no publication grant',async()=>{
 const {db,env}=setup();
 const read=async(_e,s)=>s.folderId===ROOT?
  pg(s,{folders:[{id:CHILD,type:'folder',name:'Part 1'}]}):pg(s,{tracks:[track('TrackABCDEFGH123')]});
 assert.equal((await tick(env,when,read)).status,'OBSERVED_UNPINNED');
 const out=await describeCompletedAudit(env.B92_POINTER_DB,{cycleId:cycle,storyId:SID});
 assert.equal(out.trackCount,1);assert.equal(out.folderCount,2);assert.match(out.fingerprint,/^[a-f0-9]{64}$/);
 assert.equal(out.publicationAllowed,false);assert.equal(out.atomicSnapshot,false);
 assert.equal(JSON.stringify(out).includes(ROOT),false);
 // A modified stored page is rejected before digest computation.
 db.prepare('UPDATE b92_audit_pages SET body_json=? WHERE folder_id=?').run('{}',CHILD);
 await assert.rejects(describeCompletedAudit(env.B92_POINTER_DB,{cycleId:cycle,storyId:SID}),{code:'AUDIT_PAGE_INTEGRITY_FAILED'});
 db.close();
});
test('duplicate track IDs across pages fail integrity independently of page count',async()=>{
 const {db,env}=setup();
 const reader=async(_e,s)=>s.pageNo===0?pg(s,{done:false,tracks:[track('TrackABCDEFGH123')]}):
   pg(s,{tracks:[track('TrackABCDEFGH123')]});
 assert.equal((await tick(env,when,reader)).status,'OBSERVED_UNPINNED');
 await assert.rejects(describeCompletedAudit(env.B92_POINTER_DB,{cycleId:cycle,storyId:SID}),{code:'AUDIT_DUPLICATE_TRACK'});
 db.close();
});
test('expiration reset retains valid checkpoint shape and discards old pages atomically',async()=>{
 const {db,env}=setup();
 const first=await tick(env,when,async(_e,s)=>pg(s,{done:false,tracks:[track('TrackABCDEFGH123')]}),1);
 assert.equal(first.status,'IN_PROGRESS');
 const expired=await tick(env,when+19*M,async()=>{throw Error('stale cursor was used');},1);
 assert.equal(expired.status,'WAITING');
 const state=JSON.parse(db.prepare('SELECT state_json FROM b92_audit_jobs').get().state_json);
 assert.deepEqual(state.queue,[{id:ROOT,page:0,cursor:'',depth:0,cursorStartedMs:0}]);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM b92_audit_pages').get().n,0);
 const recovered=await tick(env,when+19*M+30_000,async(_e,s)=>pg(s,{tracks:[track('TrackABCDEFGH123')]}),1);
 assert.equal(recovered.status,'OBSERVED_UNPINNED');
 assert.equal((await describeCompletedAudit(env.B92_POINTER_DB,{cycleId:cycle,storyId:SID})).trackCount,1);
 db.close();
});
test('independent observations can agree without falsely claiming a pinned snapshot',async()=>{
 const a={storyId:SID,sourceVersion:'0123456789ab',cycleId:'pacific-2026-10-17',fingerprint:'a'.repeat(64),
 atomicSnapshot:false,publicationAllowed:false,trackCount:1,folderCount:1};
 const b={...a,cycleId:'pacific-2026-10-18'};
 assert.deepEqual(compareAuditObservations(a,b),{storyId:SID,matching:true,folderCount:1,trackCount:1,
 atomicSnapshot:false,publicationAllowed:false});
 assert.equal(compareAuditObservations(a,{...b,fingerprint:'b'.repeat(64)}).matching,false);
 assert.throws(()=>compareAuditObservations(a,{...a,atomicSnapshot:true}),{code:'AUDIT_OBSERVATIONS_INVALID'});
 assert.throws(()=>compareAuditObservations(a,{...b,publicationAllowed:true}),{code:'AUDIT_OBSERVATIONS_INVALID'});
});
