/**
 * OX B9.2 Step C — synthetic-only control-plane staging experiment.
 * No real catalogs, Drive access, audio endpoints, scheduled jobs, player hooks,
 * main-site routes, or automatic publication. Step D adds an authenticated
 * 1-bit journal only; it NEVER changes the catalog pointer. Never deploy as production Player.
 */
import {sha256,loadReference,rehearsePromotion,rehearseRollback,
  playableGeneration} from './activation-core.mjs';

const STORY='b92-staging-fixture';
const SOURCE='aaaaaaaaaaaa';
const BLOB_PREFIX='b92:stepc:synthetic:blob:';
const MAX_BODY=1024;
const TOK_LEN=32;
const corsFreeHeaders={
  'cache-control':'no-store, private, max-age=0',
  'content-type':'application/json; charset=utf-8',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; frame-ancestors 'none'"
};
class StageFault extends Error {constructor(code,status=400){super(code);this.code=code;this.status=status;}}
function fail(code,status){throw new StageFault(code,status);}
function result(data,status=200){return new Response(JSON.stringify(data),{status,headers:corsFreeHeaders});}
function fixture(generationId){
  const track={key:'SYNTHETIC_FAKE_TOKEN_NOT_FOR_PLAYBACK',name:'Synthetic Test Item',mimeType:'audio/mpeg',size:1,modifiedAt:'2026-01-01T00:00:00.000Z',previousKey:'',nextKey:''};
  return {synthetic:true,version:1,storyId:STORY,sourceVersion:SOURCE,generationId,
    builtAt:'2026-01-01T00:00:00.000Z',rootKey:'fixture-root',folderCount:1,trackCount:1,
    folders:{'fixture-root':{name:'Synthetic Test Folder',folders:[],tracks:[track]}}};
}
const BASE=fixture('g_b92_seed_00001');
const NEXT=fixture('g_b92_cand_00002');
const stringify=x=>JSON.stringify(x);
function safeEqual(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0;
}
function auth(req,env){
  const token=env.STAGE_ADMIN_TOKEN;
  if(typeof token!=='string'||token.length<TOK_LEN)fail('STAGE_NOT_CONFIGURED',503);
  const expected='Bearer '+token;
  if(!safeEqual(req.headers.get('authorization')||'',expected))fail('UNAUTHORIZED',401);
  // Strictly prevent use from browser-based cross-origin scripts.
  if(req.headers.has('origin'))fail('BROWSER_REQUEST_DISALLOWED',403);
}
async function bodyJson(req, allowedKeys=['expectedRevision']){
  if(req.headers.get('content-length') && Number(req.headers.get('content-length'))>MAX_BODY)fail('REQUEST_TOO_LARGE',413);
  const text=await req.text();if(text.length>MAX_BODY)fail('REQUEST_TOO_LARGE',413);
  let j;try{j=JSON.parse(text||'{}');}catch{fail('INVALID_JSON',400);}
  if(!j||typeof j!=='object'||Array.isArray(j))fail('INVALID_JSON',400);
  if(Object.keys(j).some(k=>!allowedKeys.includes(k)))fail('UNKNOWN_PARAMETER',400);
  return j;
}
function expectedRevision(json){
  if(!Number.isSafeInteger(json.expectedRevision)||json.expectedRevision<0||json.expectedRevision>10000)
    fail('INVALID_EXPECTED_REVISION',400);
  return json.expectedRevision;
}
class StageStore {
  constructor(db,kv){this.db=db;this.kv=kv;}
  async getBlob(key){
    if(typeof key!=='string'||!key.startsWith(BLOB_PREFIX))fail('NOT_STAGE_KEY');
    return await this.kv.get(key,'text');
  }
  async putImmutable(key,content){
    if(!key.startsWith(BLOB_PREFIX)||typeof content!=='string'||content.length>8192)fail('STAGE_BLOB_REFUSED');
    const digest=await sha256(content);
    if(key!==BLOB_PREFIX+digest)fail('INVALID_DIGEST_KEY');
    const seen=await this.getBlob(key);
    if(seen!==null){if(seen!==content)fail('IMMUTABLE_COLLISION',409);return;}
    await this.kv.put(key,content);
  }
  async recordSignal(signalId,state){
    // Stores ONLY random opaque signal IDs and a 1-bit status. Never Drive IDs,
    // names, audio metadata, catalogs, or credentials. No pointer updates.
    const write=await this.db.prepare('INSERT OR IGNORE INTO stage_sync_signals (signal_id,signal_state,received_at) VALUES (?,?,?)')
      .bind(signalId,state,Date.now()).run();
    if(!write.success)fail('D1_SIGNAL_WRITE_FAILED',503);
    const saved=await this.db.prepare('SELECT signal_state FROM stage_sync_signals WHERE signal_id=?')
      .bind(signalId).first();
    if(!saved)fail('D1_SIGNAL_READBACK_FAILED',503);
    if(saved.signal_state!==state)fail('SIGNAL_ID_CONFLICT',409);
    return {created:write.meta?.changes===1,duplicate:write.meta?.changes!==1};
  }
  async signalSummary(){
    const count=await this.db.prepare('SELECT COUNT(*) AS n FROM stage_sync_signals').first();
    const latest=await this.db.prepare('SELECT signal_state FROM stage_sync_signals ORDER BY received_at DESC, rowid DESC LIMIT 1').first();
    if(!Number.isSafeInteger(count?.n)||count.n<0)fail('D1_SIGNAL_READ_FAILED',503);
    return {signalCount:count.n,lastSignal:latest?.signal_state||null};
  }
  async getPointer(storyId){
    if(storyId!==STORY)fail('WRONG_TEST_STORY');
    const row=await this.db.prepare('SELECT revision, pointer_json FROM stage_pointers WHERE story_id=?')
      .bind(STORY).first();
    if(!row)return null;
    let v;try{v=JSON.parse(row.pointer_json);}catch{fail('POINTER_CORRUPTED',503);}
    if(v.revision!==row.revision||v.storyId!==STORY)fail('POINTER_CORRUPTED',503);
    return v;
  }
  async initialize(ptr){
    const body=stringify(ptr);
    const r=await this.db.prepare('INSERT OR IGNORE INTO stage_pointers (story_id,revision,pointer_json,updated_at) VALUES (?,?,?,?)')
      .bind(STORY,0,body,Date.now()).run();
    if(!r.success)fail('D1_INIT_FAILED',503);
    return r.meta?.changes===1;
  }
  async compareAndSwapPointer(storyId,revision,next){
    if(storyId!==STORY||next.storyId!==STORY||next.revision!==revision+1)fail('INVALID_CAS');
    const r=await this.db.prepare('UPDATE stage_pointers SET revision=?,pointer_json=?,updated_at=? WHERE story_id=? AND revision=?')
      .bind(next.revision,stringify(next),Date.now(),STORY,revision).run();
    if(!r.success)fail('D1_WRITE_FAILED',503);
    return r.meta?.changes===1;
  }
}
async function putVerified(store,catalog){
  const content=stringify(catalog);
  const digest=await sha256(content);
  const key=BLOB_PREFIX+digest;
  await store.putImmutable(key,content);
  const echo=await store.getBlob(key);
  if(echo!==content)fail('KV_READBACK_FAILED',503);
  return {kind:'blob',storyId:STORY,sourceVersion:SOURCE,
    generationId:catalog.generationId,trackCount:1,folderCount:1,blobKey:key,digest};
}
async function validateAssets(store,p){
  await loadReference(store,p.current);
  if(p.previous)await loadReference(store,p.previous);
}
function accepted(pointer){
  const now=Date.now();return [BASE.generationId,NEXT.generationId].filter(g=>playableGeneration(pointer,g,now));
}
/**
 * Step F — authenticated catalog preview. The only accepted catalog bytes are
 * our TWO hardcoded synthetic fixtures. No Drive tokens, names or real private
 * catalog bytes can be returned. Reads D1 first-primary, then hash-verified KV.
 * The route is not a Player playback or publication API.
 */
