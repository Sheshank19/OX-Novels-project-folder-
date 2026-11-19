import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
const TOKEN='x'.repeat(48);
function makeEnv(){
  const kvMap=new Map();let pointerRow=null;let writes=0;
  const kv={
    async get(k){return kvMap.has(k)?kvMap.get(k):null;},
    async put(k,v){writes++;kvMap.set(k,v);}
  };
  const db={withSession(mode){assert.equal(mode,'first-primary');return {
    prepare(sql){return {
      bind(...args){return {
        async first(){
          assert.match(sql,/^SELECT revision/);
          if(!pointerRow)return null;
          return {revision:pointerRow.revision,pointer_json:pointerRow.pointer_json};
        },
        async run(){
          if(sql.startsWith('INSERT OR IGNORE')){
            if(pointerRow)return {success:true,meta:{changes:0}};
            pointerRow={revision:0,pointer_json:args[2]};
            return {success:true,meta:{changes:1}};
          }
          if(sql.startsWith('UPDATE stage_pointers')){
            const [nextRevision,json,,story,expected]=args;
            assert.equal(story,'b92-staging-fixture');
            if(!pointerRow||pointerRow.revision!==expected)return {success:true,meta:{changes:0}};
            pointerRow={revision:nextRevision,pointer_json:json};
            return {success:true,meta:{changes:1}};
          }
          throw Error('UNEXPECTED_SQL');
        }
      };}
    };}
  };}};
  return {env:{STAGE_MODE:'synthetic-only',STAGE_KV:kv,STAGE_DB:db,STAGE_ADMIN_TOKEN:TOKEN},
    kvMap, getWrites:()=>writes,corrupt(key){kvMap.set(key,'tampered');},deleteBlob(key){kvMap.delete(key);}};
}
async function call(env,route,{method='GET',data,auth=true,origin=false}={}){
  const headers={};
  if(auth)headers.authorization='Bearer '+TOKEN;
  if(origin)headers.origin='https://untrusted.example';
  if(data!==undefined)headers['content-type']='application/json';
  const req=new Request('https://stage.example'+route,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});
  const res=await worker.fetch(req,env);
  return {status:res.status,body:await res.json(),cache:res.headers.get('cache-control')};
}
const post=(env,route,data={})=>call(env,route,{method:'POST',data});
test('health safe, no private data and no network',async()=>{
  const t=makeEnv();const r=await call(t.env,'/health',{auth:false});
  assert.equal(r.status,200);assert.equal(r.body.publicationDisabled,true);
  assert.match(r.cache,/no-store/);
});
test('authentication required for all mutation and status endpoints',async()=>{
  const t=makeEnv();assert.equal((await call(t.env,'/v1/status',{auth:false})).status,401);
  assert.equal((await call(t.env,'/v1/bootstrap',{auth:false,method:'POST',data:{}})).status,401);
  assert.equal(t.kvMap.size,0);
});
test('browser origin and invalid parameter blocked',async()=>{
  const t=makeEnv();assert.equal((await call(t.env,'/v1/status',{origin:true})).status,403);
  assert.equal((await post(t.env,'/v1/bootstrap',{content:'REAL_CATALOG'})).status,400);
  assert.equal(t.kvMap.size,0);
});
test('missing DB/KV bindings refuse to initialize',async()=>{
  const t=makeEnv();t.env.STAGE_DB=null;
  assert.equal((await post(t.env,'/v1/bootstrap')).status,503);
});
test('bootstrap prepare promote integrity rollback with D1 CAS, KV content verification',async()=>{
  const t=makeEnv();
  let r=await post(t.env,'/v1/bootstrap');assert.equal(r.status,200);assert.equal(r.body.state.revision,0);
  assert.equal(t.kvMap.size,1);
  r=await post(t.env,'/v1/prepare');assert.equal(r.status,200);assert.equal(t.kvMap.size,2);
  r=await post(t.env,'/v1/promote',{expectedRevision:0});
  assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.state.revision,1);
  assert.equal(r.body.state.currentGeneration,'g_b92_cand_00002');
  assert.equal(r.body.state.acceptedGenerations.length,2);
  assert.equal((await post(t.env,'/v1/promote',{expectedRevision:0})).status,409);
  r=await call(t.env,'/v1/integrity');assert.equal(r.status,200);assert.equal(r.body.globalKvPropagationProven,false);
  r=await post(t.env,'/v1/rollback',{expectedRevision:1});
  assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.state.revision,2);
  assert.equal(r.body.state.currentGeneration,'g_b92_seed_00001');
  assert.equal((await post(t.env,'/v1/rollback',{expectedRevision:1})).status,409);
  assert.equal(t.getWrites(),2); // two immutable KV blobs, no repeat writes
});
test('cannot promote before preparing candidate',async()=>{
  const t=makeEnv();await post(t.env,'/v1/bootstrap');
  const r=await post(t.env,'/v1/promote',{expectedRevision:0});
  assert.equal(r.status,409);assert.equal(r.body.error,'CANDIDATE_NOT_PREPARED');
});
test('integrity fails safely on tampered KV candidate',async()=>{
  const t=makeEnv();await post(t.env,'/v1/bootstrap');await post(t.env,'/v1/prepare');
  await post(t.env,'/v1/promote',{expectedRevision:0});
  const candidateKey=[...t.kvMap.keys()].find(k=>t.kvMap.get(k).includes('g_b92_cand_00002'));
  t.corrupt(candidateKey);
  const r=await call(t.env,'/v1/integrity');
  assert.equal(r.status,503);assert.equal(r.body.error,'STAGING_OPERATION_FAILED');
});
test('no endpoints for real catalog upload, audio, or scheduling',async()=>{
  const t=makeEnv();
  assert.equal((await post(t.env,'/v1/upload',{catalog:'private'})).status,400);
  assert.equal((await call(t.env,'/listen/story')).status,404);
  assert.equal((await call(t.env,'/health?token=abc')).status,400);
});
test('all endpoints fail closed when mode changed',async()=>{
  const t=makeEnv();t.env.STAGE_MODE='production';
  assert.equal((await post(t.env,'/v1/bootstrap')).status,503);
});

test('parallel same-revision attempts can only commit one D1 CAS',async()=>{
  const t=makeEnv();await post(t.env,'/v1/bootstrap');await post(t.env,'/v1/prepare');
  const replies=await Promise.all([
    post(t.env,'/v1/promote',{expectedRevision:0}),
    post(t.env,'/v1/promote',{expectedRevision:0})
  ]);
  assert.deepEqual(replies.map(r=>r.status).sort((a,b)=>a-b),[200,409]);
  const status=await call(t.env,'/v1/status');
  assert.equal(status.body.state.revision,1);
});
test('rollback requires an actual previous generation, without mutating state on rejection',async()=>{
  const t=makeEnv();await post(t.env,'/v1/bootstrap');
  const rejected=await post(t.env,'/v1/rollback',{expectedRevision:0});
  assert.equal(rejected.status,503);
  const after=await call(t.env,'/v1/status');
  assert.equal(after.body.state.revision,0);
});
