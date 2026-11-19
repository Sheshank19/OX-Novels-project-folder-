const PLAYER_COOKIE = "__Host-ox_player";
const HANDOFF_AAD = "OX_PLAYER_HANDOFF_V1";
const SESSION_AAD = "OX_PLAYER_SESSION_V1";
const TRACK_AAD = "OX_PLAYER_TRACK_V1";
const OX_HOME = "https://oxnovels.top";

/*__OX_B5_CATALOG_INDEX__*/

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "OX Audio Player",
        phase: "B5",
        accountRole: "separate-player-service",
        secureHandoffEnabled: Boolean(String(env.OX_HANDOFF_KEY || "").trim()),
        streamingEnabled: true,
        backgroundPolling: 0,
        r2Enabled: false,
        d1Enabled: false,
        kvEnabled: false,
        publishedCatalogs: Object.keys(CATALOG_INDEX).length
      });
    }

    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204, headers: securityHeaders() });
    }

    if (url.pathname === "/handoff") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return handleHandoff(request, env, url);
    }

    if (url.pathname === "/logout") {
      return new Response(null, {
        status: 303,
        headers: {
          ...securityHeaders(),
          location: "/",
          "cache-control": "no-store",
          "set-cookie": clearSessionCookie()
        }
      });
    }

    if (url.pathname === "/api/audio/stream" && (request.method === "GET" || request.method === "HEAD")) {
      return handleAudioStream(request, env, url);
    }

    const listenMatch = url.pathname.match(/^\/listen\/([^/]+)$/);
    if (listenMatch && request.method === "GET") {
      return handleListenPage(request, env, url, decodeURIComponent(listenMatch[1]));
    }

    if (url.pathname !== "/" || request.method !== "GET") {
      return new Response("Not found", {
        status: 404,
        headers: { ...securityHeaders(), "content-type": "text/plain; charset=utf-8" }
      });
    }

    return handleHome(request, env, url);
  }
};

async function handleHandoff(request, env, url) {
  const secret = String(env.OX_HANDOFF_KEY || "").trim();
  if (!secret) return errorPage("Secure handoff is not configured yet.", 503);

  const contentType = request.headers.get("content-type") || "";
  let token = "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      token = String(form.get("token") || "");
    } else if (contentType.includes("application/json")) {
      const body = await request.json();
      token = String(body?.token || "");
    }
  } catch {
    return errorPage("The Listen handoff could not be read.", 400);
  }

  if (!token || token.length > 12000) return errorPage("The Listen handoff is missing or invalid.", 400);

  let handoff;
  try {
    handoff = await decryptToken(token, secret, HANDOFF_AAD, "v1");
  } catch {
    return errorPage("This Listen handoff is invalid or has been altered.", 401);
  }

  const now = Math.floor(Date.now() / 1000);
  if (handoff?.kind !== "handoff" || handoff?.iss !== "oxnovels.top" || handoff?.aud !== "ox-player") {
    return errorPage("This Listen handoff is not intended for OX Audio Player.", 401);
  }
  if (!Number.isFinite(Number(handoff.iat)) || !Number.isFinite(Number(handoff.exp)) || Number(handoff.exp) < now || Number(handoff.iat) > now + 30) {
    return errorPage("This Listen handoff has expired. Return to OX Novels and tap Listen again.", 401);
  }

  const storyId = String(handoff.storyId || "").trim();
  if (!storyId) return errorPage("The Listen handoff is incomplete.", 400);

  const requestedSessionExp = Number(handoff.sessionExp || 0);
  const hardMaxExp = now + 6 * 60 * 60;
  const sessionExp = Number.isFinite(requestedSessionExp) && requestedSessionExp > now
    ? Math.min(requestedSessionExp, hardMaxExp)
    : hardMaxExp;

  const sessionPayload = {
    v: 1,
    kind: "player-session",
    iss: "ox-player",
    aud: "ox-player",
    storyId,
    storyTitle: String(handoff.storyTitle || "Story").slice(0, 180),
    storyDescription: String(handoff.storyDescription || "").slice(0, 4000),
    storyGenre: String(handoff.storyGenre || "").slice(0, 80),
    storyCover: safeExternalOxImage(handoff.storyCover),
    siteName: String(handoff.siteName || "OX Novels").slice(0, 80),
    siteLogo: safeExternalOxImage(handoff.siteLogo),
    siteAccent: /^#[0-9a-fA-F]{6}$/.test(String(handoff.siteAccent || "")) ? String(handoff.siteAccent) : "#13c3b3",
    displayName: String(handoff.displayName || "").slice(0, 120),
    access: String(handoff.access || "authorized").slice(0, 40),
    membershipStatus: String(handoff.membershipStatus || "").slice(0, 40),
    membershipPlan: String(handoff.membershipPlan || "").slice(0, 120),
    membershipExpiresAt: String(handoff.membershipExpiresAt || "").slice(0, 80),
    iat: now,
    exp: sessionExp
  };

  let sessionToken;
  try {
    sessionToken = await encryptToken(sessionPayload, secret, SESSION_AAD, "v1");
  } catch {
    return errorPage("The Player session could not be created.", 500);
  }

  return new Response(null, {
    status: 303,
    headers: {
      ...securityHeaders(),
      location: `${url.origin}/listen/${encodeURIComponent(storyId)}`,
      "cache-control": "no-store",
      "set-cookie": sessionCookie(sessionToken, Math.max(1, sessionExp - now))
    }
  });
}