async function syntheticCatalogPreview(store,pointer,role,now=Date.now()){
  if(!pointer)fail('NOT_INITIALIZED',409);
  if(role!=='current'&&role!=='previous')fail('INVALID_PREVIEW_ROLE');
  if(role==='previous'&&(!pointer.previous ||
      typeof pointer.graceUntil!=='number' || now>=pointer.graceUntil))
    fail('PREVIOUS_GENERATION_NOT_AVAILABLE',409);
  const ref=role==='current'?pointer.current:pointer.previous;
  if(!ref || ref.kind!=='blob' || ref.storyId!==STORY ||
      !ref.blobKey?.startsWith(BLOB_PREFIX))fail('NOT_SYNTHETIC_REFERENCE',503);
  // loadReference validates the digest and reference metadata. Do not fall back
  // to a potentially stale generation or expose unverified stored JSON.
  const catalog=await loadReference(store,ref);
  if(catalog.synthetic!==true ||
      (catalog.generationId!==BASE.generationId && catalog.generationId!==NEXT.generationId) ||
      JSON.stringify(catalog)!==JSON.stringify(fixture(catalog.generationId)))
    fail('NOT_SYNTHETIC_CATALOG',503);
  const folder=catalog.folders[catalog.rootKey];
  return {ok:true,stageOnly:true,syntheticOnly:true,readOnly:true,
    publicationDisabled:true,playback:false,
    role,revision:pointer.revision,generationId:catalog.generationId,
    folderCount:catalog.folderCount,trackCount:catalog.trackCount,
    folder:{name:folder.name,tracks:folder.tracks.map(t=>({name:t.name,mimeType:t.mimeType}))},
    globalKvPropagationProven:false,realPlayerIntegration:false};
}
const view=p=>({revision:p.revision,currentGeneration:p.current.generationId,
  previousGeneration:p.previous?.generationId||null,previousGenerationGraceActive:Boolean(p.previous&&p.graceUntil>Date.now()),
  acceptedGenerations:accepted(p),kind:'synthetic-fixture-only'});
