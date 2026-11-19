/**
 * B9.2 durable catalog storage control plane for the EXISTING B5 Player.
 * No network calls to Drive, no raw file IDs, no playback/stream replacement.
 * The code does NOT expose a publication endpoint, cron, or external trigger.
 * All writes require a caller-supplied separately verified immutable catalog
 * and positive consistent-snapshot evidence. The current Step E receipt
 * explicitly has pinnedSnapshotProven:false and is deliberately ineligible.
 */
import {planPromotion} from './b92-generation-policy.js';
const STORY=/^[a-z0-9][a-z0-9._-]{0,159}$/;
const HEX=/^[a-f0-9]{64}$/;
const GEN=/^g_[A-Za-z0-9_-]{5,100}$/;
const SRC=/^[a-f0-9]{12}$/;
const BLOB_PREFIX='b92:live:catalog:sha256:';
const MAX_CATALOG_BYTES=8*1024*1024; // safety: well under KV 25 MiB maximum
const MIN_PROPAGATION_MS=120000;
const encoder=new TextEncoder();
function reject(code){throw Object.assign(new Error(code),{code});}
function validId(id){if(!STORY.test(id||''))reject('INVALID_STORY');return id;}
async function digest(data){const raw=typeof data==='string'?encoder.encode(data):data;
  const bytes=await crypto.subtle.digest('SHA-256',raw);
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
function bindings(env){if(!env?.B92_POINTER_DB||!env?.B9_CATALOG_KV)reject('CATALOG_BINDINGS_MISSING');}
function validateState(id,p){
  if(!p||p.storyId!==id||p.active!==true||p.disabled!==false||
    !GEN.test(p.generationId||'')||!SRC.test(p.sourceVersion||'')||
    !Number.isSafeInteger(p.revision)||p.revision<1||
    !Number.isSafeInteger(p.trackCount)||p.trackCount<1||
    !Number.isSafeInteger(p.folderCount)||p.folderCount<1)reject('POINTER_CORRUPTED');
  if(p.blobKey){
    if(p.catalogPath!==`/api/b9/catalog/${id}/${p.generationId}`||
       !/^b92:live:catalog:sha256:[a-f0-9]{64}$/.test(p.blobKey)||
       !HEX.test(p.fingerprint||''))reject('POINTER_CORRUPTED');
  }else if(typeof p.catalogPath!=='string'||
    !p.catalogPath.startsWith(`/catalogs/${id}.json?`))reject('POINTER_CORRUPTED');
  if(p.previous){const old=p.previous;
    if(old.storyId!==id||!GEN.test(old.generationId||'')||!SRC.test(old.sourceVersion||'')||
      !Number.isSafeInteger(old.graceUntilMs)||old.graceUntilMs<0||
      typeof old.catalogPath!=='string'||!old.catalogPath.startsWith('/'))reject('POINTER_CORRUPTED');
  }
  return p;
}
async function row(db,id){return db.prepare('SELECT revision, state_json FROM b92_live_pointers WHERE story_id=?').bind(id).first();}
/** Null means static catalog is still current. Database errors must fail closed. */
export async function readLiveState(env,id){
  validId(id);
  if(!env?.B92_POINTER_DB)return null;
  const r=await row(env.B92_POINTER_DB,id);
  if(!r)return null;
  let p;try{p=JSON.parse(r.state_json);}catch{reject('POINTER_CORRUPTED');}
  if(p.revision!==r.revision)reject('POINTER_CORRUPTED');
  return validateState(id,p);
}
export async function getImmutableCatalog(env,blobKey,digestExpected){
  if(!env?.B9_CATALOG_KV||!HEX.test(digestExpected||'')||
     blobKey!==BLOB_PREFIX+digestExpected)reject('CATALOG_REFERENCE_INVALID');
  const data=await env.B9_CATALOG_KV.get(blobKey,'text');
  if(typeof data!=='string')reject('CATALOG_BLOB_MISSING');
  if(encoder.encode(data).length>MAX_CATALOG_BYTES||await digest(data)!==digestExpected)
    reject('CATALOG_BLOB_CORRUPTED');
  return data;
}
/** Store only a VERIFIED protected catalog; performs independent format and hash checks.
 * This is a library function, not reachable through any HTTP or scheduled handler. */
export async function stageVerifiedCatalog(env, {candidate,verifiedReceipt}={}){
  bindings(env);
  if(verifiedReceipt?.pinnedSnapshotProven!==true||verifiedReceipt?.publicationAllowed!==true||
     verifiedReceipt?.stagingOnly!==false||verifiedReceipt?.requiresHumanReview===true)
    reject('PUBLICATION_PROOF_MISSING');
  if(!candidate||candidate.version!==1||!STORY.test(candidate.storyId||'')||
     !GEN.test(candidate.generationId||'')||!SRC.test(candidate.sourceVersion||'')||
     !Number.isSafeInteger(candidate.trackCount)||candidate.trackCount<1||
     !Number.isSafeInteger(candidate.folderCount)||candidate.folderCount<1||
     !candidate.folders?.[candidate.rootKey]||
     Object.keys(candidate.folders).length!==candidate.folderCount)
    reject('CATALOG_SHAPE_INVALID');
  const body=JSON.stringify(candidate);
  if(encoder.encode(body).length>MAX_CATALOG_BYTES)reject('CATALOG_TOO_LARGE');
  if(!HEX.test(verifiedReceipt.catalogDigest||'')||
     await digest(body)!==verifiedReceipt.catalogDigest||
     verifiedReceipt.storyId!==candidate.storyId||
     verifiedReceipt.generationId!==candidate.generationId)reject('CATALOG_RECEIPT_MISMATCH');
  const key=BLOB_PREFIX+verifiedReceipt.catalogDigest;
  const existed=await env.B9_CATALOG_KV.get(key,'text');
  if(existed!==null&&existed!==body)reject('IMMUTABLE_BLOB_CONFLICT');
  if(existed===null)await env.B9_CATALOG_KV.put(key,body);
  await getImmutableCatalog(env,key,verifiedReceipt.catalogDigest);
  const stagedAt=Date.now();
  const result=await env.B92_POINTER_DB.prepare(`INSERT OR IGNORE INTO b92_live_staged
   (story_id,generation_id,digest,staged_at_ms,track_count,folder_count,source_version)
   VALUES(?,?,?,?,?,?,?)`).bind(candidate.storyId,candidate.generationId,
   verifiedReceipt.catalogDigest,stagedAt,candidate.trackCount,
   candidate.folderCount,candidate.sourceVersion).run();
  if(result?.success!==true)reject('STAGING_JOURNAL_WRITE_FAILED');
  const journal=await env.B92_POINTER_DB.prepare('SELECT * FROM b92_live_staged WHERE story_id=? AND generation_id=?')
    .bind(candidate.storyId,candidate.generationId).first();
  if(!journal||journal.digest!==verifiedReceipt.catalogDigest||
     journal.track_count!==candidate.trackCount||journal.folder_count!==candidate.folderCount||
     journal.source_version!==candidate.sourceVersion)reject('STAGING_JOURNAL_CONFLICT');
  return {staged:true,storyId:candidate.storyId,generationId:candidate.generationId,
    digest:verifiedReceipt.catalogDigest,stagedAtMs:journal.staged_at_ms,activation:false};
}
/** D1 compare-and-swap is atomic. Propagation wait is a safety margin, not a global guarantee.
 * Unverified Step E/Step H artifacts are incapable of reaching this method. */
export async function promoteStagedCatalog(env,index,{storyId,generationId,expectedRevision,verifiedReceipt,now=Date.now()}={}){
  bindings(env);validId(storyId);
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||
     !Number.isSafeInteger(now)||verifiedReceipt?.pinnedSnapshotProven!==true||
     verifiedReceipt?.publicationAllowed!==true||verifiedReceipt?.stagingOnly!==false||
     verifiedReceipt?.requiresHumanReview===true||verifiedReceipt?.storyId!==storyId||
     verifiedReceipt?.generationId!==generationId)reject('PUBLICATION_PROOF_MISSING');
  const j=await env.B92_POINTER_DB.prepare('SELECT * FROM b92_live_staged WHERE story_id=? AND generation_id=?')
    .bind(storyId,generationId).first();
  if(!j||j.digest!==verifiedReceipt.catalogDigest||now-j.staged_at_ms<MIN_PROPAGATION_MS)
    reject('CANDIDATE_NOT_READY');
  const existing=await readLiveState(env,storyId);
  if((existing?.revision||0)!==expectedRevision)reject('STALE_POINTER_REVISION');
  const baseline=existing||index[storyId];
  if(!baseline||baseline.sourceVersion!==j.source_version)reject('SOURCE_VERSION_REVIEW_REQUIRED');
  const body=await getImmutableCatalog(env,BLOB_PREFIX+j.digest,j.digest);
  let c;try{c=JSON.parse(body);}catch{reject('CATALOG_BLOB_CORRUPTED');}
  if(c.storyId!==storyId||c.generationId!==generationId||
     c.sourceVersion!==j.source_version||c.folderCount!==j.folder_count||
     c.trackCount!==j.track_count)reject('CATALOG_BLOB_CORRUPTED');
  const candidate={storyId,generationId,sourceVersion:c.sourceVersion,
    catalogPath:`/api/b9/catalog/${storyId}/${generationId}`,blobKey:BLOB_PREFIX+j.digest,
    fingerprint:j.digest,folderCount:c.folderCount,trackCount:c.trackCount};
  const next=planPromotion({storyId,staticMeta:index[storyId]||null,state:existing,candidate,now});
  let wrote;
  if(expectedRevision===0){
    wrote=await env.B92_POINTER_DB.prepare(`INSERT OR IGNORE INTO b92_live_pointers
      (story_id,revision,state_json,updated_at_ms) VALUES(?,?,?,?)`)
      .bind(storyId,next.revision,JSON.stringify(next),now).run();
  }else{
    wrote=await env.B92_POINTER_DB.prepare(`UPDATE b92_live_pointers SET
      revision=?,state_json=?,updated_at_ms=? WHERE story_id=? AND revision=?`)
      .bind(next.revision,JSON.stringify(next),now,storyId,expectedRevision).run();
  }
  if(wrote?.success!==true||wrote?.meta?.changes!==1)reject('POINTER_CAS_CONFLICT');
  return {promoted:true,storyId,generationId,revision:next.revision,
    previousGraceUntilMs:next.previous?.graceUntilMs||null};
}
export const releaseStoreLimits=Object.freeze({maxCatalogBytes:MAX_CATALOG_BYTES,
  minimumPropagationDelayMs:MIN_PROPAGATION_MS,
  publicationEnabled:false,automaticSyncEnabled:false});
