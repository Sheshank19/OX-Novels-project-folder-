import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {auditTick,auditCapabilities,validateRoster} from '../src/b92-audit-scheduler.js';
import {assertPage} from '../src/b92-audit-reader.js';
const schema=readFileSync(new URL('../sql/0002_b92_resumable_readonly_audit.sql',import.meta.url),'utf8');
const ROOT1='ABCDEFGHIJKLMNO1234',ROOT2='PQRSTUVWXYZabcd1234',CHILD='ChildFolderABC1234';
const when=Date.UTC(2026,9,18,18,0,0);
function dbMock(){
  const db=new DatabaseSync(':memory:');db.exec(schema);
  const binding={
    prepare(sql){return {bind(...args){const stmt=db.prepare(sql);return {
      first:async()=>stmt.get(...args)||null,
      run:async()=>{const r=stmt.run(...args);return {success:true,meta:{changes:Number(r.changes)}};},
      all:async()=>({results:stmt.all(...args)})
    };}};},
    async batch(stmts){const outs=[];db.exec('BEGIN');try{for(const s of stmts)outs.push(await s.run());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return outs;}
  };
  return {db,binding};
}
const fixtures=[
  {id:'first-story',root:ROOT1},
  {id:'second-story',root:ROOT2}
];
function page(scope,{complete=true,folders=[],tracks=[]}={}){
  return {ok:true,version:'ox-stage-multiroot-v2',readOnly:true,publishAllowed:false,
    pinnedSnapshot:false,stableSnapshot:false,storyId:scope.storyId,storyRootId:scope.rootId,
    folderId:scope.folderId,pageNo:scope.pageNo,complete,hasMore:!complete,
    folders,tracks,nextCursor:complete?null:'opaque-signed-cursor'};
}
const track={id:'AudioTrackIDABC123',type:'track',name:'Episode 1',size:123,
  modifiedAt:'2026-10-01T12:00:00.000Z',mimeType:'audio/mpeg'};
test('real SQLite D1-compatible read-only all-story audit persists a two-folder inventory',async()=>{
 const {db,binding}=dbMock(), env={B92_AUDIT_MODE:'readonly',B92_POINTER_DB:binding};
 const roster=async()=>fixtures;
 const reader=async(_env,scope)=>scope.folderId===ROOT1?page(scope,{folders:[{id:CHILD,name:'Part 1',type:'folder'}]}):
   page(scope,{tracks:[track]});
 const options={time:when,clock:()=>when,getRoster:roster,readPage:reader,maxPages:5};
 const first=await auditTick(env,options);
 assert.equal(first.status,'OBSERVED_UNPINNED');
 const second=await auditTick(env,options);
 assert.equal(second.status,'OBSERVED_UNPINNED');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM b92_audit_jobs WHERE status=?').get('OBSERVED_UNPINNED').n,2);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM b92_audit_pages').get().n,3);
 assert.equal(db.prepare('SELECT track_count FROM b92_audit_jobs WHERE story_id=?').get('first-story').track_count,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='b92_live_pointers'").get().n,0);
 assert.equal(auditCapabilities.publication,false);
 db.close();
});
test('mismatched cross-story page fails closed and does not mark a scan complete',async()=>{
 const {db,binding}=dbMock(),env={B92_AUDIT_MODE:'readonly',B92_POINTER_DB:binding};
 const result=await auditTick(env,{time:when,clock:()=>when,getRoster:async()=>fixtures.slice(0,1),
   readPage:async(_env,s)=>({...page(s),storyRootId:ROOT2})});
 assert.equal(result.status,'WAITING');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM b92_audit_pages').get().n,0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM b92_audit_jobs WHERE status=?').get('OBSERVED_UNPINNED').n,0);
 db.close();
});
test('no input or HTTP endpoint can enable publication',async()=>{
 const r=await auditTick({B92_AUDIT_MODE:'off'});
 assert.equal(r.status,'DISABLED');
 assert.equal(auditCapabilities.automaticUpdate,false);
 assert.throws(()=>validateRoster([{id:'a',folderId:'FAKE',sourceVersion:'a'}]));
 const scope={storyId:'first-story',rootId:ROOT1,folderId:ROOT1,pageNo:0};
 assert.throws(()=>assertPage({...page(scope),pinnedSnapshot:true},scope));
});
test('paged root scan persists signed continuation and resumes on next cron invocation',async()=>{
 const {db,binding}=dbMock(),env={B92_AUDIT_MODE:'readonly',B92_POINTER_DB:binding};
 const seen=[];
 const roster=async()=>fixtures.slice(0,1);
 const reader=async(_env,s)=>{
   seen.push([s.pageNo,s.cursor]);
   if(s.pageNo===0)return page(s,{complete:false,tracks:[track]});
   return page(s,{tracks:[{...track,id:'AudioTrackIDABC456'}]});
 };
 const first=await auditTick(env,{time:when,clock:()=>when,getRoster:roster,readPage:reader,maxPages:1});
 assert.equal(first.status,'IN_PROGRESS');
 let state=JSON.parse(db.prepare('SELECT state_json FROM b92_audit_jobs WHERE story_id=?').get('first-story').state_json);
 assert.equal(state.queue[0].page,1);
 assert.equal(state.queue[0].cursor,'opaque-signed-cursor');
 const second=await auditTick(env,{time:when+MINUTE_TEST,clock:()=>when+MINUTE_TEST,getRoster:roster,readPage:reader,maxPages:1});
 assert.equal(second.status,'OBSERVED_UNPINNED');
 assert.deepEqual(seen,[[0,''],[1,'opaque-signed-cursor']]);
 assert.equal(db.prepare('SELECT track_count FROM b92_audit_jobs WHERE story_id=?').get('first-story').track_count,2);
 db.close();
});
const MINUTE_TEST=60000;
test('expired continuation is cleared, never accepted as a complete inventory',async()=>{
 const {db,binding}=dbMock(),env={B92_AUDIT_MODE:'readonly',B92_POINTER_DB:binding};
 const roster=async()=>fixtures.slice(0,1);
 const reader=async(_env,s)=>page(s,{complete:false,tracks:[track]});
 const first=await auditTick(env,{time:when,clock:()=>when,getRoster:roster,readPage:reader,maxPages:1});
 assert.equal(first.status,'IN_PROGRESS');
 const later=when+19*MINUTE_TEST;
 const second=await auditTick(env,{time:later,clock:()=>later,getRoster:roster,readPage:reader,maxPages:1});
 assert.equal(second.status,'WAITING');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM b92_audit_pages').get().n,0);
 assert.equal(db.prepare('SELECT page_count FROM b92_audit_jobs').get().page_count,0);
 db.close();
});
