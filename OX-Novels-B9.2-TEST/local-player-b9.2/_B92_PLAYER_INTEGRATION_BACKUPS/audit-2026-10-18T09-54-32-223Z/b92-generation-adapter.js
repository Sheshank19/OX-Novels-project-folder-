/**
 * B9.2 safe integration around the user's existing catalog manager.
 * This module NEVER writes to, or alters, the installed manager source.
 * The unverified legacy B9 single-pass scanner is deliberately inactive.
 */
import {
  authSync as legacyAuthSync,
  handleAdminAction as legacyAdminAction
} from './b9-catalog-manager.js';
import { selectGeneration } from './b92-generation-policy.js';
import {readLiveState,getImmutableCatalog} from './b92-live-catalog-store.js';
export * from './b9-catalog-manager.js';

const storyIdOk = /^[a-z0-9][a-z0-9._-]{0,159}$/;
const genOk = /^g_[A-Za-z0-9_-]{5,100}$/;
function json(o,status){return new Response(JSON.stringify(o),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff'
}});}
async function state(env,id){
  // A bound D1 table is authoritative. Do not fall back to eventually-consistent KV
  // if it is absent, corrupted or temporarily unavailable.
  if(env.B92_POINTER_DB)return readLiveState(env,id);
  if(!env.B9_CATALOG_KV)return null;
  return await env.B9_CATALOG_KV.get(`b9:state:${id}`,'json');
}
export async function playbackGeneration(env,index,id,track,now=Date.now()){
  if(!storyIdOk.test(id))return null;
  const st=await state(env,id);
  return selectGeneration({storyId:id,staticMeta:index[id]||null,state:st,
    generationId:String(track?.generationId||''),
    sourceVersion:String(track?.sourceVersion||''),now});
}
export async function catalogAsset(_request,env,index,id,generation){
  if(!storyIdOk.test(id)||!genOk.test(generation))return json({error:'Not found'},404);
  const st=await state(env,id);
  const selected=selectGeneration({storyId:id,staticMeta:index[id]||null,
    state:st,generationId:generation,now:Date.now()});
  if(!selected||!selected.meta.blobKey)return json({error:'Catalog generation unavailable'},404);
  if(!env.B9_CATALOG_KV)return json({error:'Catalog storage unavailable'},503);
  let body;
  try {
    if(selected.meta.blobKey.startsWith('b92:live:catalog:sha256:'))
      body=await getImmutableCatalog(env,selected.meta.blobKey,selected.meta.fingerprint);
    else body=await env.B9_CATALOG_KV.get(selected.meta.blobKey);
  } catch {return json({error:'Catalog temporarily unavailable'},503);}
  if(!body)return json({error:'Catalog temporarily unavailable'},503);
  return new Response(body,{headers:{'content-type':'application/json; charset=utf-8',
    'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
}
// This original scanner can only read one non-paginated Drive listing. It MUST NOT
// be able to replace a good catalog even if the user's manager differs from our copy.
export async function processScanQueue(batch){
  for(const message of batch.messages||[]){
    console.warn('B9.2 legacy one-pass scan rejected; sealed paginated sync not integrated');
    message.ack();
  }
}
export async function runPacificCron(){
  console.warn('B9.2 legacy auto-publish disabled pending sealed paginated sync');
}
export async function reconcile(){
  throw Error('B9.2 legacy unsealed sync disabled; existing catalogs retained');
}
export async function handleSyncNotice(request,env){
  if(!legacyAuthSync(request,env))return json({error:'Unauthorized'},401);
  return json({error:'Unsealed scan is disabled; existing catalogs retained'},503);
}
export async function handleAdminAction(request,env,index){
  let obj;
  try{obj=await request.clone().json();}catch{return json({error:'Invalid JSON'},400);}
  if(obj?.action==='status')return legacyAdminAction(request,env,index);
  return json({error:'Legacy one-pass scans disabled; existing catalogs retained'},503);
}

// Live catalog page lookup also uses the same authoritative D1 generation state.
// Existing unbound installations retain their earlier catalogMeta behavior.
export async function catalogMeta(env,index,id){
  if(!storyIdOk.test(id))return null;
  if(env.B92_POINTER_DB){
    const ptr=await readLiveState(env,id);
    return ptr?.disabled===true ? null : ptr?.active===true ? ptr : index[id]||null;
  }
  if(env.B9_CATALOG_KV){
    const ptr=await state(env,id);
    return ptr?.disabled===true ? null : ptr?.active===true ? ptr : index[id]||null;
  }
  return index[id]||null;
}
