/**
 * B9.2 Step B — isolated promotion/rollback transaction logic.
 * NO network, no Cloudflare bindings, no production/Player integration here.
 * A future staging adapter MUST implement real atomic pointer CAS (e.g. D1 SQL
 * compare-and-update), which Cloudflare KV alone does not provide.
 * KV is eventually consistent; read-back does NOT prove global visibility.
 */
const STORY = /^[a-z0-9][a-z0-9._-]{0,159}$/;
const GENERATION = /^g_[a-zA-Z0-9_-]{5,100}$/;
const SOURCE = /^[a-f0-9]{12}$/;
const HEX256 = /^[a-f0-9]{64}$/;
const MAX_BYTES = 24 * 1024 * 1024;
const encoder = new TextEncoder();

function reject(code) { throw Object.assign(new Error(code), {code}); }
export async function sha256(body) {
  const d=await crypto.subtle.digest('SHA-256',encoder.encode(body));
  return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function validateRef(r,storyId) {
  if (!r || (r.kind!=='static'&&r.kind!=='blob') || r.storyId!==storyId ||
      !SOURCE.test(r.sourceVersion||'') || !GENERATION.test(r.generationId||'') ||
      !Number.isSafeInteger(r.trackCount)||r.trackCount<1 ||
      !Number.isSafeInteger(r.folderCount)||r.folderCount<1) reject('INVALID_REFERENCE');
  if(r.kind==='blob' && (!r.blobKey||!HEX256.test(r.digest||''))) reject('INVALID_REFERENCE');
}
export function initialPointer(meta) {
  if (!meta||!STORY.test(meta.storyId||'')) reject('INVALID_STORY');
  const current={kind:'static',storyId:meta.storyId,sourceVersion:meta.sourceVersion,
    generationId:meta.generationId,trackCount:meta.trackCount,folderCount:meta.folderCount};
  validateRef(current,meta.storyId);
  return {storyId:meta.storyId,revision:0,current,previous:null,graceUntil:null};
}
export function playableGeneration(pointer,generationId,at=Date.now()) {
  if(!pointer||!GENERATION.test(generationId||''))return false;
  if(pointer.current?.generationId===generationId)return true;
  return pointer.previous?.generationId===generationId &&
    typeof pointer.graceUntil==='number' && at<pointer.graceUntil;
}
export function acceptedAsset(pointer,requestedGeneration,at=Date.now()) {
  if(!playableGeneration(pointer,requestedGeneration,at))reject('GENERATION_NOT_ACCEPTED');
  return pointer.current.generationId===requestedGeneration?pointer.current:pointer.previous;
}
function validateCatalogBasic(c,storyId) {
  if(!c||c.version!==1||c.storyId!==storyId||!SOURCE.test(c.sourceVersion||'')||
     !GENERATION.test(c.generationId||'')||!Number.isSafeInteger(c.trackCount)||c.trackCount<1||
     !Number.isSafeInteger(c.folderCount)||c.folderCount<1||
     !c.folders?.[c.rootKey] || Object.keys(c.folders).length!==c.folderCount)reject('CATALOG_SHAPE_INVALID');
}
function validatePointer(p,storyId) {
  if(!p||p.storyId!==storyId||!Number.isSafeInteger(p.revision)||p.revision<0)
    reject('INVALID_POINTER');
  validateRef(p.current,storyId);
  if(p.previous)validateRef(p.previous,storyId);
}
export async function loadReference(store,ref,{loadStatic}={}) {
  validateRef(ref,ref?.storyId);
  let content;
  if(ref.kind==='static') {
    if(typeof loadStatic!=='function')reject('STATIC_ASSET_MISSING');
    content=await loadStatic(ref.storyId);
  } else {
    content=await store.getBlob(ref.blobKey);
    if(typeof content!=='string')reject('IMMUTABLE_ASSET_MISSING');
    if(await sha256(content)!==ref.digest)reject('IMMUTABLE_ASSET_CHANGED');
  }
  if(typeof content!=='string'||encoder.encode(content).length>MAX_BYTES)reject('ASSET_SIZE_INVALID');
  let parsed;
  try{parsed=JSON.parse(content);}catch{reject('ASSET_JSON_INVALID');}
  validateCatalogBasic(parsed,ref.storyId);
  if(parsed.sourceVersion!==ref.sourceVersion||parsed.generationId!==ref.generationId||
     parsed.trackCount!==ref.trackCount||parsed.folderCount!==ref.folderCount)reject('ASSET_REFERENCE_MISMATCH');
  return parsed;
}
/**
 * The caller MUST supply full encrypted-token/catalog validation before calling.
 * `allowRehearsalOnly` is intentionally mandatory; not a publication API.
 */
export async function rehearsePromotion(store, {candidate, expectedRevision, now=Date.now(),
  graceMs=30*60_000, allowRehearsalOnly=false}={}) {
  if(allowRehearsalOnly!==true)reject('REHEARSAL_ONLY');
  if(!candidate||!STORY.test(candidate.storyId||''))reject('INVALID_STORY');
  validateCatalogBasic(candidate,candidate.storyId);
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)reject('INVALID_REVISION');
  const before=await store.getPointer(candidate.storyId);
  validatePointer(before,candidate.storyId);
  if(before.revision!==expectedRevision)reject('STALE_POINTER_REVISION');
  if(before.current.sourceVersion!==candidate.sourceVersion)reject('SOURCE_VERSION_CHANGED_REQUIRES_REVIEW');
  if(before.current.generationId===candidate.generationId)reject('GENERATION_ALREADY_CURRENT');
  const content=JSON.stringify(candidate);
  if(encoder.encode(content).length>MAX_BYTES)reject('ASSET_SIZE_INVALID');
  const digest=await sha256(content);
  const blobKey=`b92:stepc:synthetic:blob:${digest}`;
  await store.putImmutable(blobKey,content);
  const echo=await store.getBlob(blobKey);
  if(typeof echo!=='string'||await sha256(echo)!==digest)reject('BLOB_READBACK_FAILED');
  const current={kind:'blob',storyId:candidate.storyId,sourceVersion:candidate.sourceVersion,
    generationId:candidate.generationId,trackCount:candidate.trackCount,
    folderCount:candidate.folderCount,blobKey,digest};
  const next={storyId:candidate.storyId,revision:expectedRevision+1,current,
    previous:before.current,graceUntil:now+graceMs};
  // Only a transactionally-enforced CAS is acceptable for future real deployment.
  if(!await store.compareAndSwapPointer(candidate.storyId,expectedRevision,next))reject('POINTER_CONFLICT');
  const observed=await store.getPointer(candidate.storyId);
  if(!observed||observed.revision!==next.revision||
     observed.current.generationId!==candidate.generationId)reject('POINTER_READBACK_INCONCLUSIVE');
  return next;
}
export async function rehearseRollback(store,{storyId,expectedRevision,now=Date.now(),
  graceMs=30*60_000,loadStatic,allowRehearsalOnly=false}={}) {
  if(allowRehearsalOnly!==true)reject('REHEARSAL_ONLY');
  if(!STORY.test(storyId||''))reject('INVALID_STORY');
  const before=await store.getPointer(storyId);
  validatePointer(before,storyId);
  if(before.revision!==expectedRevision)reject('STALE_POINTER_REVISION');
  if(!before.previous)reject('NO_ROLLBACK_TARGET');
  // If the previous catalog is unreadable or altered, don't switch to it.
  await loadReference(store,before.previous,{loadStatic});
  const next={storyId,revision:expectedRevision+1,current:before.previous,
    previous:before.current,graceUntil:now+graceMs};
  if(!await store.compareAndSwapPointer(storyId,expectedRevision,next))reject('POINTER_CONFLICT');
  const observed=await store.getPointer(storyId);
  if(!observed||observed.revision!==next.revision||
     observed.current.generationId!==next.current.generationId)reject('POINTER_READBACK_INCONCLUSIVE');
  return next;
}
/** In-memory transactional emulator only. Never imported into live Player. */
export class OfflineActivationStore {
  #blobs=new Map();#pointers=new Map();
  constructor(initial){this.#pointers.set(initial.storyId,structuredClone(initial));}
  async putImmutable(key,body){
    if(this.#blobs.has(key)&&this.#blobs.get(key)!==body)reject('IMMUTABLE_ASSET_COLLISION');
    this.#blobs.set(key,body);
  }
  async getBlob(key){return this.#blobs.get(key)||null;}
  async getPointer(id){const p=this.#pointers.get(id);return p?structuredClone(p):null;}
  async compareAndSwapPointer(id,expectedRevision,next){
    const current=this.#pointers.get(id);
    if(!current||current.revision!==expectedRevision)return false;
    this.#pointers.set(id,structuredClone(next));return true;
  }
  // Test-only fault injection; not part of real storage interface.
  simulateLossOfBlob(key){this.#blobs.delete(key);}
}
