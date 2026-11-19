import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';

const T='s'.repeat(48);
function rig(){
  const kv=new Map();const signals=new Map();let pointer=null,writeCount=0,kvPutCount=0;
  const env={STAGE_MODE:'synthetic-only',STAGE_ADMIN_TOKEN:T,
    STAGE_KV:{async get(k){return kv.has(k)?kv.get(k):null;},async put(k,v){kvPutCount++;kv.set(k,v);}},
    STAGE_DB:{withSession(mode){assert.equal(mode,'first-primary');return {prepare(sql){return {
      bind(...params){return {
        async first(){
          if(sql.startsWith('SELECT revision, pointer_json'))return pointer;
          if(sql.startsWith('SELECT signal_state FROM stage_sync_signals WHERE'))return signals.has(params[0])?{signal_state:signals.get(params[0])}:null;
          throw Error('UNEXPECTED_FIRST');
        },
        async run(){
          if(sql.startsWith('INSERT OR IGNORE INTO stage_pointers')){
            if(pointer)return {success:true,meta:{changes:0}};
            pointer={revision:0,pointer_json:params[2]};writeCount++;
            return {success:true,meta:{changes:1}};
          }
          if(sql.startsWith('UPDATE stage_pointers')){
            const [revision,pointer_json,,,expected]=params;
            if(!pointer||pointer.revision!==expected)return {success:true,meta:{changes:0}};
            pointer={revision,pointer_json};writeCount++;
            return {success:true,meta:{changes:1}};
          }
          throw Error('UNEXPECTED_RUN');
        }
      };}
    };}};}}};
  async function request(route,method='GET',data,{auth=true,origin=false}={}){
    const headers={};if(auth)headers.authorization='Bearer '+T;
    if(origin)headers.origin='https://elsewhere.invalid';
    if(data!==undefined)headers['content-type']='application/json';
    const r=await worker.fetch(new Request('https://synthetic.invalid'+route,{method,headers,
      body:data===undefined?undefined:JSON.stringify(data)}),env);
    return {status:r.status,json:await r.json(),cache:r.headers.get('cache-control')};
  }
  const post=(path,data={})=>request(path,'POST',data);
  const get=(path,opts)=>request(path,'GET',undefined,opts);
  return {kv,post,get,request,env,
    pointer:()=>pointer&&JSON.parse(pointer.pointer_json),
    editPointer:fn=>{const p=JSON.parse(pointer.pointer_json);fn(p);pointer.pointer_json=JSON.stringify(p);},
    removeCurrent:()=>{const p=JSON.parse(pointer.pointer_json);kv.delete(p.current.blobKey);},
    corruptCurrent:()=>{const p=JSON.parse(pointer.pointer_json);kv.set(p.current.blobKey,'{}');},
    corruptSynthetic:()=>{const p=JSON.parse(pointer.pointer_json);const c=JSON.parse(kv.get(p.current.blobKey));c.synthetic=false;kv.set(p.current.blobKey,JSON.stringify(c));},
    countWrites:()=>[writeCount,kvPutCount]};
}
const curr='/v1/catalog-preview/current',prev='/v1/catalog-preview/previous';