/** Atomic rollback to the saved previous generation; never accepts an
 * arbitrary generationId, and never removes the previous immutable blob. */
export async function rollbackLiveCatalog(env,index,{storyId,expectedRevision,now=Date.now()}={}){
  bindings(env);validId(storyId);
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1||
     !Number.isSafeInteger(now))reject('INVALID_ROLLBACK_REQUEST');
  const before=await readLiveState(env,storyId);
  if(!before||before.revision!==expectedRevision)reject('STALE_POINTER_REVISION');
  const p=before.previous;
  if(!p||!GEN.test(p.generationId||''))reject('NO_PREVIOUS_GENERATION');
  if(p.blobKey){
    if(!p.fingerprint)reject('PREVIOUS_CATALOG_UNVERIFIED');
    await getImmutableCatalog(env,p.blobKey,p.fingerprint);
  }else if(index?.[storyId]?.generationId!==p.generationId ||
           index[storyId].sourceVersion!==p.sourceVersion)
    reject('PREVIOUS_STATIC_CATALOG_UNAVAILABLE');
  const restoredStatic=p.blobKey?null:index?.[storyId];
  const next={...p,trackCount:p.trackCount||restoredStatic?.trackCount,
    folderCount:p.folderCount||restoredStatic?.folderCount,
    active:true,disabled:false,revision:expectedRevision+1,
    previous:{storyId,sourceVersion:before.sourceVersion,generationId:before.generationId,
      catalogPath:before.catalogPath,blobKey:before.blobKey,
      fingerprint:before.fingerprint||null,trackCount:before.trackCount,
      folderCount:before.folderCount,graceUntilMs:now+8*60*60*1000}};
  delete next.graceUntilMs;
  const saved=await env.B92_POINTER_DB.prepare(`UPDATE b92_live_pointers
    SET revision=?,state_json=?,updated_at_ms=? WHERE story_id=? AND revision=?`)
    .bind(next.revision,JSON.stringify(next),now,storyId,expectedRevision).run();
  if(saved?.success!==true||saved?.meta?.changes!==1)reject('POINTER_CAS_CONFLICT');
  return {rolledBack:true,storyId,revision:next.revision,
    restoredGenerationId:next.generationId,previousGraceUntilMs:next.previous.graceUntilMs};
}