async function action(req,env,route){
  if(env.STAGE_MODE!=='synthetic-only'||!env.STAGE_KV||!env.STAGE_DB)fail('STAGE_NOT_CONFIGURED',503);
  auth(req,env);
  const db=env.STAGE_DB.withSession('first-primary');
  const store=new StageStore(db,env.STAGE_KV);
  if(req.method==='GET'){
    if(route==='/v1/status'){
      const p=await store.getPointer(STORY);
      return result({ok:true,initialized:Boolean(p),state:p?view(p):null});
    }
    if(route==='/v1/catalog-preview/current' || route==='/v1/catalog-preview/previous'){
      const p=await store.getPointer(STORY);
      return result(await syntheticCatalogPreview(store,p,route.endsWith('/current')?'current':'previous'));
    }
    if(route==='/v1/sync-status'){
      const s=await store.signalSummary();
      return result({ok:true,stageOnly:true,signalsOnly:true,
        catalogPublicationDisabled:true, ...s});
    }
    if(route==='/v1/integrity'){
      const p=await store.getPointer(STORY);
      if(!p)fail('NOT_INITIALIZED',409);
      await validateAssets(store,p);
      return result({ok:true,verified:'CURRENT_AND_PREVIOUS_SYNTHETIC_BLOBS',state:view(p),globalKvPropagationProven:false});
    }
    fail('NOT_FOUND',404);
  }
  if(req.method!=='POST')fail('METHOD_NOT_ALLOWED',405);
  if(route==='/v1/sync-signal'){
    const v=await bodyJson(req,['signalId','state']);
    if(Object.keys(v).length!==2 || typeof v.signalId!=='string' ||
       !/^[a-f0-9]{32}$/.test(v.signalId) ||
       (v.state!=='unchanged' && v.state!=='change_quarantined'))
      fail('INVALID_SYNC_SIGNAL',400);
    const ack=await store.recordSignal(v.signalId,v.state);
    return result({ok:true,stageOnly:true,signalsOnly:true,
      catalogPointerUnchanged:true, publicationDisabled:true,...ack});
  }
  const v=await bodyJson(req);
  if(route==='/v1/bootstrap'){
    if(Object.keys(v).length)fail('UNKNOWN_PARAMETER');
    // fixed synthetic fixture only — never accept catalog content from the request.
    const ref=await putVerified(store,BASE);
    const ptr={storyId:STORY,revision:0,current:ref,previous:null,graceUntil:null};
    const created=await store.initialize(ptr);
    const observed=await store.getPointer(STORY);
    if(!observed)fail('D1_READBACK_FAILED',503);
    return result({ok:true,created,initialized:true,state:view(observed)});
  }
  if(route==='/v1/prepare'){
    if(Object.keys(v).length)fail('UNKNOWN_PARAMETER');
    const ptr=await store.getPointer(STORY);if(!ptr)fail('NOT_INITIALIZED',409);
    await putVerified(store,NEXT);
    return result({ok:true,prepared:true,syntheticOnly:true,existingPointerUnchanged:true});
  }
  if(route==='/v1/promote'){
    const revision=expectedRevision(v);
    const ptr=await store.getPointer(STORY);if(!ptr)fail('NOT_INITIALIZED',409);
    if(ptr.revision!==revision)fail('STALE_POINTER_REVISION',409);
    // Insist candidate has already been staged; separate KV write from D1 swap.
    const digest=await sha256(stringify(NEXT));
    const found=await store.getBlob(BLOB_PREFIX+digest);
    if(found!==stringify(NEXT))fail('CANDIDATE_NOT_PREPARED',409);
    let next;try{next=await rehearsePromotion(store,{
      candidate:NEXT,expectedRevision:revision,allowRehearsalOnly:true,
      graceMs:30*60_000
    });}catch(e){if(e?.code==='POINTER_CONFLICT'||e?.code==='STALE_POINTER_REVISION')fail(e.code,409);throw e;}
    return result({ok:true,promoted:true,state:view(next),globalKvPropagationProven:false});
  }
  if(route==='/v1/rollback'){
    const revision=expectedRevision(v);
    const ptr=await store.getPointer(STORY);if(!ptr)fail('NOT_INITIALIZED',409);
    if(ptr.revision!==revision)fail('STALE_POINTER_REVISION',409);
    let next;try{next=await rehearseRollback(store,{
      storyId:STORY,expectedRevision:revision,allowRehearsalOnly:true,graceMs:30*60_000
    });}catch(e){if(e?.code==='POINTER_CONFLICT'||e?.code==='STALE_POINTER_REVISION')fail(e.code,409);throw e;}
    return result({ok:true,rolledBack:true,state:view(next)});
  }
  fail('NOT_FOUND',404);
}
export default {
  async fetch(req,env){
    const u=new URL(req.url);
    if(u.search) return result({ok:false,error:'QUERY_PARAMETERS_DISABLED'},400);
    if(u.pathname==='/health' && req.method==='GET')return result({ok:true,service:'OX B9.2 Step C synthetic control-plane',stageOnly:true,publicationDisabled:true,driveAccess:false,playback:false,syntheticCatalogPreview:'read-only'});
    try{return await action(req,env,u.pathname);}catch(e){
      const known=e instanceof StageFault;
      return result({ok:false,error:known?e.code:'STAGING_OPERATION_FAILED'},known?e.status:503);
    }
  }
};
export {fixture};
