/**
 * OX B9.2 Step G -- ISOLATED PROTECTED CATALOG QUARANTINE VAULT.
 * This Worker MUST NOT be deployed before explicit user approval. It can ONLY
 * store and read authenticated protected catalog bytes in a dedicated KV.
 * No catalog pointer, D1, activation, Drive API, audio, schedule, or Player hook.
 * Never deploy over Step C synthetic staging Worker or production `listen`.
 */
import {validateManifest,digestBytes,isHex,MAX_PART} from './vault-core.mjs';
const PREFIX='b92:stepg:quarantine:v1:';
const NO_CACHE={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store, private, max-age=0',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; frame-ancestors 'none'"
};
class Fault extends Error{constructor(code,status=400){super(code);this.code=code;this.status=status;}}
function fail(code,status=400){throw new Fault(code,status);}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:NO_CACHE});}
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function guard(req,env){
  if(env.STAGE_MODE!=='protected-quarantine-only'||!env.PROTECTED_STAGE_KV)
    fail('PROTECTED_STAGE_DISABLED',503);
  if(typeof env.PROTECTED_STAGE_ADMIN_TOKEN!=='string'||env.PROTECTED_STAGE_ADMIN_TOKEN.length<32)
    fail('PROTECTED_STAGE_NOT_CONFIGURED',503);
  if(req.headers.has('origin'))fail('BROWSER_ORIGIN_DENIED',403);
  if(!equal(req.headers.get('authorization')||'','Bearer '+env.PROTECTED_STAGE_ADMIN_TOKEN))fail('UNAUTHORIZED',401);
}
async function parse(req,keys,max=70_000){
  if(Number(req.headers.get('content-length')||0)>max)fail('REQUEST_TOO_LARGE',413);
  const text=await req.text();if(text.length>max)fail('REQUEST_TOO_LARGE',413);
  let body;try{body=JSON.parse(text);}catch{fail('INVALID_REQUEST_JSON');}
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).length!==keys.length||Object.keys(body).some(k=>!keys.includes(k)))
    fail('INVALID_REQUEST_FIELDS');
  return body;
}
function keys(id,index){return PREFIX+'chunk:'+id+':'+index;}
function manifestKey(id){return PREFIX+'manifest:'+id;}
function decodeChunk(s){
  if(typeof s!=='string'||s.length<1||s.length>33_000||!/^[A-Za-z0-9_-]+$/.test(s))fail('INVALID_CHUNK');
  const base=s.replace(/-/g,'+').replace(/_/g,'/');
  let data;try{data=atob(base);}catch{fail('INVALID_CHUNK');}
  const bytes=Uint8Array.from(data,ch=>ch.charCodeAt(0));
  if(bytes.length<1||bytes.length>MAX_PART)fail('INVALID_CHUNK');
  // Reject ambiguous base64 spelling/padding while permitting base64url without padding.
  let canon=btoa(data).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  if(canon!==s)fail('INVALID_CHUNK');
  return bytes;
}
function encodeChunk(bytes){
  let binary='';for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function getManifest(kv,id){
  if(!isHex(id))fail('INVALID_MANIFEST_ID');
  const raw=await kv.get(manifestKey(id),'text');
  if(raw===null)fail('QUARANTINE_NOT_FOUND',404);
  if(await digestBytes(raw)!==id)fail('QUARANTINE_MANIFEST_CORRUPTED',503);
  let manifest;try{manifest=JSON.parse(raw);validateManifest(manifest);}catch{fail('QUARANTINE_MANIFEST_CORRUPTED',503);}
  return {raw,manifest};
}
async function storeImmutable(kv,key,value){
  const original=await kv.get(key,'arrayBuffer');
  if(original!==null){
    const found=new Uint8Array(original);
    if(found.length!==value.length||await digestBytes(found)!==await digestBytes(value))
      fail('IMMUTABLE_QUARANTINE_CONFLICT',409);
    return false;
  }
  await kv.put(key,value);
  return true;
}
async function action(req,env,url){
  guard(req,env);
  if(req.method!=='POST')fail('METHOD_NOT_ALLOWED',405);
  if(url.pathname==='/v1/quarantine/manifest'){
    const {manifest}=await parse(req,['manifest'],5000);
    validateManifest(manifest);
    const raw=JSON.stringify(manifest);
    const id=await digestBytes(raw);
    const created=await storeImmutable(env.PROTECTED_STAGE_KV,manifestKey(id),new TextEncoder().encode(raw));
    return json({ok:true,quarantinedOnly:true,manifestId:id,created,activationDisabled:true});
  }
  if(url.pathname==='/v1/quarantine/get-manifest'){
    const {manifestId}=await parse(req,['manifestId'],1000);
    const {manifest}=await getManifest(env.PROTECTED_STAGE_KV,manifestId);
    return json({ok:true,quarantinedOnly:true,manifest,activationDisabled:true});
  }
  if(url.pathname==='/v1/quarantine/put-chunk'){
    const {manifestId,index,content}=await parse(req,['manifestId','index','content']);
    const {manifest}=await getManifest(env.PROTECTED_STAGE_KV,manifestId);
    if(!Number.isSafeInteger(index)||index<0||index>=manifest.parts.length)fail('INVALID_PART_INDEX');
    const bytes=decodeChunk(content);
    if(bytes.length!==manifest.parts[index].bytes||await digestBytes(bytes)!==manifest.parts[index].digest)
      fail('CHUNK_INTEGRITY_FAILED');
    const created=await storeImmutable(env.PROTECTED_STAGE_KV,keys(manifestId,index),bytes);
    return json({ok:true,quarantinedOnly:true,part:index,created,activationDisabled:true});
  }
  if(url.pathname==='/v1/quarantine/get-chunk'){
    const {manifestId,index}=await parse(req,['manifestId','index'],1000);
    const {manifest}=await getManifest(env.PROTECTED_STAGE_KV,manifestId);
    if(!Number.isSafeInteger(index)||index<0||index>=manifest.parts.length)fail('INVALID_PART_INDEX');
    const raw=await env.PROTECTED_STAGE_KV.get(keys(manifestId,index),'arrayBuffer');
    if(raw===null)fail('CHUNK_NOT_AVAILABLE',404);
    const bytes=new Uint8Array(raw);
    if(bytes.length!==manifest.parts[index].bytes||await digestBytes(bytes)!==manifest.parts[index].digest)
      fail('CHUNK_INTEGRITY_FAILED',503);
    return json({ok:true,quarantinedOnly:true,part:index,content:encodeChunk(bytes),activationDisabled:true});
  }
  fail('ROUTE_DISABLED',404);
}
export default {async fetch(req,env){
  const url=new URL(req.url);
  if(url.search||url.hash)return json({ok:false,error:'QUERY_PARAMETERS_DISABLED'},400);
  if(req.method==='GET'&&url.pathname==='/health')return json({ok:true,
    service:'OX B9.2 Step G private quarantine vault',stageOnly:true,activationDisabled:true,
    publicationDisabled:true,playback:false,driveAccess:false,automaticSync:false,
    realContentMayBeStoredOnlyWithExplicitConsent:true});
  try{return await action(req,env,url);}catch(e){
    return json({ok:false,error:e instanceof Fault?e.code:'STAGE_OPERATION_FAILED'},e instanceof Fault?e.status:503);
  }
}};
