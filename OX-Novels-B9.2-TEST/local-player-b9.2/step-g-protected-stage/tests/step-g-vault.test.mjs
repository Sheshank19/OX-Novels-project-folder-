import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import worker from '../src/worker.mjs';
import {createManifest,validateManifest,assembleAndVerify,splitPrivateCatalog,digestBytes,
  MAX_PART,MAX_CATALOG} from '../src/vault-core.mjs';
const TOK='T'.repeat(48);
const data=new TextEncoder().encode(JSON.stringify({version:1,
  tokens:Array.from({length:500},(_,i)=>`t1.${'a'.repeat(80)}.${i.toString(36)}`)}));
async function envelope(){return createManifest({candidateBytes:data,
  receiptBytes:new TextEncoder().encode('{"stepE":true}'),
  previousBytes:new TextEncoder().encode('{"static":true}'),folderCount:7,trackCount:534});}
function rig(){
 const mem=new Map(),env={STAGE_MODE:'protected-quarantine-only',PROTECTED_STAGE_ADMIN_TOKEN:TOK,
   PROTECTED_STAGE_KV:{
     async get(key,kind){const v=mem.get(key);if(v===undefined)return null;
       return kind==='text'?new TextDecoder().decode(v):v.buffer.slice(v.byteOffset,v.byteOffset+v.byteLength);},
     async put(key,data){mem.set(key,typeof data==='string'?new TextEncoder().encode(data):new Uint8Array(data));}
   }};
 async function call(route,body,opts={}){
   const headers={}; if(opts.auth!==false)headers.authorization='Bearer '+TOK;
   if(opts.origin)headers.origin='https://evil.example';
   const response=await worker.fetch(new Request('https://protected.invalid'+route,{
     method:opts.method||'POST',headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
   return {status:response.status,body:await response.json(),headers:response.headers};
 }
 return {call,mem,env};
}
const base64url=bytes=>Buffer.from(bytes).toString('base64url');
async function stage(rig,x){const m=await rig.call('/v1/quarantine/manifest',{manifest:x.manifest});
 assert.equal(m.status,200,JSON.stringify(m.body));return m.body.manifestId;}
test('chunk contract has bounded parts and no raw story metadata',async()=>{
 const x=await envelope();assert.ok(x.parts.length>=2);
 assert.equal(x.manifest.totalBytes,data.length);
 assert.ok(x.parts.every(p=>p.length<=MAX_PART));
 assert.ok(!JSON.stringify(x.manifest).includes('t1.'));
 assert.deepEqual(await assembleAndVerify(x.manifest,x.parts),data);
});
test('manifest must explicitly disable publication, activation, and snapshot assertion',async()=>{
 const x=await envelope();for(const bad of [
  {...x.manifest,publicationAllowed:true}, {...x.manifest,activationDisabled:false},
  {...x.manifest,pinnedSnapshotProven:true}, {...x.manifest,extra:'drive_id'},
  {...x.manifest,parts:[]}, {...x.manifest,totalBytes:MAX_CATALOG+1},
  {...x.manifest,parts:[{digest:'not_hex',bytes:10}]},
  {...x.manifest,trackCount:0}]) assert.throws(()=>validateManifest(bad));
});
test('one wrong chunk or entire-file digest fails closed',async()=>{
 const x=await envelope();const parts=x.parts.map(p=>new Uint8Array(p));parts[0][0]^=1;
 await assert.rejects(assembleAndVerify(x.manifest,parts),/CHUNK_INTEGRITY_FAILED/);
 const c=structuredClone(x.manifest);c.catalogSha256='1'.repeat(64);
 await assert.rejects(assembleAndVerify(c,x.parts),/CATALOG_INTEGRITY_FAILED/);
});
test('oversized candidate cannot create a manifest',()=>{
 assert.throws(()=>splitPrivateCatalog(new Uint8Array(MAX_CATALOG+1)),/CATALOG_SIZE_UNSUPPORTED/);
});
test('health is safe; quarantine Worker has no playback or activation',async()=>{
 const r=rig();const h=await r.call('/health',undefined,{method:'GET',auth:false});
 assert.equal(h.status,200);assert.equal(h.body.activationDisabled,true);
 for(const route of ['/v1/promote','/v1/rollback','/listen/test','/stream','/v1/catalog-preview/current']){
  const a=await r.call(route,{});assert.equal(a.status,404);
 }
 assert.equal(r.mem.size,0);
});
test('fail closed with incorrect STAGE_MODE, missing secret or KV',async()=>{
 const r=rig();r.env.STAGE_MODE='synthetic-only';
 assert.equal((await r.call('/v1/quarantine/manifest',{manifest:(await envelope()).manifest})).status,503);
 r.env.STAGE_MODE='protected-quarantine-only';delete r.env.PROTECTED_STAGE_KV;
 assert.equal((await r.call('/v1/quarantine/get-manifest',{manifestId:'0'.repeat(64)})).status,503);
});
test('bearer auth, browser origin, unsupported HTTP methods and query blocked',async()=>{
 const r=rig();const x=await envelope();
 assert.equal((await r.call('/v1/quarantine/manifest',{manifest:x.manifest},{auth:false})).status,401);
 assert.equal((await r.call('/v1/quarantine/manifest',{manifest:x.manifest},{origin:true})).status,403);
 assert.equal((await r.call('/v1/quarantine/manifest',undefined,{method:'GET'})).status,405);
 assert.equal((await r.call('/v1/quarantine/manifest?index=0',{manifest:x.manifest})).status,400);
 assert.equal(r.mem.size,0);
});
test('authenticated manifest + chunk private roundtrip, with exact digest verification',async()=>{
 const r=rig(),x=await envelope();const id=await stage(r,x);
 assert.equal(id,await digestBytes(JSON.stringify(x.manifest)));
 const y=await r.call('/v1/quarantine/get-manifest',{manifestId:id});
 assert.equal(y.status,200);assert.deepEqual(y.body.manifest,x.manifest);
 const downloaded=[];
 for(let i=0;i<x.parts.length;i++){
  const upload=await r.call('/v1/quarantine/put-chunk',{manifestId:id,index:i,content:base64url(x.parts[i])});
  assert.equal(upload.status,200,JSON.stringify(upload.body));
  assert.equal(upload.body.activationDisabled,true);
  const got=await r.call('/v1/quarantine/get-chunk',{manifestId:id,index:i});
  assert.equal(got.status,200);
  downloaded.push(new Uint8Array(Buffer.from(got.body.content,'base64url')));
 }
 assert.deepEqual(await assembleAndVerify(x.manifest,downloaded),data);
 assert.equal(r.mem.size,x.parts.length+1);
});
test('duplicate identical chunk is idempotent; corrupt overwrite rejected',async()=>{
 const r=rig(),x=await envelope(),id=await stage(r,x);
 const request={manifestId:id,index:0,content:base64url(x.parts[0])};
 assert.equal((await r.call('/v1/quarantine/put-chunk',request)).body.created,true);
 assert.equal((await r.call('/v1/quarantine/put-chunk',request)).body.created,false);
 const k=[...r.mem.keys()].find(v=>v.includes('chunk'));
 r.mem.get(k)[0]^=1;
 assert.equal((await r.call('/v1/quarantine/put-chunk',request)).status,409);
 assert.equal((await r.call('/v1/quarantine/get-chunk',{manifestId:id,index:0})).status,503);
});
test('wrong content, part index, and absent manifest fail',async()=>{
 const r=rig(),x=await envelope(),id=await stage(r,x);
 const changed=new Uint8Array(x.parts[0]);changed[5]^=1;
 assert.equal((await r.call('/v1/quarantine/put-chunk',{manifestId:id,index:0,content:base64url(changed)})).status,400);
 assert.equal((await r.call('/v1/quarantine/put-chunk',{manifestId:id,index:-1,content:base64url(x.parts[0])})).status,400);
 assert.equal((await r.call('/v1/quarantine/get-chunk',{manifestId:id,index:0})).status,404);
 assert.equal((await r.call('/v1/quarantine/get-manifest',{manifestId:'f'.repeat(64)})).status,404);
});
test('tampered manifest in KV refused and no confidential JSON leaked',async()=>{
 const r=rig(),x=await envelope(),id=await stage(r,x);
 const k=[...r.mem.keys()][0];r.mem.set(k,new TextEncoder().encode('{}'));
 const got=await r.call('/v1/quarantine/get-manifest',{manifestId:id});
 assert.equal(got.status,503);assert.equal(got.body.ok,false);assert.equal(JSON.stringify(got.body).includes('t1.'),false);
});
test('a random UUID / Drive identifier cannot appear in manifest schema',async()=>{
 const r=rig(),x=await envelope();const invalid={...x.manifest,driveFolderId:'some-drive-id'};
 assert.equal((await r.call('/v1/quarantine/manifest',{manifest:invalid})).status,503);
 assert.equal(r.mem.size,0);
});