async function handleListenPage(request, env, url, storyId) {
  const session = await readPlayerSession(request, env);
  if (!session || String(session.storyId) !== String(storyId)) return listenDeniedPage(url.hostname);
  const catalogMeta = CATALOG_INDEX[storyId] || null;
  return htmlResponse(listenHtml(url.hostname, session, catalogMeta));
}

async function handleHome(request, env, url) {
  const session = await readPlayerSession(request, env);
  return htmlResponse(homeHtml(url.hostname, Boolean(String(env.OX_HANDOFF_KEY || "").trim()), session));
}

async function handleAudioStream(request, env, url) {
  const session = await readPlayerSession(request, env);
  if (!session) return textResponse("Player session expired. Return to OX Novels and open Listen again.", 401);

  const trackToken = String(url.searchParams.get("track") || "").trim();
  if (!trackToken || trackToken.length > 900) return textResponse("Track is missing or invalid.", 400);

  const secret = String(env.OX_HANDOFF_KEY || "").trim();
  let track;
  try {
    track = await decryptToken(trackToken, secret, TRACK_AAD, "t1");
  } catch {
    return textResponse("This track key is invalid or has been altered.", 401);
  }

  const storyId = String(session.storyId || "");
  const catalog = CATALOG_INDEX[storyId] || null;
  if (!catalog) return textResponse("This story catalog is not published on the Player yet.", 503);

  if (track?.kind !== "track" || String(track.storyId || "") !== storyId) return textResponse("This track does not belong to this story.", 403);
  if (String(track.sourceVersion || "") !== String(catalog.sourceVersion || "") || String(track.generationId || "") !== String(catalog.generationId || "")) {
    return textResponse("This track belongs to an older catalog generation. Reopen the story from OX Novels.", 409);
  }

  const fileId = String(track.fileId || "").trim();
  if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) return textResponse("The protected audio source is invalid.", 400);

  const range = String(request.headers.get("range") || "").trim();
  if (range && !/^bytes=\d*-\d*$/.test(range)) {
    return new Response("Only a single byte range is supported.", {
      status: 416,
      headers: { ...securityHeaders(), "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "accept-ranges": "bytes" }
    });
  }

  try {
    const upstream = await fetchDriveAudio(fileId, range);
    const headers = new Headers();
    headers.set("content-type", upstream.headers.get("content-type") || String(track.mimeType || "application/octet-stream"));
    headers.set("cache-control", "private, no-store");
    headers.set("accept-ranges", upstream.headers.get("accept-ranges") || "bytes");
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "no-referrer");
    headers.set("x-ox-player-stream", "b5-incremental-catalog-stream");
    for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }

    if (request.method === "HEAD") {
      try { await upstream.body?.cancel(); } catch {}
      return new Response(null, { status: upstream.status === 206 ? 206 : 200, headers });
    }
    return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
  } catch {
    return textResponse("Google Drive could not provide this audio range right now. Retry once.", 502);
  }
}

async function fetchDriveAudio(fileId, range = "") {
  const id = encodeURIComponent(fileId);
  const candidates = [
    `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${id}&confirm=t`
  ];
  let lastError = null;

  for (const target of candidates) {
    try {
      const headers = new Headers({ "user-agent": "OX-Audio-Player-B5/1.0" });
      if (range) headers.set("range", range);
      const response = await fetch(target, { method: "GET", redirect: "follow", headers });
      const type = String(response.headers.get("content-type") || "").toLowerCase();
      const looksHtml = type.includes("text/html");
      if ((response.ok || response.status === 206) && !looksHtml && response.body) return response;
      try { await response.body?.cancel(); } catch {}
      lastError = new Error("Drive source unavailable");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Drive source unavailable");
}

async function readPlayerSession(request, env) {
  const secret = String(env.OX_HANDOFF_KEY || "").trim();
  const token = getCookie(request, PLAYER_COOKIE);
  if (!secret || !token) return null;
  try {
    const session = await decryptToken(token, secret, SESSION_AAD, "v1");
    const now = Math.floor(Date.now() / 1000);
    if (session?.kind !== "player-session" || session?.iss !== "ox-player" || session?.aud !== "ox-player") return null;
    if (!Number.isFinite(Number(session.exp)) || Number(session.exp) <= now) return null;
    return session;
  } catch {
    return null;
  }
}

function safeExternalOxImage(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, OX_HOME);
    if (url.protocol !== "https:" || url.hostname !== "oxnovels.top") return "";
    return url.href.slice(0, 1400);
  } catch {
    return "";
  }
}

async function encryptToken(payload, secret, aadText, prefix) {
  const key = await importAesKey(secret, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const aad = new TextEncoder().encode(aadText);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, key, data);
  return `${prefix}.${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(encrypted))}`;
}

async function decryptToken(token, secret, aadText, prefix) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== prefix) throw new Error("Bad token format");
  const iv = base64UrlDecode(parts[1]);
  const encrypted = base64UrlDecode(parts[2]);
  if (iv.byteLength !== 12 || encrypted.byteLength < 17) throw new Error("Bad token data");
  const key = await importAesKey(secret, ["decrypt"]);
  const aad = new TextEncoder().encode(aadText);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, key, encrypted);
  return JSON.parse(new TextDecoder().decode(plain));
}

async function importAesKey(secret, usages) {
  const raw = base64UrlDecode(secret);
  if (raw.byteLength !== 32) throw new Error("OX_HANDOFF_KEY must decode to exactly 32 bytes");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, usages);
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const item = part.trim();
    const index = item.indexOf("=");
    if (index < 0) continue;
    if (item.slice(0, index) === name) return decodeURIComponent(item.slice(index + 1));
  }
  return "";
}