test('no initial catalog means fail-closed and no storage writes',async()=>{
  const f=rig();const r=await f.get(curr);assert.equal(r.status,409);
  assert.equal(r.json.error,'NOT_INITIALIZED');assert.deepEqual(f.countWrites(),[0,0]);
});
test('bootstrap lets authenticated reader view only synthetic current summary',async()=>{
  const f=rig();assert.equal((await f.post('/v1/bootstrap')).status,200);
  const before=f.countWrites(),p=f.pointer();
  const a=await f.get(curr);assert.equal(a.status,200,JSON.stringify(a.json));
  assert.equal(a.json.generationId,'g_b92_seed_00001');assert.equal(a.json.role,'current');
  assert.equal(a.json.folderCount,1);assert.equal(a.json.trackCount,1);
  assert.equal(a.json.folder.name,'Synthetic Test Folder');
  assert.equal(a.json.folder.tracks[0].name,'Synthetic Test Item');
  assert.equal(a.json.syntheticOnly,true);assert.equal(a.json.publicationDisabled,true);
  assert.equal(a.json.playback,false);assert.equal(a.json.globalKvPropagationProven,false);
  assert.match(a.cache,/no-store/);
  assert.deepEqual(f.countWrites(),before);assert.deepEqual(f.pointer(),p);
  assert.equal((await f.get(prev)).status,409);
});
test('promote reads current generation through D1 pointer, preserves prior within grace',async()=>{
  const f=rig();await f.post('/v1/bootstrap');await f.post('/v1/prepare');
  const r=await f.post('/v1/promote',{expectedRevision:0});assert.equal(r.status,200,JSON.stringify(r.json));
  const before=f.countWrites(),ptr=f.pointer();
  const current=await f.get(curr),previous=await f.get(prev);
  assert.equal(current.status,200);assert.equal(previous.status,200);
  assert.equal(current.json.generationId,'g_b92_cand_00002');
  assert.equal(previous.json.generationId,'g_b92_seed_00001');
  assert.equal(current.json.revision,1);assert.equal(previous.json.revision,1);
  assert.deepEqual(f.countWrites(),before);assert.deepEqual(f.pointer(),ptr);
});
test('an expired previous generation is not readable',async()=>{
  const f=rig();await f.post('/v1/bootstrap');await f.post('/v1/prepare');await f.post('/v1/promote',{expectedRevision:0});
  f.editPointer(p=>p.graceUntil=Date.now()-1000);
  assert.equal((await f.get(curr)).status,200);
  const r=await f.get(prev);assert.equal(r.status,409);assert.equal(r.json.error,'PREVIOUS_GENERATION_NOT_AVAILABLE');
});
test('rollback swaps current and previous readers while preserving grace',async()=>{
  const f=rig();await f.post('/v1/bootstrap');await f.post('/v1/prepare');await f.post('/v1/promote',{expectedRevision:0});
  const rr=await f.post('/v1/rollback',{expectedRevision:1});assert.equal(rr.status,200);
  assert.equal((await f.get(curr)).json.generationId,'g_b92_seed_00001');
  assert.equal((await f.get(prev)).json.generationId,'g_b92_cand_00002');
  assert.equal((await f.get(curr)).json.revision,2);
});
test('rejects missing, tampered or foreign-synthetic bytes and never falls back',async()=>{
  for(const issue of ['missing','tampered','invalid-synthetic']){
    const f=rig();await f.post('/v1/bootstrap');
    if(issue==='missing')f.removeCurrent();
    else if(issue==='tampered')f.corruptCurrent();
    else f.corruptSynthetic();
    const r=await f.get(curr);assert.equal(r.status,503,issue);
    assert.equal(r.json.ok,false);assert.equal('folder' in r.json,false);
  }
});
test('auth, browser, method, query and mode protections still apply',async()=>{
  const f=rig();await f.post('/v1/bootstrap');
  assert.equal((await f.get(curr,{auth:false})).status,401);
  assert.equal((await f.get(curr,{origin:true})).status,403);
  assert.equal((await f.get(curr+'?generationId=g_other')).status,400);
  assert.equal((await f.request(curr,'POST',{})).status,404);
  f.env.STAGE_MODE='live';assert.equal((await f.get(curr)).status,503);
});
test('read endpoints cannot be used to expose real catalog content',async()=>{
  const f=rig();await f.post('/v1/bootstrap');
  const c=await f.get(curr);
  const string=JSON.stringify(c.json);
  assert.doesNotMatch(string,/drive\.google|\.m4a|t1\.|STAGE_ADMIN_TOKEN|sourceVersion|blobKey|digest|fileId/i);
  assert.equal(c.json.realPlayerIntegration,false);
});
