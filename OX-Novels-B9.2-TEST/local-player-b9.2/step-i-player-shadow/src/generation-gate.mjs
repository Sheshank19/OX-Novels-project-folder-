/**
 * OX B9.2 / Step I — OFFLINE, SHADOW PLAYER GENERATION GATE.
 * No HTTP, Cloudflare bindings, Google Drive calls, file I/O or deployments.
 * Adapter candidate ONLY: DO NOT import into deployed production Player.
 * Session authenticity is established upstream by the real B5 readPlayerSession;
 * this module consumes the resulting validated session, never raw cookie text.
 */
import {acceptedAsset,loadReference,rehearsePromotion} from '../../staging/b92-activation-core.mjs';
import {assertProtectedCatalog,decryptToken} from '../../staging/catalog-compat.mjs';

const fail = code => {throw Object.assign(new Error(code), {code});};
const ID=/^[A-Za-z0-9_-]{10,}$/;
const MAX_TRACK_TOKEN=900;

/**
 * Resolve a browser track's catalog generation, never weakening session checks.
 * Important: this does not stream or authenticate user sessions; the caller MUST
 * validate a signed, unexpired, entitled Player session before calling it.
 */
export async function resolveGenerationAwareTrack({
  authenticatedSession, trackToken, key, pointer, store, loadStatic,
  now=Date.now(), verifyEntitlement=()=>false
}={}) {
  // Auth-first: never touch KV or decrypt a token for an unauthenticated session.
  if (!authenticatedSession || !authenticatedSession.storyId ||
      authenticatedSession.authenticated !== true) fail('PLAYER_SESSION_REQUIRED');
  const storyId=String(authenticatedSession.storyId);
  // A true, fresh entitlement check is mandatory; old generations are not an auth bypass.
  if (typeof verifyEntitlement!=='function' ||
      await verifyEntitlement(authenticatedSession,storyId)!==true)
    fail('PLAYER_ENTITLEMENT_REQUIRED');
  if(!Buffer.isBuffer(key)||key.length!==32)fail('PLAYER_KEY_INVALID');
  if(typeof trackToken!=='string'||trackToken.length>MAX_TRACK_TOKEN||!trackToken.startsWith('t1.'))
    fail('INVALID_TRACK_TOKEN');
  if (!pointer||pointer.storyId!==storyId) fail('STORY_POINTER_MISMATCH');
  let track;
  try {track=decryptToken(trackToken,key);} catch {fail('TRACK_TOKEN_AUTH_FAILED');}
  if(track?.kind!=='track'||track.storyId!==storyId||!ID.test(track.fileId||'')||
     typeof track.sourceVersion!=='string'||typeof track.generationId!=='string')
    fail('TRACK_IDENTITY_INVALID');

  // Step B selects strictly current or the previous generation within grace.
  let ref;
  try{ref=acceptedAsset(pointer,track.generationId,now);}catch{fail('GENERATION_NOT_ACCEPTED');}
  if (ref.storyId!==storyId || ref.generationId!==track.generationId ||
      ref.sourceVersion!==track.sourceVersion) fail('TRACK_SOURCE_MISMATCH');
  let catalog;
  try{
    catalog=await loadReference(store,ref,{loadStatic});
    assertProtectedCatalog(catalog,key,{id:storyId,sourceVersion:track.sourceVersion});
  } catch {fail('CATALOG_INTEGRITY_OR_AVAILABILITY_FAILED');}

  // Prevent a merely valid token with the same generation from referring to an
  // episode outside that generation's catalog. No raw file IDs are exposed.
  const included=Object.values(catalog.folders).some(folder=>
    folder.tracks.some(item=>item.key===trackToken));
  if(!included)fail('TRACK_NOT_IN_SELECTED_CATALOG');
  return Object.freeze({
    storyId, generationId:track.generationId, sourceVersion:track.sourceVersion,
    role:ref.generationId===pointer.current.generationId?'current':'previous',
    fileId:track.fileId, mimeType:track.mimeType,
    catalogTrackCount:catalog.trackCount,
    expiresAt:ref.generationId===pointer.current.generationId?null:pointer.graceUntil,
    authorizationRequiredPerRequest:true,
    // This gate never supplies a public Drive URL or audio bytes.
    streamNotImplemented:true
  });
}

/** Select current generation for new story views; never alter existing tabs. */
export async function resolveFreshStoryCatalog({
  authenticatedSession, pointer, store, loadStatic, key, verifyEntitlement=()=>false
}={}){
  if(!authenticatedSession||authenticatedSession.authenticated!==true||
     !authenticatedSession.storyId)fail('PLAYER_SESSION_REQUIRED');
  const storyId=String(authenticatedSession.storyId);
  if(await verifyEntitlement(authenticatedSession,storyId)!==true)
    fail('PLAYER_ENTITLEMENT_REQUIRED');
  if(!pointer||pointer.storyId!==storyId)fail('STORY_POINTER_MISMATCH');
  let catalog;
  try{
    catalog=await loadReference(store,pointer.current,{loadStatic});
    assertProtectedCatalog(catalog,key,{id:storyId,sourceVersion:pointer.current.sourceVersion});
  }catch{fail('CATALOG_INTEGRITY_OR_AVAILABILITY_FAILED');}
  return Object.freeze({
    storyId,sourceVersion:catalog.sourceVersion,generationId:catalog.generationId,
    trackCount:catalog.trackCount,folderCount:catalog.folderCount,
    role:'current',cacheControl:'private, no-store',
    // Only local, private shadow verification; does not emit a catalog JSON endpoint.
    privatePreviewOnly:true
  });
}

/**
 * Prevent a second promotion from discarding an old generation that still has
 * a valid grace window. This is only an offline preflight: production must
 * enforce both revision and grace predicates ATOMICALLY in the same D1 CAS.
 */
export function assertPromotionWindowSafe(pointer,now=Date.now()) {
  if(!pointer||!Number.isSafeInteger(pointer.revision)||pointer.revision<0)
    fail('INVALID_POINTER');
  if(pointer.previous){
    if(!Number.isFinite(pointer.graceUntil)||now<pointer.graceUntil)
      fail('PRIOR_GENERATION_GRACE_ACTIVE');
  }
  return true;
}
export async function rehearseWindowSafePromotion(store,opts={}) {
  if(opts.allowRehearsalOnly!==true)fail('REHEARSAL_ONLY');
  const before=await store.getPointer(opts.candidate?.storyId);
  assertPromotionWindowSafe(before,opts.now);
  // Production atomic D1 CAS must repeat this grace predicate to avoid races.
  return rehearsePromotion(store,opts);
}