function sessionCookie(value, maxAge) {
  return `${PLAYER_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${Math.max(1, Math.floor(maxAge))}; HttpOnly; Secure; SameSite=Lax`;
}
function clearSessionCookie() {
  return `${PLAYER_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { ...securityHeaders(), "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
  });
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { ...securityHeaders(), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
function textResponse(text, status = 200) {
  return new Response(text, {
    status,
    headers: { ...securityHeaders(), "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
  });
}
function methodNotAllowed(method) {
  return new Response("Method not allowed", { status: 405, headers: { ...securityHeaders(), allow: method } });
}
function securityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "x-frame-options": "DENY",
    "content-security-policy": "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https://oxnovels.top; connect-src 'self'; media-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  };
}
function errorPage(message, status) {
  return htmlResponse(simplePage("Secure Player unavailable", message, true), status);
}
function listenDeniedPage(hostname) {
  return htmlResponse(simplePage("No active Listen session", "Return to OX Novels and open a story using its Listen action.", true, hostname), 401);
}

function homeHtml(hostname, handoffConfigured, session) {
  const published = Object.values(CATALOG_INDEX)
    .map(c => `${escapeHtml(c.storyId)} (${Number(c.trackCount || 0)} tracks)`)
    .join(", ") || "none yet";
  return pageShell(hostname, `
    <section class="hero">
      <div class="eyebrow">SEPARATE PLAYER SERVICE · PHASE B5</div>
      <h1>Scalable OX Player is ${handoffConfigured ? "ready" : "waiting for its secret"}.</h1>
      <p>The secure catalog is now published as static Worker assets instead of being embedded inside the dynamic Worker code. Audio streaming still runs only when an episode is selected.</p>
    </section>
    <section class="stats">
      <div class="stat"><span>Published catalogs</span><strong>${Object.keys(CATALOG_INDEX).length}</strong></div>
      <div class="stat"><span>Background polling</span><strong>0</strong></div>
      <div class="stat"><span>Paid storage</span><strong>NONE</strong></div>
      <div class="stat"><span>Static catalog delivery</span><strong>ON</strong></div>
    </section>
    <section class="panel"><h2>Published Player catalogs</h2><p>${published}</p>${session ? `<a class="primary-link" href="/listen/${encodeURIComponent(session.storyId)}">Open current Player session</a>` : `<p>Open a story from OX Novels to create a secure Player session.</p>`}</section>
  `, null);
}

function listenHtml(hostname, session, catalogMeta) {
  if (!catalogMeta) {
    return pageShell(hostname, `
      <section class="hero warn"><div class="eyebrow">OX LISTEN · CATALOG NOT PUBLISHED</div><h1>${escapeHtml(session.storyTitle || "Story")}</h1><p>Your authorization is valid, but this Player build does not contain this story's prepared catalog yet. Publish the latest catalog build and reopen the story.</p></section>
      <section class="panel"><a class="primary-link" href="${OX_HOME}">Return to OX Novels</a></section>
    `, session);
  }

  const boot = {
    storyId: String(catalogMeta.storyId || session.storyId || ""),
    catalogPath: String(catalogMeta.catalogPath || ""),
    sourceVersion: String(catalogMeta.sourceVersion || ""),
    generationId: String(catalogMeta.generationId || ""),
    storyTitle: String(session.storyTitle || catalogMeta.storyId || "Story")
  };
  const safeBootJson = safeScriptJson(JSON.stringify(boot));
  const cover = session.storyCover
    ? `<img class="story-cover" src="${escapeHtml(session.storyCover)}" alt="${escapeHtml(session.storyTitle || "Story")} cover" referrerpolicy="no-referrer">`
    : `<div class="story-mark">OX</div>`;
  const description = session.storyDescription ? `<p class="story-description">${escapeHtml(session.storyDescription)}</p>` : "";
  const genre = session.storyGenre ? `<span class="genre-pill">${escapeHtml(session.storyGenre)}</span>` : "";

  return pageShell(hostname, `
    <section class="story-card">
      ${cover}
      <div class="story-copy">
        <div class="eyebrow">OX LISTEN · SECURE SESSION</div>
        <h1>${escapeHtml(session.storyTitle || catalogMeta.storyId)}</h1>
        ${description}
        <div class="story-meta">${genre}<span>${Number(catalogMeta.folderCount || 0)} folders</span><span>${Number(catalogMeta.trackCount || 0)} audio tracks</span></div>
      </div>
      <button id="continueButton" class="continue" hidden type="button"></button>
    </section>

    <section class="panel browser-panel">
      <div class="browser-head"><div><div class="eyebrow">STORY CONTENTS</div><h2>Folders and audio files</h2></div><button id="folderBack" class="soft" hidden type="button">← Back</button></div>
      <div id="catalogLoading" class="catalog-loading">Loading story contents…</div>
      <div id="breadcrumbs" class="breadcrumbs"></div>
      <div id="browser" class="browser"></div>
    </section>

    <section class="foot-note">Player Account B · catalog navigation is static/browser-side · no player heartbeat · audio streams only when an episode is selected.</section>

    <div id="playerSheet" class="player-sheet" hidden>
      <div class="player-top"><div><strong id="playerStory">${escapeHtml(session.storyTitle || "OX Novels")}</strong><span id="playerTrack">Audio</span></div><div class="top-actions"><button id="minimizePlayer" class="icon-btn" type="button" aria-label="Minimize player">⌄</button><button id="closePlayer" class="icon-btn" type="button" aria-label="Close player">×</button></div></div>
      <div id="playerError" class="player-error" hidden><span id="playerErrorText"></span><button id="retryButton" type="button">Retry</button></div>
      <div id="buffering" class="buffering" hidden>Buffering…</div>
      <div class="time-row"><span id="currentTime">0:00</span><input id="seek" type="range" min="0" max="1000" value="0"><span id="duration">0:00</span></div>
      <div class="transport"><button id="previousButton" type="button">⏮</button><button id="backButton" type="button">↶<small>10</small></button><button id="playButton" class="play" type="button">▶</button><button id="forwardButton" type="button">↷<small>10</small></button><button id="nextButton" type="button">⏭</button></div>
      <div class="player-options">
        <label>Speed<select id="speedSelect"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option><option value="2">2×</option></select></label>
        <label>Sleep timer<select id="sleepSelect"><option value="off">Off</option><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option><option value="episode">End of episode</option></select></label>
        <label>Volume<div class="volume-row"><input id="volume" type="range" min="0" max="1" step="0.01" value="1"><button id="muteButton" type="button">Mute</button></div></label>
      </div>
      <audio id="audioEngine" preload="none"></audio>
    </div>

    <div id="miniPlayer" class="mini-player" hidden><button id="expandPlayer" class="mini-copy" type="button"><strong id="miniTrack">Audio</strong><span id="miniTime">0:00</span></button><button id="miniPlay" class="mini-play" type="button">▶</button></div>

    <script id="oxBoot" type="application/json">${safeBootJson}</script>
    <script>${PLAYER_JS}</script>
  `, session);
}

const PLAYER_JS = String.raw`(async () => {
  const boot = JSON.parse(document.getElementById('oxBoot').textContent || '{}');
  const storyId = String(boot.storyId || '');
  let catalog = null;
  const $ = id => document.getElementById(id);
  const els = {
    browser:$('browser'), breadcrumbs:$('breadcrumbs'), folderBack:$('folderBack'), continueButton:$('continueButton'), catalogLoading:$('catalogLoading'),
    playerSheet:$('playerSheet'), playerStory:$('playerStory'), playerTrack:$('playerTrack'), playerError:$('playerError'), playerErrorText:$('playerErrorText'), retryButton:$('retryButton'), buffering:$('buffering'),
    currentTime:$('currentTime'), duration:$('duration'), seek:$('seek'), previousButton:$('previousButton'), nextButton:$('nextButton'), backButton:$('backButton'), forwardButton:$('forwardButton'), playButton:$('playButton'),
    speedSelect:$('speedSelect'), sleepSelect:$('sleepSelect'), volume:$('volume'), muteButton:$('muteButton'), minimizePlayer:$('minimizePlayer'), closePlayer:$('closePlayer'), audio:$('audioEngine'),
    miniPlayer:$('miniPlayer'), miniTrack:$('miniTrack'), miniTime:$('miniTime'), miniPlay:$('miniPlay'), expandPlayer:$('expandPlayer')
  };
  let path = [];
  let active = null;
  let sleepTimer = null;
  let stopAtEpisodeEnd = false;
  let isSeeking = false;
  let lastSavedSecond = -1;
  let minimizedByUser = false;
  let sourceGeneration = 0;
  const SPEED_KEY = 'ox-player-speed-v1';
  const PROGRESS_KEY = 'ox-player-progress-v1:' + storyId;
  const trackMap = new Map();
  try {
    const response = await fetch(String(boot.catalogPath || ''), { cache: 'force-cache', credentials: 'omit' });
    if (!response.ok) throw new Error('Catalog request failed with ' + response.status);
    catalog = await response.json();
    if (!catalog || String(catalog.storyId || '') !== storyId) throw new Error('Catalog story mismatch');
    if (String(catalog.sourceVersion || '') !== String(boot.sourceVersion || '') || String(catalog.generationId || '') !== String(boot.generationId || '')) {
      throw new Error('Catalog generation mismatch');
    }
    if (!catalog.rootKey || !catalog.folders?.[catalog.rootKey]) throw new Error('Catalog root folder is missing');
    path = [catalog.rootKey];
    els.catalogLoading.hidden = true;
  } catch (error) {
    els.catalogLoading.textContent = 'Story contents could not load. Return to OX Novels and open Listen again.';
    els.catalogLoading.classList.add('is-error');
    console.error('OX Player catalog load failed', error);
    return;
  }
  for (const folder of Object.values(catalog.folders || {})) for (const track of (folder.tracks || [])) trackMap.set(track.key, track);

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function fmtTime(value){const s=Number.isFinite(value)&&value>0?Math.floor(value):0,h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;return h?h+':'+String(m).padStart(2,'0')+':'+String(x).padStart(2,'0'):m+':'+String(x).padStart(2,'0');}
  function fmtBytes(value){let b=Number(value||0),u=['B','KB','MB','GB'],i=0;if(!Number.isFinite(b)||b<=0)return'';while(b>=1024&&i<u.length-1){b/=1024;i++;}return (b>=100||i===0?Math.round(b):b.toFixed(1))+' '+u[i];}
  function loadProgress(){try{return JSON.parse(localStorage.getItem(PROGRESS_KEY)||'{}')}catch{return{}}}
  function saveProgress(extra={}){const old=loadProgress();localStorage.setItem(PROGRESS_KEY,JSON.stringify({...old,...extra,updatedAt:Date.now()}));refreshContinue();}
  function refreshContinue(){const s=loadProgress();if(!s.trackKey||!(Number(s.position)>1)||!trackMap.has(s.trackKey)){els.continueButton.hidden=true;return;}els.continueButton.hidden=false;els.continueButton.textContent='Continue '+(s.trackName||'Listening')+' · '+fmtTime(Number(s.position)||0);}
  function currentFolder(){return catalog.folders?.[path[path.length-1]]||null;}
  function render(){const folder=currentFolder();if(!folder){els.browser.innerHTML='<div class="empty">Folder unavailable.</div>';return;}els.breadcrumbs.innerHTML=path.map((key,i)=>'<button type="button" data-crumb="'+i+'">'+esc(catalog.folders[key]?.name||'Folder')+'</button>'+(i<path.length-1?'<span>›</span>':'')).join('');els.folderBack.hidden=path.length<=1;const rows=[];for(const child of folder.folders||[])rows.push('<button class="browser-row" type="button" data-folder="'+esc(child.key)+'"><span class="row-icon">▰</span><span class="row-copy"><strong>'+esc(child.name)+'</strong><span>Folder</span></span><span class="row-action">Open</span></button>');for(const t of folder.tracks||[]){const d=[t.mimeType,fmtBytes(t.size)].filter(Boolean).join(' · ');rows.push('<button class="browser-row" type="button" data-track="'+esc(t.key)+'"><span class="row-icon">▶</span><span class="row-copy"><strong>'+esc(t.name)+'</strong><span>'+esc(d)+'</span></span><span class="row-action">Play</span></button>');}els.browser.innerHTML=rows.join('')||'<div class="empty">No folders or recognized audio files were found here.</div>';}
  function showPlayer(){minimizedByUser=false;els.playerSheet.hidden=false;els.miniPlayer.hidden=true;}
  function minimize(){if(!active)return;minimizedByUser=true;els.playerSheet.hidden=true;els.miniPlayer.hidden=false;}
  function closePlayer(){sourceGeneration++;minimizedByUser=false;els.audio.pause();els.audio.removeAttribute('src');els.audio.load();active=null;els.playerSheet.hidden=true;els.miniPlayer.hidden=true;clearError();els.buffering.hidden=true;updateButtons();}
  function clearError(){els.playerError.hidden=true;}
  function showError(text){els.playerErrorText.textContent=text;els.playerError.hidden=false;els.buffering.hidden=true;}
  function updateButtons(){const playing=!els.audio.paused&&!els.audio.ended;els.playButton.textContent=playing?'❚❚':'▶';els.miniPlay.textContent=playing?'❚❚':'▶';}
  function jump(sec){if(Number.isFinite(els.audio.duration))els.audio.currentTime=Math.max(0,Math.min(els.audio.duration,els.audio.currentTime+sec));}
  function setSleep(value){if(sleepTimer)clearTimeout(sleepTimer);sleepTimer=null;stopAtEpisodeEnd=value==='episode';const m=Number(value);if(Number.isFinite(m)&&m>0)sleepTimer=setTimeout(()=>{els.audio.pause();els.sleepSelect.value='off';sleepTimer=null;},m*60000);}
  function configureMedia(t){if(!('mediaSession'in navigator)||!t)return;try{navigator.mediaSession.metadata=new MediaMetadata({title:t.name,artist:'OX Novels',album:document.title});}catch{}}
  async function safePlay(){try{await els.audio.play();return true;}catch(e){if(e?.name==='AbortError'&&els.audio.paused){els.buffering.hidden=true;clearError();updateButtons();return false;}throw e;}}
  function applySource(url,resume=null){sourceGeneration++;const generation=sourceGeneration;clearError();els.audio.pause();els.audio.removeAttribute('src');els.audio.load();els.audio.src=url;els.audio.playbackRate=Number(els.speedSelect.value)||1;if(resume!==null){const fn=()=>{if(generation!==sourceGeneration)return;if(Number.isFinite(els.audio.duration))els.audio.currentTime=Math.min(Number(resume)||0,Math.max(0,els.audio.duration-.25));els.audio.removeEventListener('loadedmetadata',fn);};if(els.audio.readyState>=1)fn();else els.audio.addEventListener('loadedmetadata',fn);}}
  async function start(track,resume=0){if(!track?.key)return;clearError();showPlayer();els.buffering.hidden=false;active=track;els.playerTrack.textContent=track.name||'Audio';els.miniTrack.textContent=track.name||'Audio';configureMedia(track);applySource('/api/audio/stream?track='+encodeURIComponent(track.key),resume);try{await safePlay();}catch(e){showError(e?.message||'Playback could not start.');}}
  async function playNeighbor(kind){if(!active)return;const key=kind==='previous'?active.previousKey:active.nextKey;if(!key)return;const t=trackMap.get(key);if(t)await start(t,0);}
  els.browser.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.folder){path.push(b.dataset.folder);render();return;}if(b.dataset.track){const t=trackMap.get(b.dataset.track);if(t)start(t,0);}});
  els.folderBack.addEventListener('click',()=>{if(path.length>1){path.pop();render();}});
  els.breadcrumbs.addEventListener('click',e=>{const b=e.target.closest('[data-crumb]');if(!b)return;const i=Number(b.dataset.crumb);if(Number.isInteger(i)&&i>=0&&i<path.length){path=path.slice(0,i+1);render();}});
  els.continueButton.addEventListener('click',()=>{const s=loadProgress(),t=trackMap.get(s.trackKey);if(t)start(t,Number(s.position)||0);else{localStorage.removeItem(PROGRESS_KEY);refreshContinue();}});
  els.playButton.addEventListener('click',async()=>{if(!active)return;if(els.audio.paused){try{await safePlay()}catch(e){showError(e?.message||'Playback could not start.')}}else els.audio.pause();});
  els.miniPlay.addEventListener('click',async()=>{if(!active)return;if(els.audio.paused){try{await safePlay()}catch(e){showError(e?.message||'Playback could not start.')}}else els.audio.pause();});
  els.previousButton.addEventListener('click',()=>playNeighbor('previous'));els.nextButton.addEventListener('click',()=>playNeighbor('next'));els.backButton.addEventListener('click',()=>jump(-10));els.forwardButton.addEventListener('click',()=>jump(10));els.minimizePlayer.addEventListener('click',minimize);els.expandPlayer.addEventListener('click',showPlayer);els.closePlayer.addEventListener('click',closePlayer);els.retryButton.addEventListener('click',()=>{if(!active)return;const position=Number(els.audio.currentTime)||Number(loadProgress().position)||0;clearError();start(active,position);});
  els.speedSelect.addEventListener('change',()=>{const r=Number(els.speedSelect.value)||1;els.audio.playbackRate=r;localStorage.setItem(SPEED_KEY,String(r));});
  els.volume.addEventListener('input',()=>{els.audio.volume=Number(els.volume.value);if(els.audio.muted&&Number(els.volume.value)>0)els.audio.muted=false;els.muteButton.textContent=els.audio.muted?'Unmute':'Mute';});els.muteButton.addEventListener('click',()=>{els.audio.muted=!els.audio.muted;els.muteButton.textContent=els.audio.muted?'Unmute':'Mute';});els.sleepSelect.addEventListener('change',()=>setSleep(els.sleepSelect.value));
  els.seek.addEventListener('pointerdown',()=>{isSeeking=true});els.seek.addEventListener('pointerup',()=>{isSeeking=false});els.seek.addEventListener('input',()=>{if(Number.isFinite(els.audio.duration)&&els.audio.duration>0)els.audio.currentTime=(Number(els.seek.value)/1000)*els.audio.duration;});
  els.audio.addEventListener('play',updateButtons);els.audio.addEventListener('pause',updateButtons);els.audio.addEventListener('waiting',()=>{if(active)els.buffering.hidden=false});els.audio.addEventListener('playing',()=>{els.buffering.hidden=true;clearError();updateButtons();});els.audio.addEventListener('canplay',()=>{els.buffering.hidden=true;clearError();});els.audio.addEventListener('error',()=>{const mediaError=els.audio.error;if(!active||!els.audio.getAttribute('src')||!mediaError)return;showError('This episode could not be streamed. Retry once.');});
  els.audio.addEventListener('loadedmetadata',()=>{els.duration.textContent=fmtTime(els.audio.duration)});
  els.audio.addEventListener('timeupdate',()=>{const c=els.audio.currentTime||0,d=els.audio.duration||0;els.currentTime.textContent=fmtTime(c);els.miniTime.textContent=fmtTime(c);if(!isSeeking&&d>0)els.seek.value=String(Math.round(c/d*1000));if(active?.key){const whole=Math.floor(c);if(whole!==lastSavedSecond&&whole>0&&whole%5===0){lastSavedSecond=whole;saveProgress({trackKey:active.key,trackName:active.name,position:c});}}if('mediaSession'in navigator&&'setPositionState'in navigator.mediaSession&&d>0&&Number.isFinite(d)){try{navigator.mediaSession.setPositionState({duration:d,playbackRate:els.audio.playbackRate,position:Math.min(c,d)})}catch{}}});
  els.audio.addEventListener('ended',async()=>{if(active?.key)saveProgress({trackKey:active.key,trackName:active.name,position:0});if(stopAtEpisodeEnd){stopAtEpisodeEnd=false;els.sleepSelect.value='off';updateButtons();return;}if(active?.nextKey)await playNeighbor('next');else updateButtons();});
  if('mediaSession'in navigator){const set=(n,f)=>{try{navigator.mediaSession.setActionHandler(n,f)}catch{}};set('play',()=>safePlay().catch(e=>showError(e?.message||'Playback could not start.')));set('pause',()=>els.audio.pause());set('seekbackward',d=>jump(-(d.seekOffset||10)));set('seekforward',d=>jump(d.seekOffset||10));set('previoustrack',()=>playNeighbor('previous'));set('nexttrack',()=>playNeighbor('next'));set('seekto',d=>{if(Number.isFinite(d.seekTime))els.audio.currentTime=d.seekTime});}
  els.playerSheet.hidden=true;els.miniPlayer.hidden=true;
  const savedRate=Number(localStorage.getItem(SPEED_KEY));if([.75,1,1.25,1.5,1.75,2].includes(savedRate))els.speedSelect.value=String(savedRate);els.audio.playbackRate=Number(els.speedSelect.value)||1;refreshContinue();render();updateButtons();
})();`;

function simplePage(title, message, back = false, hostname = "listen.ox-audio-player.workers.dev") {
  return pageShell(hostname, `<section class="hero"><div class="eyebrow">OX AUDIO PLAYER</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${back ? `<p><a class="primary-link" href="${OX_HOME}">Return to OX Novels</a></p>` : ""}</section>`, null);
}

function pageShell(hostname, body, session) {
  const siteName = escapeHtml(session?.siteName || "OX Novels");
  const accent = /^#[0-9a-fA-F]{6}$/.test(String(session?.siteAccent || "")) ? String(session.siteAccent) : "#13c3b3";
  const logo = session?.siteLogo
    ? `<img class="brand-logo" src="${escapeHtml(session.siteLogo)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="mark">OX</span>`;
  const membershipCandidates = [session?.membershipPlan, session?.membershipStatus, session?.access]
    .map(value => String(value || "").trim())
    .filter(value => value && !/^(none|null|undefined)$/i.test(value));
  const membershipLine = session
    ? escapeHtml(membershipCandidates[0] || "Member")
    : "Separate Player";
  const expiryLine = session?.membershipExpiresAt
    ? `<small>Access until ${escapeHtml(formatDisplayDate(session.membershipExpiresAt))}</small>`
    : "";
  const accountMenu = session ? `
    <button class="site-menu-toggle" id="siteMenuToggle" type="button" aria-label="Open account menu" aria-expanded="false">☰</button>
    <div class="site-menu-popover" id="siteMenuPopover" hidden>
      <div class="site-menu-summary"><strong>${escapeHtml(session.displayName || "Member")}</strong><span>${membershipLine}</span>${expiryLine}</div>
      <a class="site-menu-action" href="${OX_HOME}">Account details on OX</a>
      <a class="site-menu-action" href="${OX_HOME}">Return to OX Novels</a>
      <a class="site-menu-action danger" href="/logout">Clear Player session</a>
    </div>` : `<span class="member-pill">PLAYER ACCOUNT B · B5</span>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="${accent}"><title>${siteName} — Player</title><style>
  :root{--accent:${accent};--accent-soft:color-mix(in srgb,var(--accent) 12%,white);--ink:#142426;--muted:#63777a;--line:#dce7e7;--bg:#f5f7f7}
  *{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input,select{font:inherit}button{cursor:pointer}.topbar{height:56px;background:#fff;border-bottom:1px solid #e3e8ea;position:sticky;top:0;z-index:40}.topbar-inner{height:100%;max-width:1200px;margin:auto;padding:0 18px;display:flex;align-items:center;justify-content:space-between}.brand{display:flex;gap:10px;align-items:center;font-weight:800;color:#182629;text-decoration:none}.brand-logo,.mark{width:34px;height:34px;border-radius:10px}.brand-logo{object-fit:cover;border:1px solid rgba(0,0,0,.06)}.mark{display:grid;place-items:center;background:linear-gradient(135deg,#101d21,#23484c);color:var(--accent);font-size:12px}.top-actions{position:relative}.site-menu-toggle{width:40px;height:40px;border:0;background:transparent;border-radius:10px;font-size:22px;line-height:1}.site-menu-toggle:hover{background:#f3f5f6}.site-menu-popover{position:absolute;right:0;top:46px;width:min(290px,calc(100vw - 28px));padding:8px;background:#fff;border:1px solid #dde5e7;border-radius:14px;box-shadow:0 18px 55px rgba(17,38,41,.16)}.site-menu-summary{padding:8px 9px 11px;display:grid;gap:3px;border-bottom:1px solid #edf1f2}.site-menu-summary strong{font-size:14px}.site-menu-summary span,.site-menu-summary small{color:#667176;font-size:12px;line-height:1.4}.site-menu-action{display:block;width:100%;padding:10px 9px;border:0;background:transparent;color:#1c2b2e;text-align:left;text-decoration:none;border-radius:9px;font-weight:700;font-size:13px}.site-menu-action:hover{background:#f4f7f7}.site-menu-action.danger{color:#9d3d3d}.member-pill{font-size:12px;padding:7px 10px;border-radius:999px;background:var(--accent-soft);color:#087b73;font-weight:800}
  main{max-width:1040px;margin:26px auto 150px;padding:0 18px}.hero,.panel,.story-card,.stat{background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 8px 30px rgba(16,45,48,.05)}.hero{padding:28px}.hero h1,.story-card h1{font-size:32px;margin:8px 0 9px}.hero p,.story-card p,.panel p{color:#587074;line-height:1.6}.eyebrow{font-size:10px;letter-spacing:.18em;font-weight:900;color:var(--accent)}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0}.stat{padding:17px}.stat span{display:block;color:#6b7d80;font-size:12px}.stat strong{display:block;margin-top:5px;font-size:18px;color:#087f77}.panel{padding:22px;margin-top:14px}.primary-link{display:inline-block;margin-top:12px;padding:10px 14px;border-radius:10px;background:#142426;color:#fff;text-decoration:none;font-weight:800}
  .story-card{display:flex;align-items:center;gap:20px;padding:22px}.story-cover,.story-mark{width:132px;height:184px;border-radius:15px;flex:0 0 auto}.story-cover{object-fit:cover;border:1px solid #e1e7e8;background:#eef3f3}.story-mark{display:grid;place-items:center;background:linear-gradient(135deg,#101d21,#23484c);color:var(--accent);font-weight:900;font-size:20px}.story-copy{min-width:0;flex:1}.story-description{max-width:720px;margin:0 0 10px}.story-meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;color:#6d7f82;font-size:12px}.story-meta>span{padding:5px 8px;border:1px solid #dce5e5;border-radius:999px}.genre-pill{background:var(--accent-soft);color:#087b73!important;border-color:transparent!important;font-weight:800}.continue{border:0;background:var(--accent);color:#fff;border-radius:11px;padding:12px 15px;font-weight:900;max-width:260px}
  .browser-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.browser-head h2{margin:5px 0 0}.soft,.icon-btn{border:1px solid #d5e2e2;background:#fff;color:#163235;border-radius:10px;padding:9px 12px}.catalog-loading{padding:18px 0;color:#6d7f82}.catalog-loading.is-error{color:#9d3d3d}.breadcrumbs{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:18px 0}.breadcrumbs button{border:0;background:transparent;color:#087f77;font-weight:800;padding:2px}.browser{display:grid;gap:8px}.browser-row{width:100%;display:flex;align-items:center;gap:12px;text-align:left;border:1px solid #dde7e7;background:#fff;border-radius:12px;padding:12px}.browser-row:hover{border-color:#98d8d3;background:#f8fdfd}.row-icon{width:34px;height:34px;border-radius:9px;background:#edf8f7;color:#07867e;display:grid;place-items:center}.row-copy{min-width:0;flex:1}.row-copy strong,.row-copy span{display:block}.row-copy strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row-copy span{font-size:12px;color:#748589;margin-top:3px}.row-action{font-weight:900;color:#07867e}.empty{padding:24px;text-align:center;color:#76878a}.foot-note{text-align:center;color:#7d8e90;font-size:12px;margin:18px 0}
  .player-sheet{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);width:min(760px,calc(100vw - 24px));background:#fff;border:1px solid #d8e4e4;border-radius:20px;box-shadow:0 20px 70px rgba(9,34,36,.22);padding:18px;z-index:50}.player-top{display:flex;align-items:center;justify-content:space-between;gap:12px}.player-top strong,.player-top span{display:block}.player-top span{font-size:13px;color:#677b7e;margin-top:3px}.top-actions{display:flex;gap:7px}.player-error{display:flex;justify-content:space-between;gap:10px;align-items:center;background:#fff1f1;border:1px solid #ffcaca;color:#a73b3b;padding:10px 12px;border-radius:10px;margin-top:12px}.player-error button{border:1px solid #e9bbbb;background:#fff;border-radius:8px;padding:7px 10px;font-weight:800}.buffering{text-align:center;margin:10px 0;color:#6b7e80}.time-row{display:grid;grid-template-columns:48px 1fr 48px;align-items:center;gap:9px;margin-top:14px;font-size:12px;color:#65777a}.time-row input{width:100%}.transport{display:flex;justify-content:center;align-items:center;gap:10px;margin:14px 0}.transport button{width:48px;height:48px;border-radius:50%;border:1px solid #d6e2e2;background:#fff;font-weight:900}.transport .play{width:60px;height:60px;background:var(--accent);color:#fff;border-color:var(--accent);font-size:20px}.transport small{display:block;font-size:8px}.player-options{display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:10px}.player-options label{display:flex;flex-direction:column;gap:7px;border:1px solid #dbe5e5;border-radius:11px;padding:10px;font-size:11px;color:#587074}.player-options select{border:0;background:transparent;font-weight:800;color:#142426}.volume-row{display:flex;align-items:center;gap:7px}.volume-row input{min-width:0;flex:1}.volume-row button{border:1px solid #d7e2e2;background:#fff;border-radius:8px;padding:6px 8px;font-size:11px}.mini-player{position:fixed;left:12px;right:12px;bottom:12px;max-width:620px;margin:auto;background:#fff;border:1px solid #d9e5e5;border-radius:15px;box-shadow:0 14px 45px rgba(9,34,36,.2);display:flex;align-items:center;gap:10px;padding:10px;z-index:50}.mini-copy{flex:1;min-width:0;text-align:left;border:0;background:transparent}.mini-copy strong,.mini-copy span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mini-copy span{font-size:11px;color:#728386}.mini-play{width:42px;height:42px;border-radius:50%;border:0;background:var(--accent);color:#fff;font-weight:900}.warn{border-color:#ffd5a5}
  @media(max-width:720px){.topbar-inner{padding:0 12px}.story-card{align-items:flex-start;flex-wrap:wrap;padding:18px}.story-cover,.story-mark{width:92px;height:128px}.story-copy{flex:1}.story-card h1,.hero h1{font-size:25px}.continue{width:100%;max-width:none}.stats{grid-template-columns:1fr 1fr}.player-options{grid-template-columns:1fr}.player-sheet{bottom:8px}.browser-row{padding:11px}}
  </style></head><body><header class="topbar"><div class="topbar-inner"><a class="brand" href="${OX_HOME}" aria-label="OX Novels home">${logo}<span>${siteName}</span></a><div class="top-actions">${accountMenu}</div></div></header><main>${body}</main>
  <script>(()=>{const b=document.getElementById('siteMenuToggle'),p=document.getElementById('siteMenuPopover');if(!b||!p)return;b.addEventListener('click',()=>{const o=p.hidden;p.hidden=!o;b.setAttribute('aria-expanded',String(o))});document.addEventListener('click',e=>{if(p.hidden||p.contains(e.target)||b.contains(e.target))return;p.hidden=true;b.setAttribute('aria-expanded','false')});})();</script>
  </body></html>`;
}

function formatDisplayDate(value) {
  const d = new Date(String(value || ""));
  if (!Number.isFinite(d.getTime())) return String(value || "");
  return d.toLocaleString("en", { year:"numeric", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"UTC" }) + " UTC";
}

function safeScriptJson(text) {
  return String(text).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[ch]);
}
