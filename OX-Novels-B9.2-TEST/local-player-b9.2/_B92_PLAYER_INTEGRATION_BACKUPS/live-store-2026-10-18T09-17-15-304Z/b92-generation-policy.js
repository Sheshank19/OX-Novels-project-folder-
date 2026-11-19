/**
 * OX B9.2 generation compatibility, shared by stream and catalog routes.
 * No Drive, network, D1 or publishing side effects. A signed Player session
 * must be checked by the existing route BEFORE invoking these helpers.
 */
const STORY = /^[a-z0-9][a-z0-9._-]{0,159}$/;
const GEN = /^g_[A-Za-z0-9_-]{5,100}$/;
const SRC = /^[a-f0-9]{12}$/;
export const PLAYER_GRACE_MS = 8 * 60 * 60 * 1000; // B5 handoff <= six hours
const fail = code => {throw Object.assign(new Error(code), {code});};
function valid(m,id) {
  return m && m.storyId === id && GEN.test(m.generationId || '') &&
    SRC.test(m.sourceVersion || '') && typeof m.catalogPath === 'string' &&
    m.catalogPath.startsWith('/');
}
function current(state,staticMeta,id) {
  if (state?.disabled === true) return null;
  if (state?.active === true) {
    if (!valid(state,id)) fail('INVALID_ACTIVE_STATE');
    return state;
  }
  // Fail closed if a state record is malformed. Do not silently show static.
  if (state && state.active !== false) fail('INVALID_CATALOG_STATE');
  return valid(staticMeta,id) ? staticMeta : null;
}
export function selectGeneration({storyId,staticMeta,state,generationId,sourceVersion,
  now=Date.now()} = {}) {
  if (!STORY.test(storyId||'') || !GEN.test(generationId||'') ||
      !Number.isSafeInteger(now) || now < 0) return null;
  const live = current(state,staticMeta,storyId);
  if (!live) return null;
  const selected = generationId === live.generationId ? live :
    (state?.active === true && state.previous &&
      Number.isSafeInteger(state.previous.graceUntilMs) &&
      now < state.previous.graceUntilMs ? state.previous : null);
  if (!selected || !valid(selected,storyId) ||
      selected.generationId !== generationId ||
      (sourceVersion !== undefined && selected.sourceVersion !== sourceVersion)) return null;
  return {role: selected === live ? 'current' : 'previous', meta: selected};
}
export function planPromotion({storyId, staticMeta, state, candidate, now=Date.now()}={}) {
  if (!STORY.test(storyId || '') || !Number.isSafeInteger(now) || now < 0 ||
    !valid(candidate,storyId) || !candidate.blobKey || !candidate.fingerprint) fail('INVALID_CANDIDATE');
  const before=current(state,staticMeta,storyId);
  if (before?.generationId === candidate.generationId) fail('REUSED_GENERATION');
  if (state?.active === true && state.previous &&
      (state.previous.graceUntilMs == null || now < state.previous.graceUntilMs))
    fail('PREVIOUS_GRACE_ACTIVE');
  // The candidate blob must be fully and independently validated before calling this.
  const previous=before ? {storyId,sourceVersion:before.sourceVersion,
    generationId:before.generationId,catalogPath:before.catalogPath,
    blobKey:before.blobKey || null, graceUntilMs: now + PLAYER_GRACE_MS} : null;
  return {...candidate,active:true,disabled:false,previous,
    revision:(Number.isSafeInteger(state?.revision) ? state.revision : 0)+1};
}
