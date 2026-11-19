// B9.2 protected Player canary: add once at top-level BEFORE `var index_default = {`.
// Uses existing authentication, entitlement checks and OX_HANDOFF_KEY; no payment changes.
const B92_PLAYER_CANARY_ID = 'a-dragon-s-revenge';
const B92_PLAYER_HANDOFF_TARGET = 'https://listen.ox-audio-player.workers.dev/handoff';
function b92Base64Url(bytes) {
  let s = '';
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function b92DecodeBase64Url(raw) {
  const s = String(raw || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(bin, ch => ch.charCodeAt(0));
}
function b92SafeOxImage(value) {
  if (!value) return '';
  try {
    const u = new URL(String(value), 'https://oxnovels.top');
    return u.protocol === 'https:' && u.hostname === 'oxnovels.top' ? u.href.slice(0, 1400) : '';
  } catch { return ''; }
}
async function b92CanaryPlayerLanding(request, env, storyId) {
  // Fail closed: no fallback to Drive if a protected handoff cannot be issued.
  if (storyId !== B92_PLAYER_CANARY_ID) return json({ error: 'Not found' }, 404);
  if (!(await databaseReady(env))) return json({ error: 'Database unavailable' }, 503);
  const story = await env.DB.prepare('SELECT id,title,description,genre,cover,drive_url FROM stories WHERE id=? AND visible=1')
    .bind(storyId).first();
  if (!story || !story.drive_url) return json({ error: 'Story unavailable' }, 404);
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: 'Log in to listen', code: 'LOGIN_REQUIRED' }, 401);
  const access = await userAccessContext(env, user);
  let lifetimeAccess = false;
  if (!access.membershipActive) {
    if (access.testMode) lifetimeAccess = Boolean(access.lifetimeEnabled && String(access.lifetimeStoryId) === storyId);
    else {
      const owned = await env.DB.prepare(`SELECT lp.id FROM lifetime_story_products p
        JOIN story_lifetime_purchases lp ON lp.permanent_story_id=p.id
        WHERE p.current_story_id=? AND p.state='Active' AND lp.user_id=?
          AND lp.purchase_status='Completed' AND lp.entitlement_status='Active' LIMIT 1`)
        .bind(storyId, user.id).first().catch(() => null);
      lifetimeAccess = Boolean(owned);
    }
    if (!lifetimeAccess) return json({ error: 'Membership or lifetime purchase required', code: 'ACCESS_REQUIRED' }, 403);
  }
  const rawSecret = String(env.OX_HANDOFF_KEY || '').trim();
  let rawKey;
  try { rawKey = b92DecodeBase64Url(rawSecret); }
  catch { return json({ error: 'Protected Player handoff not configured', code: 'HANDOFF_UNAVAILABLE' }, 503); }
  if (rawKey.length !== 32) return json({ error: 'Protected Player handoff not configured', code: 'HANDOFF_UNAVAILABLE' }, 503);
  const now = Math.floor(Date.now() / 1000);
  let sessionExp = now + 6 * 60 * 60;
  if (access.membershipActive && user.membership_expires_at) {
    const limit = Math.floor(Date.parse(user.membership_expires_at) / 1000);
    if (Number.isFinite(limit) && limit > now) sessionExp = Math.min(sessionExp, limit);
  }
  if (sessionExp <= now + 10) return json({ error: 'Your membership is expiring', code: 'ACCESS_EXPIRING' }, 403);
  const payload = {
    v: 1, kind: 'handoff', iss: 'oxnovels.top', aud: 'ox-player',
    storyId: String(story.id), storyTitle: String(story.title || 'Story'),
    storyDescription: String(story.description || ''), storyGenre: String(story.genre || ''),
    storyCover: b92SafeOxImage(story.cover || '/api/story-cover/' + encodeURIComponent(storyId)),
    siteName: 'OX Novels', siteAccent: '#13c3b3',
    displayName: String(user.name || ''),
    access: access.membershipActive ? (access.testMode ? 'test-membership' : 'membership')
      : (access.testMode ? 'test-lifetime' : 'lifetime'),
    membershipStatus: String(access.membershipStatus || ''),
    membershipPlan: String(user.membership_plan || 'None'),
    membershipExpiresAt: String(user.membership_expires_at || ''),
    iat: now, exp: now + 90, sessionExp
  };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt({
    name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('OX_PLAYER_HANDOFF_V1'), tagLength: 128
  }, key, new TextEncoder().encode(JSON.stringify(payload)));
  const token = `v1.${b92Base64Url(iv)}.${b92Base64Url(new Uint8Array(ciphertext))}`;
  const nonce = b92Base64Url(crypto.getRandomValues(new Uint8Array(18)));
  const page = `<!doctype html><html><head><meta charset="utf-8"><title>Opening OX Player…</title>
    <meta name="referrer" content="no-referrer"></head><body>
    <p>Opening your protected OX audio story…</p>
    <form id="handoff" method="POST" action="${B92_PLAYER_HANDOFF_TARGET}"><input type="hidden" name="token" value="${token}">
    <button type="submit">Continue to OX Player</button></form>
    <script nonce="${nonce}">document.getElementById('handoff').submit();</script>
    </body></html>`;
  return new Response(page, { status: 200, headers: {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store, private',
    'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
    'content-security-policy': `default-src 'none'; base-uri 'none'; style-src 'unsafe-inline'; form-action ${B92_PLAYER_HANDOFF_TARGET}; script-src 'nonce-${nonce}'`
  }});
}
