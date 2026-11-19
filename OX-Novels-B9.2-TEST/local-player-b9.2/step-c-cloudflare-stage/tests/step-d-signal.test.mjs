import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
const TOKEN='t'.repeat(48);
const nonce='f'.repeat(32);
function envFixture(){
  const signals=new Map();const kvMap=new Map();let pointer=null;let pointerUpdates=0;let writes=0;
  const kv={async get(k){return kvMap.get(k)||null;},async put(k,v){kvMap.set(k,v);}};
  const db={withSession(mode){assert.equal(mode,'first-primary');return {
    prepare(sql){return {bind(...args){return {first:()=>doFirst(sql,args),run:()=>doRun(sql,args)};},first:()=>doFirst(sql,[])};}
  };}};
  async function doFirst(sql,args){
    if(sql.startsWith('SELECT COUNT(*) AS n'))return {n:signals.size};
    if(sql.startsWith('SELECT signal_state FROM stage_sync_signals ORDER BY')){
      const latest=[...signals.values()].at(-1);return latest?{signal_state:latest}:null;
    }
    if(sql.startsWith('SELECT signal_state FROM stage_sync_signals WHERE signal_id')){
      return signals.has(args[0])?{signal_state:signals.get(args[0])}:null;
    }
    if(sql.startsWith('SELECT revision, pointer_json FROM stage_pointers'))return pointer;
    throw Error('UNEXPECTED_DB_FIRST');
  }
  async function doRun(sql,args){
    if(sql.startsWith('INSERT OR IGNORE INTO stage_sync_signals')){
      const [id,state]=args;
      if(signals.has(id))return {success:true,meta:{changes:0}};
      writes++;signals.set(id,state);return {success:true,meta:{changes:1}};
    }
    if(sql.startsWith('INSERT OR IGNORE INTO stage_pointers')){
      if(pointer)return {success:true,meta:{changes:0}};
      pointer={revision:0,pointer_json:args[2]};pointerUpdates++;
      return {success:true,meta:{changes:1}};
    }
    if(sql.startsWith('UPDATE stage_pointers')){
      const [revision,pointer_json, , ,expected]=args;
      if(!pointer||pointer.revision!==expected)return {success:true,meta:{changes:0}};
      pointer={revision,pointer_json};pointerUpdates++;return {success:true,meta:{changes:1}};
    }
    throw Error('UNEXPECTED_DB_WRITE');
  }
  return {env:{STAGE_MODE:'synthetic-only',STAGE_ADMIN_TOKEN:TOKEN,STAGE_KV:kv,STAGE_DB:db},
    signals,kvMap,ptr:()=>pointer,ptrWrites:()=>pointerUpdates,writes:()=>writes};
}
async function call(env,route,{method='GET',json,authenticated=true,origin=false}={}){
  const headers={};if(authenticated)headers.authorization='Bearer '+TOKEN;
  if(origin)headers.origin='https://example.invalid';
  if(json!==undefined)headers['content-type']='application/json';
  const res=await worker.fetch(new Request('https://stepc.example'+route,{method,headers,
    body:json===undefined?undefined:JSON.stringify(json)}),env);
  return {http:res.status,data:await res.json()};
}
const post=(env,route,payload)=>call(env,route,{method:'POST',json:payload});
test('read-only stage endpoint starts with zero signals',async()=>{
  const f=envFixture();const r=await call(f.env,'/v1/sync-status');
  assert.equal(r.http,200);assert.equal(r.data.signalCount,0);
  assert.equal(r.data.lastSignal,null);assert.equal(r.data.catalogPublicationDisabled,true);
});
test('requires stage token and rejects browser origin',async()=>{
  const f=envFixture();
  assert.equal((await call(f.env,'/v1/sync-status',{authenticated:false})).http,401);
  assert.equal((await post(f.env,'/v1/sync-signal',{signalId:nonce,state:'unchanged'})).http,200);
  assert.equal((await call(f.env,'/v1/sync-status',{origin:true})).http,403);
  assert.equal(f.signals.size,1);
});
test('exact schema rejects content, ids, sizes, urls and extra fields',async()=>{
  const f=envFixture();
  const invalid=[{signalId:nonce,state:'unchanged',catalog:'SECRET'},
    {signalId:nonce,state:'unchanged',trackCount:534},
    {signalId:nonce,state:'changed'},
    {signalId:nonce,state:'change_quarantined',storyId:'something'},
    {signalId:'short',state:'unchanged'},
    {signalId:nonce,state:'unchanged',driveUrl:'https://drive.google.com/foo'},
    {signalId:nonce},{}];
  for(const body of invalid){const r=await post(f.env,'/v1/sync-signal',body);assert.equal(r.http,400);}
  assert.equal(f.writes(),0);assert.equal(f.signals.size,0);
});
test('unchanged event writes one journal row without modifying catalog pointer or KV',async()=>{
  const f=envFixture();
  const before=await post(f.env,'/v1/bootstrap',{});assert.equal(before.http,200);
  const ptr=JSON.stringify(f.ptr());const kv=f.kvMap.size;
  const r=await post(f.env,'/v1/sync-signal',{signalId:nonce,state:'unchanged'});
  assert.equal(r.http,200);assert.equal(r.data.created,true);
  assert.equal(r.data.catalogPointerUnchanged,true);
  assert.equal(JSON.stringify(f.ptr()),ptr);assert.equal(f.kvMap.size,kv);
  assert.equal(f.writes(),1);const status=await call(f.env,'/v1/sync-status');
  assert.equal(status.data.signalCount,1);assert.equal(status.data.lastSignal,'unchanged');
});
test('changed observation only quarantines; does not promote or publish',async()=>{
  const f=envFixture();await post(f.env,'/v1/bootstrap',{});
  const ptr=JSON.stringify(f.ptr());
  const r=await post(f.env,'/v1/sync-signal',{signalId:nonce,state:'change_quarantined'});
  assert.equal(r.http,200);assert.equal(r.data.publicationDisabled,true);
  assert.equal(JSON.stringify(f.ptr()),ptr);
  assert.equal((await call(f.env,'/v1/sync-status')).data.lastSignal,'change_quarantined');
});
test('idempotent retry returns duplicate; conflicting reuse rejected',async()=>{
  const f=envFixture();const payload={signalId:nonce,state:'unchanged'};
  assert.equal((await post(f.env,'/v1/sync-signal',payload)).data.created,true);
  const twice=await post(f.env,'/v1/sync-signal',payload);
  assert.equal(twice.http,200);assert.equal(twice.data.duplicate,true);
  const conflict=await post(f.env,'/v1/sync-signal',{...payload,state:'change_quarantined'});
  assert.equal(conflict.http,409);assert.equal(conflict.data.error,'SIGNAL_ID_CONFLICT');
  assert.equal(f.signals.size,1);assert.equal(f.writes(),1);
});
test('same-event concurrent sends only write once',async()=>{
  const f=envFixture();const payload={signalId:nonce,state:'unchanged'};
  const responses=await Promise.all([post(f.env,'/v1/sync-signal',payload),post(f.env,'/v1/sync-signal',payload)]);
  assert.equal(responses.filter(r=>r.data.created).length,1);
  assert.equal(f.signals.size,1);
});
test('stage fails closed if STAGE_MODE changes',async()=>{
  const f=envFixture();f.env.STAGE_MODE='production';
  assert.equal((await post(f.env,'/v1/sync-signal',{signalId:nonce,state:'unchanged'})).http,503);
  assert.equal(f.writes(),0);
});
