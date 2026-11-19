/**
 * OX B9.2 Step J / constant-size indexed membership read, LOCAL CONTRACT ONLY.
 * Worker-compatible WebCrypto and plain JS. No Node-specific imports, network,
 * Worker exports, mutations, catalog publication, or streaming functions.
 *
 * Caller contracts:
 *  - authenticatedSession MUST come from B5's verified signed-session reader;
 *  - verifyEntitlement MUST check the user's current entitlement;
 *  - decryptTrackToken MUST perform authenticated AES-GCM t1 decryption;
 *  - readMembership MUST execute the provided parameterized SQL against an
 *    authorized, populated D1 index. No fallback on missing/errored rows.
 */
const fail=code=>{throw Object.assign(new Error(code),{code});};
const ID=/^[A-Za-z0-9_-]{10,}$/;
const STORY=/^[a-z0-9][a-z0-9._-]{0,159}$/;
const SOURCE=/^[a-f0-9]{12}$/;
const GENERATION=/^g_[a-zA-Z0-9_-]{5,100}$/;
const TOKEN=/^t1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const HEX64=/^[a-f0-9]{64}$/;
const prefix='OX_B92_TOKEN_MEMBERSHIP_V1\u0000';
const enc=new TextEncoder();

// D1 uses one indexed query for BOTH pointer generation/grace and track membership.
// The SQL is explicitly parameterized; no string interpolation of caller values.
export const MEMBERSHIP_SQL=`SELECT
  CASE WHEN p.current_generation = m.generation_id THEN 'current'
       ELSE 'previous' END AS role,
  p.revision AS revision,
  p.grace_until_ms AS graceUntil
FROM b92_j_pointers AS p
JOIN b92_j_members AS m
  ON m.story_id = p.story_id
WHERE p.story_id = ?
  AND m.generation_id = ?
  AND m.source_version = ?
  AND m.token_digest = ?
  AND (
    (p.current_generation = m.generation_id
     AND p.current_source_version = m.source_version)
    OR
    (p.previous_generation = m.generation_id
     AND p.previous_source_version = m.source_version
     AND p.grace_until_ms > ?)
  )
LIMIT 1`;

/** Only token hash is stored; never the encrypted token, Drive ID, or metadata. */
export async function membershipDigest(trackToken){
  if(typeof trackToken!=='string'||trackToken.length>900||!TOKEN.test(trackToken))
    fail('INVALID_TRACK_TOKEN');
  const data=enc.encode(prefix+trackToken);
  const digest=await crypto.subtle.digest('SHA-256',data);
  return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
}

/** Adapt real D1 safely: returns one row or null, with no extra fallback reads. */
export async function d1MembershipReader(db,{storyId,generationId,sourceVersion,tokenDigest,now}){
  if(!db||typeof db.prepare!=='function')fail('MEMBERSHIP_STORE_UNAVAILABLE');
  return db.prepare(MEMBERSHIP_SQL)
    .bind(storyId,generationId,sourceVersion,tokenDigest,now).first();
}

export async function authorizeIndexedTrack({
  authenticatedSession,verifyEntitlement,decryptTrackToken,trackToken,readMembership,
  now=Date.now()
}={}){
  // Authorization must precede token hashing, catalog access, and D1 lookups.
  if(!authenticatedSession||authenticatedSession.authenticated!==true||
     !STORY.test(authenticatedSession.storyId||''))fail('PLAYER_SESSION_REQUIRED');
  const storyId=authenticatedSession.storyId;
  if(typeof verifyEntitlement!=='function'||
     await verifyEntitlement(authenticatedSession,storyId)!==true)
    fail('PLAYER_ENTITLEMENT_REQUIRED');
  if(typeof decryptTrackToken!=='function')fail('DECRYPTOR_REQUIRED');
  if(typeof readMembership!=='function')fail('INDEX_READER_REQUIRED');
  const digest=await membershipDigest(trackToken);
  let track;
  try{track=await decryptTrackToken(trackToken);}catch{fail('TRACK_TOKEN_AUTH_FAILED');}
  if(track?.kind!=='track'||track.storyId!==storyId||!SOURCE.test(track.sourceVersion||'')||
     !GENERATION.test(track.generationId||'')||!ID.test(track.fileId||'')||
     typeof track.mimeType!=='string'||track.mimeType.length>150)
    fail('TRACK_IDENTITY_INVALID');
  if(!Number.isSafeInteger(now)||now<0)fail('INVALID_TIME');
  let result;
  try{
    result=await readMembership({storyId,generationId:track.generationId,
      sourceVersion:track.sourceVersion,tokenDigest:digest,now});
  }catch{fail('MEMBERSHIP_STORE_UNAVAILABLE');}
  if(!result)fail('GENERATION_OR_MEMBERSHIP_REJECTED');
  if(!Number.isSafeInteger(result.revision)||result.revision<0||
     (result.role!=='current'&&result.role!=='previous'))fail('INVALID_MEMBERSHIP_RESULT');
  // Defense-in-depth: even a mistaken store adapter cannot authorize expired old tokens.
  if(result.role==='previous'&&(!Number.isSafeInteger(result.graceUntil)||
    result.graceUntil<=now))fail('GENERATION_GRACE_EXPIRED');
  return Object.freeze({storyId,sourceVersion:track.sourceVersion,
    generationId:track.generationId,role:result.role,revision:result.revision,
    fileId:track.fileId,mimeType:track.mimeType,
    // Stream handler must still enforce signed session and Range policy.
    authenticatedPerRequest:true,streamNotImplemented:true});
}
