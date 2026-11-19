const DEFAULT_APPEARANCE = {
  name: "",
  handle: "",
  description: "",
  accent: "#13c3b3",
  layout: "Integrated banner",
  logo: "",
  profileImage: "",
  bannerImage: ""
};

const DEFAULT_SETTINGS = {
  language: "English",
  timezone: "Asia/Kolkata (IST)",
  currency: "USD — US Dollar",
  supportEmail: "",
  supportLabel: "Support",
  showSearch: true,
  showChat: true,
  showSupport: true,
  preventSelection: true
};

const ADMIN_SESSION_COOKIE = "ox_admin_session";
const USER_SESSION_COOKIE = "ox_user_session";
const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const USER_SESSION_MAX_AGE = 60 * 60 * 24 * 365;
const USER_SESSION_REFRESH_THRESHOLD = 60 * 60 * 24 * 180;
const PASSWORD_ITERATIONS = 120000;
const LIFETIME_STORY_PRICE = "49.00";
const LIFETIME_STORY_CURRENCY = "USD";
const LIFETIME_CHECKOUT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

// Admin password brute-force protection. This is deliberately per-client so one
// remote attacker cannot globally lock every Admin out of the site. Only a
// SHA-256 fingerprint of the connecting IP is kept in D1; the raw IP is not.
const ADMIN_LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_FAILURES = 5;
const ADMIN_LOGIN_LOCK_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_STALE_ROW_MS = 24 * 60 * 60 * 1000;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

// OX PLAYER HANDOFF LOCAL TEST — Phase B2. The production deployment is not
// changed by this installer. A 32-byte AES-GCM key is passed to Wrangler only
// by START-OX-NOVELS-PLAYER-HANDOFF-TEST.bat; .dev.vars is not modified.
const OX_PLAYER_HANDOFF_AAD = "OX_PLAYER_HANDOFF_V1";
const OX_PLAYER_HANDOFF_TTL_SECONDS = 90;
const OX_PLAYER_SESSION_MAX_SECONDS = 6 * 60 * 60;

function oxPlayerBase64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function oxPlayerBase64UrlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function createOxPlayerHandoffToken(env, payload) {
  const secret = String(env.OX_HANDOFF_KEY || "").trim();
  if (!secret) { const error = new Error("Local Player handoff key is not configured. Start OX with START-OX-NOVELS-PLAYER-HANDOFF-TEST.bat."); error.code = "PLAYER_HANDOFF_NOT_CONFIGURED"; throw error; }
  const raw = oxPlayerBase64UrlDecode(secret);
  if (raw.byteLength !== 32) { const error = new Error("Local Player handoff key must be a 32-byte base64url value."); error.code = "PLAYER_HANDOFF_BAD_KEY"; throw error; }
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const aad = new TextEncoder().encode(OX_PLAYER_HANDOFF_AAD);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, key, data);
  return `v1.${oxPlayerBase64UrlEncode(iv)}.${oxPlayerBase64UrlEncode(new Uint8Array(encrypted))}`;
}

function oxPlayerBaseUrl(env) {
  const configured = String(env.OX_PLAYER_BASE_URL || "https://listen.ox-audio-player.workers.dev").trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== "https:") throw new Error("HTTPS required");
    return parsed.origin;
  } catch {
    return "https://listen.ox-audio-player.workers.dev";
  }
}

function isLocalhost(url) {
  return ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname) || url.hostname.startsWith("192.168.");
}

function getCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const item = part.trim();
    const index = item.indexOf("=");
    if (index === -1) continue;
    if (item.slice(0, index) === name) return decodeURIComponent(item.slice(index + 1));
  }
  return "";
}

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeAppearance(input = {}) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(String(input.accent || "")) ? String(input.accent) : DEFAULT_APPEARANCE.accent;
  return {
    name: String(input.name || DEFAULT_APPEARANCE.name).trim().slice(0, 80) || DEFAULT_APPEARANCE.name,
    handle: String(input.handle || DEFAULT_APPEARANCE.handle).trim().slice(0, 80),
    description: String(input.description || "").trim().slice(0, 500),
    accent,
    layout: String(input.layout || DEFAULT_APPEARANCE.layout).slice(0, 60),
    logo: String(input.logo || "").trim().slice(0, 1000),
    profileImage: String(input.profileImage || "").trim().slice(0, 1000),
    bannerImage: String(input.bannerImage || "").trim().slice(0, 1000)
  };
}

function normalizeSettings(input = {}) {
  const rawSupportEmail = String(input.supportEmail || "").trim().slice(0, 180);
  const supportEmail = rawSupportEmail.toLowerCase() === "support@example.com" ? "" : rawSupportEmail;
  return {
    language: String(input.language || DEFAULT_SETTINGS.language).slice(0, 60),
    timezone: String(input.timezone || DEFAULT_SETTINGS.timezone).slice(0, 100),
    currency: String(input.currency || DEFAULT_SETTINGS.currency).slice(0, 100),
    supportEmail,
    supportLabel: String(input.supportLabel || DEFAULT_SETTINGS.supportLabel).slice(0, 40),
    showSearch: input.showSearch !== false,
    showChat: input.showChat !== false,
    showSupport: input.showSupport !== false,
    preventSelection: input.preventSelection !== false
  };
}

function normalizeStory(input = {}, index = 0) {
  const id = String(input.id || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  if (!id) return null;
  return {
    id,
    title: String(input.title || "Untitled Story").trim().slice(0, 180),
    description: String(input.description || "").trim().slice(0, 4000),
    genre: String(input.genre || input.category || "Unverified").trim().slice(0, 80),
    cover: (() => {
      const raw = String(input.cover || "").trim();
      if (!raw || (id !== "wolves-blood-moon" && raw === "/covers/wolves-blood-moon.svg")) return `/api/story-cover/${encodeURIComponent(id)}`;
      return raw.slice(0, 1000);
    })(),
    visible: input.visible !== false,
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : index + 1,
    driveUrl: String(input.driveUrl || "").trim().slice(0, 2000),
    driveRootId: String(input.driveRootId || "").trim().slice(0, 220),
    driveRootUrl: String(input.driveRootUrl || "").trim().slice(0, 2000),
    driveRootName: String(input.driveRootName || "").trim().slice(0, 300),
    driveRootOwnerEmail: String(input.driveRootOwnerEmail || "").trim().slice(0, 320),
    drivePath: String(input.drivePath || "").trim().slice(0, 3000),
    checked: String(input.checked || "Never").slice(0, 100),
    lock: input.lock === true,
    genreLastChecked: input.genreLastChecked || null
  };
}

function normalizeTier(input = {}, index = 0) {
  const id = String(input.id || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  if (!id) return null;
  const benefits = Array.isArray(input.benefits) ? input.benefits.map(v => String(v).trim().slice(0, 220)).filter(Boolean).slice(0, 20) : [];
  return {
    id,
    name: String(input.name || "Membership").trim().slice(0, 120),
    price: String(input.price || "$0.00").trim().slice(0, 40),
    cycle: String(input.cycle || "/ month").trim().slice(0, 40),
    description: String(input.description || "").trim().slice(0, 1000),
    status: input.status === "Published" ? "Published" : "Draft",
    benefits,
    cover: String(input.cover || "").trim().slice(0, 1000),
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : index + 1
  };
}

function publicStoryFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.genre,
    genre: row.genre,
    cover: (!row.cover || (row.id !== "wolves-blood-moon" && row.cover === "/covers/wolves-blood-moon.svg"))
      ? `/api/story-cover/${encodeURIComponent(row.id)}?v=${encodeURIComponent(String(row.updated_at || "0"))}`
      : row.cover,
    visible: row.visible === 1,
    order: Number(row.sort_order || 9999),
    genreLastChecked: row.genre_last_checked || null,
    source: "d1"
  };
}

function adminStoryFromRow(row) {
  return {
    ...publicStoryFromRow(row),
    driveUrl: row.drive_url || "",
    driveRootId: row.drive_root_id || "",
    driveRootUrl: row.drive_root_url || "",
    driveRootName: row.drive_root_name || "",
    driveRootOwnerEmail: row.drive_root_owner_email || "",
    drivePath: row.drive_path || "",
    checked: row.checked || "Never",
    lock: row.manual_lock === 1
  };
}

function tierFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    cycle: row.cycle,
    description: row.description,
    status: row.status === "Published" ? "Published" : "Draft",
    benefits: safeParse(row.benefits_json || "[]", []),
    cover: row.cover || "",
    order: Number(row.sort_order || 9999)
  };
}

function escapeSvgText(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function generatedStoryCoverSvg(title, id) {
  const text = String(title || "Untitled Story").trim() || "Untitled Story";
  let hash = 0;
  for (const char of String(id || text)) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  const hueA = Math.abs(hash) % 360;
  const hueB = (hueA + 42 + (Math.abs(hash >> 3) % 70)) % 360;
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > 20 && line) { lines.push(line); line = word; } else line = candidate;
  }
  if (line) lines.push(line);
  const displayLines = lines.slice(0, 3);
  if (lines.length > 3) displayLines[2] = `${displayLines[2].slice(0, 17)}…`;

  // Match the public gallery's new near-square Ko-fi-style tile (1 : 1.04).
  // Generated covers therefore fill the card naturally instead of showing dark
  // side bars, while uploaded portrait artwork can still use contained + blur.
  const canvasW = 800;
  const canvasH = 832;
  const lineGap = 48;
  const firstY = 758 - Math.max(0, displayLines.length - 1) * lineGap;
  const oxLabelY = firstY - 58;
  const titleMarkup = displayLines.map((value, index) => `<text x="58" y="${firstY + index * lineGap}" fill="white" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="800">${escapeSvgText(value)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}" role="img" aria-label="${escapeSvgText(text)} cover">
    <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="hsl(${hueA} 62% 23%)"/><stop offset="1" stop-color="hsl(${hueB} 72% 40%)"/></linearGradient></defs>
    <rect width="${canvasW}" height="${canvasH}" fill="url(#g)"/>
    <circle cx="655" cy="132" r="138" fill="white" opacity=".10"/><circle cx="108" cy="710" r="190" fill="white" opacity=".07"/>
    <path d="M0 600 C210 485 370 710 800 480 V832 H0 Z" fill="#000" opacity=".16"/>
    <text x="58" y="${oxLabelY}" fill="white" opacity=".70" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" letter-spacing="5">AUDIO STORY</text>
    ${titleMarkup}
  </svg>`;
}

function generatedUserAvatarSvg(name = "Member", email = "", id = "") {
  const cleanName = String(name || "Member").trim() || "Member";
  const words = cleanName.split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? `${words[0][0] || ""}${words[words.length - 1][0] || ""}` : (words[0] || "M").slice(0, 2)).toUpperCase();
  const seed = String(id || email || cleanName);
  let hash = 0;
  for (const char of seed) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  const hueA = Math.abs(hash) % 360;
  const hueB = (hueA + 36 + (Math.abs(hash >> 4) % 72)) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" role="img" aria-label="${escapeSvgText(cleanName)} profile picture">
    <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="hsl(${hueA} 58% 30%)"/><stop offset="1" stop-color="hsl(${hueB} 68% 46%)"/></linearGradient></defs>
    <rect width="800" height="800" rx="400" fill="url(#g)"/>
    <circle cx="650" cy="150" r="170" fill="white" opacity=".10"/><circle cx="135" cy="675" r="220" fill="white" opacity=".07"/>
    <text x="400" y="430" text-anchor="middle" fill="white" font-family="Arial, Helvetica, sans-serif" font-size="230" font-weight="800">${escapeSvgText(initials || "M")}</text>
  </svg>`;
}

async function ensureStoryCoversTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS story_covers (
    story_id TEXT PRIMARY KEY,
    mime_type TEXT NOT NULL,
    image_data BLOB NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`).run();
}

async function getStoryCover(request, env, storyId) {
  try {
    await ensureStoryCoversTable(env);
    const uploaded = await env.DB.prepare("SELECT mime_type, image_data, updated_at, size_bytes FROM story_covers WHERE story_id = ?").bind(storyId).first();
    if (uploaded?.image_data) {
      const bytes = uploaded.image_data instanceof ArrayBuffer
        ? new Uint8Array(uploaded.image_data)
        : Uint8Array.from(uploaded.image_data);
      const versioned = new URL(request.url).searchParams.has("v");
      return new Response(bytes, {
        headers: {
          "content-type": uploaded.mime_type || "image/webp",
          "cache-control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=3600, stale-while-revalidate=86400",
          "etag": `W/\"story-${encodeURIComponent(storyId)}-${String(uploaded.updated_at || uploaded.size_bytes || "0")}\"`
        }
      });
    }
  } catch {}

  let title = String(storyId || "").replace(/-/g, " ").replace(/\\b\\w/g, char => char.toUpperCase());
  try {
    const story = await env.DB.prepare("SELECT title FROM stories WHERE id = ?").bind(storyId).first();
    if (story?.title) title = story.title;
  } catch {}
  return new Response(generatedStoryCoverSvg(title, storyId), {
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=300, stale-while-revalidate=3600" }
  });
}

async function uploadStoryCover(request, env, storyId) {
  storyId = String(storyId || "").trim();
  if (!storyId) { if (request.body) { try { await request.arrayBuffer(); } catch {} } return json({ error: "A valid story id is required for a cover upload." }, 400); }
  let mime = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(mime)) {
    return json({ error: "Use a JPG, PNG, WEBP or AVIF cover image." }, 415);
  }
  try {
    const buffer = await request.arrayBuffer();
    if (!buffer.byteLength) return json({ error: "The selected image is empty." }, 400);
    if (buffer.byteLength > 1_250_000) return json({ error: "Cover image is still too large after optimization. Please choose a smaller image." }, 413);
    await ensureStoryCoversTable(env);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO story_covers (story_id,mime_type,image_data,size_bytes,updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(story_id) DO UPDATE SET mime_type=excluded.mime_type,image_data=excluded.image_data,size_bytes=excluded.size_bytes,updated_at=excluded.updated_at`)
      .bind(storyId, mime, buffer, buffer.byteLength, now).run();
    await env.DB.prepare("UPDATE stories SET updated_at=? WHERE id=?").bind(now, storyId).run().catch(() => null);
    return json({ ok: true, cover: `/api/story-cover/${encodeURIComponent(storyId)}?v=${encodeURIComponent(now)}` });
  } catch (error) {
    console.error("Story cover upload failed", error);
    return json({ error: `Unable to upload cover image: ${String(error?.message || error).slice(0, 220)}` }, 500);
  }
}

async function resetStoryCover(env, storyId) {
  try {
    await ensureStoryCoversTable(env);
    await env.DB.prepare("DELETE FROM story_covers WHERE story_id = ?").bind(storyId).run();
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE stories SET updated_at=? WHERE id=?").bind(now, storyId).run().catch(() => null);
    return json({ ok: true, cover: `/api/story-cover/${encodeURIComponent(storyId)}?v=${encodeURIComponent(now)}` });
  } catch (error) {
    return json({ error: `Unable to reset cover image: ${String(error?.message || error).slice(0, 220)}` }, 500);
  }
}


function validMediaKey(value = "") {
  const key = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9:_-]{0,159}$/.test(key) ? key : "";
}

async function ensureMediaAssetsTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS media_assets (
    asset_key TEXT PRIMARY KEY,
    mime_type TEXT NOT NULL,
    image_data BLOB NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`).run();
}

async function getMediaAsset(request, env, rawKey) {
  const key = validMediaKey(rawKey);
  if (!key) return new Response("Not found", { status: 404 });
  await ensureMediaAssetsTable(env);
  const row = await env.DB.prepare("SELECT mime_type,image_data,size_bytes,updated_at FROM media_assets WHERE asset_key=?").bind(key).first();
  if (row?.image_data) {
    const bytes = row.image_data instanceof ArrayBuffer ? new Uint8Array(row.image_data) : Uint8Array.from(row.image_data);
    const versioned = new URL(request.url).searchParams.has("v");
    const memberAvatar = key.startsWith("user-profile-");
    const cacheControl = versioned ? "public, max-age=31536000, immutable" : (memberAvatar ? "private, max-age=300, must-revalidate" : "public, max-age=3600, stale-while-revalidate=86400");
    return new Response(bytes, { headers: {
      "content-type": row.mime_type || "image/webp",
      "cache-control": cacheControl,
      "etag": `W/\"media-${encodeURIComponent(key)}-${String(row.updated_at || row.size_bytes || "0")}\"`
    } });
  }

  // Member profile pictures intentionally fall back to a generated initials SVG,
  // just like a story gets a generated cover when no uploaded artwork exists.
  if (key.startsWith("user-profile-")) {
    const userId = key.slice("user-profile-".length);
    try {
      const user = await env.DB.prepare("SELECT id,name,email FROM users WHERE id=?").bind(userId).first();
      if (user) return new Response(generatedUserAvatarSvg(user.name, user.email, user.id), {
        headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "private, max-age=300, must-revalidate" }
      });
    } catch {}
  }
  return new Response("Not found", { status: 404 });
}

async function uploadMediaAsset(request, env, rawKey) {
  const key = validMediaKey(rawKey);
  if (!key) return json({ error: "Invalid media asset key." }, 400);
  let mime = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(mime)) return json({ error: "Use a JPG, PNG, WEBP or AVIF image." }, 415);
  const buffer = await request.arrayBuffer();
  if (!buffer.byteLength) return json({ error: "The selected image is empty." }, 400);
  if (buffer.byteLength > 1_250_000) return json({ error: "Image is still too large after optimization. Choose a smaller image." }, 413);
  await ensureMediaAssetsTable(env);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO media_assets(asset_key,mime_type,image_data,size_bytes,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(asset_key) DO UPDATE SET mime_type=excluded.mime_type,image_data=excluded.image_data,size_bytes=excluded.size_bytes,updated_at=excluded.updated_at`)
    .bind(key, mime, buffer, buffer.byteLength, now).run();
  return json({ ok: true, url: `/api/media/${encodeURIComponent(key)}` });
}

async function deleteMediaAsset(env, rawKey) {
  const key = validMediaKey(rawKey);
  if (!key) return json({ error: "Invalid media asset key." }, 400);
  await ensureMediaAssetsTable(env);
  await env.DB.prepare("DELETE FROM media_assets WHERE asset_key=?").bind(key).run();
  return json({ ok: true });
}

function base64UrlBytes(bytes) {
  let binary = "";
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < array.length; i += 0x8000) binary += String.fromCharCode(...array.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlText(text) { return base64UrlBytes(new TextEncoder().encode(text)); }
function decodeBase64ToBytes(value = "") {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function extractDriveFolderId(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  let match = text.match(/(?:drive\/folders|folders)\/([a-zA-Z0-9_-]{10,})/);
  if (match) return match[1];
  match = text.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (match) return match[1];
  return /^[a-zA-Z0-9_-]{10,}$/.test(text) ? text : "";
}

async function fetchAppsScriptJson(url) {
  let response;
  try {
    response = await fetch(url, { method: "GET", redirect: "follow", headers: { accept: "application/json,text/plain,*/*" } });
  } catch {
    throw new Error("Unable to reach the Google Apps Script Drive scanner. Check the deployed Web app URL and your internet connection.");
  }
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 180);
    if (/<!doctype|<html|accounts\.google|sign in/i.test(text)) {
      throw new Error("Google returned a sign-in/HTML page instead of scanner JSON. In Apps Script deploy the Web app as Execute as: Me and Who has access: Anyone, then deploy a new version.");
    }
    throw new Error(`Apps Script returned non-JSON data${preview ? `: ${preview}` : "."}`);
  }
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `Google Apps Script request failed (${response.status}).`);
  return payload || {};
}


async function fetchAppsScriptPostJson(url, body) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: { "content-type": "application/json", accept: "application/json,text/plain,*/*" },
      body: JSON.stringify(body || {})
    });
  } catch (error) {
    const cause = error?.cause;
    const detail = cause ? ` (${cause.code || cause.name || "network"}: ${cause.message || cause})` : "";
    throw new Error(`Unable to reach the Google Apps Script Drive scanner${detail}.`);
  }
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 180);
    if (/<!doctype|<html|accounts\.google|sign in/i.test(text)) {
      throw new Error("Google returned a sign-in/HTML page instead of scanner JSON. In Apps Script deploy the Web app as Execute as: Me and Who has access: Anyone, then deploy a new version.");
    }
    throw new Error(`Apps Script returned non-JSON data${preview ? `: ${preview}` : "."}`);
  }
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `Google Apps Script request failed (${response.status}).`);
  return payload || {};
}

async function fetchAppsScriptPostJsonRetry(url, body, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await fetchAppsScriptPostJson(url, body); }
    catch (error) { lastError = error; }
  }
  throw lastError || new Error("Google Apps Script request failed after retries.");
}

async function scanDriveRootChunked(endpoint, secret, rootId) {
  const nodesById = new Map();
  const visited = new Set();
  const chunkErrors = [];
  let pending;
  let chunks = 0;
  let traversalElapsedMs = 0;
  const started = Date.now();

  while (true) {
    const requestBody = {
      key: secret,
      mode: "folder_chunk",
      rootFolderId: rootId,
      maxFolders: 220
    };
    if (pending !== undefined) requestBody.pending = pending;

    const part = await fetchAppsScriptPostJsonRetry(endpoint, requestBody, 3);
    chunks++;
    traversalElapsedMs += Number(part.elapsedMs || 0);

    for (const node of Array.isArray(part.nodes) ? part.nodes : []) {
      const id = String(node?.id || "").trim();
      if (!id) continue;
      nodesById.set(id, {
        id,
        name: String(node?.name || "").trim(),
        parentId: String(node?.parentId || "").trim(),
        depth: Math.max(0, Number(node?.depth || 0)),
        ownerEmail: String(node?.ownerEmail || "").trim()
      });
    }
    for (const id of Array.isArray(part.processedIds) ? part.processedIds : []) {
      const text = String(id || "").trim();
      if (text) visited.add(text);
    }
    if (Array.isArray(part.errors)) chunkErrors.push(...part.errors);

    const next = [];
    const queued = new Set();
    for (const item of Array.isArray(part.nextPending) ? part.nextPending : []) {
      const id = String(item?.id || item || "").trim();
      if (!id || visited.has(id) || queued.has(id)) continue;
      queued.add(id);
      next.push({
        id,
        parentId: String(item?.parentId || "").trim(),
        depth: Math.max(0, Number(item?.depth || 0))
      });
    }

    if (part.done || next.length === 0) break;
    if (chunks >= 200) throw new Error(`Drive root ${rootId} exceeded the 200-chunk safety limit.`);
    if (nodesById.size + next.length > 25000) throw new Error(`Drive root ${rootId} exceeded the 25,000-folder safety limit.`);
    pending = next;
  }

  if (!nodesById.has(rootId)) throw new Error("The Drive root could not be read during chunked folder discovery.");

  const payload = await fetchAppsScriptPostJsonRetry(endpoint, {
    key: secret,
    mode: "classify_tree",
    rootFolderId: rootId,
    nodes: [...nodesById.values()]
  }, 3);
  const classificationElapsedMs = Number(payload.elapsedMs || 0);
  payload.scannedFolders = nodesById.size;
  payload.indexedFolders = nodesById.size;
  payload.traversalChunks = chunks;
  payload.traversalElapsedMs = traversalElapsedMs;
  payload.classificationElapsedMs = classificationElapsedMs;
  payload.httpElapsedMs = Date.now() - started;
  payload.elapsedMs = payload.httpElapsedMs;
  payload.folderChunkErrors = chunkErrors;
  payload.incompleteSearch = chunkErrors.length > 0;
  if (Array.isArray(payload.rootResults) && payload.rootResults[0]) {
    payload.rootResults[0].foldersDiscovered = nodesById.size;
    payload.rootResults[0].traversalChunks = chunks;
    payload.rootResults[0].folderReadErrors = chunkErrors.length;
    payload.rootResults[0].elapsedMs = Date.now() - started;
  }
  return payload;
}


async function scanDriveFolderChunkApi(env, rootId, pending) {
  const endpoint = String(env.GOOGLE_APPS_SCRIPT_URL || "").trim();
  const secret = String(env.GOOGLE_APPS_SCRIPT_SECRET || "").trim();
  if (!endpoint || !secret) {
    const error = new Error("Google Drive Import is not connected yet. Run SETUP-GOOGLE-DRIVE.bat and deploy the included Apps Script scanner.");
    error.code = "GOOGLE_DRIVE_NOT_CONFIGURED";
    throw error;
  }
  const id = extractDriveFolderId(rootId);
  if (!id) throw new Error("Invalid Google Drive root folder ID.");
  const body = { key: secret, mode: "folder_chunk", rootFolderId: id, maxFolders: 220 };
  if (Array.isArray(pending)) body.pending = pending;
  return fetchAppsScriptPostJsonRetry(endpoint, body, 3);
}

async function classifyDriveTreeApi(env, rootId, nodes) {
  const endpoint = String(env.GOOGLE_APPS_SCRIPT_URL || "").trim();
  const secret = String(env.GOOGLE_APPS_SCRIPT_SECRET || "").trim();
  if (!endpoint || !secret) {
    const error = new Error("Google Drive Import is not connected yet. Run SETUP-GOOGLE-DRIVE.bat and deploy the included Apps Script scanner.");
    error.code = "GOOGLE_DRIVE_NOT_CONFIGURED";
    throw error;
  }
  const id = extractDriveFolderId(rootId);
  if (!id) throw new Error("Invalid Google Drive root folder ID.");
  const rows = Array.isArray(nodes) ? nodes : [];
  if (!rows.length) throw new Error("No discovered Drive folders were supplied for classification.");
  const payload = await fetchAppsScriptPostJsonRetry(endpoint, { key: secret, mode: "classify_tree", rootFolderId: id, nodes: rows }, 3);
  payload.scannedFolders = rows.length;
  payload.indexedFolders = rows.length;
  return payload;
}

async function scanDriveRoots(env, rawLinks = []) {
  const endpoint = String(env.GOOGLE_APPS_SCRIPT_URL || "").trim();
  const secret = String(env.GOOGLE_APPS_SCRIPT_SECRET || "").trim();
  if (!endpoint || !secret) {
    const error = new Error("Google Drive Import is not connected yet. Run SETUP-GOOGLE-DRIVE.bat and deploy the included Apps Script scanner.");
    error.code = "GOOGLE_DRIVE_NOT_CONFIGURED";
    throw error;
  }

  const sourceItems = Array.isArray(rawLinks) ? rawLinks : [rawLinks];
  const ids = [];
  const seenIds = new Set();
  for (const item of sourceItems) {
    const pieces = String(item || "").split(/[\s,;]+/).filter(Boolean);
    for (const piece of pieces.length ? pieces : [item]) {
      const id = extractDriveFolderId(piece);
      if (id && !seenIds.has(id)) { seenIds.add(id); ids.push(id); }
    }
  }
  if (!ids.length) throw new Error("Paste at least one valid Google Drive folder link.");

  const stories = [];
  const seenFolders = new Set();
  const rootResults = [];
  const ambiguous = [];
  let scannedFolders = 0;
  let scannedFiles = 0;
  let audioProbeFolders = 0;
  let elapsedMs = 0;

  // v15.2 reliability rule: accept every pasted root in one Admin action, then split
  // each large root into bounded Apps Script folder chunks. The completed lightweight
  // folder tree is classified only after discovery, so 1,000-2,000+ folder roots no
  // longer depend on one 3-5 minute Apps Script response. Successful roots are still
  // preserved when another root is inaccessible.
  for (const id of ids) {
    let payload;
    try {
      payload = await scanDriveRootChunked(endpoint, secret, id);
    } catch (error) {
      rootResults.push({
        ok: false,
        rootFolderId: id,
        rootDriveUrl: `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`,
        error: String(error?.message || error || "Drive scan failed")
      });
      continue;
    }

    scannedFolders += Number(payload.scannedFolders || 0);
    scannedFiles += Number(payload.checkedFiles ?? payload.scannedFiles ?? 0);
    audioProbeFolders += Number(payload.audioProbeFolders || 0);
    elapsedMs += Number(payload.elapsedMs || 0);
    if (Array.isArray(payload.ambiguous)) {
      for (const review of payload.ambiguous) ambiguous.push(review);
    }
    if (Array.isArray(payload.rootResults) && payload.rootResults.length) {
      rootResults.push(...payload.rootResults);
    } else {
      rootResults.push({
        ok: true,
        rootFolderId: id,
        rootDriveUrl: `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`,
        storiesFound: Number(payload.count || 0),
        foldersDiscovered: Number(payload.scannedFolders || 0),
        elapsedMs: Number(payload.elapsedMs || 0)
      });
    }

    const rows = Array.isArray(payload.candidates) ? payload.candidates : (Array.isArray(payload.stories) ? payload.stories : []);
    for (const item of rows) {
      const folderId = String(item.storyFolderId || item.folderId || "").trim();
      if (!folderId || seenFolders.has(folderId)) continue;
      seenFolders.add(folderId);
      stories.push({
        folderId,
        title: String(item.title || "Untitled Story").trim() || "Untitled Story",
        driveUrl: String(item.driveUrl || `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`),
        rootFolderId: String(item.rootFolderId || id).trim(),
        rootFolderName: String(item.rootFolderName || "").trim(),
        rootDriveUrl: String(item.rootDriveUrl || `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`).trim(),
        rootOwnerEmail: String(item.rootOwnerEmail || "").trim(),
        folderPath: String(item.folderPath || "").trim(),
        audioFiles: Number.isFinite(Number(item.audioFiles)) ? Number(item.audioFiles) : null,
        depth: Number(item.depth || 0),
        detection: String(item.detection || '').trim()
      });
    }
  }

  stories.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }));
  return { roots: ids.length, scannedFolders, scannedFiles, audioProbeFolders, ambiguousCount: ambiguous.length, ambiguous, elapsedMs, rootResults, stories };
}

// Story checking is intentionally manual-only. OX prepares a research prompt in Admin; no AI provider API is called by the backend.
function fallbackStories() {
  return [];
}

async function getCoreState(env) {
  const [appearanceRow, settingsRow, storyResult, tierResult] = await Promise.all([
    env.DB.prepare("SELECT value FROM site_settings WHERE key = 'appearance'").first(),
    env.DB.prepare("SELECT value FROM site_settings WHERE key = 'settings'").first(),
    env.DB.prepare("SELECT * FROM stories ORDER BY sort_order ASC, title ASC").all(),
    env.DB.prepare("SELECT * FROM membership_tiers ORDER BY sort_order ASC, name ASC").all()
  ]);
  return {
    appearance: normalizeAppearance(safeParse(appearanceRow?.value || "{}", DEFAULT_APPEARANCE)),
    settings: normalizeSettings(safeParse(settingsRow?.value || "{}", DEFAULT_SETTINGS)),
    stories: (storyResult.results || []).map(adminStoryFromRow),
    tiers: (tierResult.results || []).map(tierFromRow)
  };
}


function lifetimeStoryTitleKey(value = "") {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 220);
}

function lifetimeDriveFolderId(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const folderMatch = raw.match(/\/folders\/([A-Za-z0-9_-]{8,})/i);
  if (folderMatch) return folderMatch[1].slice(0, 220);
  try {
    const parsed = new URL(raw);
    if (/^(?:www\.)?drive\.google\.com$/i.test(parsed.hostname)) {
      const id = String(parsed.searchParams.get("id") || "").trim();
      if (/^[A-Za-z0-9_-]{8,}$/.test(id)) return id.slice(0, 220);
    }
  } catch {}
  return "";
}

function makePermanentStoryId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `story_${[...bytes].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

function addLifetimeCandidate(map, key, productId) {
  const clean = String(key || "").trim();
  if (!clean || !productId) return;
  if (!map.has(clean)) map.set(clean, new Set());
  map.get(clean).add(productId);
}

function uniqueLifetimeCandidate(map, key) {
  const clean = String(key || "").trim();
  if (!clean) return "";
  const set = map.get(clean);
  return set && set.size === 1 ? [...set][0] : "";
}

async function createLifetimeStoryProduct(env, story, now) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const id = makePermanentStoryId();
    const result = await env.DB.prepare(`INSERT OR IGNORE INTO lifetime_story_products(id,current_story_id,state,created_at,updated_at)
      VALUES(?,?,'Active',?,?)`).bind(id, story.id, now, now).run();
    if (Number(result.meta?.changes || 0) > 0) return id;
  }
  throw new Error("Unable to create permanent story identity.");
}

async function recordLifetimeStorySnapshot(env, permanentStoryId, story, now) {
  const snapshot = {
    storyId: String(story.id || ""),
    title: String(story.title || ""),
    titleKey: lifetimeStoryTitleKey(story.title),
    driveUrl: String(story.drive_url || ""),
    driveFolderId: lifetimeDriveFolderId(story.drive_url),
    cover: String(story.cover || "")
  };
  const latest = await env.DB.prepare(`SELECT story_id_snapshot,title,title_key,drive_url,drive_folder_id,cover
    FROM story_identity_history WHERE permanent_story_id=? ORDER BY id DESC LIMIT 1`).bind(permanentStoryId).first();
  if (latest &&
      String(latest.story_id_snapshot || "") === snapshot.storyId &&
      String(latest.title || "") === snapshot.title &&
      String(latest.title_key || "") === snapshot.titleKey &&
      String(latest.drive_url || "") === snapshot.driveUrl &&
      String(latest.drive_folder_id || "") === snapshot.driveFolderId &&
      String(latest.cover || "") === snapshot.cover) return false;
  await env.DB.prepare(`INSERT INTO story_identity_history(permanent_story_id,story_id_snapshot,title,title_key,drive_url,drive_folder_id,cover,recorded_at)
    VALUES(?,?,?,?,?,?,?,?)`).bind(permanentStoryId, snapshot.storyId, snapshot.title, snapshot.titleKey, snapshot.driveUrl, snapshot.driveFolderId, snapshot.cover, now).run();
  return true;
}

async function syncLifetimeStoryProducts(env, { reason = "story-library-sync" } = {}) {
  if (!env.DB) return { ok: false, skipped: true };
  const now = new Date().toISOString();
  const [storyResult, productResult, historyResult] = await Promise.all([
    env.DB.prepare("SELECT id,title,cover,drive_url FROM stories ORDER BY sort_order ASC,title ASC").all(),
    env.DB.prepare("SELECT id,current_story_id,state FROM lifetime_story_products ORDER BY created_at ASC").all(),
    env.DB.prepare(`SELECT permanent_story_id,story_id_snapshot,title,title_key,drive_url,drive_folder_id,cover
      FROM story_identity_history ORDER BY id DESC`).all()
  ]);
  const stories = storyResult.results || [];
  const products = productResult.results || [];
  const currentByStory = new Map();
  const productById = new Map();
  for (const product of products) {
    productById.set(product.id, { ...product });
    if (product.current_story_id) currentByStory.set(String(product.current_story_id), product.id);
  }

  const byStoryId = new Map();
  const byDriveFolder = new Map();
  const byDriveUrl = new Map();
  const byTitleKey = new Map();
  const latestStoryForProduct = new Map();
  const latestHistoryByProduct = new Map();
  for (const history of historyResult.results || []) {
    const productId = String(history.permanent_story_id || "");
    if (!productId) continue;
    if (!latestHistoryByProduct.has(productId)) latestHistoryByProduct.set(productId, history);
    if (!latestStoryForProduct.has(productId)) latestStoryForProduct.set(productId, String(history.story_id_snapshot || ""));
    // Historical aliases are only candidates for currently unassigned products.
    // Never steal a live current story assignment from another product.
    const product = productById.get(productId);
    if (product?.current_story_id || ["Archived", "Unavailable"].includes(String(product?.state || ""))) continue;
    addLifetimeCandidate(byStoryId, history.story_id_snapshot, productId);
    addLifetimeCandidate(byDriveFolder, history.drive_folder_id, productId);
    addLifetimeCandidate(byDriveUrl, history.drive_url, productId);
    addLifetimeCandidate(byTitleKey, history.title_key, productId);
  }

  let created = 0;
  let relinked = 0;
  let snapshots = 0;
  const assignedProducts = new Set();
  const writes = [];

  const queueSnapshot = (permanentStoryId, story) => {
    const snapshot = {
      storyId: String(story.id || ""),
      title: String(story.title || ""),
      titleKey: lifetimeStoryTitleKey(story.title),
      driveUrl: String(story.drive_url || ""),
      driveFolderId: lifetimeDriveFolderId(story.drive_url),
      cover: String(story.cover || "")
    };
    const latest = latestHistoryByProduct.get(permanentStoryId);
    if (latest &&
        String(latest.story_id_snapshot || "") === snapshot.storyId &&
        String(latest.title || "") === snapshot.title &&
        String(latest.title_key || "") === snapshot.titleKey &&
        String(latest.drive_url || "") === snapshot.driveUrl &&
        String(latest.drive_folder_id || "") === snapshot.driveFolderId &&
        String(latest.cover || "") === snapshot.cover) return;
    writes.push(env.DB.prepare(`INSERT INTO story_identity_history(permanent_story_id,story_id_snapshot,title,title_key,drive_url,drive_folder_id,cover,recorded_at)
      VALUES(?,?,?,?,?,?,?,?)`).bind(permanentStoryId, snapshot.storyId, snapshot.title, snapshot.titleKey, snapshot.driveUrl, snapshot.driveFolderId, snapshot.cover, now));
    latestHistoryByProduct.set(permanentStoryId, {
      permanent_story_id: permanentStoryId,
      story_id_snapshot: snapshot.storyId,
      title: snapshot.title,
      title_key: snapshot.titleKey,
      drive_url: snapshot.driveUrl,
      drive_folder_id: snapshot.driveFolderId,
      cover: snapshot.cover
    });
    snapshots++;
  };

  // Repair unlinked stories first. The previous implementation performed several
  // sequential D1 writes for every story, so a large production library could
  // stop part-way through reconciliation and leave the later stories unavailable
  // for /49 purchases. We now calculate the whole plan in memory and commit it
  // in small D1 batches.
  const orderedStories = [...stories].sort((a, b) => {
    const aLinked = currentByStory.has(String(a.id || "")) ? 1 : 0;
    const bLinked = currentByStory.has(String(b.id || "")) ? 1 : 0;
    return aLinked - bLinked;
  });

  for (const story of orderedStories) {
    const storyId = String(story.id || "");
    let productId = currentByStory.get(storyId) || "";
    let matchReason = productId ? "current-story-id" : "";

    if (!productId) {
      productId = uniqueLifetimeCandidate(byStoryId, storyId);
      if (productId) matchReason = "previous-story-id";
    }
    if (!productId) {
      productId = uniqueLifetimeCandidate(byDriveFolder, lifetimeDriveFolderId(story.drive_url));
      if (productId) matchReason = "drive-folder-id";
    }
    if (!productId) {
      productId = uniqueLifetimeCandidate(byDriveUrl, String(story.drive_url || ""));
      if (productId) matchReason = "exact-drive-url";
    }
    if (!productId) {
      productId = uniqueLifetimeCandidate(byTitleKey, lifetimeStoryTitleKey(story.title));
      if (productId) matchReason = "exact-title";
    }

    if (productId && assignedProducts.has(productId)) {
      productId = "";
      matchReason = "";
    }

    if (!productId) {
      productId = makePermanentStoryId();
      writes.push(env.DB.prepare(`INSERT INTO lifetime_story_products(id,current_story_id,state,created_at,updated_at)
        VALUES(?,?,'Active',?,?)`).bind(productId, storyId, now, now));
      created++;
      matchReason = "new-permanent-identity";
      productById.set(productId, { id: productId, current_story_id: storyId, state: "Active" });
      currentByStory.set(storyId, productId);
    } else {
      const product = productById.get(productId) || {};
      const oldCurrentStoryId = String(product.current_story_id || "");
      if (oldCurrentStoryId !== storyId || String(product.state || "") !== "Active") {
        writes.push(env.DB.prepare("UPDATE lifetime_story_products SET current_story_id=?,state='Active',updated_at=? WHERE id=?")
          .bind(storyId, now, productId));
        if (oldCurrentStoryId !== storyId) {
          const fromStoryId = oldCurrentStoryId || latestStoryForProduct.get(productId) || "";
          writes.push(env.DB.prepare(`INSERT INTO lifetime_story_assignments(permanent_story_id,from_story_id,to_story_id,source,reason,note,changed_at)
            VALUES(?,?,?,'auto',?,'',?)`).bind(productId, fromStoryId, storyId, matchReason || reason, now));
          relinked++;
        }
        product.current_story_id = storyId;
        product.state = "Active";
        productById.set(productId, product);
        currentByStory.set(storyId, productId);
      }
    }

    assignedProducts.add(productId);
    queueSnapshot(productId, story);
  }

  // Keep each D1 batch deliberately small. This avoids long sequential round
  // trips while staying comfortably below statement-count limits.
  const BATCH_SIZE = 40;
  for (let index = 0; index < writes.length; index += BATCH_SIZE) {
    await env.DB.batch(writes.slice(index, index + BATCH_SIZE));
  }

  await env.DB.prepare(`UPDATE lifetime_story_products SET state='Needs Assignment',updated_at=?
    WHERE current_story_id IS NULL AND state NOT IN ('Archived','Unavailable')`).bind(now).run();

  const needs = await env.DB.prepare("SELECT COUNT(*) AS count FROM lifetime_story_products WHERE current_story_id IS NULL AND state='Needs Assignment'").first();
  return { ok: true, created, relinked, snapshots, needsAssignment: Number(needs?.count || 0), stories: stories.length };
}

async function saveCoreState(env, payload) {
  const appearance = normalizeAppearance(payload.appearance || {});
  const settings = normalizeSettings(payload.settings || {});
  const stories = (Array.isArray(payload.stories) ? payload.stories : []).map(normalizeStory).filter(Boolean);
  const tiers = (Array.isArray(payload.tiers) ? payload.tiers : []).map(normalizeTier).filter(Boolean);
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare("INSERT INTO site_settings (key,value,updated_at) VALUES ('appearance',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(JSON.stringify(appearance), now),
    env.DB.prepare("INSERT INTO site_settings (key,value,updated_at) VALUES ('settings',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(JSON.stringify(settings), now),
    env.DB.prepare("DELETE FROM stories"),
    env.DB.prepare(`INSERT INTO stories (id,title,description,genre,status,cover,visible,sort_order,source_url,drive_url,drive_root_id,drive_root_url,drive_root_name,drive_root_owner_email,drive_path,checked,automatic_check,manual_lock,confidence,status_last_checked,genre_last_checked,created_at,updated_at)
      SELECT
        json_extract(value,'$.id'), json_extract(value,'$.title'), COALESCE(json_extract(value,'$.description'),''),
        COALESCE(json_extract(value,'$.genre'),'Unverified'), '', COALESCE(json_extract(value,'$.cover'),''),
        CASE WHEN json_extract(value,'$.visible') THEN 1 ELSE 0 END, COALESCE(json_extract(value,'$.order'),9999),
        '', COALESCE(json_extract(value,'$.driveUrl'),''),
        COALESCE(json_extract(value,'$.driveRootId'),''), COALESCE(json_extract(value,'$.driveRootUrl'),''), COALESCE(json_extract(value,'$.driveRootName'),''),
        COALESCE(json_extract(value,'$.driveRootOwnerEmail'),''), COALESCE(json_extract(value,'$.drivePath'),''), COALESCE(json_extract(value,'$.checked'),'Never'),
        0, CASE WHEN json_extract(value,'$.lock') THEN 1 ELSE 0 END,
        0, NULL, json_extract(value,'$.genreLastChecked'), ?, ?
      FROM json_each(?)`).bind(now, now, JSON.stringify(stories)),
    env.DB.prepare(`INSERT INTO membership_tiers (id,name,price,cycle,description,status,benefits_json,cover,sort_order,created_at,updated_at)
      SELECT json_extract(value,'$.id'), json_extract(value,'$.name'), COALESCE(json_extract(value,'$.price'),'$0.00'),
        COALESCE(json_extract(value,'$.cycle'),'/ month'), COALESCE(json_extract(value,'$.description'),''),
        CASE WHEN json_extract(value,'$.status')='Published' THEN 'Published' ELSE 'Draft' END,
        COALESCE(json_extract(value,'$.benefits'),'[]'), COALESCE(json_extract(value,'$.cover'),''), COALESCE(json_extract(value,'$.order'),9999), ?, ?
      FROM json_each(?) WHERE 1
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,price=excluded.price,cycle=excluded.cycle,description=excluded.description,
        status=excluded.status,benefits_json=excluded.benefits_json,cover=excluded.cover,sort_order=excluded.sort_order,updated_at=excluded.updated_at`).bind(now, now, JSON.stringify(tiers)),
    env.DB.prepare(`DELETE FROM membership_tiers WHERE id NOT IN (
      SELECT json_extract(value,'$.id') FROM json_each(?)
    )`).bind(JSON.stringify(tiers))
  ]);

  try { await env.DB.prepare("DELETE FROM story_covers WHERE story_id NOT IN (SELECT id FROM stories)").run(); } catch {}
  try { await syncLifetimeStoryProducts(env, { reason: "admin-core-save" }); } catch (error) { console.warn("Lifetime story identity sync skipped", error); }
  return { appearance, settings, stories, tiers };
}

const D1_BACKUP_FORMAT = "ox-novels-d1-backup";
const D1_BACKUP_VERSION = 1;
const D1_BACKUP_SCHEMA_VERSION = 25;

const D1_BACKUP_TABLES = [
  { name: "site_settings", columns: ["key","value","updated_at"] },
  { name: "membership_tiers", columns: ["id","name","price","cycle","description","status","benefits_json","cover","sort_order","created_at","updated_at"] },
  { name: "posts", columns: ["id","title","body","status","pinned","published_at","created_at","updated_at"] },
  { name: "chat_broadcasts", columns: ["id","body","audience","audience_label","recipient_count","recipient_ids_json","created_at"] },
  { name: "post_read_state", columns: ["user_id","last_seen_at","updated_at"] },
  { name: "telegram_connections", columns: ["user_id","telegram_user_id","telegram_username","telegram_first_name","telegram_last_name","status","linked_at","joined_at","left_at","last_join_request_at","last_checked_at","updated_at"] },
  { name: "telegram_link_tokens", columns: ["token_hash","user_id","expires_at","used_at","created_at"] },
  { name: "user_test_overrides", columns: ["user_id","enabled","simulate_paid_once","chat_enabled","telegram_enabled","membership_status","lifetime_enabled","lifetime_story_id","purchased_section_enabled","created_at","updated_at"] },
  { name: "stories", columns: ["id","title","description","genre","status","cover","visible","sort_order","source_url","drive_url","checked","automatic_check","manual_lock","confidence","status_last_checked","genre_last_checked","created_at","updated_at","drive_root_id","drive_root_url","drive_root_name","drive_root_owner_email","drive_path"] },
  { name: "users", columns: ["id","name","email","password_hash","password_salt","password_iterations","account_status","membership_status","membership_tier_id","membership_plan","membership_started_at","membership_expires_at","payment_status","latest_amount","paid_once_at","manual_chat_unlocked_at","created_at","last_login_at","updated_at"] },
  { name: "lifetime_story_products", columns: ["id","current_story_id","state","created_at","updated_at"] },
  { name: "story_identity_history", columns: ["id","permanent_story_id","story_id_snapshot","title","title_key","drive_url","drive_folder_id","cover","recorded_at"] },
  { name: "story_lifetime_purchases", columns: ["id","user_id","user_name_snapshot","user_email_snapshot","permanent_story_id","original_story_id","original_title","original_drive_url","original_drive_folder_id","original_cover","amount","currency","provider","environment","paypal_order_id","paypal_capture_id","purchase_status","entitlement_status","purchased_at","updated_at"] },
  { name: "lifetime_story_assignments", columns: ["id","permanent_story_id","from_story_id","to_story_id","source","reason","note","changed_at"] },
  { name: "user_google_auth", columns: ["user_id","google_sub","google_email","picture_url","created_at","updated_at"] },
  { name: "user_client_context", columns: ["user_id","timezone","locale","updated_at"] },
  { name: "chat_messages", columns: ["id","user_id","sender_role","body","created_at","delivered_at","seen_at"] },
  { name: "story_covers", columns: ["story_id","mime_type","image_data","size_bytes","updated_at"], blobColumns: ["image_data"] },
  { name: "media_assets", columns: ["asset_key","mime_type","image_data","size_bytes","updated_at"], blobColumns: ["image_data"] },
  { name: "payment_provider_settings", columns: ["provider","enabled","mode","client_id","webhook_id","updated_at","support_enabled","support_email","support_min_amount"] },
  { name: "membership_payment_plans", columns: ["tier_id","provider","external_plan_id","updated_at"] },
  { name: "member_subscriptions", columns: ["provider_subscription_id","provider","user_id","tier_id","external_plan_id","status","next_billing_at","last_payment_at","started_at","cancelled_at","created_at","updated_at","environment"] },
  { name: "raptor_migration_claims", columns: ["provider_subscription_id","raptor_user_id","ox_user_id","raptor_plan","raptor_pricing_tier","raptor_price","paypal_plan_id","paypal_status","next_billing_at","claimed_at","last_verified_at"] },
  { name: "payment_events", columns: ["id","provider","provider_event_id","event_type","user_id","provider_subscription_id","amount","currency","status","occurred_at","created_at","environment","user_name_snapshot","user_email_snapshot"] },
  { name: "finance_record_overrides", columns: ["record_key","environment","exclude_from_revenue","hidden","note","updated_at"] },
  { name: "admin_notifications", columns: ["id","type","title","body","target_route","user_id","related_key","read_at","created_at"] },
  { name: "activity_log", columns: ["id","type","title","detail","created_at"] }
];

function backupBytesToBase64(value) {
  if (value == null) return "";
  let bytes = null;
  if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
  else if (ArrayBuffer.isView(value)) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  else if (Array.isArray(value)) bytes = Uint8Array.from(value);
  else if (value && typeof value === "object" && Array.isArray(value.data)) bytes = Uint8Array.from(value.data);
  if (!bytes) return String(value || "");
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function backupBase64ToBytes(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function readBackupTable(env, spec) {
  try {
    const result = await env.DB.prepare(`SELECT ${spec.columns.join(",")} FROM ${spec.name}`).all();
    const blobSet = new Set(spec.blobColumns || []);
    return (result.results || []).map(row => {
      const out = {};
      for (const column of spec.columns) {
        const value = row[column];
        out[column] = blobSet.has(column) ? { __oxBase64: backupBytesToBase64(value) } : value;
      }
      return out;
    });
  } catch (error) {
    console.warn(`Backup skipped table ${spec.name}`, error);
    return [];
  }
}

async function createD1Backup(env, { summaryOnly = false } = {}) {
  const tables = {};
  const counts = {};
  let mediaBytes = 0;
  for (const spec of D1_BACKUP_TABLES) {
    if (summaryOnly) {
      try {
        const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${spec.name}`).first();
        counts[spec.name] = Number(row?.count || 0);
        if (["story_covers","media_assets"].includes(spec.name)) {
          const size = await env.DB.prepare(`SELECT COALESCE(SUM(size_bytes),0) AS bytes FROM ${spec.name}`).first();
          mediaBytes += Number(size?.bytes || 0);
        }
      } catch { counts[spec.name] = 0; }
      continue;
    }
    const rows = await readBackupTable(env, spec);
    tables[spec.name] = rows;
    counts[spec.name] = rows.length;
    if (["story_covers","media_assets"].includes(spec.name)) {
      mediaBytes += rows.reduce((sum, row) => sum + Number(row.size_bytes || 0), 0);
    }
  }
  const meta = {
    format: D1_BACKUP_FORMAT,
    version: D1_BACKUP_VERSION,
    schemaVersion: D1_BACKUP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    counts,
    mediaBytes,
    secretsIncluded: false,
    excludes: ["ADMIN_PASSWORD","PAYPAL_CLIENT_SECRET","GOOGLE_APPS_SCRIPT_SECRET","admin_sessions","admin_login_rate_limits","user_sessions","payment_checkout_sessions","support_checkout_sessions","lifetime_story_checkout_sessions"]
  };
  return summaryOnly ? meta : { ...meta, tables };
}

async function clearRestorableData(env) {
  const statements = [
    "DELETE FROM lifetime_story_checkout_sessions",
    "DELETE FROM lifetime_story_assignments",
    "DELETE FROM story_lifetime_purchases",
    "DELETE FROM story_identity_history",
    "DELETE FROM lifetime_story_products",
    "DELETE FROM finance_record_overrides",
    "DELETE FROM admin_notifications",
    "DELETE FROM payment_checkout_sessions",
    "DELETE FROM support_checkout_sessions",
    "DELETE FROM payment_events",
    "DELETE FROM raptor_migration_claims",
    "DELETE FROM member_subscriptions",
    "DELETE FROM membership_payment_plans",
    "DELETE FROM chat_messages",
    "DELETE FROM user_client_context",
    "DELETE FROM user_google_auth",
    "DELETE FROM user_sessions",
    "DELETE FROM users",
    "DELETE FROM story_covers",
    "DELETE FROM media_assets",
    "DELETE FROM stories",
    "DELETE FROM membership_tiers",
    "DELETE FROM posts",
    "DELETE FROM chat_broadcasts",
    "DELETE FROM post_read_state",
    "DELETE FROM telegram_link_tokens",
    "DELETE FROM telegram_connections",
    "DELETE FROM user_test_overrides",
    "DELETE FROM site_settings",
    "DELETE FROM activity_log",
    "DELETE FROM payment_provider_settings",
    "DELETE FROM admin_sessions",
    "DELETE FROM admin_login_rate_limits"
  ];
  for (const sql of statements) {
    try { await env.DB.prepare(sql).run(); } catch (error) { console.warn(`Restore cleanup skipped: ${sql}`, error); }
  }
}

async function insertBackupRows(env, spec, rows) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  const blobSet = new Set(spec.blobColumns || []);
  if (!blobSet.size) {
    const selectors = spec.columns.map(column => `json_extract(value,'$.${column}')`).join(",");
    const sql = `INSERT INTO ${spec.name} (${spec.columns.join(",")}) SELECT ${selectors} FROM json_each(?)`;
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      await env.DB.prepare(sql).bind(JSON.stringify(rows.slice(i, i + chunkSize))).run();
    }
    return rows.length;
  }
  const placeholders = spec.columns.map(() => "?").join(",");
  const sql = `INSERT INTO ${spec.name} (${spec.columns.join(",")}) VALUES (${placeholders})`;
  const chunkSize = 30;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const statements = rows.slice(i, i + chunkSize).map(row => env.DB.prepare(sql).bind(...spec.columns.map(column => {
      const value = row?.[column];
      if (blobSet.has(column)) return backupBase64ToBytes(value?.__oxBase64 || "");
      return value === undefined ? null : value;
    })));
    await env.DB.batch(statements);
  }
  return rows.length;
}

async function restoreD1Backup(env, backup) {
  if (!backup || backup.format !== D1_BACKUP_FORMAT || Number(backup.version) !== D1_BACKUP_VERSION || !backup.tables || typeof backup.tables !== "object") {
    throw new Error("This is not a compatible full site D1 backup.");
  }
  await ensureUserClientContextTable(env);
  await clearRestorableData(env);
  const restoreOrder = [
    "site_settings","membership_tiers","posts","stories","users","lifetime_story_products","story_identity_history","story_lifetime_purchases","lifetime_story_assignments",
    "user_google_auth","user_client_context","story_covers","media_assets",
    "payment_provider_settings","membership_payment_plans","member_subscriptions","raptor_migration_claims","payment_events","finance_record_overrides",
    "chat_messages","chat_broadcasts","post_read_state","telegram_connections","telegram_link_tokens","user_test_overrides","admin_notifications","activity_log"
  ];
  const restored = {};
  for (const name of restoreOrder) {
    const spec = D1_BACKUP_TABLES.find(item => item.name === name);
    if (!spec) continue;
    restored[name] = await insertBackupRows(env, spec, backup.tables[name] || []);
  }
  await backfillPaidOnceAccess(env).catch(error => console.warn("Paid-once restore backfill skipped", error));
  // Restored sessions are intentionally never accepted. Everyone logs in again.
  await env.DB.prepare("DELETE FROM admin_sessions").run().catch(() => null);
  await env.DB.prepare("DELETE FROM admin_login_rate_limits").run().catch(() => null);
  await env.DB.prepare("DELETE FROM user_sessions").run().catch(() => null);
  return restored;
}

async function handleAdminBackup(request, env, url) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  if (request.method === "GET") {
    const summaryOnly = url.searchParams.get("summary") === "1";
    return json({ ok: true, backup: await createD1Backup(env, { summaryOnly }) });
  }
  if (request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch { return json({ error: "Invalid backup JSON." }, 400); }
    if (String(body.confirm || "") !== "RESTORE") return json({ error: "Type RESTORE to confirm replacing the current website data." }, 400);
    try {
      const restored = await restoreD1Backup(env, body.backup);
      return json({ ok: true, restored, loggedOut: true });
    } catch (error) {
      return json({ error: String(error?.message || error) }, 400);
    }
  }
  return json({ error: "Method not allowed." }, 405);
}

async function handleDeletedUserCleanup(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  const beforeNotifications = Number((await env.DB.prepare("SELECT COUNT(*) AS count FROM admin_notifications").first().catch(() => ({ count: 0 })))?.count || 0);
  const beforePayments = Number((await env.DB.prepare("SELECT COUNT(*) AS count FROM payment_events").first().catch(() => ({ count: 0 })))?.count || 0);
  await env.DB.prepare(`DELETE FROM admin_notifications
    WHERE user_id IS NULL AND (type IN ('user','chat','payment') OR related_key LIKE 'register:%' OR related_key LIKE 'chat:%' OR related_key LIKE 'admin-user-action:%')`).run().catch(() => null);
  await env.DB.prepare(`DELETE FROM payment_events
    WHERE user_id IS NULL AND (
      LOWER(COALESCE(environment,''))='sandbox'
      OR EXISTS (SELECT 1 FROM finance_record_overrides f WHERE f.record_key=('event:' || payment_events.id) AND LOWER(COALESCE(f.environment,''))='sandbox')
    )`).run().catch(() => null);
  await env.DB.prepare(`DELETE FROM finance_record_overrides
    WHERE record_key LIKE 'event:%' AND NOT EXISTS (SELECT 1 FROM payment_events p WHERE ('event:' || p.id)=finance_record_overrides.record_key)`).run().catch(() => null);
  const afterNotifications = Number((await env.DB.prepare("SELECT COUNT(*) AS count FROM admin_notifications").first().catch(() => ({ count: 0 })))?.count || 0);
  const afterPayments = Number((await env.DB.prepare("SELECT COUNT(*) AS count FROM payment_events").first().catch(() => ({ count: 0 })))?.count || 0);
  const now = new Date().toISOString();
  const removedNotifications = Math.max(0, beforeNotifications - afterNotifications);
  const removedPayments = Math.max(0, beforePayments - afterPayments);
  await env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('system','Deleted-user leftovers cleaned',?,?)")
    .bind(`${removedNotifications} notification${removedNotifications === 1 ? "" : "s"} and ${removedPayments} Sandbox/test Finance record${removedPayments === 1 ? "" : "s"} removed. Activity history was preserved.`, now).run();
  return json({ ok: true, removedNotifications, removedPayments });
}



function normalizePostStatus(value = "Draft") {
  return String(value || "").trim().toLowerCase() === "published" ? "Published" : "Draft";
}

function normalizePostInput(body = {}, existing = null) {
  const titleValue = body.title !== undefined ? body.title : existing?.title;
  const bodyValue = body.body !== undefined ? body.body : existing?.body;
  const statusValue = body.status !== undefined ? body.status : existing?.status;
  const pinnedValue = body.pinned !== undefined ? body.pinned : Number(existing?.pinned || 0) === 1;

  const title = String(titleValue || "").replace(/\s+/g, " ").trim().slice(0, 160);
  const postBody = String(bodyValue || "").replace(/\r\n/g, "\n").trim().slice(0, 8000);
  const status = normalizePostStatus(statusValue);
  const pinned = pinnedValue === true || pinnedValue === 1 || String(pinnedValue).toLowerCase() === "true";

  if (!title) return { error: "Post title is required." };
  if (!postBody) return { error: "Post message is required." };
  return { title, body: postBody, status, pinned };
}

function adminPostFromRow(row = {}) {
  return {
    id: String(row.id || ""),
    title: String(row.title || ""),
    body: String(row.body || ""),
    status: normalizePostStatus(row.status),
    pinned: Number(row.pinned || 0) === 1,
    publishedAt: row.published_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

async function handleAdminPostsGet(env) {
  try {
    const result = await env.DB.prepare(`SELECT id,title,body,status,pinned,published_at,created_at,updated_at
      FROM posts
      ORDER BY CASE status WHEN 'Published' THEN 0 ELSE 1 END, pinned DESC,
        COALESCE(published_at,created_at) DESC, updated_at DESC`).all();
    return json({ ok: true, posts: (result.results || []).map(adminPostFromRow) });
  } catch (error) {
    return json({ error: "Posts database is not ready. Apply migration 0021_posts.sql first." }, 503);
  }
}

async function handleAdminPostsCreate(request, env) {
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const input = normalizePostInput(body);
  if (input.error) return json({ error: input.error }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const publishedAt = input.status === "Published" ? now : null;

  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO posts(id,title,body,status,pinned,published_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?)`).bind(id,input.title,input.body,input.status,input.pinned?1:0,publishedAt,now,now),
      env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('system','Post created',?,?)")
        .bind(`${input.status} · ${input.title}`.slice(0, 900), now)
    ]);
    const row = await env.DB.prepare("SELECT * FROM posts WHERE id=?").bind(id).first();
    return json({ ok: true, post: adminPostFromRow(row) }, 201);
  } catch (error) {
    return json({ error: error.message || "Unable to create post." }, 500);
  }
}

async function handleAdminPostUpdate(request, env, postId) {
  const existing = await env.DB.prepare("SELECT * FROM posts WHERE id=?").bind(postId).first().catch(() => null);
  if (!existing) return json({ error: "Post not found." }, 404);

  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const input = normalizePostInput(body, existing);
  if (input.error) return json({ error: input.error }, 400);

  const now = new Date().toISOString();
  let publishedAt = existing.published_at || null;
  if (input.status === "Published" && existing.status !== "Published") publishedAt = now;
  if (input.status === "Draft") publishedAt = null;

  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE posts
        SET title=?,body=?,status=?,pinned=?,published_at=?,updated_at=?
        WHERE id=?`).bind(input.title,input.body,input.status,input.pinned?1:0,publishedAt,now,postId),
      env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('system','Post updated',?,?)")
        .bind(`${input.status} · ${input.title}`.slice(0, 900), now)
    ]);
    const row = await env.DB.prepare("SELECT * FROM posts WHERE id=?").bind(postId).first();
    return json({ ok: true, post: adminPostFromRow(row) });
  } catch (error) {
    return json({ error: error.message || "Unable to update post." }, 500);
  }
}

async function handleAdminPostDelete(env, postId) {
  const existing = await env.DB.prepare("SELECT id,title FROM posts WHERE id=?").bind(postId).first().catch(() => null);
  if (!existing) return json({ error: "Post not found." }, 404);
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM posts WHERE id=?").bind(postId),
      env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('system','Post deleted',?,?)")
        .bind(String(existing.title || "Post").slice(0, 900), now)
    ]);
    return json({ ok: true, deleted: 1 });
  } catch (error) {
    return json({ error: error.message || "Unable to delete post." }, 500);
  }
}

function normalizeActivityType(value = "system") {
  const type = String(value || "system").trim().toLowerCase();
  return ["story", "user", "payment", "system"].includes(type) ? type : "system";
}

async function handleAdminActivityGet(env, url) {
  const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit")) || 500));
  const requestedType = String(url.searchParams.get("type") || "all").trim().toLowerCase();
  const q = String(url.searchParams.get("q") || "").trim().slice(0, 160);
  const conditions = ["title <> ?"];
  const values = ["Core site settings synchronized"];
  if (["story", "user", "payment", "system"].includes(requestedType)) {
    conditions.push("type = ?");
    values.push(requestedType);
  }
  if (q) {
    conditions.push("(title LIKE ? OR detail LIKE ?)");
    values.push(`%${q}%`, `%${q}%`);
  }
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const result = await env.DB.prepare(`SELECT id,type,title,detail,created_at FROM activity_log${where} ORDER BY id DESC LIMIT ?`)
    .bind(...values, limit).all();
  const activity = [];
  for (const row of result.results || []) {
    const previous = activity[activity.length - 1];
    if (previous && previous.type === row.type && previous.title === row.title && previous.detail === row.detail) {
      const gap = Math.abs(new Date(previous.createdAt).getTime() - new Date(row.created_at).getTime());
      if (Number.isFinite(gap) && gap <= 5000) continue;
    }
    activity.push({ id: row.id, type: row.type, title: row.title, detail: row.detail, createdAt: row.created_at });
  }
  return json({ ok: true, activity });
}

async function handleAdminActivityPost(request, env) {
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const type = normalizeActivityType(body.type);
  const title = String(body.title || "").trim().slice(0, 180);
  const detail = String(body.detail || "").trim().slice(0, 1000);
  if (!title) return json({ error: "Activity title is required." }, 400);
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 5000).toISOString();
  const duplicate = await env.DB.prepare(`SELECT id,type,title,detail,created_at FROM activity_log
    WHERE type=? AND title=? AND detail=? AND created_at>=? ORDER BY id DESC LIMIT 1`)
    .bind(type, title, detail, cutoff).first();
  if (duplicate) {
    return json({ ok: true, activity: { id: duplicate.id, type: duplicate.type, title: duplicate.title, detail: duplicate.detail, createdAt: duplicate.created_at }, deduplicated: true });
  }
  const result = await env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES(?,?,?,?)")
    .bind(type, title, detail, now).run();
  if (title === "Drive import completed") await createAdminNotification(env, { type: "drive", title, body: detail, route: "add", relatedKey: `activity:${result.meta?.last_row_id || now}` });
  if (title === "AI story details applied") await createAdminNotification(env, { type: "story", title, body: detail, route: "checks", relatedKey: `activity:${result.meta?.last_row_id || now}` });
  return json({ ok: true, activity: { id: result.meta?.last_row_id || null, type, title, detail, createdAt: now } });
}


async function createAdminNotification(env, { type = "system", title = "", body = "", route = "", userId = null, relatedKey = "", dedupeMinutes = 0 } = {}) {
  const cleanTitle = String(title || "").trim().slice(0, 180);
  if (!cleanTitle) return null;
  const cleanBody = String(body || "").trim().slice(0, 1000);
  const cleanRoute = String(route || "").trim().slice(0, 60);
  const cleanType = String(type || "system").trim().toLowerCase().slice(0, 40) || "system";
  const cleanKey = String(relatedKey || "").trim().slice(0, 220);
  const now = new Date().toISOString();
  try {
    if (cleanKey && Number(dedupeMinutes) > 0) {
      const cutoff = new Date(Date.now() - Number(dedupeMinutes) * 60 * 1000).toISOString();
      const existing = await env.DB.prepare(`SELECT id FROM admin_notifications
        WHERE related_key=? AND read_at IS NULL AND created_at>=? ORDER BY id DESC LIMIT 1`).bind(cleanKey, cutoff).first();
      if (existing?.id) {
        await env.DB.prepare(`UPDATE admin_notifications SET type=?,title=?,body=?,target_route=?,user_id=?,created_at=? WHERE id=?`)
          .bind(cleanType, cleanTitle, cleanBody, cleanRoute, userId || null, now, existing.id).run();
        return existing.id;
      }
    }
    const result = await env.DB.prepare(`INSERT INTO admin_notifications(type,title,body,target_route,user_id,related_key,created_at)
      VALUES(?,?,?,?,?,?,?)`).bind(cleanType, cleanTitle, cleanBody, cleanRoute, userId || null, cleanKey, now).run();
    return result.meta?.last_row_id || null;
  } catch (error) {
    console.warn("Unable to save Admin notification", error);
    return null;
  }
}

async function handleAdminNotifications(request, env, url) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit")) || 250));
  try {
    // Older lifetime-purchase notifications were initially routed to Finance.
    // Normalize them so existing and future lifetime notices open the dedicated
    // Lifetime Purchases recovery/ownership page instead.
    await env.DB.prepare(`UPDATE admin_notifications SET target_route='lifetime'
      WHERE target_route='finance' AND (related_key LIKE 'lifetime:%' OR related_key LIKE 'lifetime-%' OR title LIKE 'Lifetime %')`).run().catch(() => null);
    const result = await env.DB.prepare(`SELECT id,type,title,body,target_route,user_id,related_key,read_at,created_at
      FROM admin_notifications ORDER BY created_at DESC,id DESC LIMIT ?`).bind(limit).all();
    const rows = (result.results || []).map(r => ({
      id: Number(r.id), type: String(r.type || "system"), title: String(r.title || ""), text: String(r.body || ""),
      route: String(r.target_route || ""), userId: r.user_id || null, relatedKey: String(r.related_key || ""),
      unread: !r.read_at, readAt: r.read_at || null, createdAt: r.created_at || null
    }));
    return json({ ok: true, notifications: rows, unread: rows.filter(r => r.unread).length });
  } catch (error) {
    return json({ error: error.message || "Unable to load notifications." }, 500);
  }
}

async function handleAdminNotificationsRead(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const now = new Date().toISOString();
  if (body.all === true) {
    await env.DB.prepare("UPDATE admin_notifications SET read_at=? WHERE read_at IS NULL").bind(now).run();
    return json({ ok: true, all: true, readAt: now });
  }
  const route = String(body.route || "").trim().slice(0, 60);
  if (route) {
    const result = await env.DB.prepare("UPDATE admin_notifications SET read_at=? WHERE read_at IS NULL AND target_route=?")
      .bind(now, route).run();
    return json({ ok: true, route, updated: Number(result.meta?.changes || 0), readAt: now });
  }
  const id = Number(body.id || 0);
  if (!id) return json({ error: "Notification id is required." }, 400);
  await env.DB.prepare("UPDATE admin_notifications SET read_at=? WHERE id=?").bind(now, id).run();
  return json({ ok: true, id, readAt: now });
}

function financeAmountNumber(value) {
  const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function financeEventShape(eventType = "") {
  const type = String(eventType || "").toUpperCase();
  if (type === "OX.SUPPORT.COMPLETED") return { kind: "support", label: "Support", status: "Paid" };
  if (type === "OX.LIFETIME_STORY.COMPLETED") return { kind: "lifetime", label: "Lifetime Story Purchase", status: "Paid" };
  if (type === "PAYMENT.SALE.COMPLETED") return { kind: "payment", status: "Paid" };
  if (["PAYMENT.SALE.REFUNDED", "PAYMENT.CAPTURE.REFUNDED"].includes(type)) return { kind: "refund", status: "Refunded" };
  if (["PAYMENT.SALE.REVERSED", "PAYMENT.CAPTURE.REVERSED"].includes(type)) return { kind: "refund", status: "Reversed" };
  if (type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED") return { kind: "failed", status: "Failed" };
  if (type === "BILLING.SUBSCRIPTION.CANCELLED") return { kind: "lifecycle", label: "Cancellation", status: "Cancelled" };
  if (type === "BILLING.SUBSCRIPTION.SUSPENDED") return { kind: "lifecycle", label: "Subscription", status: "Suspended" };
  if (type === "BILLING.SUBSCRIPTION.EXPIRED") return { kind: "lifecycle", label: "Subscription", status: "Expired" };
  return null;
}

async function handleAdminFinance(env, url) {
  const limit = Math.max(1, Math.min(2000, Number(url.searchParams.get("limit")) || 1200));
  const paypalConfig = await getPaypalSettings(env).catch(() => ({ mode: "", plans: {} }));
  const currentPlanIds = new Set(Object.values(paypalConfig.plans || {}).map(v => String(v || "").trim()).filter(Boolean));

  // Finance must remain compatible with older local D1 copies. Environment was
  // added later, so do not make the core ledger queries depend on that column.
  const [eventsResult, subscriptionsResult, grantsResult, eventEnvironmentResult, subscriptionEnvironmentResult, overridesResult, lifetimeResult] = await Promise.all([
    env.DB.prepare(`SELECT pe.id,pe.provider_event_id,pe.event_type,pe.user_id,pe.provider_subscription_id,pe.amount,pe.currency,pe.status,pe.occurred_at,pe.created_at,
      pe.user_name_snapshot,pe.user_email_snapshot,
      u.name AS user_name,u.email AS user_email,u.membership_status AS user_membership_status,u.membership_plan AS user_membership_plan,u.latest_amount AS user_latest_amount,
      ms.tier_id,ms.external_plan_id,ms.started_at AS subscription_started_at,
      mt.name AS tier_name,mt.price AS tier_price,mapped_mt.name AS mapped_tier_name,mapped_mt.price AS mapped_tier_price,
      user_mt.name AS user_tier_name,user_mt.price AS user_tier_price
      FROM payment_events pe
      LEFT JOIN users u ON u.id=pe.user_id
      LEFT JOIN member_subscriptions ms ON ms.provider_subscription_id=pe.provider_subscription_id
      LEFT JOIN membership_tiers mt ON mt.id=ms.tier_id
      LEFT JOIN membership_payment_plans mpp ON mpp.provider='paypal' AND mpp.external_plan_id=ms.external_plan_id
      LEFT JOIN membership_tiers mapped_mt ON mapped_mt.id=mpp.tier_id
      LEFT JOIN membership_tiers user_mt ON LOWER(user_mt.name)=LOWER(u.membership_plan)
      ORDER BY COALESCE(pe.occurred_at,pe.created_at) ASC, pe.id ASC LIMIT ?`).bind(limit).all().catch(() => ({ results: [] })),
    env.DB.prepare(`SELECT ms.provider_subscription_id,ms.user_id,ms.status,ms.last_payment_at,ms.started_at,ms.next_billing_at,ms.external_plan_id,
      u.name AS user_name,u.email AS user_email,u.membership_status AS user_membership_status,u.payment_status AS user_payment_status,u.membership_plan AS user_membership_plan,u.latest_amount AS user_latest_amount,
      mt.name AS tier_name,mt.price AS tier_price,mapped_mt.name AS mapped_tier_name,mapped_mt.price AS mapped_tier_price,
      user_mt.name AS user_tier_name,user_mt.price AS user_tier_price
      FROM member_subscriptions ms
      LEFT JOIN users u ON u.id=ms.user_id
      LEFT JOIN membership_tiers mt ON mt.id=ms.tier_id
      LEFT JOIN membership_payment_plans mpp ON mpp.provider='paypal' AND mpp.external_plan_id=ms.external_plan_id
      LEFT JOIN membership_tiers mapped_mt ON mapped_mt.id=mpp.tier_id
      LEFT JOIN membership_tiers user_mt ON LOWER(user_mt.name)=LOWER(u.membership_plan)
      WHERE ms.provider='paypal' ORDER BY ms.updated_at DESC`).all().catch(() => ({ results: [] })),
    env.DB.prepare(`SELECT id,name,email,membership_plan,membership_started_at,updated_at,created_at
      FROM users WHERE membership_status='Granted' ORDER BY COALESCE(membership_started_at,updated_at,created_at) DESC`).all().catch(() => ({ results: [] })),
    env.DB.prepare("SELECT id,environment FROM payment_events").all().catch(() => ({ results: [] })),
    env.DB.prepare("SELECT provider_subscription_id,environment FROM member_subscriptions WHERE provider='paypal'").all().catch(() => ({ results: [] })),
    env.DB.prepare("SELECT record_key,environment,exclude_from_revenue,hidden,note FROM finance_record_overrides").all().catch(() => ({ results: [] })),
    env.DB.prepare(`SELECT paypal_capture_id,original_title,permanent_story_id,purchase_status,entitlement_status
      FROM story_lifetime_purchases WHERE paypal_capture_id IS NOT NULL`).all().catch(() => ({ results: [] }))
  ]);

  const eventEnvironment = new Map((eventEnvironmentResult.results || []).map(r => [Number(r.id), String(r.environment || "").toLowerCase()]));
  const subscriptionEnvironment = new Map((subscriptionEnvironmentResult.results || []).map(r => [String(r.provider_subscription_id || ""), String(r.environment || "").toLowerCase()]));
  const financeOverrides = new Map((overridesResult.results || []).map(r => [String(r.record_key || ""), {
    environment: String(r.environment || "").toLowerCase(),
    excludeFromRevenue: Number(r.exclude_from_revenue || 0) === 1,
    hidden: Number(r.hidden || 0) === 1,
    note: String(r.note || "")
  }]));
  const lifetimeByCapture = new Map((lifetimeResult.results || []).map(r => [String(r.paypal_capture_id || ""), r]));
  const rows = [];
  const paidSeen = new Set();
  const paidTimesBySubscription = new Map();

  for (const row of eventsResult.results || []) {
    const shape = financeEventShape(row.event_type);
    if (!shape) continue;
    const subscriptionId = String(row.provider_subscription_id || "");
    const eventDate = row.occurred_at || row.created_at || null;
    const tierAmount = financeAmountNumber(row.tier_price);
    const mappedTierAmount = financeAmountNumber(row.mapped_tier_price);
    const userTierAmount = financeAmountNumber(row.user_tier_price);
    const userAmount = financeAmountNumber(row.user_latest_amount);
    const eventAmount = financeAmountNumber(row.amount);
    const resolvedPlan = row.tier_name || row.mapped_tier_name || row.user_tier_name || (String(row.user_membership_plan || "").toLowerCase() !== "none" ? row.user_membership_plan : "—");
    const lifetimeCaptureId = String(row.provider_event_id || "").replace(/^LIFETIME:/i, "");
    const lifetimePurchase = lifetimeByCapture.get(lifetimeCaptureId) || null;
    let resolvedRecordPlan = resolvedPlan;
    const savedEnvironment = eventEnvironment.get(Number(row.id)) || subscriptionEnvironment.get(subscriptionId) || "";
    const inferredEnvironment = savedEnvironment ||
      (row.external_plan_id && currentPlanIds.has(String(row.external_plan_id)) ? String(paypalConfig.mode || "").toLowerCase() : "legacy");
    let type = shape.label || "Payment";
    let amount = null;
    let currency = String(row.currency || "USD") || "USD";
    if (shape.kind === "payment") {
      const key = subscriptionId || `event:${row.id}`;
      type = paidSeen.has(key) ? "Renewal" : "Subscription";
      paidSeen.add(key);
      amount = eventAmount || tierAmount || mappedTierAmount || userTierAmount || userAmount;
      if (subscriptionId && eventDate) {
        if (!paidTimesBySubscription.has(subscriptionId)) paidTimesBySubscription.set(subscriptionId, []);
        paidTimesBySubscription.get(subscriptionId).push(new Date(eventDate).getTime());
      }
    } else if (shape.kind === "lifetime") {
      type = "Lifetime Story Purchase";
      amount = eventAmount || Number(LIFETIME_STORY_PRICE);
      resolvedRecordPlan = lifetimePurchase?.original_title || "Lifetime Story";
    } else if (shape.kind === "support") {
      type = "Support";
      amount = eventAmount;
    } else if (shape.kind === "refund") {
      type = "Refund";
      amount = -(Math.abs(eventAmount || tierAmount || mappedTierAmount || userTierAmount || userAmount));
    } else if (shape.kind === "failed") {
      type = "Renewal";
      amount = eventAmount || tierAmount || mappedTierAmount || userTierAmount || userAmount || null;
    }
    rows.push({
      date: eventDate,
      user: row.user_name || row.user_name_snapshot || "Deleted user",
      email: row.user_email || row.user_email_snapshot || "",
      type,
      plan: shape.kind === "support" ? "Support" : resolvedRecordPlan,
      amount,
      currency,
      status: shape.status,
      environment: inferredEnvironment || "legacy",
      reference: row.provider_event_id || "—",
      subscriptionId,
      provider: "PayPal",
      eventType: row.event_type || "",
      recordKey: `event:${row.id}`
    });
  }

  // Recover verified subscription purchases even when an old localhost database
  // missed the PayPal webhook, lost its old tier foreign key, or predates the
  // environment column. ACTIVE is sufficient here because OX has no trial plans:
  // the subscription was server-verified with PayPal before access was granted.
  for (const sub of subscriptionsResult.results || []) {
    const subscriptionStatus = String(sub.status || "").toUpperCase();
    const legacyActivationPayment = !sub.last_payment_at && subscriptionStatus === "ACTIVE"
      ? (sub.started_at || null)
      : null;
    const verifiedPaymentAt = sub.last_payment_at || legacyActivationPayment;
    if (!verifiedPaymentAt) continue;
    const subscriptionId = String(sub.provider_subscription_id || "");
    const paymentMs = new Date(verifiedPaymentAt).getTime();
    const existingTimes = paidTimesBySubscription.get(subscriptionId) || [];
    const hasMatchingPayment = Number.isFinite(paymentMs) && existingTimes.some(t => Number.isFinite(t) && Math.abs(t - paymentMs) <= 10 * 60 * 1000);
    if (hasMatchingPayment) continue;
    const amount = financeAmountNumber(sub.tier_price) || financeAmountNumber(sub.mapped_tier_price) || financeAmountNumber(sub.user_tier_price) || financeAmountNumber(sub.user_latest_amount);
    const resolvedPlan = sub.tier_name || sub.mapped_tier_name || sub.user_tier_name || (String(sub.user_membership_plan || "").toLowerCase() !== "none" ? sub.user_membership_plan : "—");
    const savedEnvironment = subscriptionEnvironment.get(subscriptionId) || "";
    const inferredEnvironment = savedEnvironment ||
      (sub.external_plan_id && currentPlanIds.has(String(sub.external_plan_id)) ? String(paypalConfig.mode || "").toLowerCase() : "legacy");
    rows.push({
      date: verifiedPaymentAt,
      user: sub.user_name || "Unknown user",
      email: sub.user_email || "",
      type: legacyActivationPayment ? "Verified subscription activation" : "Verified subscription payment",
      plan: resolvedPlan,
      amount: amount || null,
      currency: "USD",
      status: "Paid",
      environment: inferredEnvironment || "legacy",
      reference: subscriptionId || "Verified by PayPal",
      subscriptionId,
      provider: "PayPal",
      eventType: legacyActivationPayment ? "SUBSCRIPTION.VERIFIED.ACTIVATION" : "SUBSCRIPTION.API.LAST_PAYMENT",
      recordKey: `subscription:${subscriptionId}:${legacyActivationPayment ? "activation" : "last-payment"}`
    });
  }

  for (const grant of grantsResult.results || []) {
    rows.push({
      date: grant.membership_started_at || grant.updated_at || grant.created_at || null,
      user: grant.name || "Unknown user",
      email: grant.email || "",
      type: "Admin Grant",
      plan: grant.membership_plan || "Admin Grant",
      amount: 0,
      currency: "USD",
      status: "Granted",
      environment: "admin",
      reference: `ADMIN-${grant.id}`,
      subscriptionId: "",
      provider: "Admin",
      eventType: "ADMIN.GRANT",
      recordKey: `grant:${grant.id}`
    });
  }

  for (const row of rows) {
    const override = financeOverrides.get(String(row.recordKey || ""));
    row.hidden = Boolean(override?.hidden);
    row.note = override?.note || "";
    row.excludedFromRevenue = Boolean(override?.excludeFromRevenue);
    if (override?.environment && ["live","sandbox","legacy","admin"].includes(override.environment)) row.environment = override.environment;
    // Sandbox is always test data and never contributes to business revenue.
    if (row.environment === "sandbox") row.excludedFromRevenue = true;
  }

  rows.sort((a, b) => (new Date(b.date || 0).getTime() || 0) - (new Date(a.date || 0).getTime() || 0));
  const visibleRows = rows.filter(r => !r.hidden);
  const successfulRows = visibleRows.filter(r => r.status === "Paid");
  const countablePaidRows = successfulRows.filter(r => !r.excludedFromRevenue && r.environment !== "sandbox");
  const refundRows = visibleRows.filter(r => ["Refunded", "Reversed"].includes(r.status) && !r.excludedFromRevenue && r.environment !== "sandbox");
  const grossRevenue = countablePaidRows.reduce((n, r) => n + Math.max(0, Number(r.amount) || 0), 0);
  const liveRevenue = countablePaidRows.filter(r => r.environment === "live").reduce((n, r) => n + Math.max(0, Number(r.amount) || 0), 0);
  const sandboxRevenue = successfulRows.filter(r => r.environment === "sandbox").reduce((n, r) => n + Math.max(0, Number(r.amount) || 0), 0);
  const legacyRevenue = countablePaidRows.filter(r => r.environment === "legacy").reduce((n, r) => n + Math.max(0, Number(r.amount) || 0), 0);
  const refunded = refundRows.reduce((n, r) => n + Math.abs(Number(r.amount) || 0), 0);
  const activePaidSubscriptions = (subscriptionsResult.results || []).filter(r => String(r.status || "").toUpperCase() === "ACTIVE").length;
  const summary = {
    grossRevenue,
    liveRevenue,
    sandboxRevenue,
    legacyRevenue,
    netRevenue: grossRevenue - refunded,
    refunded,
    successful: countablePaidRows.length,
    sandboxTests: successfulRows.filter(r => r.environment === "sandbox").length,
    failed: visibleRows.filter(r => r.status === "Failed" && r.environment !== "sandbox" && !r.excludedFromRevenue).length,
    adminGrants: visibleRows.filter(r => r.status === "Granted").length,
    activePaidSubscriptions
  };

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const now = new Date();
  const monthly = [];
  for (let offset = 5; offset >= 0; offset--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    const amount = countablePaidRows.reduce((total, row) => {
      const rd = new Date(row.date || 0);
      return rd.getUTCFullYear() === y && rd.getUTCMonth() === m ? total + Math.max(0, Number(row.amount) || 0) : total;
    }, 0);
    monthly.push({ month: `${y}-${String(m + 1).padStart(2, "0")}`, label: monthNames[m], amount, currency: "USD" });
  }
  return json({ ok: true, generatedAt: new Date().toISOString(), rows: rows.slice(0, limit), summary, monthly });
}

async function handleAdminFinanceOverride(request, env) {
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const recordKey = String(body.recordKey || "").trim().slice(0, 220);
  if (!recordKey) return json({ error: "Finance record key is required." }, 400);
  const environment = String(body.environment || "").trim().toLowerCase();
  if (environment && !["live","sandbox","legacy","admin"].includes(environment)) return json({ error: "Invalid finance environment." }, 400);
  const excludeFromRevenue = body.excludeFromRevenue === true || Number(body.excludeFromRevenue || 0) === 1;
  const hidden = body.hidden === true || Number(body.hidden || 0) === 1;
  const note = String(body.note || "").trim().slice(0, 500);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO finance_record_overrides(record_key,environment,exclude_from_revenue,hidden,note,updated_at)
    VALUES(?,?,?,?,?,?)
    ON CONFLICT(record_key) DO UPDATE SET environment=excluded.environment,exclude_from_revenue=excluded.exclude_from_revenue,hidden=excluded.hidden,note=excluded.note,updated_at=excluded.updated_at`)
    .bind(recordKey, environment, excludeFromRevenue ? 1 : 0, hidden ? 1 : 0, note, now).run();
  await env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('payment','Finance record adjusted',?,?)")
    .bind(`${recordKey}${environment ? ` · ${environment}` : ""}${hidden ? " · hidden" : ""}${excludeFromRevenue ? " · excluded from revenue" : ""}`, now).run()
    .catch(() => {});
  return json({ ok: true, recordKey, environment, excludeFromRevenue, hidden, note, updatedAt: now });
}

function toBytesHex(buffer) {
  return [...new Uint8Array(buffer)].map(v => v.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  return toBytesHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value) {
  const base64 = String(value || "").replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

function constantTimeTextEqual(a, b) {
  const aa = String(a || "");
  const bb = String(b || "");
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return diff === 0;
}

async function secureEqualText(a, b) {
  const [aHash, bHash] = await Promise.all([sha256Hex(String(a || "")), sha256Hex(String(b || ""))]);
  return constantTimeTextEqual(aHash, bHash);
}

async function hashPassword(password, saltBytes, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
    key,
    256
  );
  return base64UrlEncode(new Uint8Array(bits));
}

async function makePasswordRecord(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return {
    salt: base64UrlEncode(salt),
    hash: await hashPassword(password, salt, PASSWORD_ITERATIONS),
    iterations: PASSWORD_ITERATIONS
  };
}

function makeUnusablePasswordRecord() {
  // Google-only accounts never authenticate with this password record.
  // Keep random non-secret placeholder values only to satisfy the legacy users schema,
  // avoiding PBKDF2 entirely on Cloudflare Workers.
  const salt = new Uint8Array(16);
  const hash = new Uint8Array(32);
  crypto.getRandomValues(salt);
  crypto.getRandomValues(hash);
  return {
    salt: base64UrlEncode(salt),
    hash: base64UrlEncode(hash),
    iterations: 1
  };
}

async function verifyPassword(password, row) {
  try {
    const salt = base64UrlDecode(row.password_salt);
    const hash = await hashPassword(password, salt, Number(row.password_iterations || PASSWORD_ITERATIONS));
    return constantTimeTextEqual(hash, row.password_hash);
  } catch {
    return false;
  }
}

function cookieFor(name, token, url, maxAge) {
  const secure = !isLocalhost(url) ? "; Secure" : "";
  return `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function clearCookie(name, url) {
  const secure = !isLocalhost(url) ? "; Secure" : "";
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

async function isAdminAuthenticated(request, env) {
  const token = getCookie(request, ADMIN_SESSION_COOKIE);
  if (!token || !env.DB) return false;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare("SELECT token_hash FROM admin_sessions WHERE token_hash = ? AND expires_at > ?")
    .bind(tokenHash, new Date().toISOString()).first();
  return Boolean(row);
}

function adminSessionCookie(token, url) {
  return cookieFor(ADMIN_SESSION_COOKIE, token, url, ADMIN_SESSION_MAX_AGE);
}

async function ensureAdminLoginRateLimitTable(env) {
  if (!env.DB) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_login_rate_limits (
      client_key TEXT PRIMARY KEY,
      failure_count INTEGER NOT NULL DEFAULT 0,
      window_started_at TEXT NOT NULL,
      locked_until TEXT,
      updated_at TEXT NOT NULL
    )
  `).run();
}

function adminLoginClientAddress(request) {
  const cfAddress = String(request.headers.get("CF-Connecting-IP") || "").trim();
  if (cfAddress) return cfAddress;
  const forwarded = String(request.headers.get("X-Forwarded-For") || "").split(",")[0].trim();
  if (forwarded) return forwarded;
  const realAddress = String(request.headers.get("X-Real-IP") || "").trim();
  return realAddress || "local-development";
}

async function adminLoginClientKey(request) {
  return sha256Hex(`admin-login:${adminLoginClientAddress(request)}`);
}

async function adminLoginRateState(request, env) {
  await ensureAdminLoginRateLimitTable(env);
  const clientKey = await adminLoginClientKey(request);
  const nowMs = Date.now();
  const row = await env.DB.prepare(`
    SELECT failure_count, window_started_at, locked_until, updated_at
    FROM admin_login_rate_limits
    WHERE client_key = ?
  `).bind(clientKey).first();
  if (!row) return { clientKey, locked: false, failureCount: 0, windowStartedAt: nowMs };

  const lockedUntilMs = row.locked_until ? Date.parse(row.locked_until) : NaN;
  if (Number.isFinite(lockedUntilMs) && lockedUntilMs > nowMs) {
    return {
      clientKey,
      locked: true,
      failureCount: Number(row.failure_count || 0),
      windowStartedAt: Date.parse(row.window_started_at) || nowMs,
      retryAfterSeconds: Math.max(1, Math.ceil((lockedUntilMs - nowMs) / 1000))
    };
  }

  const windowStartedAt = Date.parse(row.window_started_at);
  if (!Number.isFinite(windowStartedAt) || nowMs - windowStartedAt >= ADMIN_LOGIN_FAILURE_WINDOW_MS || (Number.isFinite(lockedUntilMs) && lockedUntilMs <= nowMs)) {
    await env.DB.prepare("DELETE FROM admin_login_rate_limits WHERE client_key = ?").bind(clientKey).run().catch(() => null);
    return { clientKey, locked: false, failureCount: 0, windowStartedAt: nowMs };
  }

  return {
    clientKey,
    locked: false,
    failureCount: Math.max(0, Number(row.failure_count || 0)),
    windowStartedAt
  };
}

async function recordAdminLoginFailure(env, state) {
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const existingWindow = Number.isFinite(state.windowStartedAt) && nowMs - state.windowStartedAt < ADMIN_LOGIN_FAILURE_WINDOW_MS;
  const windowStartedAtMs = existingWindow ? state.windowStartedAt : nowMs;
  const failureCount = (existingWindow ? Number(state.failureCount || 0) : 0) + 1;
  const locked = failureCount >= ADMIN_LOGIN_MAX_FAILURES;
  const lockedUntilMs = locked ? nowMs + ADMIN_LOGIN_LOCK_MS : null;
  const lockedUntil = lockedUntilMs ? new Date(lockedUntilMs).toISOString() : null;

  await env.DB.prepare(`
    INSERT INTO admin_login_rate_limits (client_key,failure_count,window_started_at,locked_until,updated_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(client_key) DO UPDATE SET
      failure_count=excluded.failure_count,
      window_started_at=excluded.window_started_at,
      locked_until=excluded.locked_until,
      updated_at=excluded.updated_at
  `).bind(state.clientKey, failureCount, new Date(windowStartedAtMs).toISOString(), lockedUntil, now).run();

  // Keep this transient table tiny without putting cleanup work on every request.
  if (failureCount === 1 || locked) {
    const staleBefore = new Date(nowMs - ADMIN_LOGIN_STALE_ROW_MS).toISOString();
    await env.DB.prepare("DELETE FROM admin_login_rate_limits WHERE updated_at < ?").bind(staleBefore).run().catch(() => null);
  }

  return {
    locked,
    failureCount,
    attemptsRemaining: Math.max(0, ADMIN_LOGIN_MAX_FAILURES - failureCount),
    retryAfterSeconds: lockedUntilMs ? Math.max(1, Math.ceil((lockedUntilMs - nowMs) / 1000)) : 0
  };
}

async function clearAdminLoginFailures(env, clientKey) {
  if (!env.DB || !clientKey) return;
  await env.DB.prepare("DELETE FROM admin_login_rate_limits WHERE client_key = ?").bind(clientKey).run().catch(() => null);
}

async function getCurrentUser(request, env) {
  const token = getCookie(request, USER_SESSION_COOKIE);
  if (!token || !env.DB) return null;
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(`
    SELECT u.*
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(tokenHash, now).first();
  return row || null;
}

async function refreshUserSession(request, env, url) {
  const token = getCookie(request, USER_SESSION_COOKIE);
  if (!token || !env.DB) return null;
  const tokenHash = await sha256Hex(token);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const session = await env.DB.prepare("SELECT expires_at FROM user_sessions WHERE token_hash=? AND expires_at>?")
    .bind(tokenHash, now).first();
  if (!session) return null;
  const expiresMs = new Date(session.expires_at).getTime();
  if (!Number.isFinite(expiresMs) || expiresMs - nowMs <= USER_SESSION_REFRESH_THRESHOLD * 1000) {
    const nextExpiry = new Date(nowMs + USER_SESSION_MAX_AGE * 1000).toISOString();
    await env.DB.prepare("UPDATE user_sessions SET expires_at=? WHERE token_hash=?")
      .bind(nextExpiry, tokenHash).run().catch(() => null);
  }
  return cookieFor(USER_SESSION_COOKIE, token, url, USER_SESSION_MAX_AGE);
}

function effectiveMembershipStatus(row) {
  if (!row) return "None";
  const status = row.membership_status || "None";
  if (["Active", "Granted"].includes(status) && row.membership_expires_at) {
    const expiry = new Date(row.membership_expires_at).getTime();
    if (Number.isFinite(expiry) && expiry <= Date.now()) return "Expired";
  }
  return status;
}

function membershipIsActive(row) {
  if (!row || row.account_status !== "Active") return false;
  return ["Active", "Granted"].includes(effectiveMembershipStatus(row));
}


const TEST_MEMBERSHIP_STATUSES = new Set(["None","Active","Granted","Expired","Cancelled"]);

function normalizeTestMembershipStatus(value = "None") {
  const raw = String(value || "").trim();
  return TEST_MEMBERSHIP_STATUSES.has(raw) ? raw : "None";
}

function testFlag(value) {
  return Number(value || 0) === 1 || value === true;
}

async function getUserTestOverride(env, userId, { includeDisabled = false } = {}) {
  const id = String(userId || "").trim();
  if (!id || !env.DB) return null;
  try {
    const row = await env.DB.prepare("SELECT * FROM user_test_overrides WHERE user_id=? LIMIT 1").bind(id).first();
    if (!row) return null;
    if (!includeDisabled && !testFlag(row.enabled)) return null;
    return row;
  } catch {
    return null;
  }
}

async function userAccessContext(env, user) {
  if (!user) return {
    testMode:false,membershipStatus:"None",membershipActive:false,paidOnce:false,
    chatAccess:false,telegramEligible:false,lifetimeEnabled:false,lifetimeStoryId:"",
    showPurchasedSection:true,override:null
  };
  const override = await getUserTestOverride(env, user.id);
  const testMode = Boolean(override);
  const membershipStatus = testMode
    ? normalizeTestMembershipStatus(override.membership_status)
    : effectiveMembershipStatus(user);
  return {
    testMode,
    membershipStatus,
    membershipActive: user.account_status === "Active" && ["Active","Granted"].includes(membershipStatus),
    paidOnce: testMode ? testFlag(override.simulate_paid_once) : Boolean(user.paid_once_at),
    chatAccess: user.account_status === "Active" && (Boolean(user.manual_chat_unlocked_at) || (testMode ? testFlag(override.chat_enabled) : Boolean(user.paid_once_at))),
    telegramEligible: user.account_status === "Active" && (testMode ? testFlag(override.telegram_enabled) : Boolean(user.paid_once_at)),
    lifetimeEnabled: testMode && testFlag(override.lifetime_enabled),
    lifetimeStoryId: testMode ? String(override.lifetime_story_id || "") : "",
    showPurchasedSection: testMode ? testFlag(override.purchased_section_enabled) : true,
    override
  };
}

async function syntheticTestLifetimePurchase(env, user, access) {
  if (!user || !access?.testMode || !access.lifetimeEnabled || !access.lifetimeStoryId) return null;
  const story = await env.DB.prepare(`SELECT s.id,s.title,s.cover,s.visible,p.id AS permanent_story_id,p.state AS product_state
    FROM stories s
    LEFT JOIN lifetime_story_products p ON p.current_story_id=s.id
    WHERE s.id=? LIMIT 1`).bind(access.lifetimeStoryId).first().catch(() => null);
  if (!story) return null;
  const when = access.override?.updated_at || new Date().toISOString();
  return {
    purchaseId:`test-sim:${user.id}:${story.id}`,
    permanentStoryId:story.permanent_story_id || `test-sim:${story.id}`,
    originalStoryId:story.id,
    originalTitle:story.title || "Test Story",
    originalCover:lifetimePublicCover(story),
    amount:"0.00",currency:"USD",
    purchaseStatus:"Completed",entitlementStatus:"Active",purchasedAt:when,
    currentStoryId:story.id,currentTitle:story.title || "Test Story",
    currentCover:lifetimePublicCover(story),
    currentAvailable:Number(story.visible || 0) === 1 && (!story.product_state || story.product_state === "Active"),
    testSimulation:true
  };
}

function paidOnceEnvironmentEligible(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !["sandbox", "test", "test_mode"].includes(normalized);
}

async function markUserPaidOnce(env, userId, paidAt = "", environment = "") {
  const id = String(userId || "").trim();
  if (!id || !paidOnceEnvironmentEligible(environment)) return false;
  const parsed = new Date(String(paidAt || ""));
  const when = Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`UPDATE users
    SET paid_once_at=COALESCE(paid_once_at,?),
        updated_at=CASE WHEN paid_once_at IS NULL THEN ? ELSE updated_at END
    WHERE id=?`).bind(when, now, id).run();
  return Number(result?.meta?.changes || 0) > 0;
}

async function syncPaidOnceForUser(env, userId) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const user = await env.DB.prepare("SELECT paid_once_at FROM users WHERE id=? LIMIT 1").bind(id).first().catch(() => null);
  if (!user || user.paid_once_at) return user?.paid_once_at || null;

  const candidate = await env.DB.prepare(`
    SELECT MIN(paid_at) AS paid_at FROM (
      SELECT COALESCE(NULLIF(last_payment_at,''),NULLIF(started_at,''),created_at) AS paid_at
      FROM member_subscriptions
      WHERE user_id=?
        AND LOWER(COALESCE(environment,'')) NOT IN ('sandbox','test','test_mode')
        AND (NULLIF(last_payment_at,'') IS NOT NULL OR UPPER(COALESCE(status,'')) IN ('ACTIVE','CANCELLED','EXPIRED','SUSPENDED'))

      UNION ALL

      SELECT purchased_at AS paid_at
      FROM story_lifetime_purchases
      WHERE user_id=?
        AND LOWER(COALESCE(environment,'')) NOT IN ('sandbox','test','test_mode')
        AND NULLIF(purchased_at,'') IS NOT NULL

      UNION ALL

      SELECT claimed_at AS paid_at
      FROM raptor_migration_claims
      WHERE ox_user_id=?
        AND NULLIF(claimed_at,'') IS NOT NULL
    )
    WHERE paid_at IS NOT NULL AND paid_at<>''
  `).bind(id, id, id).first().catch(() => null);

  if (!candidate?.paid_at) return null;
  await markUserPaidOnce(env, id, candidate.paid_at, "legacy");
  return candidate.paid_at;
}

async function backfillPaidOnceAccess(env) {
  const users = await env.DB.prepare("SELECT id FROM users WHERE paid_once_at IS NULL").all().catch(() => ({ results: [] }));
  let updated = 0;
  for (const row of users.results || []) {
    if (await syncPaidOnceForUser(env, row.id)) updated++;
  }
  return updated;
}

function paypalSubscriptionSummary(subscription) {
  if (!subscription) return null;
  const status = String(subscription.status || "").toUpperCase() || "UNKNOWN";
  const autoRenew = status === "ACTIVE";
  return {
    provider: "PayPal",
    subscriptionId: subscription.provider_subscription_id || "",
    status,
    autoRenew,
    nextBillingAt: subscription.next_billing_at || null,
    lastPaymentAt: subscription.last_payment_at || null,
    cancelledAt: subscription.cancelled_at || null
  };
}

function publicUserFromRow(row, subscription = null, access = null) {
  if (!row) return null;
  const paypal = paypalSubscriptionSummary(subscription);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    accountStatus: row.account_status,
    membershipStatus: access?.testMode ? access.membershipStatus : effectiveMembershipStatus(row),
    plan: access?.testMode
      ? (["Active","Granted"].includes(access.membershipStatus) ? "OX Test Simulation" : "None")
      : (row.membership_plan || "None"),
    membershipStartedAt: row.membership_started_at || null,
    membershipExpiresAt: row.membership_expires_at || null,
    profileImage: `/api/media/user-profile-${encodeURIComponent(row.id)}`,
    billingProvider: paypal?.provider || null,
    subscriptionId: paypal?.subscriptionId || null,
    subscriptionStatus: paypal?.status || null,
    autoRenew: paypal ? paypal.autoRenew : null,
    nextBillingAt: paypal?.nextBillingAt || null,
    lastPaymentAt: paypal?.lastPaymentAt || null,
    paidOnce: access?.testMode ? Boolean(access.paidOnce) : Boolean(row.paid_once_at),
    paidOnceAt: access?.testMode ? null : (row.paid_once_at || null),
    testMode: Boolean(access?.testMode),
    testChatAccess: Boolean(access?.testMode && access.chatAccess),
    testTelegramEligible: Boolean(access?.testMode && access.telegramEligible),
    testLifetimeEnabled: Boolean(access?.testMode && access.lifetimeEnabled),
    testShowPurchased: access?.testMode ? Boolean(access.showPurchasedSection) : true
  };
}

async function publicAccessPayload(env, row, subscription = null) {
  const access = await userAccessContext(env, row);
  return { membershipActive: access.membershipActive, user: publicUserFromRow(row, subscription, access), access };
}

function adminUserFromRow(row, subscription = null, lifetimePurchases = [], telegramConnection = null, testOverride = null) {
  const membership = effectiveMembershipStatus(row);
  const account = row.account_status || "Active";
  const paypal = paypalSubscriptionSummary(subscription);
  const renewal = paypal?.status === "ACTIVE" && paypal.nextBillingAt
    ? paypal.nextBillingAt
    : (row.membership_expires_at || "—");
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    account,
    membership,
    membershipTierId: row.membership_tier_id || null,
    plan: row.membership_plan || "None",
    renewal,
    joined: row.created_at || "—",
    lastLogin: row.last_login_at || "Never",
    payment: row.payment_status || "None",
    amount: row.latest_amount || "$0.00",
    profileImage: `/api/media/user-profile-${encodeURIComponent(row.id)}`,
    timezone: row.user_timezone || "",
    billingProvider: paypal?.provider || null,
    subscriptionId: paypal?.subscriptionId || null,
    subscriptionStatus: paypal?.status || null,
    autoRenew: paypal ? paypal.autoRenew : null,
    nextBillingAt: paypal?.nextBillingAt || null,
    lastPaymentAt: paypal?.lastPaymentAt || null,
    accessUntil: row.membership_expires_at || null,
    paidOnce: Boolean(row.paid_once_at),
    paidOnceAt: row.paid_once_at || null,
    manualChatUnlocked: Boolean(row.manual_chat_unlocked_at),
    manualChatUnlockedAt: row.manual_chat_unlocked_at || null,
    testControls: testOverride ? {
      configured:true,
      enabled:testFlag(testOverride.enabled),
      simulatePaidOnce:testFlag(testOverride.simulate_paid_once),
      chatEnabled:testFlag(testOverride.chat_enabled),
      telegramEnabled:testFlag(testOverride.telegram_enabled),
      membershipStatus:normalizeTestMembershipStatus(testOverride.membership_status),
      lifetimeEnabled:testFlag(testOverride.lifetime_enabled),
      lifetimeStoryId:testOverride.lifetime_story_id || "",
      purchasedSectionEnabled:testFlag(testOverride.purchased_section_enabled),
      updatedAt:testOverride.updated_at || null
    } : {
      configured:false,enabled:false,simulatePaidOnce:true,chatEnabled:true,telegramEnabled:true,
      membershipStatus:"Active",lifetimeEnabled:false,lifetimeStoryId:"",purchasedSectionEnabled:true,updatedAt:null
    },
    telegram: telegramConnection ? {
      connected: true,
      telegramUserId: String(telegramConnection.telegram_user_id || ""),
      username: telegramConnection.telegram_username || "",
      firstName: telegramConnection.telegram_first_name || "",
      lastName: telegramConnection.telegram_last_name || "",
      status: telegramConnection.status || "linked",
      joined: String(telegramConnection.status || "") === "joined",
      linkedAt: telegramConnection.linked_at || null,
      joinedAt: telegramConnection.joined_at || null,
      leftAt: telegramConnection.left_at || null
    } : {
      connected: false,
      telegramUserId: "",
      username: "",
      firstName: "",
      lastName: "",
      status: "not_connected",
      joined: false,
      linkedAt: null,
      joinedAt: null,
      leftAt: null
    },
    lifetimePurchaseCount: Array.isArray(lifetimePurchases) ? lifetimePurchases.length : 0,
    lifetimePurchases: Array.isArray(lifetimePurchases) ? lifetimePurchases : []
  };
}

async function createUserSession(env, userId, url) {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + USER_SESSION_MAX_AGE * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM user_sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("INSERT INTO user_sessions (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)")
      .bind(tokenHash, userId, now, expiresAt)
  ]);
  return cookieFor(USER_SESSION_COOKIE, token, url, USER_SESSION_MAX_AGE);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 180);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateMemberCredentials(body, { registering = false } = {}) {
  const password = String(body.password || "");
  if (password.length < 8 || password.length > 128) return { error: "Password must be 8–128 characters." };

  if (registering) {
    const email = normalizeEmail(body.email);
    const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (!validEmail(email)) return { error: "Enter a valid email address." };
    if (name.length < 2) return { error: "Enter your name." };
    return { email, password, name };
  }

  const identifier = String(body.identifier || body.email || "").trim().replace(/\s+/g, " ").slice(0, 180);
  if (identifier.length < 2) return { error: "Enter your email or name." };
  return { identifier, password };
}

async function databaseReady(env) {
  if (!env.DB) return false;
  try {
    await env.DB.prepare("SELECT 1 AS ok FROM site_settings LIMIT 1").first();
    return true;
  } catch {
    return false;
  }
}

async function authTablesReady(env) {
  if (!(await databaseReady(env))) return false;
  try {
    await env.DB.prepare("SELECT 1 AS ok FROM users LIMIT 1").first();
    return true;
  } catch {
    return false;
  }
}


function validGoogleClientId(value = "") {
  return /^[0-9A-Za-z._-]+\.apps\.googleusercontent\.com$/.test(String(value || "").trim());
}

async function getGoogleAuthSettings(env) {
  if (!(await databaseReady(env))) return { clientId: "" };
  try {
    const row = await env.DB.prepare("SELECT value FROM site_settings WHERE key='google_auth'").first();
    const parsed = safeParse(row?.value || "{}", {});
    return { clientId: validGoogleClientId(parsed.clientId) ? String(parsed.clientId).trim() : "" };
  } catch { return { clientId: "" }; }
}

async function saveGoogleAuthSettings(env, input = {}) {
  const clientId = String(input.clientId || "").trim();
  if (clientId && !validGoogleClientId(clientId)) throw new Error("Enter a valid Google Web Client ID ending in .apps.googleusercontent.com.");
  const config = { clientId };
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO site_settings(key,value,updated_at) VALUES('google_auth',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
    .bind(JSON.stringify(config), now).run();
  return config;
}

let googleJwksCache = { expiresAt: 0, keys: [] };
function parseCacheMaxAge(value = "") {
  const match = String(value || "").match(/(?:^|,)\s*max-age=(\d+)/i);
  return match ? Math.max(60, Number(match[1] || 300)) : 300;
}
function decodeJwtPart(value = "") {
  try { return JSON.parse(new TextDecoder().decode(base64UrlDecode(value))); }
  catch { throw new Error("Google returned an invalid identity token."); }
}
async function getGoogleJwks(force = false) {
  if (!force && googleJwksCache.keys.length && googleJwksCache.expiresAt > Date.now()) return googleJwksCache.keys;
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("Unable to retrieve Google's sign-in verification keys.");
  const payload = await response.json();
  const keys = Array.isArray(payload?.keys) ? payload.keys : [];
  if (!keys.length) throw new Error("Google sign-in verification keys are unavailable.");
  googleJwksCache = { keys, expiresAt: Date.now() + parseCacheMaxAge(response.headers.get("cache-control")) * 1000 };
  return keys;
}
async function verifyGoogleIdToken(token, clientId) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Google returned an invalid identity token.");
  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Google identity token.");
  let keys = await getGoogleJwks(false);
  let jwk = keys.find(key => key.kid === header.kid);
  if (!jwk) { keys = await getGoogleJwks(true); jwk = keys.find(key => key.kid === header.kid); }
  if (!jwk) throw new Error("Google identity signing key was not found.");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signature = base64UrlDecode(parts[2]);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signed))) throw new Error("Google identity token signature is invalid.");
  const issuer = String(payload.iss || "");
  if (!["accounts.google.com","https://accounts.google.com"].includes(issuer)) throw new Error("Google identity token issuer is invalid.");
  const audience = payload.aud;
  const audienceOk = Array.isArray(audience) ? audience.includes(clientId) : String(audience || "") === clientId;
  if (!audienceOk) throw new Error("Google identity token was issued for a different website.");
  const now = Math.floor(Date.now() / 1000);
  if (!Number(payload.exp) || Number(payload.exp) <= now) throw new Error("Google identity token has expired.");
  if (Number(payload.iat || now) > now + 300) throw new Error("Google identity token time is invalid.");
  if (!payload.sub || !validEmail(normalizeEmail(payload.email)) || payload.email_verified !== true) throw new Error("Google did not provide a verified email address.");
  return payload;
}

async function ensureUserGoogleAuthTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_google_auth (
    user_id TEXT PRIMARY KEY, google_sub TEXT NOT NULL UNIQUE, google_email TEXT NOT NULL COLLATE NOCASE,
    picture_url TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
}

async function ensureUserSessionsTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions (user_id)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions (expires_at)").run();
}

async function importGoogleProfilePicture(env, userId, pictureUrl) {
  const clean = String(pictureUrl || "").trim();
  if (!clean) return;
  let parsed;
  try { parsed = new URL(clean); } catch { return; }
  if (parsed.protocol !== "https:" || !/(^|\.)googleusercontent\.com$/i.test(parsed.hostname)) return;
  await ensureMediaAssetsTable(env);
  const key = `user-profile-${userId}`.toLowerCase();
  const existing = await env.DB.prepare("SELECT 1 AS ok FROM media_assets WHERE asset_key=?").bind(key).first();
  if (existing) return;
  try {
    const response = await fetch(clean, { redirect: "follow" });
    if (!response.ok) return;
    let mime = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (mime === "image/jpg") mime = "image/jpeg";
    if (!["image/jpeg","image/png","image/webp","image/avif"].includes(mime)) return;
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > 1_250_000) return;
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT OR IGNORE INTO media_assets(asset_key,mime_type,image_data,size_bytes,updated_at) VALUES(?,?,?,?,?)")
      .bind(key, mime, buffer, buffer.byteLength, now).run();
  } catch {}
}

async function handleGoogleAuthConfig(env) {
  const config = await getGoogleAuthSettings(env);
  return json({ enabled: Boolean(config.clientId), clientId: config.clientId }, 200, { "cache-control": "public, max-age=60, stale-while-revalidate=300" });
}

async function restoreOrphanedLifetimePurchasesForVerifiedGoogleEmail(env, userId, email, displayName = "") {
  const cleanUserId = String(userId || "").trim();
  const cleanEmail = normalizeEmail(email);
  if (!cleanUserId || !validEmail(cleanEmail)) return 0;

  let orphaned = [];
  try {
    const result = await env.DB.prepare(`SELECT id,permanent_story_id,original_title,purchased_at
      FROM story_lifetime_purchases
      WHERE user_id IS NULL AND LOWER(TRIM(user_email_snapshot))=LOWER(TRIM(?))
      ORDER BY CASE WHEN purchase_status='Completed' AND entitlement_status='Active' THEN 0 ELSE 1 END, purchased_at ASC`)
      .bind(cleanEmail).all();
    orphaned = result.results || [];
  } catch {
    return 0;
  }

  let restored = 0;
  const now = new Date().toISOString();
  for (const purchase of orphaned) {
    const permanentStoryId = String(purchase.permanent_story_id || "").trim();
    if (!permanentStoryId) continue;
    const alreadyAttached = await env.DB.prepare(`SELECT id FROM story_lifetime_purchases
      WHERE user_id=? AND permanent_story_id=? LIMIT 1`).bind(cleanUserId, permanentStoryId).first().catch(() => null);
    if (alreadyAttached) continue;
    const result = await env.DB.prepare(`UPDATE story_lifetime_purchases SET user_id=?,updated_at=?
      WHERE id=? AND user_id IS NULL`).bind(cleanUserId, now, purchase.id).run().catch(() => null);
    if (Number(result?.meta?.changes || 0) > 0) restored++;
  }

  if (restored > 0) {
    // Reconnect retained Live lifetime-payment ledger rows too. Sandbox test rows
    // may already have been intentionally cleaned when the old account was deleted.
    await env.DB.prepare(`UPDATE payment_events SET user_id=?
      WHERE user_id IS NULL AND provider='paypal' AND provider_event_id LIKE 'LIFETIME:%'
        AND LOWER(TRIM(user_email_snapshot))=LOWER(TRIM(?))`).bind(cleanUserId, cleanEmail).run().catch(() => null);
    await env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('user','Lifetime purchases restored',?,?)")
      .bind(`${cleanEmail} · ${restored} retained lifetime purchase${restored === 1 ? "" : "s"} reconnected after Google sign-in.`, now).run().catch(() => null);
    await createAdminNotification(env, {
      type: "payment", title: "Lifetime purchases restored",
      body: `${displayName || cleanEmail} · ${restored} previous lifetime purchase${restored === 1 ? "" : "s"} reconnected`,
      route: "lifetime", userId: cleanUserId, relatedKey: `lifetime-restore:${cleanUserId}:${now.slice(0, 16)}`, dedupeMinutes: 2
    }).catch(() => null);
  }
  return restored;
}

async function handleGoogleMemberAuth(request, env, url) {
  if (!(await authTablesReady(env))) return json({ error: "Account database is not initialized yet.", code: "AUTH_DB_NOT_READY" }, 503);
  const config = await getGoogleAuthSettings(env);
  if (!config.clientId) return json({ error: "Google sign-in is not configured for this website yet.", code: "GOOGLE_AUTH_NOT_CONFIGURED" }, 409);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  let google;
  try { google = await verifyGoogleIdToken(body.credential, config.clientId); }
  catch (error) { return json({ error: String(error?.message || "Google sign-in could not be verified."), code: "GOOGLE_TOKEN_INVALID" }, 401); }

  try {
    await ensureUserGoogleAuthTable(env);
    await ensureUserSessionsTable(env);
    const googleSub = String(google.sub).slice(0, 255);
    const email = normalizeEmail(google.email);
    const googleName = String(google.name || email.split("@")[0] || "Member").trim().replace(/\s+/g, " ").slice(0, 80) || "Member";
    const picture = String(google.picture || "").trim().slice(0, 1000);
    let row = await env.DB.prepare("SELECT u.* FROM user_google_auth g JOIN users u ON u.id=g.user_id WHERE g.google_sub=?").bind(googleSub).first();
    let created = false;
    const now = new Date().toISOString();

    if (!row) {
      const byEmail = await env.DB.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE").bind(email).first();
      if (byEmail) {
        const currentLink = await env.DB.prepare("SELECT google_sub FROM user_google_auth WHERE user_id=?").bind(byEmail.id).first();
        if (currentLink && currentLink.google_sub !== googleSub) return json({ error: "This account is already linked to another Google account." }, 409);
        await env.DB.prepare("INSERT OR IGNORE INTO user_google_auth(user_id,google_sub,google_email,picture_url,created_at,updated_at) VALUES(?,?,?,?,?,?)")
          .bind(byEmail.id, googleSub, email, picture, now, now).run();
        row = byEmail;
      } else {
        const id = crypto.randomUUID();
        const unusablePassword = makeUnusablePasswordRecord();
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO users (id,name,email,password_hash,password_salt,password_iterations,account_status,membership_status,membership_plan,payment_status,latest_amount,created_at,updated_at)
            VALUES (?,?,?,?,?,?,'Active','None','None','None','$0.00',?,?)`)
            .bind(id, googleName, email, unusablePassword.hash, unusablePassword.salt, unusablePassword.iterations, now, now),
          env.DB.prepare("INSERT INTO user_google_auth(user_id,google_sub,google_email,picture_url,created_at,updated_at) VALUES(?,?,?,?,?,?)")
            .bind(id, googleSub, email, picture, now, now)
        ]);
        // Audit/notification failures must never prevent a valid Google sign-in.
        await env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('user','New user registered',?,?)")
          .bind(`${email} · Google`, now).run().catch(() => null);
        await createAdminNotification(env, { type: "user", title: "New member account", body: `${googleName} · ${email}`, route: "users", userId: id, relatedKey: `register:${id}` }).catch(() => null);
        row = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
        created = true;
      }
    }

    if (!row) return json({ error: "Unable to create or load the member account.", code: "GOOGLE_ACCOUNT_NOT_FOUND" }, 500);
    if (row.account_status === "Blocked") return json({ error: "This account is blocked. Contact support." }, 403);

    // Account deletion must never erase a paid lifetime entitlement. The purchase
    // ledger keeps its verified Google-email snapshot with user_id set to NULL; if
    // that same verified Google email creates/signs into an account again, reconnect
    // those retained purchases to the current account automatically.
    await restoreOrphanedLifetimePurchasesForVerifiedGoogleEmail(env, row.id, email, googleName).catch(error =>
      console.warn("Lifetime purchase reconnect skipped", error));
    await syncPaidOnceForUser(env, row.id).catch(error => console.warn("Paid-once access sync skipped", error));
    row = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(row.id).first() || row;

    await env.DB.prepare("UPDATE users SET last_login_at=?,updated_at=? WHERE id=?").bind(now, now, row.id).run();
    await env.DB.prepare("UPDATE user_google_auth SET google_email=?,picture_url=?,updated_at=? WHERE user_id=?")
      .bind(email, picture, now, row.id).run();
    row.last_login_at = now;

    await importGoogleProfilePicture(env, row.id, picture).catch(() => null);
    const subscription = await latestPaypalSubscriptionForUser(env, row.id);
    const sessionCookie = await createUserSession(env, row.id, url);
    const publicAccess = await publicAccessPayload(env, row, subscription);
    return json({ ok: true, created, loggedIn: true, membershipActive: publicAccess.membershipActive, user: publicAccess.user }, created ? 201 : 200, { "set-cookie": sessionCookie });
  } catch (error) {
    console.error("Google member sign-in failed", error);
    const detail = String(error?.message || error || "Unknown account synchronization error.").slice(0, 280);
    return json({ error: `Google completed, but this website could not finish the member session: ${detail}`, code: "GOOGLE_ACCOUNT_SYNC_FAILED" }, 500);
  }
}

async function handleAdminGoogleAuth(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  if (request.method === "GET") return json({ ok: true, config: await getGoogleAuthSettings(env) });
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  try {
    const config = await saveGoogleAuthSettings(env, body);
    await env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('system','Google Sign-In settings updated',?,?)")
      .bind(config.clientId ? "Google member sign-in configured." : "Google member sign-in cleared.", new Date().toISOString()).run().catch(() => null);
    return json({ ok: true, config });
  } catch (error) { return json({ error: String(error?.message || error) }, 400); }
}

async function handlePublicSite(env) {
  if (!(await databaseReady(env))) {
    return json({ backend: false, appearance: DEFAULT_APPEARANCE, settings: DEFAULT_SETTINGS, tiers: [] });
  }
  const core = await getCoreState(env);
  const playerDelivery = await getPlayerDeliveryConfig(env);
  return json({
    backend: true,
    appearance: core.appearance,
    settings: core.settings,
    playerDelivery,
    tiers: core.tiers.filter(t => t.status === "Published")
  }, 200, { "cache-control": "public, max-age=15, stale-while-revalidate=60" });
}

async function handlePublicStories(env) {
  if (!(await databaseReady(env))) return json({ backend: false, stories: fallbackStories() });
  const result = await env.DB.prepare("SELECT * FROM stories WHERE visible = 1 ORDER BY sort_order ASC, title ASC").all();
  return json({ backend: true, stories: (result.results || []).map(publicStoryFromRow) }, 200, { "cache-control": "public, max-age=15, stale-while-revalidate=60" });
}


async function handlePublicPosts(env) {
  if (!(await databaseReady(env))) return json({ backend: false, posts: [] });
  try {
    const result = await env.DB.prepare(`SELECT id,title,body,pinned,published_at,created_at,updated_at
      FROM posts
      WHERE status='Published'
      ORDER BY pinned DESC, COALESCE(published_at,created_at) DESC, created_at DESC`).all();
    return json({
      backend: true,
      posts: (result.results || []).map(row => ({
        id: String(row.id || ""),
        title: String(row.title || ""),
        body: String(row.body || ""),
        pinned: Number(row.pinned || 0) === 1,
        publishedAt: row.published_at || null,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null
      }))
    }, 200, { "cache-control": "no-store" });
  } catch (error) {
    // A code deploy can briefly arrive before migration 0021. Keep the public
    // website usable instead of failing the entire page.
    console.warn("Public posts unavailable", error);
    return json({ backend: true, posts: [] }, 200, { "cache-control": "no-store" });
  }
}


async function latestPublishedPostMoment(env) {
  const row = await env.DB.prepare(`SELECT
      COUNT(*) AS published_count,
      MAX(COALESCE(published_at,created_at)) AS latest_published_at
    FROM posts WHERE status='Published'`).first();
  return {
    publishedCount: Number(row?.published_count || 0),
    latestPublishedAt: row?.latest_published_at || null
  };
}

async function handlePostsStatus(request, env, url) {
  if (!(await databaseReady(env))) {
    return json({ ok: true, loggedIn: false, unreadCount: 0, publishedCount: 0, latestPublishedAt: null });
  }

  try {
    const latest = await latestPublishedPostMoment(env);
    const user = await getCurrentUser(request, env);

    if (user) {
      let readState = await env.DB.prepare("SELECT last_seen_at FROM post_read_state WHERE user_id=?")
        .bind(user.id).first();

      // A newly-created account may not have existed when migration 0023 ran.
      // Start that account from the current Posts position instead of marking
      // the entire historical feed unread.
      if (!readState) {
        const now = new Date().toISOString();
        const baseline = latest.latestPublishedAt || now;
        await env.DB.prepare(`INSERT INTO post_read_state(user_id,last_seen_at,updated_at)
          VALUES(?,?,?) ON CONFLICT(user_id) DO NOTHING`).bind(user.id, baseline, now).run();
        readState = { last_seen_at: baseline };
      }

      const seenAt = readState?.last_seen_at || "1970-01-01T00:00:00.000Z";
      const unread = await env.DB.prepare(`SELECT COUNT(*) AS total FROM posts
        WHERE status='Published' AND COALESCE(published_at,created_at) > ?`)
        .bind(seenAt).first();

      return json({
        ok: true,
        loggedIn: true,
        unreadCount: Number(unread?.total || 0),
        publishedCount: latest.publishedCount,
        latestPublishedAt: latest.latestPublishedAt,
        lastSeenAt: seenAt
      }, 200, { "cache-control": "no-store" });
    }

    const rawSince = String(url.searchParams.get("since") || "").trim();
    const parsedSince = new Date(rawSince);
    if (!rawSince || !Number.isFinite(parsedSince.getTime())) {
      return json({
        ok: true,
        loggedIn: false,
        unreadCount: 0,
        publishedCount: latest.publishedCount,
        latestPublishedAt: latest.latestPublishedAt,
        lastSeenAt: null
      }, 200, { "cache-control": "no-store" });
    }

    const since = parsedSince.toISOString();
    const unread = await env.DB.prepare(`SELECT COUNT(*) AS total FROM posts
      WHERE status='Published' AND COALESCE(published_at,created_at) > ?`)
      .bind(since).first();

    return json({
      ok: true,
      loggedIn: false,
      unreadCount: Number(unread?.total || 0),
      publishedCount: latest.publishedCount,
      latestPublishedAt: latest.latestPublishedAt,
      lastSeenAt: since
    }, 200, { "cache-control": "no-store" });
  } catch (error) {
    console.warn("Posts unread status unavailable", error);
    return json({ ok: true, loggedIn: false, unreadCount: 0, publishedCount: 0, latestPublishedAt: null }, 200, { "cache-control": "no-store" });
  }
}

async function handlePostsSeen(request, env) {
  if (!(await databaseReady(env))) return json({ ok: true, loggedIn: false });

  try {
    const user = await getCurrentUser(request, env);
    const latest = await latestPublishedPostMoment(env);
    if (!user) {
      return json({ ok: true, loggedIn: false, latestPublishedAt: latest.latestPublishedAt });
    }

    const now = new Date().toISOString();
    const seenAt = latest.latestPublishedAt || now;
    await env.DB.prepare(`INSERT INTO post_read_state(user_id,last_seen_at,updated_at)
      VALUES(?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET
        last_seen_at=excluded.last_seen_at,
        updated_at=excluded.updated_at`)
      .bind(user.id, seenAt, now).run();

    return json({ ok: true, loggedIn: true, unreadCount: 0, latestPublishedAt: latest.latestPublishedAt });
  } catch (error) {
    return json({ error: error.message || "Unable to update Posts notification." }, 500);
  }
}

async function latestPaypalSubscriptionForUser(env, userId) {
  if (!userId) return null;
  try {
    return await env.DB.prepare(`SELECT * FROM member_subscriptions
      WHERE user_id=? AND provider='paypal' ORDER BY updated_at DESC LIMIT 1`).bind(userId).first();
  } catch {
    return null;
  }
}

async function handlePublicSession(request, env, url) {
  if (!(await authTablesReady(env))) return json({ loggedIn: false, membershipActive: false, user: null, authReady: false });
  const row = await getCurrentUser(request, env);
  if (!row) return json({ loggedIn: false, membershipActive: false, user: null, authReady: true });
  let subscription = await latestPaypalSubscriptionForUser(env, row.id);
  subscription = await refreshRaptorMigratedSubscriptionIfStale(env, row.id, subscription);
  const refreshedCookie = await refreshUserSession(request, env, url);
  const publicAccess = await publicAccessPayload(env, row, subscription);
  return json({
    loggedIn: true,
    membershipActive: publicAccess.membershipActive,
    user: publicAccess.user,
    authReady: true
  }, 200, refreshedCookie ? { "set-cookie": refreshedCookie } : {});
}

async function handleRegister(request, env, url) {
  if (!(await authTablesReady(env))) return json({ error: "Account database is not initialized yet.", code: "AUTH_DB_NOT_READY" }, 503);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const input = validateMemberCredentials(body, { registering: true });
  if (input.error) return json({ error: input.error }, 400);

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(input.email).first();
  if (existing) return json({ error: "An account with this email already exists." }, 409);

  const password = await makePasswordRecord(input.password);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (
      id,name,email,password_hash,password_salt,password_iterations,account_status,membership_status,
      membership_plan,payment_status,latest_amount,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,'Active','None','None','None','$0.00',?,?)`)
      .bind(id, input.name, input.email, password.hash, password.salt, password.iterations, now, now),
    env.DB.prepare("INSERT INTO activity_log (type,title,detail,created_at) VALUES ('user','New user registered',?,?)")
      .bind(input.email, now)
  ]);
  await createAdminNotification(env, { type: "user", title: "New member account", body: `${input.name} · ${input.email}`, route: "users", userId: id, relatedKey: `register:${id}` });

  const sessionCookie = await createUserSession(env, id, url);
  const row = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  const publicAccess = await publicAccessPayload(env, row);
  return json({
    ok: true,
    loggedIn: true,
    membershipActive: publicAccess.membershipActive,
    user: publicAccess.user
  }, 201, { "set-cookie": sessionCookie });
}

async function handleMemberLogin(request, env, url) {
  if (!(await authTablesReady(env))) return json({ error: "Account database is not initialized yet.", code: "AUTH_DB_NOT_READY" }, 503);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const input = validateMemberCredentials(body);
  if (input.error) return json({ error: input.error }, 400);

  let row = null;
  if (input.identifier.includes("@")) {
    row = await env.DB.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").bind(normalizeEmail(input.identifier)).first();
  } else {
    const matches = await env.DB.prepare("SELECT * FROM users WHERE name = ? COLLATE NOCASE ORDER BY created_at ASC LIMIT 2").bind(input.identifier).all();
    const rows = matches.results || [];
    if (rows.length > 1) return json({ error: "More than one account uses this name. Log in with your email." }, 409);
    row = rows[0] || null;
  }
  if (!row || !(await verifyPassword(input.password, row))) {
    return json({ error: "Incorrect email/name or password." }, 401);
  }
  if (row.account_status === "Blocked") return json({ error: "This account is blocked. Contact support." }, 403);

  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(now, now, row.id).run();
  row.last_login_at = now;
  const sessionCookie = await createUserSession(env, row.id, url);
  const publicAccess = await publicAccessPayload(env, row);
  return json({
    ok: true,
    loggedIn: true,
    membershipActive: publicAccess.membershipActive,
    user: publicAccess.user
  }, 200, { "set-cookie": sessionCookie });
}

async function handleMemberLogout(request, env, url) {
  const token = getCookie(request, USER_SESSION_COOKIE);
  if (token && env.DB) {
    try {
      await env.DB.prepare("DELETE FROM user_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
    } catch {}
  }
  return json({ ok: true }, 200, { "set-cookie": clearCookie(USER_SESSION_COOKIE, url) });
}

async function handleAdminStatus(request, env) {
  const dbReady = await databaseReady(env);
  const authReady = await authTablesReady(env);
  const passwordConfigured = Boolean(env.ADMIN_PASSWORD);
  const authenticated = dbReady && passwordConfigured ? await isAdminAuthenticated(request, env) : false;
  return json({ backend: true, dbReady, authReady, passwordConfigured, authenticated });
}

async function handleAdminLogin(request, env, url) {
  if (!(await databaseReady(env))) return json({ error: "Database is not initialized yet.", code: "DB_NOT_READY" }, 503);
  if (!env.ADMIN_PASSWORD) return json({ error: "ADMIN_PASSWORD is not configured.", code: "PASSWORD_NOT_CONFIGURED" }, 503);

  const rateState = await adminLoginRateState(request, env);
  if (rateState.locked) {
    return json({
      error: "Too many incorrect attempts. Admin login is temporarily locked.",
      code: "ADMIN_TEMP_LOCKED",
      retryAfterSeconds: rateState.retryAfterSeconds
    }, 429, { "retry-after": String(rateState.retryAfterSeconds) });
  }

  let body = {};
  try { body = await request.json(); } catch {}
  if (!(await secureEqualText(body.password, env.ADMIN_PASSWORD))) {
    const failure = await recordAdminLoginFailure(env, rateState);
    if (failure.locked) {
      return json({
        error: "Too many incorrect attempts. Admin login is temporarily locked.",
        code: "ADMIN_TEMP_LOCKED",
        retryAfterSeconds: failure.retryAfterSeconds
      }, 429, { "retry-after": String(failure.retryAfterSeconds) });
    }
    return json({ error: "Incorrect admin password.", code: "ADMIN_PASSWORD_INCORRECT" }, 401);
  }

  await clearAdminLoginFailures(env, rateState.clientKey);
  const token = randomToken();
  const hash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_MAX_AGE * 1000).toISOString();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("INSERT INTO admin_sessions (token_hash,created_at,expires_at) VALUES (?,?,?)").bind(hash, now, expiresAt),
    env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('system','Admin logged in','Admin session opened.',?)").bind(now)
  ]);
  return json({ ok: true }, 200, { "set-cookie": adminSessionCookie(token, url) });
}

async function handleAdminLogout(request, env, url) {
  const token = getCookie(request, ADMIN_SESSION_COOKIE);
  if (token && env.DB) {
    try {
      const hash = await sha256Hex(token);
      const session = await env.DB.prepare("SELECT token_hash FROM admin_sessions WHERE token_hash=? AND expires_at>?").bind(hash,new Date().toISOString()).first();
      await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(hash).run();
      if (session) await env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('system','Admin logged out','Admin session closed.',?)").bind(new Date().toISOString()).run();
    } catch {}
  }
  return json({ ok: true }, 200, { "set-cookie": clearCookie(ADMIN_SESSION_COOKIE, url) });
}


function cleanMoneyValue(value = "") {
  const raw = String(value || "").trim().replace(/[^0-9.]/g, "");
  if (!raw || !/^\d+(?:\.\d{1,2})?$/.test(raw)) return "";
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) return "";
  return amount.toFixed(2);
}

async function paypalPlanRecurringPrice(env, planId, config) {
  const id = String(planId || "").trim();
  if (!id) return { amount: "", currency: "" };
  try {
    const plan = await paypalRequest(env, `/v1/billing/plans/${encodeURIComponent(id)}`, { method: "GET" }, config);
    const cycles = Array.isArray(plan?.billing_cycles) ? plan.billing_cycles : [];
    const regular = cycles.find(cycle => String(cycle?.tenure_type || "").toUpperCase() === "REGULAR") || cycles[0] || null;
    const fixed = regular?.pricing_scheme?.fixed_price || null;
    const amount = cleanMoneyValue(fixed?.value || "");
    const currency = String(fixed?.currency_code || "").toUpperCase().slice(0, 8);
    return { amount, currency };
  } catch {
    return { amount: "", currency: "" };
  }
}

function raptorPricingTierFromPrice(amount = "") {
  const price = Number(amount || 0);
  if (Math.abs(price - 17.99) < 0.01) return "referral";
  if (Math.abs(price - 24.99) < 0.01) return "standard";
  return "legacy";
}

async function freshAdminUser(env, userId) {
  const users = await listAdminUsers(env);
  return users.find(user => String(user.id) === String(userId)) || null;
}


async function handleAdminUserTestControls(request, env, userId) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  const user = await env.DB.prepare("SELECT id,name,email FROM users WHERE id=? LIMIT 1").bind(userId).first();
  if (!user) return json({ error: "User not found." }, 404);

  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }

  const enabled = body.enabled === true ? 1 : 0;
  const simulatePaidOnce = body.simulatePaidOnce === true ? 1 : 0;
  const chatEnabled = body.chatEnabled === true ? 1 : 0;
  const telegramEnabled = body.telegramEnabled === true ? 1 : 0;
  const membershipStatus = normalizeTestMembershipStatus(body.membershipStatus);
  const lifetimeEnabled = body.lifetimeEnabled === true ? 1 : 0;
  const purchasedSectionEnabled = body.purchasedSectionEnabled === true ? 1 : 0;
  let lifetimeStoryId = String(body.lifetimeStoryId || "").trim().slice(0,120);

  if (lifetimeEnabled) {
    if (!lifetimeStoryId) return json({ error: "Choose a story for the simulated Lifetime access." }, 400);
    const story = await env.DB.prepare("SELECT id FROM stories WHERE id=? LIMIT 1").bind(lifetimeStoryId).first();
    if (!story) return json({ error: "Selected test Lifetime story was not found." }, 404);
  } else lifetimeStoryId = "";

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO user_test_overrides(
      user_id,enabled,simulate_paid_once,chat_enabled,telegram_enabled,membership_status,
      lifetime_enabled,lifetime_story_id,purchased_section_enabled,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      enabled=excluded.enabled,
      simulate_paid_once=excluded.simulate_paid_once,
      chat_enabled=excluded.chat_enabled,
      telegram_enabled=excluded.telegram_enabled,
      membership_status=excluded.membership_status,
      lifetime_enabled=excluded.lifetime_enabled,
      lifetime_story_id=excluded.lifetime_story_id,
      purchased_section_enabled=excluded.purchased_section_enabled,
      updated_at=excluded.updated_at`)
      .bind(userId,enabled,simulatePaidOnce,chatEnabled,telegramEnabled,membershipStatus,
        lifetimeEnabled,lifetimeStoryId || null,purchasedSectionEnabled,now,now),
    env.DB.prepare(`INSERT INTO activity_log(type,title,detail,created_at) VALUES('system',?,?,?)`)
      .bind(
        enabled ? "Test Account Mode enabled" : "Test Account Mode disabled",
        `${user.email} · membership=${membershipStatus} · paid-once=${Boolean(simulatePaidOnce)} · chat=${Boolean(chatEnabled)} · Telegram=${Boolean(telegramEnabled)} · lifetime=${Boolean(lifetimeEnabled)}. No Finance/payment records changed.`,
        now
      )
  ]);

  return json({ ok:true, user:await freshAdminUser(env,userId), testModeEnabled:Boolean(enabled) });
}

async function handleAdminUserPaypalAttach(request, env, userId) {
  const user = await env.DB.prepare("SELECT * FROM users WHERE id=? LIMIT 1").bind(userId).first();
  if (!user) return json({ error: "User not found." }, 404);

  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }

  const subscriptionId = String(body.subscriptionId || "").trim().toUpperCase();
  if (!/^I-[A-Z0-9]+$/.test(subscriptionId)) {
    return json({ error: "Enter a valid PayPal subscription ID beginning with I-." }, 400);
  }

  const currentOwner = await env.DB.prepare(`SELECT user_id FROM member_subscriptions
    WHERE provider_subscription_id=? LIMIT 1`).bind(subscriptionId).first().catch(() => null);
  if (currentOwner?.user_id && String(currentOwner.user_id) !== String(userId)) {
    return json({ error: "That PayPal subscription is already linked to another OX user." }, 409);
  }

  const claimed = await env.DB.prepare(`SELECT ox_user_id FROM raptor_migration_claims
    WHERE provider_subscription_id=? LIMIT 1`).bind(subscriptionId).first().catch(() => null);
  if (claimed?.ox_user_id && String(claimed.ox_user_id) !== String(userId)) {
    return json({ error: "That RAPTOR subscription is already claimed by another OX user." }, 409);
  }

  const config = await getPaypalSettings(env);
  if (String(config.mode || "").toLowerCase() !== "live") {
    return json({ error: "Manual real-customer PayPal repair requires OX PayPal Live mode." }, 409);
  }
  if (!config.clientId || !config.secretConfigured) {
    return json({ error: "OX PayPal Live credentials are not configured." }, 409);
  }

  let details;
  try {
    details = await fetchPaypalSubscription(env, subscriptionId, config);
  } catch (error) {
    return json({ error: error.message || "PayPal could not verify this subscription ID." }, 400);
  }

  const verifiedStatus = String(details.status || "UNKNOWN").toUpperCase();
  const paypalCustomId = String(details.custom_id || "").trim().slice(0, 120);
  const planId = String(details.plan_id || "").trim();
  const planPrice = await paypalPlanRecurringPrice(env, planId, config);
  const manualPrice = cleanMoneyValue(body.legacyPrice || "");
  const verifiedOrManualPrice = planPrice.amount || manualPrice;
  const isRaptorLegacy = /^\d+$/.test(paypalCustomId);

  let tierId = String(body.tierId || "").trim();
  let tier = null;
  if (tierId) tier = await env.DB.prepare("SELECT id,name,price,status FROM membership_tiers WHERE id=? LIMIT 1").bind(tierId).first();

  if (!tier && planId) {
    const mapped = await env.DB.prepare(`SELECT mt.id,mt.name,mt.price,mt.status
      FROM membership_payment_plans mpp
      JOIN membership_tiers mt ON mt.id=mpp.tier_id
      WHERE mpp.provider='paypal' AND mpp.external_plan_id=? LIMIT 1`).bind(planId).first().catch(() => null);
    if (mapped) tier = mapped;
  }

  if (!tier && isRaptorLegacy) {
    tier = await resolveRaptorMigrationTier(env, {
      price: verifiedOrManualPrice,
      pricingTier: raptorPricingTierFromPrice(verifiedOrManualPrice)
    });
  }

  if (!tier) {
    tier = await env.DB.prepare(`SELECT id,name,price,status FROM membership_tiers
      ORDER BY CASE status WHEN 'Published' THEN 0 ELSE 1 END, sort_order ASC LIMIT 1`).first().catch(() => null);
  }

  if (!tier) return json({ error: "No OX membership tier is available to attach this subscription to." }, 409);

  const now = new Date().toISOString();
  const existingMigration = await env.DB.prepare(`SELECT claimed_at FROM raptor_migration_claims
    WHERE provider_subscription_id=? LIMIT 1`).bind(subscriptionId).first().catch(() => null);

  // A numeric PayPal custom_id is how legacy RAPTOR subscriptions identify their
  // old WordPress user. Record the migration relationship so RAPTOR PayPal
  // webhooks continue updating this repaired OX account in the future.
  if (isRaptorLegacy) {
    const raptorPrice = verifiedOrManualPrice || cleanMoneyValue(String(user.latest_amount || ""));
    await env.DB.prepare(`INSERT INTO raptor_migration_claims(
      provider_subscription_id,raptor_user_id,ox_user_id,raptor_plan,raptor_pricing_tier,raptor_price,
      paypal_plan_id,paypal_status,next_billing_at,claimed_at,last_verified_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(provider_subscription_id) DO UPDATE SET
      raptor_user_id=excluded.raptor_user_id,
      ox_user_id=excluded.ox_user_id,
      raptor_plan=excluded.raptor_plan,
      raptor_pricing_tier=excluded.raptor_pricing_tier,
      raptor_price=CASE WHEN excluded.raptor_price<>'' THEN excluded.raptor_price ELSE raptor_migration_claims.raptor_price END,
      paypal_plan_id=excluded.paypal_plan_id,
      paypal_status=excluded.paypal_status,
      next_billing_at=excluded.next_billing_at,
      last_verified_at=excluded.last_verified_at`)
      .bind(
        subscriptionId, paypalCustomId, userId, "RAPTOR Membership · Admin Repair",
        raptorPricingTierFromPrice(raptorPrice), raptorPrice, planId, verifiedStatus,
        details.billing_info?.next_billing_time || null, existingMigration?.claimed_at || now, now
      ).run();
  }

  const saved = await savePaypalSubscription(env, userId, tier.id, details, {
    paymentCompleted: false,
    environment: "live"
  });

  if (verifiedOrManualPrice) {
    await env.DB.prepare(`UPDATE users SET latest_amount=?,payment_status=CASE
      WHEN ?='ACTIVE' THEN 'Paid'
      WHEN ?='CANCELLED' THEN 'Cancelled'
      WHEN ?='EXPIRED' THEN 'Expired'
      ELSE payment_status END,updated_at=? WHERE id=?`)
      .bind(`$${verifiedOrManualPrice}`, verifiedStatus, verifiedStatus, verifiedStatus, now, userId).run();
  }

  await markUserPaidOnce(env, userId, saved.lastPaymentAt || details.start_time || now, "live").catch(() => null);

  const detail = `${user.email} · ${subscriptionId} · ${verifiedStatus} · ${tier.name}${verifiedOrManualPrice ? ` · $${verifiedOrManualPrice}` : ""}${isRaptorLegacy ? " · RAPTOR legacy repaired" : ""}.`;
  await env.DB.prepare(`INSERT INTO activity_log(type,title,detail,created_at)
    VALUES('payment','PayPal subscription manually attached',?,?)`).bind(detail, now).run().catch(() => null);
  await createAdminNotification(env, {
    type: "payment",
    title: isRaptorLegacy ? "RAPTOR subscription repaired" : "PayPal subscription attached",
    body: `${user.name || user.email} · ${subscriptionId} · ${verifiedStatus}`,
    route: "users",
    userId,
    relatedKey: `admin-paypal-attach:${subscriptionId}:${now.slice(0,16)}`,
    dedupeMinutes: 1
  }).catch(() => null);

  return json({
    ok: true,
    user: await freshAdminUser(env, userId),
    subscription: {
      subscriptionId,
      status: verifiedStatus,
      planId,
      planAmount: verifiedOrManualPrice || null,
      currency: planPrice.currency || "USD",
      paypalCustomId: paypalCustomId || null,
      raptorLegacy: isRaptorLegacy,
      tierId: tier.id,
      tierName: tier.name,
      nextBillingAt: saved.nextBilling || null,
      lastPaymentAt: saved.lastPaymentAt || null
    }
  });
}

async function handleAdminUserPaypalDetach(request, env, userId) {
  const user = await env.DB.prepare("SELECT id,name,email FROM users WHERE id=? LIMIT 1").bind(userId).first();
  if (!user) return json({ error: "User not found." }, 404);

  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  let subscriptionId = String(body.subscriptionId || "").trim().toUpperCase();

  if (!subscriptionId) {
    const latest = await env.DB.prepare(`SELECT provider_subscription_id FROM member_subscriptions
      WHERE provider='paypal' AND user_id=? ORDER BY updated_at DESC LIMIT 1`).bind(userId).first().catch(() => null);
    subscriptionId = String(latest?.provider_subscription_id || "").trim().toUpperCase();
  }

  if (!subscriptionId) return json({ error: "No PayPal subscription is linked to this user." }, 404);

  const owner = await env.DB.prepare(`SELECT user_id FROM member_subscriptions
    WHERE provider_subscription_id=? AND provider='paypal' LIMIT 1`).bind(subscriptionId).first().catch(() => null);
  if (!owner || String(owner.user_id) !== String(userId)) {
    return json({ error: "That PayPal subscription is not linked to this user." }, 404);
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM member_subscriptions
      WHERE provider='paypal' AND provider_subscription_id=? AND user_id=?`).bind(subscriptionId, userId),
    env.DB.prepare(`DELETE FROM raptor_migration_claims
      WHERE provider_subscription_id=? AND ox_user_id=?`).bind(subscriptionId, userId),
    env.DB.prepare(`INSERT INTO activity_log(type,title,detail,created_at)
      VALUES('payment','PayPal subscription detached',?,?)`)
      .bind(`${user.email} · ${subscriptionId} detached from OX. PayPal billing was NOT cancelled.`, now)
  ]);

  return json({
    ok: true,
    user: await freshAdminUser(env, userId),
    detachedSubscriptionId: subscriptionId,
    paypalCancelled: false
  });
}

async function recomputePaidOnceAfterAdminCorrection(env, userId) {
  const id = String(userId || "").trim();
  if (!id) return;
  await env.DB.prepare("UPDATE users SET paid_once_at=NULL WHERE id=?").bind(id).run().catch(() => null);
  await syncPaidOnceForUser(env, id).catch(() => null);
}

async function handleAdminLifetimePurchaseHardDelete(env, purchaseId) {
  const id = String(purchaseId || "").trim().slice(0, 160);
  if (!id) return json({ error: "Lifetime purchase id is required." }, 400);

  const purchase = await env.DB.prepare(`SELECT * FROM story_lifetime_purchases WHERE id=? LIMIT 1`)
    .bind(id).first().catch(() => null);
  if (!purchase) return json({ error: "Lifetime purchase record not found." }, 404);

  const now = new Date().toISOString();
  const captureId = String(purchase.paypal_capture_id || "").trim();
  const orderId = String(purchase.paypal_order_id || "").trim();
  const provider = String(purchase.provider || "").toLowerCase();
  const environment = String(purchase.environment || "").toLowerCase();
  const userId = String(purchase.user_id || "").trim();
  const permanentStoryId = String(purchase.permanent_story_id || "").trim();

  const eventIds = [];
  if (captureId) {
    const eventRows = await env.DB.prepare(`SELECT id FROM payment_events
      WHERE provider_event_id=? OR (event_type='OX.LIFETIME_STORY.COMPLETED' AND provider_event_id=?)`)
      .bind(`LIFETIME:${captureId}`, captureId).all().catch(() => ({ results: [] }));
    for (const row of eventRows.results || []) eventIds.push(Number(row.id));
  }

  const statements = [];

  // Remove the purchase first: this removes the user's lifetime entitlement and
  // the Lifetime Purchases/Gross Recorded amount.
  statements.push(env.DB.prepare("DELETE FROM story_lifetime_purchases WHERE id=?").bind(id));

  // PayPal lifetime purchases create a Finance payment_event. Remove that exact
  // lifetime event so an Admin test/mistake can be erased from Finance too.
  if (captureId) {
    statements.push(env.DB.prepare(`DELETE FROM payment_events
      WHERE provider_event_id=? AND event_type='OX.LIFETIME_STORY.COMPLETED'`).bind(`LIFETIME:${captureId}`));
  }

  // Clean exact PayPal checkout rows for this purchase. This does NOT issue a
  // refund and does not contact PayPal.
  if (orderId || captureId) {
    statements.push(env.DB.prepare(`DELETE FROM lifetime_story_checkout_sessions
      WHERE (?<>'' AND paypal_order_id=?) OR (?<>'' AND paypal_capture_id=?)`)
      .bind(orderId, orderId, captureId, captureId));
  }

  // Dodo is only test-mode in the current OX project. Remove completed test
  // checkout rows for the same user/story so a deliberate test cleanup is clean.
  if (provider === "dodo" && environment === "test_mode" && userId && permanentStoryId) {
    statements.push(env.DB.prepare(`DELETE FROM dodo_lifetime_checkout_sessions
      WHERE user_id=? AND permanent_story_id=? AND environment='test_mode'
        AND status IN ('COMPLETED','DUPLICATE_COMPLETED')`).bind(userId, permanentStoryId));
  }

  for (const eventId of eventIds) {
    statements.push(env.DB.prepare("DELETE FROM finance_record_overrides WHERE record_key=?").bind(`event:${eventId}`));
  }

  statements.push(env.DB.prepare(`INSERT INTO activity_log(type,title,detail,created_at)
    VALUES('payment','Lifetime purchase record removed',?,?)`)
    .bind(`${purchase.user_email_snapshot || userId || "Deleted user"} · ${purchase.original_title || "Purchased story"} · ${provider || "unknown"} ${environment || ""} · Admin hard delete. No refund was sent.`, now));

  await env.DB.batch(statements);

  if (userId) await recomputePaidOnceAfterAdminCorrection(env, userId);

  return json({
    ok: true,
    deleted: 1,
    purchaseId: id,
    userId: userId || null,
    story: purchase.original_title || "Purchased story",
    provider,
    environment,
    financeEventRemoved: Boolean(captureId),
    refundSent: false
  });
}

async function listAdminUsers(env) {
  if (!(await authTablesReady(env))) return [];
  await ensureUserClientContextTable(env);
  const [result, subscriptions, lifetimePurchases, telegramConnections, testOverrides] = await Promise.all([
    env.DB.prepare(`SELECT u.*, c.timezone AS user_timezone
      FROM users u LEFT JOIN user_client_context c ON c.user_id=u.id
      ORDER BY u.created_at DESC, u.email ASC`).all(),
    env.DB.prepare(`SELECT * FROM member_subscriptions WHERE provider='paypal' ORDER BY updated_at DESC`).all().catch(() => ({ results: [] })),
    env.DB.prepare(`SELECT lp.user_id,lp.id AS purchase_id,lp.original_title,lp.amount,lp.currency,lp.purchase_status,lp.entitlement_status,lp.purchased_at,
      p.current_story_id,p.state AS product_state,s.title AS current_title
      FROM story_lifetime_purchases lp
      JOIN lifetime_story_products p ON p.id=lp.permanent_story_id
      LEFT JOIN stories s ON s.id=p.current_story_id
      WHERE lp.user_id IS NOT NULL ORDER BY lp.purchased_at DESC`).all().catch(() => ({ results: [] })),
    env.DB.prepare(`SELECT * FROM telegram_connections`).all().catch(() => ({ results: [] })),
    env.DB.prepare(`SELECT * FROM user_test_overrides`).all().catch(() => ({ results: [] }))
  ]);
  const byUser = new Map();
  for (const subscription of subscriptions.results || []) {
    if (!byUser.has(subscription.user_id)) byUser.set(subscription.user_id, subscription);
  }
  const testByUser = new Map();
  for (const override of testOverrides.results || []) {
    if (override?.user_id) testByUser.set(String(override.user_id), override);
  }
  const telegramByUser = new Map();
  for (const connection of telegramConnections.results || []) {
    if (connection?.user_id) telegramByUser.set(String(connection.user_id), connection);
  }
  const lifetimeByUser = new Map();
  for (const purchase of lifetimePurchases.results || []) {
    const userId = String(purchase.user_id || "");
    if (!userId) continue;
    if (!lifetimeByUser.has(userId)) lifetimeByUser.set(userId, []);
    lifetimeByUser.get(userId).push({
      purchaseId: purchase.purchase_id,
      title: purchase.original_title || purchase.current_title || "Purchased story",
      currentTitle: purchase.current_title || null,
      amount: purchase.amount || "49.00",
      currency: purchase.currency || "USD",
      purchaseStatus: purchase.purchase_status || "Completed",
      entitlementStatus: purchase.entitlement_status || "Active",
      purchasedAt: purchase.purchased_at || null,
      productState: purchase.product_state || "Needs Assignment",
      linked: Boolean(purchase.current_story_id && purchase.product_state === "Active")
    });
  }
  return (result.results || []).map(row => adminUserFromRow(row, byUser.get(row.id) || null, lifetimeByUser.get(String(row.id)) || [], telegramByUser.get(String(row.id)) || null, testByUser.get(String(row.id)) || null));
}

function addDaysIso(baseIso, days) {
  const baseTime = baseIso && new Date(baseIso).getTime() > Date.now() ? new Date(baseIso).getTime() : Date.now();
  return new Date(baseTime + days * 86400000).toISOString();
}

async function updateAdminUser(env, userId, body = {}) {
  const row = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
  if (!row) return { error: "User not found.", status: 404 };

  const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
  const email = normalizeEmail(body.email);
  const account = ["Active", "Blocked"].includes(body.account) ? body.account : row.account_status;
  const membership = ["None", "Active", "Granted", "Expired", "Cancelled"].includes(body.membership) ? body.membership : effectiveMembershipStatus(row);
  let plan = String(body.plan || "None").trim().slice(0, 120) || "None";
  let expiry = null;

  if (name.length < 2) return { error: "Enter a valid user name.", status: 400 };
  if (!validEmail(email)) return { error: "Enter a valid email address.", status: 400 };
  const duplicate = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND id <> ?").bind(email, userId).first();
  if (duplicate) return { error: "Another account already uses this email.", status: 409 };

  if (body.expiry) {
    const parsed = new Date(`${String(body.expiry).slice(0, 10)}T23:59:59.999Z`);
    if (!Number.isFinite(parsed.getTime())) return { error: "Enter a valid expiry date.", status: 400 };
    expiry = parsed.toISOString();
  }
  if (["None", "Cancelled"].includes(membership)) {
    expiry = null;
    if (!plan || plan === row.membership_plan) plan = "None";
  }

  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE users SET
    name=?, email=?, account_status=?, membership_status=?, membership_plan=?, membership_expires_at=?, updated_at=?
    WHERE id=?`).bind(name, email, account, membership, plan, expiry, now, userId).run();
  if (account === "Blocked") await env.DB.prepare("DELETE FROM user_sessions WHERE user_id=?").bind(userId).run();

  const detail = `${email} account details were edited.`;
  await env.DB.prepare("INSERT INTO activity_log (type,title,detail,created_at) VALUES ('user','User edited',?,?)").bind(detail, now).run();
  return { user: await freshAdminUser(env, userId), detail };
}

async function deleteAdminUsers(env, ids = []) {
  ids = [...new Set(ids.map(v => String(v || "").trim()).filter(Boolean))].slice(0, 500);
  if (!ids.length) return { error: "Select at least one user.", status: 400 };
  const placeholders = ids.map(() => "?").join(",");
  const existing = await env.DB.prepare(`SELECT id,name,email FROM users WHERE id IN (${placeholders})`).bind(...ids).all();
  const rows = existing.results || [];
  if (!rows.length) return { deleted: 0 };
  const realIds = rows.map(r => r.id);
  const realPlaceholders = realIds.map(() => "?").join(",");
  const profileKeys = realIds.map(id => `user-profile-${id}`);
  const profilePlaceholders = profileKeys.map(() => "?").join(",");
  const now = new Date().toISOString();
  await ensureMediaAssetsTable(env);

  // Preserve the member identity on historical payment rows before removing the
  // account. This lets real Live transactions remain auditable in Finance.
  for (const row of rows) {
    try {
      await env.DB.prepare(`UPDATE payment_events
        SET user_name_snapshot=CASE WHEN user_name_snapshot='' THEN ? ELSE user_name_snapshot END,
            user_email_snapshot=CASE WHEN user_email_snapshot='' THEN ? ELSE user_email_snapshot END
        WHERE user_id=?`).bind(row.name || "Deleted user", row.email || "", row.id).run();
    } catch {}
  }

  // User-specific notifications are attention items, not audit history, so they
  // disappear with the account. Activity Log intentionally remains.
  await env.DB.prepare(`DELETE FROM admin_notifications WHERE user_id IN (${realPlaceholders})`).bind(...realIds).run().catch(() => null);

  // Remove only Sandbox/test Finance rows with the deleted account. Live and
  // unknown historical transactions stay for accounting and are detached by the
  // payment_events foreign key when the user row is deleted.
  await env.DB.prepare(`DELETE FROM payment_events
    WHERE user_id IN (${realPlaceholders})
      AND (
        LOWER(COALESCE(environment,''))='sandbox'
        OR EXISTS (
          SELECT 1 FROM finance_record_overrides f
          WHERE f.record_key=('event:' || payment_events.id)
            AND LOWER(COALESCE(f.environment,''))='sandbox'
        )
      )`).bind(...realIds).run().catch(() => null);

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM user_sessions WHERE user_id IN (${realPlaceholders})`).bind(...realIds),
    env.DB.prepare(`DELETE FROM media_assets WHERE asset_key IN (${profilePlaceholders})`).bind(...profileKeys),
    env.DB.prepare(`DELETE FROM users WHERE id IN (${realPlaceholders})`).bind(...realIds),
    env.DB.prepare("INSERT INTO activity_log (type,title,detail,created_at) VALUES ('user','Users deleted',?,?)")
      .bind(`${rows.length} user account${rows.length === 1 ? "" : "s"} permanently deleted: ${rows.map(r => r.email).filter(Boolean).slice(0, 8).join(", ") || "account data"}.`, now)
  ]);

  // Drop Finance presentation overrides for Sandbox rows removed above.
  await env.DB.prepare(`DELETE FROM finance_record_overrides
    WHERE record_key LIKE 'event:%'
      AND NOT EXISTS (SELECT 1 FROM payment_events p WHERE ('event:' || p.id)=finance_record_overrides.record_key)`).run().catch(() => null);
  return { deleted: rows.length };
}

async function applyAdminUserAction(env, userId, action) {
  const row = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
  if (!row) return { error: "User not found.", status: 404 };

  const now = new Date().toISOString();
  let detail = "";

  if (action === "grant") {
    const expiresAt = addDaysIso(null, 30);
    await env.DB.prepare(`UPDATE users SET
      account_status='Active', membership_status='Granted', membership_tier_id=NULL,
      membership_plan='Admin Grant', membership_started_at=COALESCE(membership_started_at,?),
      membership_expires_at=?, payment_status='Not Required', latest_amount='$0.00', updated_at=?
      WHERE id=?`).bind(now, expiresAt, now, userId).run();
    detail = `${row.email} received 30 days of granted membership.`;
  } else if (action === "extend") {
    const nextStatus = ["Active", "Granted"].includes(row.membership_status) ? row.membership_status : "Granted";
    const nextPlan = row.membership_plan && row.membership_plan !== "None" ? row.membership_plan : "Admin Grant";
    const expiresAt = addDaysIso(row.membership_expires_at, 30);
    await env.DB.prepare(`UPDATE users SET
      account_status='Active', membership_status=?, membership_plan=?,
      membership_started_at=COALESCE(membership_started_at,?), membership_expires_at=?,
      payment_status=CASE WHEN ?='Granted' THEN 'Not Required' ELSE payment_status END,
      updated_at=? WHERE id=?`)
      .bind(nextStatus, nextPlan, now, expiresAt, nextStatus, now, userId).run();
    detail = `${row.email} membership extended by 30 days.`;
  } else if (action === "cancel") {
    await env.DB.prepare(`UPDATE users SET membership_status='Cancelled', membership_expires_at=NULL,
      payment_status='Cancelled', updated_at=? WHERE id=?`).bind(now, userId).run();
    detail = `${row.email} membership access was cancelled.`;
  } else if (action === "unlock-chat") {
    await env.DB.prepare("UPDATE users SET manual_chat_unlocked_at=COALESCE(manual_chat_unlocked_at,?),updated_at=? WHERE id=?").bind(now, now, userId).run();
    detail = row.email + " received a manual Chat access grant. No payment or membership record was changed.";
  } else if (action === "block") {
    const next = row.account_status === "Blocked" ? "Active" : "Blocked";
    await env.DB.prepare("UPDATE users SET account_status=?, updated_at=? WHERE id=?").bind(next, now, userId).run();
    if (next === "Blocked") await env.DB.prepare("DELETE FROM user_sessions WHERE user_id=?").bind(userId).run();
    detail = `${row.email} was ${next === "Blocked" ? "blocked" : "unblocked"}.`;
  } else {
    return { error: "Unknown user action.", status: 400 };
  }

  await env.DB.prepare("INSERT INTO activity_log (type,title,detail,created_at) VALUES ('user','User status changed',?,?)")
    .bind(detail, now).run();

  const notificationTitle = action === "grant" ? "Membership granted"
    : action === "extend" ? "Membership extended"
    : action === "cancel" ? "Membership access cancelled"
    : action === "unlock-chat" ? "Chat access manually unlocked"
    : row.account_status === "Blocked" ? "User unblocked" : "User blocked";
  await createAdminNotification(env, {
    type: "user", title: notificationTitle, body: detail, route: "users", userId,
    relatedKey: `admin-user-action:${userId}:${action}:${now}`
  });

  const updated = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
  return { user: adminUserFromRow(updated), detail };
}


async function ensureUserClientContextTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_client_context (
    user_id TEXT PRIMARY KEY,
    timezone TEXT NOT NULL DEFAULT '',
    locale TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
}

function validIanaTimezone(value = "") {
  const timezone = String(value || "").trim().slice(0, 100);
  if (!timezone || !/^[A-Za-z0-9_+\-]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(timezone)) return "";
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date()); return timezone; } catch { return ""; }
}

async function handleMemberClientContext(request, env) {
  const row = await getCurrentUser(request, env);
  if (!row) return json({ error: "Log in to update your member context." }, 401);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const timezone = validIanaTimezone(body.timezone);
  if (!timezone) return json({ error: "A valid browser timezone is required." }, 400);
  const locale = String(body.locale || "").trim().slice(0, 40);
  const now = new Date().toISOString();
  await ensureUserClientContextTable(env);
  await env.DB.prepare(`INSERT INTO user_client_context(user_id,timezone,locale,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET timezone=excluded.timezone,locale=excluded.locale,updated_at=excluded.updated_at`)
    .bind(row.id, timezone, locale, now).run();
  return json({ ok: true, timezone });
}

async function memberProfileAssetKey(request, env) {
  const row = await getCurrentUser(request, env);
  if (!row) return null;
  return `user-profile-${row.id}`;
}
async function handleMemberProfileUpload(request, env) {
  const key = await memberProfileAssetKey(request, env);
  if (!key) return json({ error: "Log in to change your profile picture." }, 401);
  return uploadMediaAsset(request, env, key);
}
async function handleMemberProfileDelete(request, env) {
  const key = await memberProfileAssetKey(request, env);
  if (!key) return json({ error: "Log in to change your profile picture." }, 401);
  return deleteMediaAsset(env, key);
}


function chatMessageFromRow(row) {
  if (!row) return null;
  const state = row.seen_at ? "seen" : (row.delivered_at ? "delivered" : "sent");
  return {
    id: Number(row.id),
    sender: row.sender_role,
    body: row.body,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at || null,
    seenAt: row.seen_at || null,
    state
  };
}

function cleanChatBody(value) {
  return String(value || "").replace(/\r\n?/g, "\n").trim().slice(0, 2000);
}

async function userHasActiveLifetimePurchase(env, userId) {
  if (!userId) return false;
  try {
    const row = await env.DB.prepare(`SELECT id FROM story_lifetime_purchases
      WHERE user_id=? AND purchase_status='Completed' AND entitlement_status='Active'
      ORDER BY purchased_at DESC LIMIT 1`).bind(userId).first();
    return Boolean(row);
  } catch {
    return false;
  }
}


const TELEGRAM_BOT_USERNAME = "OXNovelsBackupBot";
const TELEGRAM_CHANNEL_TITLE = "OX Novels Backup";
const TELEGRAM_LINK_TTL_MINUTES = 15;
const TELEGRAM_INVITE_TTL_MINUTES = 30;

function telegramConfigured(env) {
  return Boolean(
    String(env.TELEGRAM_BOT_TOKEN || "").trim() &&
    String(env.TELEGRAM_CHANNEL_ID || "").trim() &&
    String(env.TELEGRAM_WEBHOOK_SECRET || "").trim()
  );
}

function telegramChannelId(env) {
  return String(env.TELEGRAM_CHANNEL_ID || "").trim();
}

function telegramMemberIsJoined(status = "") {
  return ["member","administrator","creator","restricted"].includes(String(status || "").toLowerCase());
}

function telegramPublicConnection(row) {
  if (!row) {
    return {
      connected: false,
      joined: false,
      status: "not_connected",
      username: "",
      firstName: "",
      linkedAt: null,
      joinedAt: null,
      leftAt: null
    };
  }
  return {
    connected: true,
    joined: String(row.status || "") === "joined",
    status: row.status || "linked",
    username: row.telegram_username || "",
    firstName: row.telegram_first_name || "",
    linkedAt: row.linked_at || null,
    joinedAt: row.joined_at || null,
    leftAt: row.left_at || null
  };
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function telegramSha256Hex(value = "") {
  const data = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function telegramApi(env, method, payload = {}) {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) throw new Error("Telegram bot token is not configured.");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok || body.ok !== true) {
    throw new Error(body.description || `Telegram ${method} failed.`);
  }
  return body.result;
}

async function telegramSendText(env, chatId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    text: String(text || "").slice(0, 3900),
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return telegramApi(env, "sendMessage", payload);
}

async function telegramActualMembership(env, telegramUserId) {
  if (!telegramConfigured(env) || !telegramUserId) return "";
  try {
    const member = await telegramApi(env, "getChatMember", {
      chat_id: telegramChannelId(env),
      user_id: Number(telegramUserId)
    });
    return String(member?.status || "").toLowerCase();
  } catch {
    return "";
  }
}

async function telegramRefreshConnectionStatus(env, connection, { force = false } = {}) {
  if (!connection?.telegram_user_id || !telegramConfigured(env)) return connection;

  const lastChecked = connection.last_checked_at
    ? new Date(connection.last_checked_at).getTime()
    : 0;

  // Normal background checks stay throttled for performance.
  // A customer returning from Telegram can explicitly force one real check.
  if (!force && lastChecked && Date.now() - lastChecked < 5 * 60 * 1000) {
    return connection;
  }

  const actual = await telegramActualMembership(env, connection.telegram_user_id);
  if (!actual) return connection;

  const now = new Date().toISOString();
  const joined = telegramMemberIsJoined(actual);
  const nextStatus = joined
    ? "joined"
    : (connection.status === "linked" ? "linked" : "left");

  await env.DB.prepare(`UPDATE telegram_connections SET
    status=?,
    joined_at=CASE WHEN ?='joined' THEN COALESCE(joined_at,?) ELSE joined_at END,
    left_at=CASE WHEN ?='left' THEN COALESCE(left_at,?) ELSE left_at END,
    last_checked_at=?,
    updated_at=?
    WHERE user_id=?`)
    .bind(
      nextStatus,
      nextStatus,
      now,
      nextStatus,
      now,
      now,
      now,
      connection.user_id
    ).run();

  return {
    ...connection,
    status: nextStatus,
    joined_at: nextStatus === "joined"
      ? (connection.joined_at || now)
      : connection.joined_at,
    left_at: nextStatus === "left"
      ? (connection.left_at || now)
      : connection.left_at,
    last_checked_at: now,
    updated_at: now
  };
}

async function handleTelegramStatus(request, env) {
  const auth = await activeChatMember(request, env);
  if (auth.error) return auth.error;

  const access = auth.access || await userAccessContext(env, auth.user);
  if (!access.telegramEligible) {
    return json({
      error: "Telegram Backup is not enabled for this account.",
      code: "TELEGRAM_NOT_ELIGIBLE"
    }, 403);
  }

  const requestUrl = new URL(request.url);
  const force = requestUrl.searchParams.get("force") === "1";

  let connection = await env.DB.prepare(
    `SELECT * FROM telegram_connections WHERE user_id=? LIMIT 1`
  ).bind(auth.user.id).first().catch(() => null);

  if (connection) {
    connection = await telegramRefreshConnectionStatus(
      env,
      connection,
      { force }
    );
  }

  return json({
    ok: true,
    eligible: true,
    configured: telegramConfigured(env),
    botUsername: TELEGRAM_BOT_USERNAME,
    channelTitle: TELEGRAM_CHANNEL_TITLE,
    connection: telegramPublicConnection(connection)
  }, 200, { "cache-control": "no-store" });
}

async function handleTelegramCreateLink(request, env) {
  const auth = await activeChatMember(request, env);
  if (auth.error) return auth.error;

  const access = auth.access || await userAccessContext(env, auth.user);
  if (!access.telegramEligible) {
    return json({
      error: "Telegram Backup is not enabled for this account.",
      code: "TELEGRAM_NOT_ELIGIBLE"
    }, 403);
  }

  if (!telegramConfigured(env)) {
    return json({ error: "Telegram Backup is not configured yet." }, 503);
  }

  let connection = await env.DB.prepare(
    `SELECT * FROM telegram_connections WHERE user_id=? LIMIT 1`
  ).bind(auth.user.id).first().catch(() => null);

  if (connection) {
    // A user clicking the button expects current Telegram state, so bypass
    // the normal five-minute background throttle for this explicit action.
    connection = await telegramRefreshConnectionStatus(
      env,
      connection,
      { force: true }
    );

    if (String(connection.status || "") === "joined") {
      return json({
        ok: true,
        alreadyJoined: true,
        connection: telegramPublicConnection(connection)
      });
    }

    // Telegram has already been securely linked to this OX account.
    // Do NOT make them run /start again. Give this OX session a fresh,
    // short-lived private channel join-request link.
    if (connection.telegram_user_id) {
      try {
        const invite = await telegramCreateJoinLink(env, auth.user.id);

        return json({
          ok: true,
          mode: String(connection.status || "") === "left"
            ? "rejoin"
            : "finish_joining",
          joinLink: invite.invite_link,
          connection: telegramPublicConnection(connection)
        }, 201);
      } catch (error) {
        console.warn("Unable to create Telegram rejoin link", error);
        return json({
          error: "Unable to create the private Telegram Backup invite right now. Please try again."
        }, 502);
      }
    }
  }

  // First connection: create the one-time secure OX -> Telegram bot token.
  const now = new Date();
  const expires = new Date(
    now.getTime() + TELEGRAM_LINK_TTL_MINUTES * 60 * 1000
  );

  const random = new Uint8Array(24);
  crypto.getRandomValues(random);

  const token = base64Url(random);
  const tokenHash = await telegramSha256Hex(token);

  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM telegram_link_tokens WHERE user_id=? AND used_at IS NULL`
    ).bind(auth.user.id),

    env.DB.prepare(
      `DELETE FROM telegram_link_tokens WHERE expires_at<?`
    ).bind(now.toISOString()),

    env.DB.prepare(
      `INSERT INTO telegram_link_tokens(
        token_hash,user_id,expires_at,used_at,created_at
      ) VALUES(?,?,?,?,?)`
    ).bind(
      tokenHash,
      auth.user.id,
      expires.toISOString(),
      null,
      now.toISOString()
    )
  ]);

  return json({
    ok: true,
    mode: "connect",
    expiresAt: expires.toISOString(),
    deepLink: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(token)}`
  }, 201);
}

async function telegramCreateJoinLink(env, userId) {
  const expireDate = Math.floor(Date.now() / 1000) + TELEGRAM_INVITE_TTL_MINUTES * 60;
  return telegramApi(env, "createChatInviteLink", {
    chat_id: telegramChannelId(env),
    name: `OX backup ${String(userId || "").slice(-12)}`.slice(0, 32),
    expire_date: expireDate,
    creates_join_request: true
  });
}

async function telegramHandleStart(env, message) {
  const telegramUser = message?.from;
  const chatId = message?.chat?.id;
  const text = String(message?.text || "").trim();
  if (!telegramUser?.id || !chatId) return;

  const match = text.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]+))?$/i);
  const token = String(match?.[1] || "").trim();

  if (!token) {
    await telegramSendText(env, chatId,
      "Open OX Novels, go to Member Chat, and tap “Connect Telegram Backup” to securely link this Telegram account.");
    return;
  }

  const tokenHash = await telegramSha256Hex(token);
  const now = new Date().toISOString();
  const tokenRow = await env.DB.prepare(`SELECT t.*,u.name,u.email,u.account_status,u.paid_once_at,
      uto.enabled AS test_enabled,uto.telegram_enabled AS test_telegram_enabled
    FROM telegram_link_tokens t
    JOIN users u ON u.id=t.user_id
    LEFT JOIN user_test_overrides uto ON uto.user_id=u.id
    WHERE t.token_hash=? AND t.used_at IS NULL AND t.expires_at>? LIMIT 1`)
    .bind(tokenHash, now).first().catch(() => null);

  if (!tokenRow) {
    await telegramSendText(env, chatId,
      "This OX Telegram connection link is invalid or expired. Return to OX Novels Member Chat and tap Connect Telegram Backup again.");
    return;
  }

  const tokenTestEligible = testFlag(tokenRow.test_enabled) && testFlag(tokenRow.test_telegram_enabled);
  if ((!tokenRow.paid_once_at && !tokenTestEligible) || tokenRow.account_status !== "Active") {
    await telegramSendText(env, chatId, "Telegram Backup is not enabled for this OX account.");
    return;
  }

  const telegramUserId = String(telegramUser.id);
  const ownedByOther = await env.DB.prepare(`SELECT user_id FROM telegram_connections
    WHERE telegram_user_id=? AND user_id<>? LIMIT 1`).bind(telegramUserId, tokenRow.user_id).first().catch(() => null);
  if (ownedByOther) {
    await telegramSendText(env, chatId,
      "This Telegram account is already linked to another OX account. Contact OX Novels support if you need it reset.");
    return;
  }

  const existing = await env.DB.prepare(`SELECT * FROM telegram_connections WHERE user_id=? LIMIT 1`)
    .bind(tokenRow.user_id).first().catch(() => null);
  if (existing?.telegram_user_id && String(existing.telegram_user_id) !== telegramUserId) {
    await telegramSendText(env, chatId,
      "This OX account is already linked to another Telegram account. Contact OX Novels support to reset the old connection first.");
    return;
  }

  const actualStatus = await telegramActualMembership(env, telegramUserId);
  const alreadyJoined = telegramMemberIsJoined(actualStatus);
  const firstName = String(telegramUser.first_name || "").slice(0, 120);
  const lastName = String(telegramUser.last_name || "").slice(0, 120);
  const username = String(telegramUser.username || "").slice(0, 120);
  const status = alreadyJoined ? "joined" : "linked";

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO telegram_connections(
      user_id,telegram_user_id,telegram_username,telegram_first_name,telegram_last_name,status,
      linked_at,joined_at,left_at,last_join_request_at,last_checked_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      telegram_user_id=excluded.telegram_user_id,
      telegram_username=excluded.telegram_username,
      telegram_first_name=excluded.telegram_first_name,
      telegram_last_name=excluded.telegram_last_name,
      status=excluded.status,
      joined_at=CASE WHEN excluded.status='joined' THEN COALESCE(telegram_connections.joined_at,excluded.joined_at) ELSE telegram_connections.joined_at END,
      left_at=CASE WHEN excluded.status='joined' THEN NULL ELSE telegram_connections.left_at END,
      last_checked_at=excluded.last_checked_at,
      updated_at=excluded.updated_at`)
      .bind(
        tokenRow.user_id, telegramUserId, username, firstName, lastName, status,
        existing?.linked_at || now, alreadyJoined ? (existing?.joined_at || now) : existing?.joined_at || null,
        alreadyJoined ? null : existing?.left_at || null,
        existing?.last_join_request_at || null, now, now
      ),
    env.DB.prepare(`UPDATE telegram_link_tokens SET used_at=? WHERE token_hash=?`).bind(now, tokenHash),
    env.DB.prepare(`DELETE FROM telegram_link_tokens WHERE user_id=? AND token_hash<>?`).bind(tokenRow.user_id, tokenHash),
    env.DB.prepare(`INSERT INTO activity_log(type,title,detail,created_at)
      VALUES('user','Telegram account linked',?,?)`)
      .bind(`${tokenRow.email} linked Telegram ${username ? `@${username}` : telegramUserId}.`, now)
  ]);

  if (alreadyJoined) {
    let openChannelLink = "";

    try {
      const openInvite = await telegramCreateJoinLink(
        env,
        tokenRow.user_id
      );
      openChannelLink = String(openInvite?.invite_link || "");
    } catch {}

    await telegramSendText(
      env,
      chatId,
      "Your Telegram account is securely linked and you are already inside OX Novels Backup ✅\n\nTap below to open the channel.",
      openChannelLink
        ? {
            inline_keyboard: [[{
              text: "Open OX Novels Backup",
              url: openChannelLink
            }]]
          }
        : null
    );

    return;
  }

  try {
    const invite = await telegramCreateJoinLink(env, tokenRow.user_id);
    await telegramSendText(
      env,
      chatId,
      "Your OX account is verified ✅\n\nOne final step: tap the button below to join the private OX Novels Backup channel. Your request will be verified and approved automatically.",
      { inline_keyboard: [[{ text: "Join OX Novels Backup", url: invite.invite_link }]] }
    );
  } catch (error) {
    await telegramSendText(env, chatId,
      "Your OX account is linked, but the private channel invite could not be created. Please try Connect Telegram Backup again shortly.");
  }
}

async function telegramHandleJoinRequest(env, request) {
  const channelId = telegramChannelId(env);
  if (!channelId || String(request?.chat?.id || "") !== channelId) return;

  const telegramUserId = String(request?.from?.id || "");
  if (!telegramUserId) return;

  const now = new Date().toISOString();
  const connection = await env.DB.prepare(`SELECT tc.*,u.account_status,u.paid_once_at,u.email,
      uto.enabled AS test_enabled,uto.telegram_enabled AS test_telegram_enabled
    FROM telegram_connections tc
    JOIN users u ON u.id=tc.user_id
    LEFT JOIN user_test_overrides uto ON uto.user_id=u.id
    WHERE tc.telegram_user_id=? LIMIT 1`).bind(telegramUserId).first().catch(() => null);

  const eligible = Boolean(
    connection?.account_status === "Active" &&
    (connection?.paid_once_at || (testFlag(connection?.test_enabled) && testFlag(connection?.test_telegram_enabled)))
  );
  if (!eligible) {
    await telegramApi(env, "declineChatJoinRequest", {
      chat_id: channelId,
      user_id: Number(telegramUserId)
    }).catch(() => null);
    await telegramSendText(env, Number(request?.user_chat_id || telegramUserId),
      "OX Novels could not verify an eligible paid account for this Telegram profile. Connect Telegram Backup from your OX Member Chat first."
    ).catch(() => null);
    return;
  }

  await telegramApi(env, "approveChatJoinRequest", {
    chat_id: channelId,
    user_id: Number(telegramUserId)
  });

  await env.DB.batch([
    env.DB.prepare(`UPDATE telegram_connections SET
      status='joined',
      joined_at=COALESCE(joined_at,?),
      left_at=NULL,
      last_join_request_at=?,
      last_checked_at=?,
      updated_at=?
      WHERE user_id=?`).bind(now, now, now, now, connection.user_id),
    env.DB.prepare(`INSERT INTO activity_log(type,title,detail,created_at)
      VALUES('user','Telegram Backup joined',?,?)`)
      .bind(`${connection.email} joined ${TELEGRAM_CHANNEL_TITLE}.`, now)
  ]);

  let openChannelLink = "";

  // Create a fresh short-lived invite for the Open Channel button.
  // Because this Telegram user has already been approved, Telegram should
  // open the private channel instead of making them search for it manually.
  try {
    const openInvite = await telegramCreateJoinLink(
      env,
      connection.user_id
    );
    openChannelLink = String(openInvite?.invite_link || "");
  } catch {}

  // Fall back to the exact invite that generated this join request.
  if (!openChannelLink) {
    openChannelLink = String(
      request?.invite_link?.invite_link || ""
    );
  }

  await telegramSendText(
    env,
    Number(telegramUserId),
    "Access approved ✅\n\nYour access is approved and ready. Tap Open OX Novels Backup below to enter the private channel.\n\nWhen you return to OX Novels, the Telegram reminder will disappear automatically.",
    openChannelLink
      ? {
          inline_keyboard: [[{
            text: "Open OX Novels Backup",
            url: openChannelLink
          }]]
        }
      : null
  ).catch(() => null);
}

async function telegramHandleChatMember(env, update) {
  const channelId = telegramChannelId(env);
  if (!channelId || String(update?.chat?.id || "") !== channelId) return;

  const member = update?.new_chat_member;
  const telegramUserId = String(member?.user?.id || "");
  if (!telegramUserId || member?.user?.is_bot) return;

  const connection = await env.DB.prepare(`SELECT tc.*,u.email FROM telegram_connections tc
    JOIN users u ON u.id=tc.user_id WHERE tc.telegram_user_id=? LIMIT 1`)
    .bind(telegramUserId).first().catch(() => null);
  if (!connection) return;

  const newStatus = String(member?.status || "").toLowerCase();
  const joined = telegramMemberIsJoined(newStatus);
  const now = new Date().toISOString();

  await env.DB.prepare(`UPDATE telegram_connections SET
    status=?,
    joined_at=CASE WHEN ?='joined' THEN COALESCE(joined_at,?) ELSE joined_at END,
    left_at=CASE WHEN ?='left' THEN ? ELSE NULL END,
    last_checked_at=?,
    updated_at=?
    WHERE user_id=?`)
    .bind(joined ? "joined" : "left", joined ? "joined" : "left", now,
      joined ? "joined" : "left", now, now, now, connection.user_id).run();

  if (!joined) {
    await env.DB.prepare(`INSERT INTO activity_log(type,title,detail,created_at)
      VALUES('user','Telegram Backup left',?,?)`)
      .bind(`${connection.email} is no longer inside ${TELEGRAM_CHANNEL_TITLE}.`, now).run().catch(() => null);
  }
}

async function handleTelegramWebhook(request, env) {
  const expected = String(env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  const received = String(request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "");
  if (!expected || received !== expected) return new Response("Unauthorized", { status: 401 });

  let update = {};
  try { update = await request.json(); } catch { return new Response("OK"); }

  try {
    if (update.message?.text) await telegramHandleStart(env, update.message);
    if (update.chat_join_request) await telegramHandleJoinRequest(env, update.chat_join_request);
    if (update.chat_member) await telegramHandleChatMember(env, update.chat_member);
  } catch (error) {
    console.warn("Telegram webhook update failed", error);
  }
  return new Response("OK");
}

async function handleAdminTelegramSetupStatus(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);

  const configured = telegramConfigured(env);
  let bot = null;
  let chat = null;
  let botMember = null;
  let webhook = null;

  if (String(env.TELEGRAM_BOT_TOKEN || "").trim()) {
    try { bot = await telegramApi(env, "getMe", {}); } catch {}
    try { webhook = await telegramApi(env, "getWebhookInfo", {}); } catch {}
  }
  if (configured) {
    try { chat = await telegramApi(env, "getChat", { chat_id: telegramChannelId(env) }); } catch {}
    if (bot?.id) {
      try {
        botMember = await telegramApi(env, "getChatMember", {
          chat_id: telegramChannelId(env),
          user_id: bot.id
        });
      } catch {}
    }
  }

  return json({
    ok: true,
    configured,
    bot: bot ? { id: String(bot.id || ""), username: bot.username || "", name: bot.first_name || "" } : null,
    channel: chat ? { id: String(chat.id || ""), title: chat.title || "" } : null,
    canInviteUsers: Boolean(botMember?.can_invite_users),
    botAdminStatus: botMember?.status || null,
    webhook: webhook ? {
      url: webhook.url || "",
      pendingUpdateCount: Number(webhook.pending_update_count || 0),
      lastErrorMessage: webhook.last_error_message || "",
      allowedUpdates: Array.isArray(webhook.allowed_updates) ? webhook.allowed_updates : []
    } : null
  });
}

async function handleAdminTelegramSetup(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  if (!telegramConfigured(env)) {
    return json({ error: "Set TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID and TELEGRAM_WEBHOOK_SECRET first." }, 409);
  }

  const bot = await telegramApi(env, "getMe", {});
  const chat = await telegramApi(env, "getChat", { chat_id: telegramChannelId(env) });
  const botMember = await telegramApi(env, "getChatMember", {
    chat_id: telegramChannelId(env),
    user_id: bot.id
  });
  if (!["administrator","creator"].includes(String(botMember?.status || "").toLowerCase()) || !botMember?.can_invite_users) {
    return json({ error: "The bot must be a channel administrator with Invite Users via Link enabled." }, 409);
  }

  const origin = new URL(request.url).origin;
  const webhookUrl = `${origin}/api/telegram/webhook`;
  await telegramApi(env, "setWebhook", {
    url: webhookUrl,
    secret_token: String(env.TELEGRAM_WEBHOOK_SECRET),
    allowed_updates: ["message","chat_join_request","chat_member","my_chat_member"],
    drop_pending_updates: false
  });

  const webhook = await telegramApi(env, "getWebhookInfo", {});
  return json({
    ok: true,
    bot: { username: bot.username || "", name: bot.first_name || "" },
    channel: { id: String(chat.id || ""), title: chat.title || "" },
    canInviteUsers: Boolean(botMember?.can_invite_users),
    webhook: {
      url: webhook.url || "",
      pendingUpdateCount: Number(webhook.pending_update_count || 0),
      lastErrorMessage: webhook.last_error_message || "",
      allowedUpdates: Array.isArray(webhook.allowed_updates) ? webhook.allowed_updates : []
    }
  });
}

async function handleAdminTelegramReset(request, env, userId) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  const user = await env.DB.prepare("SELECT id,email FROM users WHERE id=? LIMIT 1").bind(userId).first();
  if (!user) return json({ error: "User not found." }, 404);

  const connection = await env.DB.prepare(`SELECT * FROM telegram_connections WHERE user_id=? LIMIT 1`)
    .bind(userId).first().catch(() => null);
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare("DELETE FROM telegram_link_tokens WHERE user_id=?").bind(userId),
    env.DB.prepare("DELETE FROM telegram_connections WHERE user_id=?").bind(userId),
    env.DB.prepare(`INSERT INTO activity_log(type,title,detail,created_at)
      VALUES('user','Telegram connection reset',?,?)`)
      .bind(`${user.email} Telegram connection was reset by Admin.${connection?.telegram_username ? ` Previous: @${connection.telegram_username}.` : ""}`, now)
  ]);

  return json({ ok: true, reset: true });
}


async function activeChatMember(request, env) {
  let user = await getCurrentUser(request, env);
  if (!user) return { error: json({ error: "Log in to use Member Chat." }, 401) };

  let access = await userAccessContext(env, user);
  if (!access.testMode && !user.paid_once_at) {
    await syncPaidOnceForUser(env, user.id).catch(() => null);
    user = await env.DB.prepare("SELECT * FROM users WHERE id=? LIMIT 1").bind(user.id).first() || user;
    access = await userAccessContext(env, user);
  }

  if (!access.chatAccess || user.account_status !== "Active") {
    return { error: json({
      error: "Member Chat unlocks permanently after your first successful membership or Lifetime Story payment.",
      code: "PAID_ONCE_REQUIRED"
    }, 403) };
  }
  return { user, access };
}

async function markChatDelivered(env, userId, senderRole) {
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE chat_messages SET delivered_at=?
    WHERE user_id=? AND sender_role=? AND delivered_at IS NULL`).bind(now, userId, senderRole).run();
  return now;
}

async function markChatSeen(env, userId, senderRole) {
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE chat_messages SET delivered_at=COALESCE(delivered_at,?), seen_at=?
    WHERE user_id=? AND sender_role=? AND seen_at IS NULL`).bind(now, now, userId, senderRole).run();
  return now;
}

async function markAdminChatNotificationsRead(env, userId) {
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(`UPDATE admin_notifications SET read_at=?
      WHERE type='chat' AND user_id=? AND read_at IS NULL`).bind(now, userId).run();
  } catch (error) {
    console.warn("Unable to synchronize Chat notifications", error);
  }
  return now;
}

async function listChatMessages(env, userId, afterId = 0, limit = 100) {
  const after = Math.max(0, Number(afterId) || 0);
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 100));
  if (after > 0) {
    const result = await env.DB.prepare(`SELECT id,user_id,sender_role,body,created_at,delivered_at,seen_at
      FROM chat_messages WHERE user_id=? AND id>? ORDER BY id ASC LIMIT ?`)
      .bind(userId, after, safeLimit).all();
    return (result.results || []).map(chatMessageFromRow);
  }
  const result = await env.DB.prepare(`SELECT id,user_id,sender_role,body,created_at,delivered_at,seen_at FROM (
      SELECT id,user_id,sender_role,body,created_at,delivered_at,seen_at
      FROM chat_messages WHERE user_id=? ORDER BY id DESC LIMIT ?
    ) ORDER BY id ASC`).bind(userId, safeLimit).all();
  return (result.results || []).map(chatMessageFromRow);
}

async function handleMemberChatStatus(request, env) {
  const auth = await activeChatMember(request, env);
  if (auth.error) return auth.error;
  await markChatDelivered(env, auth.user.id, "admin");
  const row = await env.DB.prepare(`SELECT
      SUM(CASE WHEN sender_role='admin' AND seen_at IS NULL THEN 1 ELSE 0 END) AS unread,
      MAX(id) AS latest_id
    FROM chat_messages WHERE user_id=?`).bind(auth.user.id).first();
  return json({ ok: true, unread: Number(row?.unread || 0), latestId: Number(row?.latest_id || 0) });
}

async function handleMemberChatMessages(request, env, url) {
  const auth = await activeChatMember(request, env);
  if (auth.error) return auth.error;
  const markSeen = url.searchParams.get("seen") === "1";
  if (markSeen) await markChatSeen(env, auth.user.id, "admin");
  else await markChatDelivered(env, auth.user.id, "admin");
  const after = Number(url.searchParams.get("after") || 0);
  const messages = await listChatMessages(env, auth.user.id, after, 100);
  const unreadRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM chat_messages
    WHERE user_id=? AND sender_role='admin' AND seen_at IS NULL`).bind(auth.user.id).first();
  return json({ ok: true, messages, unread: Number(unreadRow?.n || 0) });
}

async function handleMemberChatSend(request, env) {
  const auth = await activeChatMember(request, env);
  if (auth.error) return auth.error;
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const text = cleanChatBody(body.body);
  if (!text) return json({ error: "Write a message first." }, 400);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`INSERT INTO chat_messages(user_id,sender_role,body,created_at)
    VALUES(?,?,?,?)`).bind(auth.user.id, "member", text, now).run();
  const id = Number(result.meta?.last_row_id || 0);
  const row = id ? await env.DB.prepare(`SELECT id,user_id,sender_role,body,created_at,delivered_at,seen_at
    FROM chat_messages WHERE id=?`).bind(id).first() : null;
  await createAdminNotification(env, { type: "chat", title: `New message from ${auth.user.name || auth.user.email}`, body: text.slice(0, 180), route: "chat", userId: auth.user.id, relatedKey: `chat:${auth.user.id}`, dedupeMinutes: 10 });
  return json({ ok: true, message: chatMessageFromRow(row || { id, sender_role: "member", body: text, created_at: now }) }, 201);
}

async function handleAdminChatStatus(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE chat_messages SET delivered_at=?
    WHERE sender_role='member' AND delivered_at IS NULL`).bind(now).run();
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM chat_messages
    WHERE sender_role='member' AND seen_at IS NULL`).first();
  return json({ ok: true, unread: Number(row?.n || 0) });
}

async function handleAdminChatConversations(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  await ensureUserClientContextTable(env);
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE chat_messages SET delivered_at=?
    WHERE sender_role='member' AND delivered_at IS NULL`).bind(now).run();
  const result = await env.DB.prepare(`SELECT
      u.id,u.name,u.email,u.membership_status,u.membership_plan,u.membership_expires_at,u.account_status,u.paid_once_at,
      uto.enabled AS test_enabled,uto.chat_enabled AS test_chat_enabled,uto.membership_status AS test_membership_status,
      c.timezone AS user_timezone,
      (SELECT COUNT(*) FROM story_lifetime_purchases lp
        WHERE lp.user_id=u.id AND lp.purchase_status='Completed' AND lp.entitlement_status='Active') AS lifetime_count,
      (SELECT body FROM chat_messages m WHERE m.user_id=u.id ORDER BY m.id DESC LIMIT 1) AS latest_body,
      (SELECT created_at FROM chat_messages m WHERE m.user_id=u.id ORDER BY m.id DESC LIMIT 1) AS latest_at,
      (SELECT COUNT(*) FROM chat_messages m WHERE m.user_id=u.id AND m.sender_role='member' AND m.seen_at IS NULL) AS unread_count
    FROM users u
    LEFT JOIN user_client_context c ON c.user_id=u.id
    LEFT JOIN user_test_overrides uto ON uto.user_id=u.id
    WHERE u.account_status='Active'
      AND (u.paid_once_at IS NOT NULL OR (uto.enabled=1 AND uto.chat_enabled=1))
    ORDER BY COALESCE(latest_at,u.created_at) DESC, u.name COLLATE NOCASE ASC`).all();
  const conversations = (result.results || []).map(row => {
    const isTest = testFlag(row.test_enabled) && testFlag(row.test_chat_enabled);
    const currentMembership = isTest ? normalizeTestMembershipStatus(row.test_membership_status) : effectiveMembershipStatus(row);
    const lifetimeCount = Number(row.lifetime_count || 0);
    let status = isTest ? "TEST · Chat enabled" : "Paid customer";
    if (currentMembership === "Active") status = "Active member";
    else if (currentMembership === "Granted") status = "Granted · Paid once";
    else if (lifetimeCount > 0) status = `${lifetimeCount} Lifetime${lifetimeCount === 1 ? "" : "s"} · Chat enabled`;
    else if (!["None",""].includes(currentMembership)) status = `${currentMembership} · Chat enabled`;
    return {
    id: row.id,
    userId: row.id,
    user: row.name,
    email: row.email,
    status,
    plan: row.membership_plan || "None",
    profileImage: `/api/media/user-profile-${encodeURIComponent(row.id)}`,
    timezone: row.user_timezone || "",
    preview: row.latest_body || "No messages yet",
    latestAt: row.latest_at || null,
    unread: Number(row.unread_count || 0),
    paidOnceAt: row.paid_once_at || null
  };
  });
  return json({ ok: true, conversations });
}

async function getActiveAdminChatUser(env, userId) {
  return env.DB.prepare(`SELECT u.* FROM users u
    LEFT JOIN user_test_overrides uto ON uto.user_id=u.id
    WHERE u.id=? AND u.account_status='Active'
      AND (u.paid_once_at IS NOT NULL OR (uto.enabled=1 AND uto.chat_enabled=1))
    LIMIT 1`).bind(userId).first();
}

async function handleAdminChatMessages(request, env, userId, url) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  const user = await getActiveAdminChatUser(env, userId);
  if (!user) return json({ error: "Chat-enabled paid customer not found." }, 404);
  const markSeen = url.searchParams.get("seen") === "1";
  if (markSeen) {
    await markChatSeen(env, userId, "member");
    await markAdminChatNotificationsRead(env, userId);
  } else await markChatDelivered(env, userId, "member");
  const after = Number(url.searchParams.get("after") || 0);
  const messages = await listChatMessages(env, userId, after, 100);
  return json({ ok: true, messages });
}

async function handleAdminChatSend(request, env, userId) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  const user = await getActiveAdminChatUser(env, userId);
  if (!user) return json({ error: "Chat-enabled paid customer not found." }, 404);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const text = cleanChatBody(body.body);
  if (!text) return json({ error: "Write a message first." }, 400);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`INSERT INTO chat_messages(user_id,sender_role,body,created_at)
    VALUES(?,?,?,?)`).bind(userId, "admin", text, now).run();
  const id = Number(result.meta?.last_row_id || 0);
  const row = id ? await env.DB.prepare(`SELECT id,user_id,sender_role,body,created_at,delivered_at,seen_at
    FROM chat_messages WHERE id=?`).bind(id).first() : null;
  return json({ ok: true, message: chatMessageFromRow(row || { id, sender_role: "admin", body: text, created_at: now }) }, 201);
}



const CHAT_BROADCAST_MAX_RECIPIENTS = 1000;
const CHAT_BROADCAST_HISTORY_LIMIT = 30;

function normalizeBroadcastAudience(value = "all") {
  const allowed = new Set(["all","active","lifetime","expired_cancelled","active_lifetime","selected","random"]);
  const audience = String(value || "").trim().toLowerCase();
  return allowed.has(audience) ? audience : "all";
}

function broadcastAudienceLabel(audience, randomCount = 0) {
  const labels = {
    all: "All Chat-enabled users",
    active: "Active members",
    lifetime: "Lifetime Story customers",
    expired_cancelled: "Expired / cancelled members",
    active_lifetime: "Active + Lifetime users",
    selected: "Selected users",
    random: `Random users${randomCount ? ` (${randomCount})` : ""}`
  };
  return labels[audience] || labels.all;
}

async function listBroadcastCandidates(env) {
  const result = await env.DB.prepare(`SELECT
      u.id,u.name,u.email,u.membership_status,u.membership_plan,u.membership_expires_at,u.account_status,u.paid_once_at,
      (SELECT COUNT(*) FROM story_lifetime_purchases lp
        WHERE lp.user_id=u.id AND lp.purchase_status='Completed' AND lp.entitlement_status='Active') AS lifetime_count
    FROM users u
    WHERE u.account_status='Active' AND u.paid_once_at IS NOT NULL
    ORDER BY u.name COLLATE NOCASE ASC, u.email COLLATE NOCASE ASC`).all();

  return (result.results || []).map(row => ({
    id: String(row.id || ""),
    name: String(row.name || row.email || "Customer"),
    email: String(row.email || ""),
    membership: effectiveMembershipStatus(row),
    lifetimeCount: Number(row.lifetime_count || 0)
  })).filter(row => row.id);
}

function chooseBroadcastRecipients(candidates, audience, selectedIds = [], randomCount = 0) {
  const selected = new Set((Array.isArray(selectedIds) ? selectedIds : []).map(value => String(value)));
  let recipients = [];

  if (audience === "active") {
    recipients = candidates.filter(row => row.membership === "Active");
  } else if (audience === "lifetime") {
    recipients = candidates.filter(row => row.lifetimeCount > 0);
  } else if (audience === "expired_cancelled") {
    recipients = candidates.filter(row => ["Expired","Cancelled","Canceled"].includes(row.membership));
  } else if (audience === "active_lifetime") {
    recipients = candidates.filter(row => row.membership === "Active" && row.lifetimeCount > 0);
  } else if (audience === "selected") {
    recipients = candidates.filter(row => selected.has(row.id));
  } else if (audience === "random") {
    const count = Math.max(1, Math.min(50, Number(randomCount || 5)));
    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    recipients = shuffled.slice(0, count);
  } else {
    recipients = [...candidates];
  }

  return recipients.slice(0, CHAT_BROADCAST_MAX_RECIPIENTS);
}

async function handleAdminChatBroadcastPreview(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);

  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }

  const audience = normalizeBroadcastAudience(body.audience);
  const randomCount = Math.max(1, Math.min(50, Number(body.randomCount || 5)));
  const candidates = await listBroadcastCandidates(env);
  const recipients = chooseBroadcastRecipients(candidates, audience, body.selectedIds, randomCount);

  return json({
    ok: true,
    audience,
    audienceLabel: broadcastAudienceLabel(audience, randomCount),
    count: recipients.length,
    recipientIds: recipients.map(row => row.id),
    recipients: recipients.slice(0, 20).map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      membership: row.membership,
      lifetimeCount: row.lifetimeCount
    })),
    truncated: recipients.length > 20
  });
}

async function handleAdminChatBroadcastSend(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);

  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }

  const text = cleanChatBody(body.body);
  if (!text) return json({ error: "Write a broadcast message first." }, 400);

  const audience = normalizeBroadcastAudience(body.audience);
  const randomCount = Math.max(1, Math.min(50, Number(body.randomCount || 5)));
  const requestedIds = Array.isArray(body.recipientIds) ? [...new Set(body.recipientIds.map(value => String(value)).filter(Boolean))] : [];
  if (!requestedIds.length) return json({ error: "Preview the recipients before sending." }, 400);
  if (requestedIds.length > CHAT_BROADCAST_MAX_RECIPIENTS) return json({ error: `A broadcast can include up to ${CHAT_BROADCAST_MAX_RECIPIENTS} recipients.` }, 400);

  // Revalidate every previewed recipient against the permanent paid-once Chat rule.
  const candidates = await listBroadcastCandidates(env);
  const eligibleById = new Map(candidates.map(row => [row.id, row]));
  const recipients = requestedIds.map(id => eligibleById.get(id)).filter(Boolean);

  if (!recipients.length) return json({ error: "None of the previewed users are currently Chat-enabled." }, 409);
  if (recipients.length !== requestedIds.length) {
    return json({ error: "The recipient list changed. Preview recipients again before sending.", code: "RECIPIENTS_CHANGED" }, 409);
  }

  const now = new Date().toISOString();
  const broadcastId = crypto.randomUUID();
  const audienceLabel = String(body.audienceLabel || broadcastAudienceLabel(audience, randomCount)).slice(0, 120);

  // One multi-row insert keeps this fast and avoids one request per member.
  const placeholders = recipients.map(() => "(?,?,?,?)").join(",");
  const args = [];
  for (const recipient of recipients) args.push(recipient.id, "admin", text, now);

  const insertMessages = env.DB.prepare(`INSERT INTO chat_messages(user_id,sender_role,body,created_at) VALUES ${placeholders}`).bind(...args);
  const insertHistory = env.DB.prepare(`INSERT INTO chat_broadcasts
      (id,body,audience,audience_label,recipient_count,recipient_ids_json,created_at)
      VALUES(?,?,?,?,?,?,?)`)
    .bind(broadcastId, text, audience, audienceLabel, recipients.length, JSON.stringify(recipients.map(row => row.id)), now);
  const insertActivity = env.DB.prepare(`INSERT INTO activity_log(type,title,detail,created_at)
      VALUES('system','Chat broadcast sent',?,?)`)
    .bind(`${audienceLabel} · ${recipients.length} recipient${recipients.length === 1 ? "" : "s"} · ${text.slice(0, 260)}`, now);

  try {
    await env.DB.batch([insertMessages, insertHistory, insertActivity]);
  } catch (error) {
    return json({ error: error.message || "Unable to send the broadcast." }, 500);
  }

  return json({
    ok: true,
    broadcastId,
    count: recipients.length,
    audience,
    audienceLabel,
    sentAt: now
  }, 201);
}

async function handleAdminChatBroadcastHistory(request, env, url) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  const limit = Math.max(1, Math.min(CHAT_BROADCAST_HISTORY_LIMIT, Number(url.searchParams.get("limit") || 12)));

  try {
    const result = await env.DB.prepare(`SELECT id,body,audience,audience_label,recipient_count,created_at
      FROM chat_broadcasts ORDER BY created_at DESC LIMIT ?`).bind(limit).all();
    return json({
      ok: true,
      broadcasts: (result.results || []).map(row => ({
        id: String(row.id || ""),
        body: String(row.body || ""),
        audience: String(row.audience || "all"),
        audienceLabel: String(row.audience_label || "Broadcast"),
        recipientCount: Number(row.recipient_count || 0),
        createdAt: row.created_at || null
      }))
    });
  } catch (error) {
    return json({ error: "Broadcast history is not ready. Apply migration 0022_chat_broadcasts.sql first." }, 503);
  }
}


// ---------------------------------------------------------------------------
// RAPTOR -> OX Novels membership migration
// ---------------------------------------------------------------------------
const RAPTOR_MIGRATION_MAX_AGE_SECONDS = 30 * 60;
const RAPTOR_MIGRATION_STALE_VERIFY_MS = 6 * 60 * 60 * 1000;

function cleanRaptorMigrationText(value, max = 120) {
  return String(value || "").replace(/[\r\n]/g, " ").trim().slice(0, max);
}

function normalizeRaptorMigrationPrice(value) {
  const raw = cleanRaptorMigrationText(value, 24).replace(/[^0-9.]/g, "");
  if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(raw)) return "";
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) return "";
  return amount.toFixed(2);
}

function raptorMigrationClaimFromInput(input = {}) {
  return {
    version: cleanRaptorMigrationText(input.version || input.v || "v1", 8),
    raptorUserId: cleanRaptorMigrationText(input.raptorUserId || input.raptor_user_id || input.ru, 32),
    subscriptionId: cleanRaptorMigrationText(input.subscriptionId || input.subscription_id || input.sid, 80).toUpperCase(),
    issuedAt: cleanRaptorMigrationText(input.issuedAt || input.issued_at || input.ts, 20),
    nonce: cleanRaptorMigrationText(input.nonce, 80),
    pricingTier: cleanRaptorMigrationText(input.pricingTier || input.pricing_tier || input.tier, 40).toLowerCase(),
    price: normalizeRaptorMigrationPrice(input.price),
    plan: cleanRaptorMigrationText(input.plan, 100),
    signature: cleanRaptorMigrationText(input.signature || input.sig, 160).toLowerCase()
  };
}

function raptorMigrationSigningMessage(claim) {
  return [
    claim.version,
    claim.raptorUserId,
    claim.subscriptionId,
    claim.issuedAt,
    claim.nonce,
    claim.pricingTier,
    claim.price,
    claim.plan
  ].join("\n");
}

async function hmacSha256Hex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toBytesHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value || ""))));
}

async function verifyRaptorMigrationClaim(env, input) {
  const secret = String(env.RAPTOR_MIGRATION_SECRET || "").trim();
  if (secret.length < 32) throw new Error("RAPTOR migration is not configured on this server yet.");

  const claim = raptorMigrationClaimFromInput(input);
  if (claim.version !== "v1") throw new Error("Unsupported RAPTOR migration link version.");
  if (!/^\d+$/.test(claim.raptorUserId)) throw new Error("Invalid RAPTOR user in migration link.");
  if (!/^I-[A-Z0-9]+$/i.test(claim.subscriptionId)) throw new Error("Invalid PayPal subscription in migration link.");
  if (!/^\d{9,12}$/.test(claim.issuedAt)) throw new Error("Invalid RAPTOR migration timestamp.");
  if (!/^[A-Za-z0-9_-]{12,80}$/.test(claim.nonce)) throw new Error("Invalid RAPTOR migration nonce.");
  if (!/^[a-f0-9]{64}$/i.test(claim.signature)) throw new Error("Invalid RAPTOR migration signature.");

  const issuedSeconds = Number(claim.issuedAt);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(issuedSeconds) || Math.abs(nowSeconds - issuedSeconds) > RAPTOR_MIGRATION_MAX_AGE_SECONDS) {
    throw new Error("This RAPTOR migration link expired. Return to RAPTOR and create a new transfer link.");
  }

  const expected = await hmacSha256Hex(secret, raptorMigrationSigningMessage(claim));
  if (!(await secureEqualText(expected, claim.signature))) throw new Error("RAPTOR migration link signature is invalid.");
  return claim;
}

function membershipTierPriceNumber(row) {
  const match = String(row?.price || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

async function resolveRaptorMigrationTier(env, claim) {
  const result = await env.DB.prepare("SELECT id,name,price,status,sort_order FROM membership_tiers ORDER BY CASE WHEN status='Published' THEN 0 ELSE 1 END, sort_order ASC, name ASC").all();
  const tiers = result.results || [];
  if (!tiers.length) return null;

  let desiredPrice = Number(claim.price || 0);
  if (!Number.isFinite(desiredPrice) || desiredPrice <= 0) {
    if (claim.pricingTier === "referral") desiredPrice = 17.99;
    else if (claim.pricingTier === "standard") desiredPrice = 24.99;
  }

  if (desiredPrice > 0) {
    const exact = tiers.find(row => Math.abs(membershipTierPriceNumber(row) - desiredPrice) < 0.001);
    if (exact) return exact;
  }

  // Older RAPTOR subscriptions may use a legacy price that no longer exists as an
  // OX public tier. Keep their PayPal billing unchanged, but attach the entitlement
  // to the closest intended OX access tier so the migrated user can use the site.
  if (claim.pricingTier === "referral") {
    const referralFallback = tiers.find(row => String(row.id || "").toLowerCase() === "premium");
    if (referralFallback) return referralFallback;
  }
  if (claim.pricingTier === "standard") {
    const standardFallback = tiers.find(row => String(row.id || "").toLowerCase() === "plus");
    if (standardFallback) return standardFallback;
  }
  return tiers.find(row => String(row.status || "") === "Published") || tiers[0] || null;
}

async function handleRaptorMigrationPreview(request, env) {
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid migration request." }, 400); }
  try {
    const claim = await verifyRaptorMigrationClaim(env, body);
    return json({
      ok: true,
      valid: true,
      source: "RAPTOR",
      plan: claim.plan || (claim.pricingTier === "referral" ? "RAPTOR Saver" : "RAPTOR Membership"),
      price: claim.price || null,
      expiresAt: new Date((Number(claim.issuedAt) + RAPTOR_MIGRATION_MAX_AGE_SECONDS) * 1000).toISOString()
    });
  } catch (error) {
    return json({ error: String(error?.message || error), valid: false }, 400);
  }
}

async function handleRaptorMigrationClaim(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: "Continue with Google before transferring your RAPTOR membership.", code: "LOGIN_REQUIRED" }, 401);

  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid migration request." }, 400); }

  try {
    const claim = await verifyRaptorMigrationClaim(env, body);
    const existingMigration = await env.DB.prepare("SELECT * FROM raptor_migration_claims WHERE provider_subscription_id=? LIMIT 1")
      .bind(claim.subscriptionId).first();
    if (existingMigration?.ox_user_id && String(existingMigration.ox_user_id) !== String(user.id)) {
      return json({ error: "This RAPTOR subscription has already been transferred to another OX account.", code: "ALREADY_CLAIMED" }, 409);
    }

    const existingSubscription = await env.DB.prepare("SELECT user_id FROM member_subscriptions WHERE provider_subscription_id=? LIMIT 1")
      .bind(claim.subscriptionId).first();
    if (existingSubscription?.user_id && String(existingSubscription.user_id) !== String(user.id)) {
      return json({ error: "This PayPal subscription is already linked to another OX account.", code: "SUBSCRIPTION_ALREADY_LINKED" }, 409);
    }

    const config = await getPaypalSettings(env);
    if (config.mode !== "live") return json({ error: "RAPTOR migration requires OX PayPal Live mode. Local Sandbox mode cannot claim a real RAPTOR subscription." }, 409);
    if (!config.clientId || !config.secretConfigured) return json({ error: "OX PayPal Live credentials are not configured." }, 409);

    const details = await fetchPaypalSubscription(env, claim.subscriptionId, config);
    const paypalCustomId = cleanRaptorMigrationText(details.custom_id, 80);
    if (!paypalCustomId || paypalCustomId !== claim.raptorUserId) {
      return json({ error: "PayPal ownership verification failed for this RAPTOR account.", code: "RAPTOR_OWNER_MISMATCH" }, 403);
    }

    const status = String(details.status || "").toUpperCase();
    const lastPaymentAt = String(details.billing_info?.last_payment?.time || "").trim();
    const hasVerifiedPaidHistory = status === "ACTIVE" || Boolean(lastPaymentAt);
    if (!hasVerifiedPaidHistory) {
      return json({
        error: `PayPal could not verify a completed RAPTOR payment for this subscription (current status: ${status || "UNKNOWN"}).`,
        code: "RAPTOR_PAYMENT_HISTORY_NOT_VERIFIED",
        status: status || "UNKNOWN"
      }, 409);
    }

    const tier = await resolveRaptorMigrationTier(env, claim);
    if (!tier) return json({ error: "OX does not have a membership tier available for this transfer." }, 409);

    const saved = await savePaypalSubscription(env, user.id, tier.id, details, { paymentCompleted: false, environment: "live" });
    const now = new Date().toISOString();
    const price = claim.price ? `$${claim.price}` : String(tier.price || "$0.00");

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO raptor_migration_claims(
        provider_subscription_id,raptor_user_id,ox_user_id,raptor_plan,raptor_pricing_tier,raptor_price,paypal_plan_id,paypal_status,next_billing_at,claimed_at,last_verified_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(provider_subscription_id) DO UPDATE SET
        ox_user_id=excluded.ox_user_id,raptor_plan=excluded.raptor_plan,raptor_pricing_tier=excluded.raptor_pricing_tier,
        raptor_price=excluded.raptor_price,paypal_plan_id=excluded.paypal_plan_id,paypal_status=excluded.paypal_status,
        next_billing_at=excluded.next_billing_at,last_verified_at=excluded.last_verified_at`)
        .bind(claim.subscriptionId, claim.raptorUserId, user.id, claim.plan, claim.pricingTier, claim.price,
          String(details.plan_id || ""), saved.status, saved.nextBilling || null, existingMigration?.claimed_at || now, now),
      env.DB.prepare("UPDATE users SET payment_status='Paid',latest_amount=?,updated_at=? WHERE id=?").bind(price, now, user.id),
      env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('payment','RAPTOR membership transferred',?,?)")
        .bind(`${user.email} · ${claim.subscriptionId} · ${saved.status}.`, now)
    ]);
    await markUserPaidOnce(env, user.id, lastPaymentAt || now, "live");

    await createAdminNotification(env, {
      type: "payment",
      title: "RAPTOR membership transferred",
      body: `${user.name || user.email} · ${claim.subscriptionId} · ${claim.plan || tier.name}`,
      route: "users",
      userId: user.id,
      relatedKey: `raptor-migration:${claim.subscriptionId}`
    }).catch(() => null);

    return json({
      ok: true,
      transferred: true,
      status: saved.status,
      subscriptionId: details.id,
      nextBillingAt: saved.nextBilling || null,
      tier: { id: tier.id, name: tier.name },
      sourcePlan: claim.plan || null,
      sourcePrice: claim.price || null
    });
  } catch (error) {
    return json({ error: String(error?.message || error || "Unable to transfer RAPTOR membership.") }, Number(error?.status) >= 400 ? Number(error.status) : 400);
  }
}

async function refreshRaptorMigratedSubscriptionIfStale(env, userId, subscription) {
  if (!subscription?.provider_subscription_id || !userId) return subscription;
  const migration = await env.DB.prepare("SELECT last_verified_at FROM raptor_migration_claims WHERE provider_subscription_id=? AND ox_user_id=? LIMIT 1")
    .bind(subscription.provider_subscription_id, userId).first().catch(() => null);
  if (!migration) return subscription;

  const verifiedMs = new Date(migration.last_verified_at || 0).getTime();
  if (Number.isFinite(verifiedMs) && Date.now() - verifiedMs < RAPTOR_MIGRATION_STALE_VERIFY_MS) return subscription;

  const config = await getPaypalSettings(env).catch(() => null);
  if (!config || config.mode !== "live" || !config.clientId || !config.secretConfigured) return subscription;

  try {
    const details = await fetchPaypalSubscription(env, subscription.provider_subscription_id, config);
    const saved = await savePaypalSubscription(env, userId, subscription.tier_id || null, details, { paymentCompleted: false, environment: "live" });
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE raptor_migration_claims SET paypal_status=?,next_billing_at=?,last_verified_at=? WHERE provider_subscription_id=?")
      .bind(saved.status, saved.nextBilling || null, now, subscription.provider_subscription_id).run();
    return await latestPaypalSubscriptionForUser(env, userId) || subscription;
  } catch (error) {
    console.warn("RAPTOR migrated subscription refresh skipped", error);
    return subscription;
  }
}


// ---------------------------------------------------------------------------
// Dodo Payments test-mode membership checkout
// ---------------------------------------------------------------------------
const DODO_TEST_PRODUCT_BY_TIER = Object.freeze({
  premium: "pdt_0NoVgVjJQrtFh91lQuvFt"
});

const DODO_TEST_LIFETIME_PRODUCT_ID = "pdt_0NoVzgAGvGixmcmp7Y480";

function dodoErrorMessage(payload, fallback = "Dodo Payments request failed.") {
  if (!payload || typeof payload !== "object") return fallback;
  const candidates = [
    payload.message,
    payload.error,
    payload.detail,
    payload.error?.message,
    payload.error?.detail
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

async function dodoTestRequest(env, path, options = {}) {
  const apiKey = String(env.DODO_PAYMENTS_API_KEY || "").trim();
  if (!apiKey) throw new Error("Dodo Payments test API key is not configured on the server.");
  const response = await fetch(`https://test.dodopayments.com${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = { message: text.slice(0, 500) }; }
  }
  if (!response.ok) {
    throw new Error(dodoErrorMessage(payload, `Dodo Payments returned HTTP ${response.status}.`));
  }
  return payload;
}

async function handleDodoTestCheckout(request, env, url) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: "Log in before starting the Dodo test checkout.", code: "LOGIN_REQUIRED" }, 401);
  if (membershipIsActive(user)) return json({ error: "Your membership is already active." }, 409);

  let body = {};
  try { body = await request.json(); }
  catch { return json({ error: "Invalid request." }, 400); }

  const tierId = String(body.tierId || "").trim();
  const tier = await env.DB.prepare("SELECT id,name,price,cycle,status FROM membership_tiers WHERE id=? AND status='Published'")
    .bind(tierId).first();
  if (!tier) return json({ error: "This membership tier is not available." }, 404);

  const productId = String(DODO_TEST_PRODUCT_BY_TIER[tierId] || "").trim();
  if (!productId) {
    return json({ error: "This membership tier does not have a Dodo test product yet.", code: "DODO_TEST_PRODUCT_NOT_CONFIGURED" }, 409);
  }

  const token = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 60 * 1000);
  await env.DB.prepare(`INSERT INTO payment_checkout_sessions(token,user_id,tier_id,provider,external_plan_id,environment,created_at,expires_at)
    VALUES(?,?,?,'dodo',?,'test_mode',?,?)`)
    .bind(token, user.id, tier.id, productId, now.toISOString(), expires.toISOString()).run();

  const returnUrl = new URL("/", url);
  returnUrl.searchParams.set("dodo_test", "1");
  returnUrl.searchParams.set("dodo", "return");
  const cancelUrl = new URL("/", url);
  cancelUrl.searchParams.set("dodo_test", "1");
  cancelUrl.searchParams.set("dodo", "cancelled");

  try {
    const checkout = await dodoTestRequest(env, "/checkouts", {
      method: "POST",
      body: JSON.stringify({
        product_cart: [{ product_id: productId, quantity: 1 }],
        customer: {
          email: String(user.email || "").trim(),
          name: String(user.name || user.email || "OX Novels Member").trim()
        },
        metadata: {
          ox_checkout_token: token,
          ox_user_id: String(user.id),
          ox_tier_id: String(tier.id),
          ox_environment: "test_mode"
        },
        return_url: returnUrl.toString(),
        cancel_url: cancelUrl.toString(),
        feature_flags: {
          allow_customer_editing_email: false,
          allow_customer_editing_name: false,
          redirect_immediately: true
        },
        customization: {
          theme: "system",
          show_order_details: true
        }
      })
    });

    const checkoutUrl = String(checkout.checkout_url || "").trim();
    if (!checkoutUrl) throw new Error("Dodo Payments did not return a checkout URL.");

    await env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('payment',?,?,?)")
      .bind("Dodo test checkout created", `${user.email} · ${tier.name} · ${checkout.session_id || token}.`, new Date().toISOString())
      .run().catch(() => null);

    return json({
      ok: true,
      provider: "dodo",
      environment: "test_mode",
      checkoutUrl,
      sessionId: String(checkout.session_id || ""),
      tier: { id: tier.id, name: tier.name, price: tier.price, cycle: tier.cycle }
    });
  } catch (error) {
    await env.DB.prepare("DELETE FROM payment_checkout_sessions WHERE token=? AND provider='dodo'")
      .bind(token).run().catch(() => null);
    return json({ error: error.message || "Unable to create Dodo test checkout." }, 400);
  }
}


// ---------------------------------------------------------------------------
// Dodo Payments test-mode lifetime-story checkout
// ---------------------------------------------------------------------------
async function handleDodoLifetimeTestCheckout(request, env, url) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: "Continue with Google before payment.", code: "LOGIN_REQUIRED" }, 401);
  if (user.account_status !== "Active") return json({ error: "This account cannot make purchases.", code: "ACCOUNT_NOT_ACTIVE" }, 403);

  let body = {};
  try { body = await request.json(); }
  catch { return json({ error: "Invalid request." }, 400); }

  const story = await lifetimePurchasableStory(env, body.storyId);
  if (!story) return json({ error: "This story is not available for lifetime purchase.", code: "STORY_NOT_PURCHASABLE" }, 404);

  const owned = await activeLifetimePurchase(env, user.id, story.permanent_story_id);
  if (owned) return json({ ok: true, alreadyPurchased: true, storyId: story.id, purchaseId: owned.id });

  const productId = String(DODO_TEST_LIFETIME_PRODUCT_ID || "").trim();
  if (!productId) return json({ error: "Dodo Lifetime Story test product is not configured.", code: "DODO_LIFETIME_PRODUCT_NOT_CONFIGURED" }, 409);

  const now = new Date();
  const nowIso = now.toISOString();
  await env.DB.prepare(`UPDATE dodo_lifetime_checkout_sessions SET status='EXPIRED'
    WHERE user_id=? AND permanent_story_id=? AND status IN ('INIT','CREATED') AND expires_at<=?`)
    .bind(user.id, story.permanent_story_id, nowIso).run().catch(() => null);

  const reusable = await env.DB.prepare(`SELECT token,checkout_session_id,checkout_url,product_id,expires_at
    FROM dodo_lifetime_checkout_sessions
    WHERE user_id=? AND permanent_story_id=? AND environment='test_mode' AND status='CREATED' AND expires_at>?
    ORDER BY created_at DESC LIMIT 1`)
    .bind(user.id, story.permanent_story_id, nowIso).first().catch(() => null);

  if (reusable?.checkout_session_id && reusable?.checkout_url && String(reusable.product_id || "") === productId) {
    return json({
      ok: true,
      provider: "dodo",
      environment: "test_mode",
      checkoutUrl: reusable.checkout_url,
      sessionId: reusable.checkout_session_id,
      storyId: story.id,
      reused: true
    });
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + LIFETIME_CHECKOUT_MAX_AGE_MS).toISOString();
  const driveFolderId = lifetimeDriveFolderId(story.drive_url);

  await env.DB.prepare(`INSERT INTO dodo_lifetime_checkout_sessions(
    token,checkout_session_id,checkout_url,payment_id,user_id,permanent_story_id,story_id_snapshot,title_snapshot,
    drive_url_snapshot,drive_folder_id_snapshot,cover_snapshot,product_id,amount,currency,environment,status,created_at,expires_at
  ) VALUES(?,NULL,'',NULL,?,?,?,?,?,?,?,?,?,?,'test_mode','INIT',?,?)`)
    .bind(
      token, user.id, story.permanent_story_id, story.id, story.title || "",
      story.drive_url || "", driveFolderId, story.cover || "", productId,
      LIFETIME_STORY_PRICE, LIFETIME_STORY_CURRENCY, nowIso, expiresAt
    ).run();

  const returnUrl = new URL("/49", url);
  returnUrl.searchParams.set("story", story.id);
  returnUrl.searchParams.set("dodo_test", "1");
  returnUrl.searchParams.set("dodo_lifetime", "return");

  const cancelUrl = new URL("/49", url);
  cancelUrl.searchParams.set("story", story.id);
  cancelUrl.searchParams.set("dodo_test", "1");
  cancelUrl.searchParams.set("dodo_lifetime", "cancelled");

  try {
    const checkout = await dodoTestRequest(env, "/checkouts", {
      method: "POST",
      body: JSON.stringify({
        product_cart: [{ product_id: productId, quantity: 1 }],
        customer: {
          email: String(user.email || "").trim(),
          name: String(user.name || user.email || "OX Novels Customer").trim()
        },
        metadata: {
          ox_purchase_type: "lifetime_story",
          ox_lifetime_token: token,
          ox_user_id: String(user.id),
          ox_story_id: String(story.id),
          ox_permanent_story_id: String(story.permanent_story_id),
          ox_product_id: productId,
          ox_environment: "test_mode"
        },
        return_url: returnUrl.toString(),
        cancel_url: cancelUrl.toString(),
        feature_flags: {
          allow_customer_editing_email: false,
          allow_customer_editing_name: false,
          redirect_immediately: true
        },
        customization: {
          theme: "system",
          show_order_details: true
        }
      })
    });

    const checkoutUrl = String(checkout.checkout_url || "").trim();
    const sessionId = String(checkout.session_id || "").trim();
    if (!checkoutUrl || !sessionId) throw new Error("Dodo Payments did not return a complete checkout session.");

    await env.DB.batch([
      env.DB.prepare(`UPDATE dodo_lifetime_checkout_sessions
        SET checkout_session_id=?,checkout_url=?,status='CREATED' WHERE token=?`)
        .bind(sessionId, checkoutUrl, token),
      env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('payment','Dodo lifetime test checkout created',?,?)")
        .bind(`${user.email} · ${story.title} · ${sessionId}.`, new Date().toISOString())
    ]);

    return json({
      ok: true,
      provider: "dodo",
      environment: "test_mode",
      checkoutUrl,
      sessionId,
      storyId: story.id,
      title: story.title,
      amount: LIFETIME_STORY_PRICE,
      currency: LIFETIME_STORY_CURRENCY
    });
  } catch (error) {
    await env.DB.prepare("UPDATE dodo_lifetime_checkout_sessions SET status='ERROR' WHERE token=?")
      .bind(token).run().catch(() => null);
    return json({ error: error.message || "Unable to create Dodo Lifetime Story test checkout." }, 400);
  }
}


// ---------------------------------------------------------------------------
// Dodo Payments test-mode webhook + OX membership activation
// ---------------------------------------------------------------------------
function dodoWebhookSecretBytes(secret) {
  let value = String(secret || "").trim();
  if (value.startsWith("whsec_")) value = value.slice(6);
  value = value.replace(/-/g, "+").replace(/_/g, "/");
  while (value.length % 4) value += "=";
  const raw = atob(value);
  return Uint8Array.from(raw, ch => ch.charCodeAt(0));
}

function dodoBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=+$/g, "");
}

function dodoSafeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function verifyDodoTestWebhook(request, env, rawBody) {
  const secret = String(env.DODO_PAYMENTS_WEBHOOK_KEY || "").trim();
  if (!secret) throw new Error("Dodo test webhook secret is not configured.");

  const webhookId = String(request.headers.get("webhook-id") || "").trim();
  const timestamp = String(request.headers.get("webhook-timestamp") || "").trim();
  const signatureHeader = String(request.headers.get("webhook-signature") || "").trim();
  if (!webhookId || !timestamp || !signatureHeader) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;

  let secretBytes;
  try { secretBytes = dodoWebhookSecretBytes(secret); }
  catch { throw new Error("Dodo test webhook secret is invalid."); }

  const signed = `${webhookId}.${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed)));
  const expected = dodoBase64(mac);

  const candidates = signatureHeader
    .split(/\s+/)
    .map(part => {
      const match = part.match(/^v1,(.+)$/);
      return match ? String(match[1]).replace(/=+$/g, "") : "";
    })
    .filter(Boolean);

  return candidates.some(candidate => dodoSafeEqual(candidate, expected));
}

function dodoTierIdForProduct(productId) {
  const wanted = String(productId || "").trim();
  for (const [tierId, mappedProductId] of Object.entries(DODO_TEST_PRODUCT_BY_TIER)) {
    if (String(mappedProductId) === wanted) return tierId;
  }
  return "";
}

async function resolveDodoWebhookOwner(env, data) {
  const metadata = data && typeof data.metadata === "object" && data.metadata ? data.metadata : {};
  const productId = String(data?.product_id || "").trim();
  const subscriptionId = String(data?.subscription_id || "").trim();
  const token = String(metadata.ox_checkout_token || "").trim();

  if (subscriptionId) {
    const existing = await env.DB.prepare(
      "SELECT user_id,tier_id,external_plan_id FROM member_subscriptions WHERE provider='dodo' AND provider_subscription_id=? LIMIT 1"
    ).bind(subscriptionId).first().catch(() => null);
    if (existing) return { user_id: existing.user_id, tier_id: existing.tier_id, token: "", product_id: existing.external_plan_id || productId };
  }

  if (token) {
    const checkout = await env.DB.prepare(`SELECT token,user_id,tier_id,external_plan_id,environment
      FROM payment_checkout_sessions WHERE token=? AND provider='dodo' LIMIT 1`).bind(token).first().catch(() => null);
    if (checkout) {
      if (String(checkout.environment || "") !== "test_mode") return null;
      if (productId && String(checkout.external_plan_id || "") !== productId) return null;
      if (metadata.ox_user_id && String(metadata.ox_user_id) !== String(checkout.user_id)) return null;
      if (metadata.ox_tier_id && String(metadata.ox_tier_id) !== String(checkout.tier_id)) return null;
      return { user_id: checkout.user_id, tier_id: checkout.tier_id, token: checkout.token, product_id: checkout.external_plan_id || productId };
    }
  }

  // Safe test-mode fallback: the checkout locks the OX email address, so if
  // metadata is unexpectedly omitted by a downstream event, match the single
  // OX account with that same email and the known Dodo test product.
  const tierId = dodoTierIdForProduct(productId);
  const email = String(data?.customer?.email || "").trim().toLowerCase();
  if (tierId && email) {
    const matches = await env.DB.prepare("SELECT id FROM users WHERE LOWER(email)=? LIMIT 2").bind(email).all().catch(() => ({ results: [] }));
    if ((matches.results || []).length === 1) {
      return { user_id: matches.results[0].id, tier_id: tierId, token: "", product_id: productId };
    }
  }

  return null;
}

function dodoStatusForEvent(type, data) {
  const raw = String(data?.status || "").trim().toUpperCase();
  if (raw) return raw;
  const eventType = String(type || "");
  if (eventType === "subscription.active" || eventType === "subscription.renewed") return "ACTIVE";
  if (eventType === "subscription.cancelled") return "CANCELLED";
  if (eventType === "subscription.expired") return "EXPIRED";
  if (eventType === "subscription.failed") return "FAILED";
  if (eventType === "subscription.on_hold") return "ON_HOLD";
  if (eventType === "subscription.paused") return "PAUSED";
  return "PENDING";
}

async function saveDodoTestSubscription(env, owner, data, eventType) {
  const now = new Date().toISOString();
  const subscriptionId = String(data?.subscription_id || "").trim();
  const productId = String(data?.product_id || owner?.product_id || "").trim();
  if (!subscriptionId || !owner?.user_id || !owner?.tier_id) return null;

  const expectedProduct = String(DODO_TEST_PRODUCT_BY_TIER[owner.tier_id] || "").trim();
  if (!expectedProduct || productId !== expectedProduct) throw new Error("Dodo product/tier verification failed.");

  const status = dodoStatusForEvent(eventType, data);
  const nextBilling = data?.next_billing_date || null;
  const startedAt = data?.created_at || now;
  const lastPaymentAt = ["subscription.active", "subscription.renewed"].includes(eventType)
    ? (data?.previous_billing_date || now)
    : (data?.previous_billing_date || null);
  const cancelledAt = data?.cancelled_at || (status === "CANCELLED" ? now : null);

  await env.DB.prepare(`INSERT INTO member_subscriptions(
      provider_subscription_id,provider,user_id,tier_id,external_plan_id,environment,status,
      next_billing_at,last_payment_at,started_at,cancelled_at,created_at,updated_at
    ) VALUES(?,'dodo',?,?,?,'test_mode',?,?,?,?,?,?,?)
    ON CONFLICT(provider_subscription_id) DO UPDATE SET
      provider='dodo',user_id=excluded.user_id,tier_id=excluded.tier_id,
      external_plan_id=excluded.external_plan_id,environment='test_mode',
      status=excluded.status,
      next_billing_at=COALESCE(excluded.next_billing_at,member_subscriptions.next_billing_at),
      last_payment_at=COALESCE(excluded.last_payment_at,member_subscriptions.last_payment_at),
      started_at=COALESCE(member_subscriptions.started_at,excluded.started_at),
      cancelled_at=excluded.cancelled_at,updated_at=excluded.updated_at`)
    .bind(
      subscriptionId, owner.user_id, owner.tier_id, productId, status,
      nextBilling, lastPaymentAt, startedAt, cancelledAt, now, now
    ).run();

  const tier = await env.DB.prepare("SELECT id,name,price FROM membership_tiers WHERE id=? LIMIT 1")
    .bind(owner.tier_id).first();
  if (!tier) throw new Error("OX membership tier no longer exists.");

  if (status === "ACTIVE") {
    await env.DB.prepare(`UPDATE users SET account_status='Active',membership_status='Active',
      membership_tier_id=?,membership_plan=?,membership_started_at=COALESCE(membership_started_at,?),
      membership_expires_at=NULL,payment_status='Paid',latest_amount=?,updated_at=? WHERE id=?`)
      .bind(tier.id, tier.name, startedAt, tier.price || "$0.00", now, owner.user_id).run();
  } else if (status === "CANCELLED") {
    const paidThrough = nextBilling && new Date(nextBilling).getTime() > Date.now() ? nextBilling : null;
    if (paidThrough) {
      await env.DB.prepare(`UPDATE users SET membership_status='Active',membership_tier_id=?,membership_plan=?,
        membership_expires_at=?,payment_status='Cancelled',latest_amount=?,updated_at=? WHERE id=?`)
        .bind(tier.id, tier.name, paidThrough, tier.price || "$0.00", now, owner.user_id).run();
    } else {
      await env.DB.prepare(`UPDATE users SET membership_status='Cancelled',membership_expires_at=NULL,
        payment_status='Cancelled',updated_at=? WHERE id=?`).bind(now, owner.user_id).run();
    }
  } else if (["EXPIRED", "FAILED", "ON_HOLD", "PAUSED"].includes(status)) {
    const paymentStatus = status === "FAILED" ? "Failed" : (status === "ON_HOLD" ? "On Hold" : status[0] + status.slice(1).toLowerCase());
    await env.DB.prepare(`UPDATE users SET membership_status='Expired',membership_expires_at=NULL,
      payment_status=?,updated_at=? WHERE id=?`).bind(paymentStatus, now, owner.user_id).run();
  }

  if (owner.token) {
    await env.DB.prepare("UPDATE payment_checkout_sessions SET used_at=COALESCE(used_at,?) WHERE token=? AND provider='dodo'")
      .bind(now, owner.token).run().catch(() => null);
  }

  return { subscriptionId, status, nextBilling };
}


function dodoPaymentHasProduct(data, expectedProductId) {
  const expected = String(expectedProductId || "").trim();
  const cart = Array.isArray(data?.product_cart) ? data.product_cart : [];
  return Boolean(expected) && cart.some(item =>
    String(item?.product_id || "").trim() === expected &&
    Number(item?.quantity || 0) >= 1
  );
}

async function handleDodoLifetimePaymentEvent(env, type, data) {
  const metadata = data && typeof data.metadata === "object" && data.metadata ? data.metadata : {};
  if (String(metadata.ox_purchase_type || "") !== "lifetime_story") return { handled: false };

  const token = String(metadata.ox_lifetime_token || "").trim();
  if (!token) throw new Error("Dodo Lifetime Story payment is missing the OX checkout token.");

  const checkout = await env.DB.prepare(`SELECT * FROM dodo_lifetime_checkout_sessions
    WHERE token=? AND environment='test_mode' LIMIT 1`).bind(token).first().catch(() => null);
  if (!checkout) throw new Error("Dodo Lifetime Story checkout was not found.");

  if (metadata.ox_user_id && String(metadata.ox_user_id) !== String(checkout.user_id)) {
    throw new Error("Dodo Lifetime Story user verification failed.");
  }
  if (metadata.ox_story_id && String(metadata.ox_story_id) !== String(checkout.story_id_snapshot)) {
    throw new Error("Dodo Lifetime Story story verification failed.");
  }
  if (metadata.ox_permanent_story_id && String(metadata.ox_permanent_story_id) !== String(checkout.permanent_story_id)) {
    throw new Error("Dodo Lifetime Story identity verification failed.");
  }

  const checkoutSessionId = String(data?.checkout_session_id || "").trim();
  if (checkoutSessionId && String(checkout.checkout_session_id || "") && checkoutSessionId !== String(checkout.checkout_session_id)) {
    throw new Error("Dodo Lifetime Story checkout-session verification failed.");
  }

  const paymentId = String(data?.payment_id || "").trim();
  const user = await env.DB.prepare("SELECT id,name,email FROM users WHERE id=? LIMIT 1").bind(checkout.user_id).first();
  if (!user) throw new Error("OX customer no longer exists for this checkout.");

  const customerEmail = String(data?.customer?.email || "").trim().toLowerCase();
  if (customerEmail && customerEmail !== String(user.email || "").trim().toLowerCase()) {
    throw new Error("Dodo Lifetime Story customer verification failed.");
  }

  if (type === "payment.failed" || type === "payment.cancelled") {
    const status = type === "payment.failed" ? "FAILED" : "CANCELLED";
    await env.DB.prepare(`UPDATE dodo_lifetime_checkout_sessions
      SET status=?,payment_id=COALESCE(payment_id,?) WHERE token=? AND status<>'COMPLETED'`)
      .bind(status, paymentId || null, token).run();
    return { handled: true, userId: user.id, paymentId, status, completed: false };
  }

  if (type !== "payment.succeeded") {
    return { handled: true, userId: user.id, paymentId, status: String(checkout.status || "PENDING"), completed: checkout.status === "COMPLETED" };
  }

  const expectedProductId = String(DODO_TEST_LIFETIME_PRODUCT_ID || "").trim();
  if (String(checkout.product_id || "") !== expectedProductId || !dodoPaymentHasProduct(data, expectedProductId)) {
    throw new Error("Dodo Lifetime Story product verification failed.");
  }
  if (!paymentId) throw new Error("Dodo Lifetime Story payment is missing its payment ID.");

  const existingByPayment = await env.DB.prepare("SELECT token FROM dodo_lifetime_checkout_sessions WHERE payment_id=? LIMIT 1")
    .bind(paymentId).first().catch(() => null);
  if (existingByPayment && String(existingByPayment.token) !== String(token)) {
    throw new Error("This Dodo payment is already linked to another OX checkout.");
  }

  if (checkout.status === "COMPLETED") {
    const purchase = await activeLifetimePurchase(env, user.id, checkout.permanent_story_id);
    return { handled: true, userId: user.id, paymentId, status: "COMPLETED", completed: true, purchaseId: purchase?.id || null };
  }

  const existingOwnership = await activeLifetimePurchase(env, user.id, checkout.permanent_story_id);
  const now = new Date().toISOString();
  if (existingOwnership) {
    await env.DB.prepare(`UPDATE dodo_lifetime_checkout_sessions
      SET status='DUPLICATE_COMPLETED',payment_id=?,completed_at=? WHERE token=?`)
      .bind(paymentId, now, token).run().catch(() => null);
    await createAdminNotification(env, {
      type: "payment",
      title: "Duplicate Dodo lifetime payment needs review",
      body: `${user.name || user.email} · ${checkout.title_snapshot} · duplicate one-time payment`,
      route: "lifetime",
      userId: user.id,
      relatedKey: `dodo-lifetime-duplicate:${paymentId}`
    }).catch(() => null);
    return { handled: true, userId: user.id, paymentId, status: "DUPLICATE_COMPLETED", completed: true, duplicate: true };
  }

  const purchaseId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO story_lifetime_purchases(
      id,user_id,user_name_snapshot,user_email_snapshot,permanent_story_id,original_story_id,original_title,
      original_drive_url,original_drive_folder_id,original_cover,amount,currency,provider,environment,
      paypal_order_id,paypal_capture_id,purchase_status,entitlement_status,purchased_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,'Completed','Active',?,?)`)
      .bind(
        purchaseId, user.id, user.name || "", user.email || "", checkout.permanent_story_id,
        checkout.story_id_snapshot, checkout.title_snapshot, checkout.drive_url_snapshot,
        checkout.drive_folder_id_snapshot, checkout.cover_snapshot, LIFETIME_STORY_PRICE,
        LIFETIME_STORY_CURRENCY, "dodo", "test_mode", now, now
      ),
    env.DB.prepare(`UPDATE dodo_lifetime_checkout_sessions
      SET status='COMPLETED',payment_id=?,completed_at=? WHERE token=?`)
      .bind(paymentId, now, token),
    env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('payment','Dodo lifetime story purchase completed',?,?)")
      .bind(`${user.email} · ${checkout.title_snapshot} · $${LIFETIME_STORY_PRICE} · ${paymentId}.`, now)
  ]);

  await createAdminNotification(env, {
    type: "payment",
    title: "Lifetime story purchased",
    body: `${user.name || user.email} · ${checkout.title_snapshot} · $${LIFETIME_STORY_PRICE} · Dodo Test`,
    route: "lifetime",
    userId: user.id,
    relatedKey: `dodo-lifetime:${paymentId}`
  }).catch(() => null);

  return {
    handled: true, userId: user.id, paymentId, status: "COMPLETED", completed: true,
    purchaseId, storyId: checkout.story_id_snapshot, permanentStoryId: checkout.permanent_story_id
  };
}


function dodoEventAmount(data) {
  const minor = Number(
    data?.total_amount ??
    data?.recurring_pre_tax_amount ??
    data?.settlement_amount ??
    0
  );
  return Number.isFinite(minor) && minor > 0 ? (minor / 100).toFixed(2) : "";
}

async function handleDodoTestWebhook(request, env) {
  const rawBody = await request.text();
  let verified = false;
  try { verified = await verifyDodoTestWebhook(request, env, rawBody); }
  catch (error) { return json({ error: error.message || "Dodo webhook verification is not configured." }, 503); }
  if (!verified) return json({ error: "Invalid Dodo webhook signature." }, 401);

  let event;
  try { event = JSON.parse(rawBody); }
  catch { return json({ error: "Invalid Dodo webhook JSON." }, 400); }

  const webhookId = String(request.headers.get("webhook-id") || "").trim();
  const type = String(event?.type || "").trim();
  const data = event?.data && typeof event.data === "object" ? event.data : {};
  if (!webhookId || !type) return json({ error: "Incomplete Dodo webhook." }, 400);

  const duplicate = await env.DB.prepare("SELECT id FROM payment_events WHERE provider_event_id=? LIMIT 1")
    .bind(webhookId).first().catch(() => null);
  if (duplicate) return json({ ok: true, duplicate: true });

  try {
    const lifetimeResult = type.startsWith("payment.")
      ? await handleDodoLifetimePaymentEvent(env, type, data)
      : { handled: false };

    const owner = lifetimeResult.handled ? null : await resolveDodoWebhookOwner(env, data);
    const isSubscriptionEvent = type.startsWith("subscription.");
    let saved = null;

    if (isSubscriptionEvent && owner) {
      saved = await saveDodoTestSubscription(env, owner, data, type);
    }

    const userId = lifetimeResult.userId || owner?.user_id || null;
    const subscriptionId = String(data?.subscription_id || saved?.subscriptionId || "").trim() || null;
    const currency = String(data?.currency || "").trim().toUpperCase();
    const amount = dodoEventAmount(data);
    const now = new Date().toISOString();
    const userSnapshot = userId
      ? await env.DB.prepare("SELECT name,email FROM users WHERE id=? LIMIT 1").bind(userId).first().catch(() => null)
      : null;

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO payment_events(
        provider,provider_event_id,event_type,user_id,provider_subscription_id,amount,currency,
        environment,status,occurred_at,created_at,user_name_snapshot,user_email_snapshot
      ) VALUES('dodo',?,?,?,?,?,?,'test_mode','Processed',?,?,?,?)`)
        .bind(
          webhookId, type, userId, subscriptionId, amount, currency,
          event?.timestamp || null, now, userSnapshot?.name || "", userSnapshot?.email || ""
        ),
      env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('payment','Dodo test webhook processed',?,?)")
        .bind(`${type}${subscriptionId ? ` · ${subscriptionId}` : ""}${saved?.status ? ` · ${saved.status}` : ""}.`, now)
    ]);

    if (userId && (lifetimeResult.completed || type === "payment.succeeded" || (type === "subscription.active" && amount))) {
      await recordPromotionPaymentAttribution(env, userId, webhookId, amount, currency, "dodo", event?.timestamp || now);
    }

    return json({
      ok: true,
      event: type,
      mapped: Boolean(owner || lifetimeResult.handled),
      activated: saved?.status === "ACTIVE",
      lifetimeCompleted: Boolean(lifetimeResult.completed),
      status: lifetimeResult.status || saved?.status || null
    });
  } catch (error) {
    console.error("Dodo test webhook processing failed", error);
    return json({ error: error.message || "Unable to process Dodo test webhook." }, 500);
  }
}

// ---------------------------------------------------------------------------
// PayPal recurring membership payments
// ---------------------------------------------------------------------------
function paypalApiBase(mode = "sandbox") {
  return String(mode).toLowerCase() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function getPaypalSettings(env) {
  const row = await env.DB.prepare("SELECT enabled,mode,client_id,webhook_id,support_enabled,support_email,support_min_amount FROM payment_provider_settings WHERE provider='paypal'").first();
  const plans = await env.DB.prepare("SELECT tier_id,external_plan_id FROM membership_payment_plans WHERE provider='paypal'").all();
  return {
    enabled: Number(row?.enabled || 0) === 1,
    mode: row?.mode === "live" ? "live" : "sandbox",
    clientId: String(row?.client_id || "").trim(),
    webhookId: String(row?.webhook_id || "").trim(),
    secretConfigured: Boolean(String(env.PAYPAL_CLIENT_SECRET || "").trim()),
    supportEnabled: Number(row?.support_enabled || 0) === 1,
    supportTarget: String(row?.support_email || "").trim(),
    supportEmail: String(row?.support_email || "").trim(),
    supportMinAmount: Math.max(1, Math.min(10000, Number(row?.support_min_amount || 9) || 9)),
    supportCurrency: "USD",
    plans: Object.fromEntries((plans.results || []).map(r => [r.tier_id, String(r.external_plan_id || "").trim()]))
  };
}

async function paypalAccessToken(env, config = null) {
  const cfg = config || await getPaypalSettings(env);
  const secret = String(env.PAYPAL_CLIENT_SECRET || "").trim();
  if (!cfg.clientId || !secret) throw new Error("PayPal Client ID or Client Secret is not configured.");
  const auth = btoa(`${cfg.clientId}:${secret}`);
  const response = await fetch(`${paypalApiBase(cfg.mode)}/v1/oauth2/token`, {
    method: "POST",
    headers: { "authorization": `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || "Unable to authenticate with PayPal.");
  return payload.access_token;
}

async function paypalRequest(env, path, options = {}, config = null) {
  const cfg = config || await getPaypalSettings(env);
  const token = await paypalAccessToken(env, cfg);
  const response = await fetch(`${paypalApiBase(cfg.mode)}${path}`, {
    ...options,
    headers: { "authorization": `Bearer ${token}`, "content-type": "application/json", "accept": "application/json", ...(options.headers || {}) }
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok) {
    const detail = payload?.details?.[0]?.description || payload?.message || payload?.error_description || payload?.name || `PayPal request failed (${response.status}).`;
    const error = new Error(detail); error.status = response.status; error.payload = payload; throw error;
  }
  return payload;
}

async function handleAdminPaypalGet(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  const config = await getPaypalSettings(env);
  const tiers = await env.DB.prepare("SELECT id,name,price,cycle,status FROM membership_tiers ORDER BY sort_order ASC,name ASC").all();
  return json({ ok: true, config, tiers: (tiers.results || []).map(t => ({ ...t, planId: config.plans[t.id] || "" })) });
}

async function handleAdminPaypalSave(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const enabled = body.enabled === true ? 1 : 0;
  const mode = body.mode === "live" ? "live" : "sandbox";
  const clientId = String(body.clientId || "").trim().slice(0, 220);
  const webhookId = String(body.webhookId || "").trim().slice(0, 120);
  const supportEnabled = body.supportEnabled === true ? 1 : 0;
  const supportTarget = String(body.supportTarget ?? body.supportEmail ?? "").trim().slice(0, 254);
  const supportMinAmountRaw = String(body.supportMinAmount ?? "9").trim();
  const supportMinAmount = /^\d{1,5}$/.test(supportMinAmountRaw) ? Number(supportMinAmountRaw) : NaN;
  if (!Number.isInteger(supportMinAmount) || supportMinAmount < 1 || supportMinAmount > 10000) return json({ error: "Minimum Support amount must be a whole number from $1 to $10,000." }, 400);
  const supportIsEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportTarget);
  const supportPaypalMe = normalizePaypalMeTarget(supportTarget);
  if (supportEnabled && !supportIsEmail && !supportPaypalMe) return json({ error: "Enter a valid PayPal.Me link or PayPal email address for Support." }, 400);
  const plans = body.plans && typeof body.plans === "object" ? body.plans : {};
  const now = new Date().toISOString();
  const tierRows = await env.DB.prepare("SELECT id FROM membership_tiers").all();
  const tierIds = new Set((tierRows.results || []).map(r => r.id));
  const statements = [
    env.DB.prepare(`INSERT INTO payment_provider_settings(provider,enabled,mode,client_id,webhook_id,support_enabled,support_email,support_min_amount,updated_at)
      VALUES('paypal',?,?,?,?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET enabled=excluded.enabled,mode=excluded.mode,
      client_id=excluded.client_id,webhook_id=excluded.webhook_id,support_enabled=excluded.support_enabled,support_email=excluded.support_email,
      support_min_amount=excluded.support_min_amount,updated_at=excluded.updated_at`)
      .bind(enabled, mode, clientId, webhookId, supportEnabled, supportTarget, supportMinAmount, now)
  ];
  for (const [tierId, rawPlanId] of Object.entries(plans)) {
    if (!tierIds.has(tierId)) continue;
    const planId = String(rawPlanId || "").trim().slice(0, 100);
    statements.push(env.DB.prepare(`INSERT INTO membership_payment_plans(tier_id,provider,external_plan_id,updated_at)
      VALUES(?,'paypal',?,?) ON CONFLICT(tier_id,provider) DO UPDATE SET external_plan_id=excluded.external_plan_id,updated_at=excluded.updated_at`)
      .bind(tierId, planId, now));
    if (planId) statements.push(env.DB.prepare(`UPDATE member_subscriptions SET tier_id=?,environment=CASE WHEN COALESCE(environment,'')='' THEN ? ELSE environment END,updated_at=?
      WHERE provider='paypal' AND external_plan_id=? AND (tier_id IS NULL OR tier_id<>? OR COALESCE(environment,'')='')`).bind(tierId, mode, now, planId, tierId));
  }
  await env.DB.batch(statements);
  await env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('payment','PayPal settings updated',?,?)")
    .bind(`${mode} mode · ${enabled ? "enabled" : "disabled"}.`, now).run();
  return handleAdminPaypalGet(request, env);
}

async function handleAdminPaypalTest(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  try {
    const config = await getPaypalSettings(env);
    await paypalAccessToken(env, config);
    const planChecks = [];
    for (const [tierId, planId] of Object.entries(config.plans)) {
      if (!planId) continue;
      try {
        const plan = await paypalRequest(env, `/v1/billing/plans/${encodeURIComponent(planId)}`, { method: "GET" }, config);
        planChecks.push({ tierId, planId, ok: true, status: plan.status || "Unknown" });
      } catch (error) {
        planChecks.push({ tierId, planId, ok: false, error: error.message });
      }
    }
    return json({ ok: true, message: "PayPal credentials connected.", planChecks });
  } catch (error) {
    return json({ error: error.message || "PayPal connection failed." }, 400);
  }
}


async function fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function googleDriveIntegrationHealth(env) {
  const endpoint = String(env.GOOGLE_APPS_SCRIPT_URL || "").trim();
  const secret = String(env.GOOGLE_APPS_SCRIPT_SECRET || "").trim();
  const base = {
    configured: Boolean(endpoint && secret),
    urlConfigured: Boolean(endpoint),
    secretConfigured: Boolean(secret),
    method: "Apps Script",
    status: "Not connected",
    ready: false,
    api: "",
    driveApp: null,
    advancedDrive: null,
    error: ""
  };
  if (!base.configured) return base;
  try {
    const healthUrl = new URL(endpoint);
    healthUrl.searchParams.set("mode", "health");
    healthUrl.searchParams.set("key", secret);
    const response = await fetchWithTimeout(healthUrl.toString(), { method: "GET", redirect: "follow" }, 10000);
    const text = await response.text();
    let payload = {};
    try { payload = JSON.parse(text || "{}"); } catch { throw new Error(`Apps Script returned HTTP ${response.status} with a non-JSON response.`); }
    if (!response.ok || !payload.ok || payload.ready === false) {
      throw new Error(String(payload.error || `Apps Script health check failed with HTTP ${response.status}.`));
    }
    return {
      ...base,
      status: "Connected",
      ready: true,
      api: String(payload.api || payload.strategy || "OX Drive Scanner"),
      driveApp: payload.driveApp !== false,
      advancedDrive: Boolean(payload.advancedDrive),
      service: String(payload.service || "OX Drive Scanner")
    };
  } catch (error) {
    return { ...base, status: "Connection error", error: error?.name === "AbortError" ? "Google Drive / Apps Script health check timed out." : String(error?.message || error) };
  }
}

async function paypalIntegrationHealth(env) {
  let config;
  try { config = await getPaypalSettings(env); }
  catch (error) { return { configured: false, status: "Connection error", error: String(error?.message || error), mode: "", enabled: false, planCount: 0, webhookConfigured: false }; }
  const planEntries = Object.entries(config.plans || {}).filter(([, id]) => String(id || "").trim());
  const base = {
    configured: Boolean(config.clientId && config.secretConfigured),
    clientIdConfigured: Boolean(config.clientId),
    secretConfigured: Boolean(config.secretConfigured),
    webhookConfigured: Boolean(config.webhookId),
    enabled: Boolean(config.enabled),
    mode: String(config.mode || "sandbox").toLowerCase(),
    planCount: planEntries.length,
    status: "Not connected",
    error: "",
    planChecks: []
  };
  if (!base.configured) return base;
  try {
    await paypalAccessToken(env, config);
    const checks = [];
    for (const [tierId, planId] of planEntries) {
      try {
        const plan = await paypalRequest(env, `/v1/billing/plans/${encodeURIComponent(planId)}`, { method: "GET" }, config);
        checks.push({ tierId, ok: true, status: String(plan.status || "Unknown") });
      } catch (error) {
        checks.push({ tierId, ok: false, error: String(error?.message || error) });
      }
    }
    const failed = checks.filter(item => !item.ok);
    return failed.length
      ? { ...base, status: "Connection error", planChecks: checks, error: `${failed.length} configured PayPal Plan ID check${failed.length === 1 ? "" : "s"} failed.` }
      : { ...base, status: "Connected", planChecks: checks };
  } catch (error) {
    return { ...base, status: "Connection error", error: String(error?.message || "PayPal connection failed.") };
  }
}

async function handleAdminIntegrationsStatus(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  const [googleDrive, paypal, googleAuth] = await Promise.all([
    googleDriveIntegrationHealth(env),
    paypalIntegrationHealth(env),
    getGoogleAuthSettings(env)
  ]);
  return json({ ok: true, checkedAt: new Date().toISOString(), googleDrive, paypal, googleAuth: {
    status: googleAuth.clientId ? "Configured" : "Not configured", clientIdConfigured: Boolean(googleAuth.clientId)
  } });
}


// B9.2 internal read-only library feed. Never exposes Drive data to unauthenticated requests.
function b92SyncAuth(request,env) {
  const expected=String(env.OX_PLAYER_SYNC_KEY||'');
  if(expected.length<32) return false;
  const a=String(request.headers.get('authorization')||''), b=`Bearer ${expected}`;
  let diff=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
}
async function b92InternalLibrary(request,env) {
  if(!b92SyncAuth(request,env))return json({error:'Unauthorized'},401);
  const result=await env.DB.prepare('SELECT id,title,visible,drive_url FROM stories ORDER BY title COLLATE NOCASE').all();
  const stories=(result.results||[]).map(s=>({id:String(s.id||''),title:String(s.title||''),visible:Number(s.visible||0)===1,folderId:extractDriveFolderId(s.drive_url||'')}));
  return new Response(JSON.stringify({ok:true,stories,generatedAt:new Date().toISOString()}),{headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
function b92NotifyPlayer(ctx,env,ids,deletedIds=[]) {
  if(!ctx?.waitUntil || !String(env.OX_PLAYER_SYNC_KEY||'') || (!ids.length&&!deletedIds.length))return;
  const target='https://listen.ox-audio-player.workers.dev/api/internal/ox-notify';
  const body=JSON.stringify({ids:ids.slice(0,100),deletedIds:deletedIds.slice(0,100)});
  ctx.waitUntil(fetch(target,{method:'POST',headers:{'authorization':`Bearer ${env.OX_PLAYER_SYNC_KEY}`,'content-type':'application/json'},body,redirect:'error'})
    .then(async r=>{if(!r.ok)console.warn('B9.2 Player notice was not accepted:',r.status)})
    .catch(()=>console.warn('B9.2 Player notice delivery failed; nightly sync will reconcile')));
}
const DEFAULT_PLAYER_DELIVERY = Object.freeze({ enabled: false });

async function getPlayerDeliveryConfig(env) {
  if (!(await databaseReady(env))) return { ...DEFAULT_PLAYER_DELIVERY };
  try {
    const row = await env.DB.prepare("SELECT value FROM site_settings WHERE key='player_delivery'").first();
    const parsed = safeParse(row?.value || "{}", {});
    return { enabled: parsed?.enabled === true };
  } catch {
    return { ...DEFAULT_PLAYER_DELIVERY };
  }
}

async function savePlayerDeliveryConfig(env, enabled) {
  const now = new Date().toISOString();
  const config = { enabled: enabled === true, updatedAt: now };
  await env.DB.prepare(`INSERT INTO site_settings(key,value,updated_at) VALUES('player_delivery',?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
    .bind(JSON.stringify(config), now).run();
  return config;
}

async function handleAdminPlayerDelivery(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  if (request.method === "GET") return json({ ok: true, config: await getPlayerDeliveryConfig(env) });
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const config = await savePlayerDeliveryConfig(env, body.enabled === true);
  await env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('system','Protected Player mode changed',?,?)")
    .bind(config.enabled ? "Protected Player enabled. Eligible story opens use Player Account B." : "Protected Player disabled. Eligible story opens use the direct Google Drive fallback.", new Date().toISOString())
    .run().catch(() => null);
  return json({ ok: true, config });
}

async function playerCatalogSourceVersion(folderId) {
  const id = String(folderId || "").trim();
  if (!id) return "";
  return (await sha256Hex(id)).slice(0, 12);
}

async function fetchPlayerCatalogStatus(env) {
  const base = oxPlayerBaseUrl(env);
  const response = await fetchWithTimeout(`${base}/api/catalog-status`, {
    method: "GET",
    headers: { accept: "application/json" },
    cf: { cacheTtl: 20, cacheEverything: true }
  }, 8000);
  const text = await response.text();
  let payload = {};
  try { payload = JSON.parse(text || "{}"); }
  catch { throw new Error(`Player status returned non-JSON data (HTTP ${response.status}).`); }
  if (!response.ok || payload?.ok !== true || !Array.isArray(payload.catalogs)) {
    if (response.status === 404) throw new Error("Player status endpoint is not deployed yet. Deploy the B8.2 Player build first.");
    throw new Error(String(payload?.error || `Player status failed with HTTP ${response.status}.`));
  }
  return { base, payload };
}

async function buildAdminPlayerCatalogState(env) {
  const result = await env.DB.prepare(`SELECT id,title,visible,drive_url,sort_order FROM stories ORDER BY sort_order ASC,title COLLATE NOCASE ASC`).all();
  const stories = result.results || [];
  let playerAvailable = true;
  let playerError = "";
  let playerBase = oxPlayerBaseUrl(env);
  let playerCatalogs = [];
  try {
    const remote = await fetchPlayerCatalogStatus(env);
    playerBase = remote.base;
    playerCatalogs = remote.payload.catalogs || [];
  } catch (error) {
    playerAvailable = false;
    playerError = String(error?.message || error);
  }

  const remoteById = new Map(playerCatalogs.map(item => [String(item.storyId || ""), item]));
  const currentIds = new Set(stories.map(row => String(row.id || "")));
  const rows = [];

  for (const row of stories) {
    const storyId = String(row.id || "");
    const folderId = extractDriveFolderId(row.drive_url || "");
    const sourceVersion = folderId ? await playerCatalogSourceVersion(folderId) : "";
    const remote = remoteById.get(storyId) || null;
    let status = "PLAYER_UNAVAILABLE";
    if (playerAvailable) {
      if (!folderId) status = "NO_DRIVE_SOURCE";
      else if (!remote) status = "MISSING_CATALOG";
      else if (String(remote.sourceVersion || "") === sourceVersion) status = "PUBLISHED_CURRENT";
      else status = "SOURCE_CHANGED";
    }
    rows.push({
      storyId,
      title: String(row.title || storyId),
      visible: Number(row.visible ?? 1) === 1,
      hasDriveSource: Boolean(folderId),
      sourceVersion,
      status,
      published: Boolean(remote),
      generationId: String(remote?.generationId || ""),
      folderCount: Number(remote?.folderCount || 0),
      trackCount: Number(remote?.trackCount || 0)
    });
  }

  if (playerAvailable) {
    for (const remote of playerCatalogs) {
      const storyId = String(remote.storyId || "");
      if (!storyId || currentIds.has(storyId)) continue;
      rows.push({
        storyId,
        title: storyId,
        visible: false,
        hasDriveSource: false,
        sourceVersion: "",
        status: "ORPHANED_PUBLISHED",
        published: true,
        generationId: String(remote.generationId || ""),
        folderCount: Number(remote.folderCount || 0),
        trackCount: Number(remote.trackCount || 0)
      });
    }
  }

  const counts = {};
  for (const row of rows) counts[row.status] = Number(counts[row.status] || 0) + 1;
  const attention = Number(counts.MISSING_CATALOG || 0) + Number(counts.SOURCE_CHANGED || 0) + Number(counts.NO_DRIVE_SOURCE || 0) + Number(counts.ORPHANED_PUBLISHED || 0);
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    playerAvailable,
    playerError,
    playerBase,
    currentStories: stories.length,
    publishedCatalogs: playerAvailable ? playerCatalogs.length : null,
    attention,
    counts,
    rows
  };
}

async function handleAdminPlayerCatalogs(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  try { return json(await buildAdminPlayerCatalogState(env)); }
  catch (error) { return json({ error: String(error?.message || error) }, 500); }
}

async function handleAdminPlayerCatalogSnapshot(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  const result = await env.DB.prepare(`SELECT id,title,visible,drive_url FROM stories ORDER BY sort_order ASC,title COLLATE NOCASE ASC`).all();
  const stories = (result.results || []).map(row => ({
    id: String(row.id || ""),
    title: String(row.title || row.id || ""),
    visible: Number(row.visible ?? 1) === 1,
    driveUrl: String(row.drive_url || "")
  })).filter(row => row.id);
  return json({
    ok: true,
    snapshot: {
      format: "ox-player-story-snapshot",
      version: 1,
      generatedAt: new Date().toISOString(),
      source: "oxnovels-admin",
      stories
    }
  });
}

async function handleAdminPlayerCatalogDriveCheck(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const storyId = String(body.storyId || "").trim().slice(0, 160);
  if (!storyId) return json({ error: "Story ID is required." }, 400);
  const story = await env.DB.prepare("SELECT id,title,drive_url FROM stories WHERE id=?").bind(storyId).first();
  if (!story) return json({ error: "Story not found." }, 404);
  const folderId = extractDriveFolderId(story.drive_url || "");
  if (!folderId) return json({ error: "This story has no valid Drive folder source." }, 400);
  const endpoint = String(env.GOOGLE_APPS_SCRIPT_URL || "").trim();
  const secret = String(env.GOOGLE_APPS_SCRIPT_SECRET || "").trim();
  if (!endpoint || !secret) return json({ error: "Google Drive / Apps Script is not configured." }, 409);
  try {
    // Reuse the already-deployed folder_chunk mode, but supply a root-only pending
    // item at the maximum depth so Apps Script verifies access without recursively
    // enumerating the story. This keeps Admin checks fast and inexpensive.
    const payload = await fetchAppsScriptPostJsonRetry(endpoint, {
      key: secret,
      mode: "folder_chunk",
      rootFolderId: folderId,
      maxFolders: 25,
      pending: [{ id: folderId, parentId: "", depth: 999 }]
    }, 2);
    const root = (Array.isArray(payload.nodes) ? payload.nodes : []).find(node => String(node?.id || "") === folderId);
    const errors = Array.isArray(payload.errors) ? payload.errors : [];
    if (!root || errors.some(item => String(item?.id || "") === folderId)) {
      const message = errors.find(item => String(item?.id || "") === folderId)?.error || "Drive folder could not be opened.";
      return json({ ok: false, storyId, title: String(story.title || storyId), accessible: false, error: String(message) }, 200);
    }
    return json({ ok: true, storyId, title: String(story.title || storyId), accessible: true, folderName: String(root.name || "") });
  } catch (error) {
    return json({ ok: false, storyId, title: String(story.title || storyId), accessible: false, error: String(error?.message || error) }, 200);
  }
}


function normalizePaypalMeTarget(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let candidate = raw;
  if (/^paypal\.me\//i.test(candidate)) candidate = `https://${candidate}`;
  let parsed;
  try { parsed = new URL(candidate); } catch { return ""; }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "paypal.me") return "";
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length !== 1 || !/^[a-z0-9]{1,20}$/i.test(parts[0])) return "";
  return `https://paypal.me/${parts[0]}`;
}

function paypalMeAmountUrl(target, amount, currency = "USD") {
  const base = normalizePaypalMeTarget(target);
  if (!base) return "";
  return `${base}/${Number(amount).toFixed(0)}${String(currency || "USD").toUpperCase()}`;
}

function validPaypalSupportEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function normalizeSupportAmount(value, minimum = 9) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,5}$/.test(raw)) return null;
  const amount = Number(raw);
  const min = Math.max(1, Math.min(10000, Number(minimum || 9) || 9));
  if (!Number.isInteger(amount) || amount < min || amount > 10000) return null;
  return amount;
}




function normalizeAdminStoryIds(values) {
  const source = Array.isArray(values) ? values : [];
  const seen = new Set();
  const ids = [];
  for (const value of source) {
    const id = String(value || "").trim().slice(0, 120);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= 500) break;
  }
  return ids;
}

async function adminStoryLifetimeProtectionRows(env, ids) {
  const cleanIds = normalizeAdminStoryIds(ids);
  if (!cleanIds.length) return [];
  const placeholders = cleanIds.map(() => "?").join(",");
  const result = await env.DB.prepare(`SELECT s.id,s.title,
      p.id AS permanent_story_id,p.state AS product_state,
      COUNT(lp.id) AS purchase_records,
      SUM(CASE WHEN lp.purchase_status='Completed' AND lp.entitlement_status='Active' THEN 1 ELSE 0 END) AS active_owners
    FROM stories s
    LEFT JOIN lifetime_story_products p ON p.current_story_id=s.id
    LEFT JOIN story_lifetime_purchases lp ON lp.permanent_story_id=p.id
    WHERE s.id IN (${placeholders})
    GROUP BY s.id,s.title,p.id,p.state`).bind(...cleanIds).all();
  const byId = new Map((result.results || []).map(row => [String(row.id), row]));
  return cleanIds.map(id => {
    const row = byId.get(id);
    if (!row) return { id, missing: true, title: id, permanentStoryId: null, productState: null, purchaseRecords: 0, activeOwners: 0, protected: false };
    const purchaseRecords = Number(row.purchase_records || 0);
    const activeOwners = Number(row.active_owners || 0);
    return {
      id: row.id,
      title: row.title || "Untitled Story",
      missing: false,
      permanentStoryId: row.permanent_story_id || null,
      productState: row.product_state || null,
      purchaseRecords,
      activeOwners,
      protected: purchaseRecords > 0
    };
  });
}

async function handleAdminStoryLifetimeProtection(request, env) {
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const ids = normalizeAdminStoryIds(body.ids);
  if (!ids.length) return json({ error: "Choose at least one story." }, 400);
  const stories = await adminStoryLifetimeProtectionRows(env, ids);
  return json({
    ok: true,
    stories,
    summary: {
      selected: ids.length,
      protectedStories: stories.filter(row => row.protected).length,
      activeOwners: stories.reduce((sum, row) => sum + Number(row.activeOwners || 0), 0),
      purchaseRecords: stories.reduce((sum, row) => sum + Number(row.purchaseRecords || 0), 0)
    }
  });
}

async function handleAdminStoryDelete(request, env) {
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const ids = normalizeAdminStoryIds(body.ids);
  if (!ids.length) return json({ error: "Choose at least one story." }, 400);

  const protection = await adminStoryLifetimeProtectionRows(env, ids);
  const existing = protection.filter(row => !row.missing);
  const protectedStories = existing.filter(row => row.protected);
  if (protectedStories.length && body.archiveProtected !== true) {
    return json({
      error: "Lifetime Purchase Protection: one or more selected stories have permanent purchase history.",
      code: "LIFETIME_PURCHASE_PROTECTION",
      protectedStories
    }, 409);
  }
  if (!existing.length) return json({ ok: true, deleted: 0, archived: 0, missing: ids.length });

  const now = new Date().toISOString();
  // Capture the latest Admin-side story details before any purchased story is
  // removed from the active library. The purchase-time snapshot remains
  // immutable; this adds one final identity-history alias for reconciliation.
  for (const item of protectedStories) {
    if (!item.permanentStoryId) continue;
    const story = await env.DB.prepare("SELECT id,title,cover,drive_url FROM stories WHERE id=?").bind(item.id).first();
    if (story) await recordLifetimeStorySnapshot(env, item.permanentStoryId, story, now);
  }

  const existingIds = existing.map(row => String(row.id));
  const placeholders = existingIds.map(() => "?").join(",");
  const statements = [
    env.DB.prepare(`DELETE FROM story_covers WHERE story_id IN (${placeholders})`).bind(...existingIds),
    env.DB.prepare(`DELETE FROM stories WHERE id IN (${placeholders})`).bind(...existingIds)
  ];
  for (const item of protectedStories) {
    if (!item.permanentStoryId) continue;
    statements.push(
      env.DB.prepare("UPDATE lifetime_story_products SET current_story_id=NULL,state='Archived',updated_at=? WHERE id=?")
        .bind(now, item.permanentStoryId),
      env.DB.prepare(`INSERT INTO lifetime_story_assignments(permanent_story_id,from_story_id,to_story_id,source,reason,note,changed_at)
        VALUES(?,?,?,'admin','story-archived','Removed from active Story Library; lifetime purchase identity preserved.',?)`)
        .bind(item.permanentStoryId, item.id, "", now)
    );
  }
  const archivedNames = protectedStories.map(row => row.title).join(", ").slice(0, 900);
  statements.push(env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('story',?,?,?)")
    .bind(protectedStories.length ? "Story removal protected" : "Story deleted",
      protectedStories.length
        ? `${protectedStories.length} lifetime-owned stor${protectedStories.length === 1 ? "y was" : "ies were"} archived safely: ${archivedNames}`
        : `${existing.length} stor${existing.length === 1 ? "y was" : "ies were"} removed from the Story Library.`, now));
  if (protectedStories.length) {
    const activeOwners = protectedStories.reduce((sum, row) => sum + Number(row.activeOwners || 0), 0);
    statements.push(env.DB.prepare(`INSERT INTO admin_notifications(type,title,body,target_route,related_key,read_at,created_at)
      VALUES('story','Lifetime-owned story archived',?,'lifetime',?,NULL,?)`)
      .bind(`${protectedStories.length} purchased stor${protectedStories.length === 1 ? "y" : "ies"} removed from the active library. ${activeOwners} active lifetime entitlement${activeOwners === 1 ? "" : "s"} remain preserved and may need a replacement assignment.`,
        protectedStories[0]?.permanentStoryId || "lifetime-archive", now));
  }
  await env.DB.batch(statements);

  // Reconcile remaining active stories. Archived products are intentionally
  // excluded by syncLifetimeStoryProducts and therefore cannot be stolen by a
  // same-title story after an explicit Admin deletion.
  try { await syncLifetimeStoryProducts(env, { reason: "admin-story-delete" }); }
  catch (error) { console.warn("Lifetime story identity sync after delete skipped", error); }

  return json({
    ok: true,
    deleted: existing.length,
    archived: protectedStories.length,
    protectedStories,
    missing: ids.length - existing.length
  });
}

async function handleAdminLifetimePurchases(env) {
  const [purchaseResult, storyResult, productSummary] = await Promise.all([
    env.DB.prepare(`SELECT lp.id AS purchase_id,lp.user_id,lp.user_name_snapshot,lp.user_email_snapshot,
      lp.permanent_story_id,lp.original_story_id,lp.original_title,lp.original_drive_url,lp.original_drive_folder_id,
      lp.original_cover,lp.amount,lp.currency,lp.environment,lp.paypal_order_id,lp.paypal_capture_id,
      lp.purchase_status,lp.entitlement_status,lp.purchased_at,lp.updated_at,
      u.name AS current_user_name,u.email AS current_user_email,
      p.current_story_id,p.state AS product_state,
      s.title AS current_title,s.drive_url AS current_drive_url,s.cover AS current_cover,s.visible AS current_visible
      FROM story_lifetime_purchases lp
      JOIN lifetime_story_products p ON p.id=lp.permanent_story_id
      LEFT JOIN users u ON u.id=lp.user_id
      LEFT JOIN stories s ON s.id=p.current_story_id
      ORDER BY lp.purchased_at DESC`).all(),
    env.DB.prepare(`SELECT s.id,s.title,s.drive_url,s.cover,s.visible,s.sort_order,
      p.id AS linked_product_id,p.state AS linked_product_state,
      (SELECT COUNT(*) FROM story_lifetime_purchases lp WHERE lp.permanent_story_id=p.id) AS linked_purchase_count
      FROM stories s
      LEFT JOIN lifetime_story_products p ON p.current_story_id=s.id
      ORDER BY s.sort_order ASC,s.title ASC`).all(),
    env.DB.prepare(`SELECT
      COUNT(*) AS products,
      SUM(CASE WHEN current_story_id IS NULL AND state<>'Archived' AND EXISTS (
        SELECT 1 FROM story_lifetime_purchases lp WHERE lp.permanent_story_id=lifetime_story_products.id
      ) THEN 1 ELSE 0 END) AS needs_assignment
      FROM lifetime_story_products`).first()
  ]);

  const purchases = (purchaseResult.results || []).map(row => ({
    purchaseId: row.purchase_id,
    userId: row.user_id || null,
    userName: row.current_user_name || row.user_name_snapshot || "Deleted user",
    userEmail: row.current_user_email || row.user_email_snapshot || "",
    permanentStoryId: row.permanent_story_id,
    originalStoryId: row.original_story_id || "",
    originalTitle: row.original_title || "Purchased story",
    originalDriveUrl: row.original_drive_url || "",
    originalDriveFolderId: row.original_drive_folder_id || "",
    originalCover: row.original_cover || "",
    amount: row.amount || LIFETIME_STORY_PRICE,
    currency: row.currency || LIFETIME_STORY_CURRENCY,
    environment: row.environment || "",
    paypalOrderId: row.paypal_order_id || "",
    paypalCaptureId: row.paypal_capture_id || "",
    purchaseStatus: row.purchase_status || "",
    entitlementStatus: row.entitlement_status || "",
    purchasedAt: row.purchased_at || null,
    currentStoryId: row.current_story_id || null,
    currentTitle: row.current_title || null,
    currentDriveUrl: row.current_drive_url || "",
    currentCover: row.current_story_id ? lifetimePublicCover({ id: row.current_story_id, cover: row.current_cover }) : null,
    currentVisible: Number(row.current_visible || 0) === 1,
    productState: row.product_state || "Needs Assignment",
    linked: Boolean(row.current_story_id && row.product_state === "Active")
  }));
  const stories = (storyResult.results || []).map(row => ({
    id: row.id,
    title: row.title || "Untitled Story",
    driveUrl: row.drive_url || "",
    driveFolderId: lifetimeDriveFolderId(row.drive_url),
    cover: lifetimePublicCover(row),
    visible: Number(row.visible || 0) === 1,
    linkedProductId: row.linked_product_id || null,
    linkedProductState: row.linked_product_state || null,
    linkedPurchaseCount: Number(row.linked_purchase_count || 0)
  }));
  const completed = purchases.filter(p => p.purchaseStatus === "Completed");
  const active = purchases.filter(p => p.purchaseStatus === "Completed" && p.entitlementStatus === "Active");
  const gross = completed.reduce((sum, p) => sum + Math.max(0, financeAmountNumber(p.amount)), 0);
  return json({
    ok: true,
    summary: {
      purchases: purchases.length,
      activeEntitlements: active.length,
      needsAssignment: Number(productSummary?.needs_assignment || 0),
      grossRecorded: gross
    },
    purchases,
    stories
  });
}

async function handleAdminLifetimeAssignment(request, env) {
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const permanentStoryId = String(body.permanentStoryId || "").trim().slice(0, 120);
  const action = String(body.action || "assign").trim().toLowerCase();
  if (!permanentStoryId) return json({ error: "Permanent story id is required." }, 400);

  const product = await env.DB.prepare("SELECT * FROM lifetime_story_products WHERE id=?").bind(permanentStoryId).first();
  if (!product) return json({ error: "Lifetime story identity was not found." }, 404);
  const now = new Date().toISOString();
  const fromStoryId = String(product.current_story_id || "");

  if (action === "unavailable") {
    await env.DB.batch([
      env.DB.prepare("UPDATE lifetime_story_products SET current_story_id=NULL,state='Unavailable',updated_at=? WHERE id=?").bind(now, permanentStoryId),
      env.DB.prepare(`INSERT INTO lifetime_story_assignments(permanent_story_id,from_story_id,to_story_id,source,reason,note,changed_at)
        VALUES(?,?,?,'admin','temporarily-unavailable',?,?)`).bind(permanentStoryId, fromStoryId, "", String(body.note || "").trim().slice(0, 500), now),
      env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('story','Lifetime story marked unavailable',?,?)")
        .bind(`${permanentStoryId} · previous story ${fromStoryId || "none"}.`, now)
    ]);
    return json({ ok: true, state: "Unavailable" });
  }

  const storyId = String(body.storyId || "").trim().slice(0, 120);
  if (!storyId) return json({ error: "Choose a current story to assign." }, 400);
  const story = await env.DB.prepare("SELECT id,title,cover,drive_url FROM stories WHERE id=?").bind(storyId).first();
  if (!story) return json({ error: "The selected current story no longer exists." }, 404);

  const occupied = await env.DB.prepare("SELECT id FROM lifetime_story_products WHERE current_story_id=? AND id<>?")
    .bind(storyId, permanentStoryId).first();
  if (occupied?.id) {
    const owned = await env.DB.prepare("SELECT COUNT(*) AS count FROM story_lifetime_purchases WHERE permanent_story_id=?")
      .bind(occupied.id).first();
    if (Number(owned?.count || 0) > 0) {
      return json({ error: "That story is already linked to another lifetime identity that has purchases. It cannot be reassigned automatically." }, 409);
    }
    // It is safe to remove an auto-created identity that has never been purchased.
    await env.DB.prepare("DELETE FROM lifetime_story_products WHERE id=?").bind(occupied.id).run();
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE lifetime_story_products SET current_story_id=?,state='Active',updated_at=? WHERE id=?")
      .bind(storyId, now, permanentStoryId),
    env.DB.prepare(`INSERT INTO lifetime_story_assignments(permanent_story_id,from_story_id,to_story_id,source,reason,note,changed_at)
      VALUES(?,?,?,'admin','manual-assignment',?,?)`)
      .bind(permanentStoryId, fromStoryId, storyId, String(body.note || "").trim().slice(0, 500), now),
    env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('story','Lifetime story reassigned',?,?)")
      .bind(`${permanentStoryId} · ${fromStoryId || "unassigned"} → ${storyId} (${story.title}).`, now)
  ]);
  await recordLifetimeStorySnapshot(env, permanentStoryId, story, now).catch(() => null);
  // Recreate/reconcile identities for any other current story that became unassigned.
  await syncLifetimeStoryProducts(env, { reason: "admin-manual-lifetime-assignment" }).catch(error => console.warn("Lifetime post-assignment sync skipped", error));
  return json({ ok: true, state: "Active", storyId, title: story.title });
}

async function handleAdminLifetimeReconcile(env) {
  try {
    const result = await syncLifetimeStoryProducts(env, { reason: "admin-manual-reconcile" });
    await env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('story','Lifetime stories reconciled',?,?)")
      .bind(`${result.created || 0} identities created · ${result.relinked || 0} relinked · ${result.needsAssignment || 0} need assignment.`, new Date().toISOString()).run();
    return json({ ok: true, ...result });
  } catch (error) {
    return json({ error: error.message || "Unable to reconcile lifetime stories." }, 500);
  }
}

function lifetimePublicCover(row) {
  const raw = String(row?.cover || "").trim();
  if (!raw || (String(row?.id || "") !== "wolves-blood-moon" && raw === "/covers/wolves-blood-moon.svg")) {
    return `/api/story-cover/${encodeURIComponent(String(row?.id || ""))}`;
  }
  return raw;
}

async function lifetimePurchasableStory(env, storyId) {
  const cleanId = String(storyId || "").trim().slice(0, 120);
  if (!cleanId) return null;

  const findStory = () => env.DB.prepare(`SELECT s.id,s.title,s.description,s.genre,s.cover,s.drive_url,s.sort_order,
      p.id AS permanent_story_id,p.state AS permanent_state
    FROM stories s
    JOIN lifetime_story_products p ON p.current_story_id=s.id
    WHERE s.id=? AND s.visible=1 AND p.state='Active' LIMIT 1`).bind(cleanId).first();

  // The customer checkout path must stay fast. Permanent identities are normally
  // maintained when Admin saves/imports the story library, so a full-library
  // reconciliation is not part of every checkout. Only fall back to it if this
  // one story unexpectedly has no active permanent identity.
  let story = await findStory();
  if (story) return story;
  try {
    await syncLifetimeStoryProducts(env, { reason: "lifetime-checkout-repair" });
    story = await findStory();
  } catch (error) {
    console.warn("Lifetime identity repair skipped before checkout", error);
  }
  return story || null;
}

async function activeLifetimePurchase(env, userId, permanentStoryId) {
  if (!userId || !permanentStoryId) return null;
  return env.DB.prepare(`SELECT * FROM story_lifetime_purchases
    WHERE user_id=? AND permanent_story_id=? AND purchase_status='Completed' AND entitlement_status='Active'
    ORDER BY purchased_at DESC LIMIT 1`).bind(userId, permanentStoryId).first();
}

async function handleLifetimeStoryCatalog(request, env) {
  if (!(await databaseReady(env))) return json({ error: "Backend database is not initialized.", code: "DB_NOT_READY" }, 503);
  // Read-only hot path: do not reconcile the full story library here.
  // Reconciliation runs when Admin changes/imports stories; page visitors only
  // need the already-linked catalog and their own purchase flags.
  const user = await getCurrentUser(request, env);
  const userId = String(user?.id || "");
  const access = user ? await userAccessContext(env, user) : null;
  try {
    const result = await env.DB.prepare(`SELECT s.id,s.title,s.description,s.genre,s.cover,s.sort_order,p.id AS permanent_story_id,
      CASE WHEN lp.id IS NULL THEN 0 ELSE 1 END AS purchased
      FROM stories s
      LEFT JOIN lifetime_story_products p ON p.current_story_id=s.id AND p.state='Active'
      LEFT JOIN story_lifetime_purchases lp ON lp.permanent_story_id=p.id AND lp.user_id=?
        AND lp.purchase_status='Completed' AND lp.entitlement_status='Active'
      WHERE s.visible=1
      ORDER BY s.sort_order ASC,s.title ASC`).bind(userId).all();
    return json({
      ok: true,
      price: LIFETIME_STORY_PRICE,
      currency: LIFETIME_STORY_CURRENCY,
      loggedIn: Boolean(user),
      stories: (result.results || []).map(row => ({
        id: row.id,
        title: row.title,
        description: row.description || "",
        genre: row.genre || "Unverified",
        cover: lifetimePublicCover(row),
        purchasable: Boolean(row.permanent_story_id),
        purchased: access?.testMode
          ? Boolean(access.lifetimeEnabled && String(access.lifetimeStoryId) === String(row.id))
          : Number(row.purchased || 0) === 1
      }))
    });
  } catch (error) {
    console.error("Lifetime catalog failed", error);
    return json({ error: "Lifetime-story foundation is not ready locally yet. Apply the latest local migrations.", code: "LIFETIME_DB_NOT_READY" }, 503);
  }
}

async function handleLifetimeStoryMine(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: "Log in to view lifetime purchases.", code: "LOGIN_REQUIRED" }, 401);
  const access = await userAccessContext(env, user);
  if (access.testMode) {
    const simulated = await syntheticTestLifetimePurchase(env, user, access);
    return json({ ok:true, purchases:simulated ? [simulated] : [], testMode:true });
  }
  try {
    const result = await env.DB.prepare(`SELECT lp.id AS purchase_id,lp.permanent_story_id,lp.original_story_id,lp.original_title,lp.original_cover,
      lp.amount,lp.currency,lp.purchase_status,lp.entitlement_status,lp.purchased_at,
      p.current_story_id,p.state AS product_state,s.title AS current_title,s.cover AS current_cover,s.drive_url AS current_drive_url,s.visible AS current_visible
      FROM story_lifetime_purchases lp
      JOIN lifetime_story_products p ON p.id=lp.permanent_story_id
      LEFT JOIN stories s ON s.id=p.current_story_id
      WHERE lp.user_id=? ORDER BY lp.purchased_at DESC`).bind(user.id).all();
    return json({ ok: true, purchases: (result.results || []).map(row => ({
      purchaseId: row.purchase_id,
      permanentStoryId: row.permanent_story_id,
      originalStoryId: row.original_story_id,
      originalTitle: row.original_title,
      originalCover: row.original_cover,
      amount: row.amount,
      currency: row.currency,
      purchaseStatus: row.purchase_status,
      entitlementStatus: row.entitlement_status,
      purchasedAt: row.purchased_at,
      currentStoryId: row.current_story_id || null,
      currentTitle: row.current_title || null,
      currentCover: row.current_story_id ? lifetimePublicCover({ id: row.current_story_id, cover: row.current_cover }) : null,
      currentAvailable: Boolean(row.current_story_id && Number(row.current_visible || 0) === 1 && row.product_state === "Active")
    })) });
  } catch (error) {
    return json({ error: "Lifetime purchases are not available yet. Apply the latest local migrations.", code: "LIFETIME_DB_NOT_READY" }, 503);
  }
}

async function handleLifetimeStoryCreateOrder(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: "Continue with Google before payment.", code: "LOGIN_REQUIRED" }, 401);
  if (user.account_status !== "Active") return json({ error: "This account cannot make purchases.", code: "ACCOUNT_NOT_ACTIVE" }, 403);

  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const story = await lifetimePurchasableStory(env, body.storyId);
  if (!story) return json({ error: "This story is not available for lifetime purchase.", code: "STORY_NOT_PURCHASABLE" }, 404);

  const owned = await activeLifetimePurchase(env, user.id, story.permanent_story_id);
  if (owned) return json({ ok: true, alreadyPurchased: true, storyId: story.id, purchaseId: owned.id });

  const config = await getPaypalSettings(env);
  if (!config.enabled || !config.clientId || !config.secretConfigured) {
    return json({ error: "PayPal checkout is not configured on this website.", code: "PAYPAL_NOT_READY" }, 409);
  }

  const requestUrl = new URL(request.url);
  if (isLocalhost(requestUrl) && config.mode === "live") {
    return json({
      error: "Local safety check passed: PayPal is configured for Live, so a real $49 checkout is blocked on localhost. The /49 page can still be tested locally.",
      code: "LOCAL_LIVE_PAYPAL_BLOCKED",
      localSafe: true
    }, 409);
  }

  const now = new Date();
  const nowIso = now.toISOString();
  await env.DB.prepare(`UPDATE lifetime_story_checkout_sessions SET status='EXPIRED'
    WHERE user_id=? AND permanent_story_id=? AND status IN ('INIT','CREATED') AND expires_at<=?`)
    .bind(user.id, story.permanent_story_id, nowIso).run().catch(() => null);

  const reusable = await env.DB.prepare(`SELECT token,paypal_order_id,paypal_approve_url,amount,currency,environment,expires_at
    FROM lifetime_story_checkout_sessions
    WHERE user_id=? AND permanent_story_id=? AND status='CREATED' AND expires_at>?
    ORDER BY created_at DESC LIMIT 1`).bind(user.id, story.permanent_story_id, nowIso).first().catch(() => null);
  if (reusable?.paypal_order_id && reusable?.paypal_approve_url) {
    return json({
      ok: true,
      orderId: reusable.paypal_order_id,
      approveUrl: reusable.paypal_approve_url,
      amount: reusable.amount,
      currency: reusable.currency,
      environment: reusable.environment,
      reused: true
    });
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + LIFETIME_CHECKOUT_MAX_AGE_MS).toISOString();
  const driveFolderId = lifetimeDriveFolderId(story.drive_url);
  await env.DB.prepare(`INSERT INTO lifetime_story_checkout_sessions(
    token,paypal_order_id,paypal_approve_url,user_id,permanent_story_id,story_id_snapshot,title_snapshot,
    drive_url_snapshot,drive_folder_id_snapshot,cover_snapshot,amount,currency,environment,status,created_at,expires_at
  ) VALUES(?,NULL,'',?,?,?,?,?,?,?,?,?,?,'INIT',?,?)`)
    .bind(token, user.id, story.permanent_story_id, story.id, story.title || "", story.drive_url || "", driveFolderId,
      story.cover || "", LIFETIME_STORY_PRICE, LIFETIME_STORY_CURRENCY, config.mode, nowIso, expiresAt).run();

  const origin = requestUrl.origin;
  const storyParam = encodeURIComponent(story.id);
  try {
    const order = await paypalRequest(env, "/v2/checkout/orders", {
      method: "POST",
      headers: { "PayPal-Request-Id": `ox-lifetime-${token}` },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: story.permanent_story_id,
          custom_id: token,
          description: `Lifetime access: ${String(story.title || "OX Novels story")}`.slice(0, 127),
          amount: { currency_code: LIFETIME_STORY_CURRENCY, value: LIFETIME_STORY_PRICE }
        }],
        application_context: {
          brand_name: "OX Novels",
          landing_page: "LOGIN",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: `${origin}/49?story=${storyParam}&paypal=return`,
          cancel_url: `${origin}/49?story=${storyParam}&paypal=cancel`
        }
      })
    }, config);
    const orderId = String(order.id || "").trim();
    const approveUrl = String((order.links || []).find(link => link.rel === "approve")?.href || "").trim();
    if (!orderId || !approveUrl) throw new Error("PayPal did not return an approval link.");
    await env.DB.prepare(`UPDATE lifetime_story_checkout_sessions
      SET paypal_order_id=?,paypal_approve_url=?,status='CREATED' WHERE token=?`)
      .bind(orderId, approveUrl, token).run();
    return json({ ok: true, orderId, approveUrl, amount: LIFETIME_STORY_PRICE, currency: LIFETIME_STORY_CURRENCY, environment: config.mode });
  } catch (error) {
    await env.DB.prepare("UPDATE lifetime_story_checkout_sessions SET status='ERROR' WHERE token=?").bind(token).run().catch(() => null);
    return json({ error: error.message || "Unable to start PayPal lifetime checkout.", code: "PAYPAL_ORDER_FAILED" }, 400);
  }
}

function paypalOrderCaptureFromPayload(payload, permanentStoryId) {
  const units = Array.isArray(payload?.purchase_units) ? payload.purchase_units : [];
  const unit = units.find(item => String(item?.reference_id || "") === String(permanentStoryId || "")) || units[0] || null;
  const captures = Array.isArray(unit?.payments?.captures) ? unit.payments.captures : [];
  return { unit, capture: captures[0] || null };
}

async function handleLifetimeStoryCaptureOrder(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: "Continue with Google to finish payment.", code: "LOGIN_REQUIRED" }, 401);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const orderId = String(body.orderId || "").trim().slice(0, 100);
  if (!orderId) return json({ error: "Missing PayPal order ID." }, 400);

  const completedPurchase = await env.DB.prepare(`SELECT id,original_story_id,original_title,amount,currency
    FROM story_lifetime_purchases WHERE paypal_order_id=? AND user_id=? AND purchase_status='Completed' LIMIT 1`)
    .bind(orderId, user.id).first().catch(() => null);
  if (completedPurchase) {
    return json({ ok: true, completed: true, alreadyCaptured: true, purchaseId: completedPurchase.id,
      storyId: completedPurchase.original_story_id, title: completedPurchase.original_title,
      amount: completedPurchase.amount, currency: completedPurchase.currency });
  }

  const checkout = await env.DB.prepare(`SELECT * FROM lifetime_story_checkout_sessions WHERE paypal_order_id=? LIMIT 1`)
    .bind(orderId).first().catch(() => null);
  if (!checkout || checkout.user_id !== user.id) return json({ error: "This PayPal checkout does not belong to your account.", code: "CHECKOUT_OWNER_MISMATCH" }, 403);
  if (checkout.status === "COMPLETED") {
    const purchase = await env.DB.prepare("SELECT id FROM story_lifetime_purchases WHERE paypal_order_id=? LIMIT 1").bind(orderId).first().catch(() => null);
    return json({ ok: true, completed: true, alreadyCaptured: true, purchaseId: purchase?.id || null, storyId: checkout.story_id_snapshot });
  }
  if (new Date(checkout.expires_at).getTime() < Date.now()) return json({ error: "This checkout expired. Please start again.", code: "CHECKOUT_EXPIRED" }, 409);

  const config = await getPaypalSettings(env);
  if (String(checkout.environment || "") && String(checkout.environment) !== String(config.mode)) {
    return json({ error: `This checkout belongs to PayPal ${checkout.environment}, but the website is currently using ${config.mode}.`, code: "PAYPAL_ENVIRONMENT_MISMATCH" }, 409);
  }
  const requestUrl = new URL(request.url);
  if (isLocalhost(requestUrl) && config.mode === "live") {
    return json({ error: "Live PayPal capture is blocked on localhost for safety.", code: "LOCAL_LIVE_PAYPAL_BLOCKED", localSafe: true }, 409);
  }

  try {
    let captured;
    try {
      captured = await paypalRequest(env, `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: "POST",
        headers: { "PayPal-Request-Id": `ox-lifetime-capture-${checkout.token}` },
        body: "{}"
      }, config);
    } catch (captureError) {
      const issues = Array.isArray(captureError?.payload?.details) ? captureError.payload.details.map(item => String(item?.issue || "")) : [];
      if (!issues.includes("ORDER_ALREADY_CAPTURED")) throw captureError;
      captured = await paypalRequest(env, `/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" }, config);
    }

    // The capture response does not reliably echo every purchase-unit field (notably custom_id).
    // Re-read the authoritative order after capture, then verify the OX checkout against that order.
    // The local checkout row already binds this PayPal order ID to the logged-in user + OX token.
    const verifiedOrder = await paypalRequest(env, `/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" }, config);
    const capturedParts = paypalOrderCaptureFromPayload(captured, checkout.permanent_story_id);
    const verifiedParts = paypalOrderCaptureFromPayload(verifiedOrder, checkout.permanent_story_id);
    const unit = verifiedParts.unit || capturedParts.unit;
    const capture = verifiedParts.capture || capturedParts.capture;
    const orderStatus = String(verifiedOrder?.status || captured?.status || "").toUpperCase();
    const captureStatus = String(capture?.status || "").toUpperCase();
    if (String(unit?.reference_id || "") !== String(checkout.permanent_story_id || "")) {
      return json({ error: "PayPal story verification failed.", code: "PAYPAL_STORY_MISMATCH" }, 409);
    }
    // custom_id should be present on the fetched order. If PayPal omits it, the persisted
    // paypal_order_id -> checkout.token/user mapping remains the authoritative OX binding.
    const paypalCustomId = String(unit?.custom_id || "").trim();
    if (paypalCustomId && paypalCustomId !== String(checkout.token || "")) {
      return json({ error: "PayPal checkout verification failed.", code: "PAYPAL_CHECKOUT_MISMATCH" }, 409);
    }
    if (orderStatus !== "COMPLETED" || captureStatus !== "COMPLETED" || !capture?.id) {
      return json({ error: `PayPal payment is ${captureStatus || orderStatus || "not completed"}.`, code: "PAYPAL_NOT_COMPLETED" }, 409);
    }

    const paidAmount = String(capture?.amount?.value || "");
    const currency = String(capture?.amount?.currency_code || "").toUpperCase();
    if (Math.abs(Number(paidAmount) - Number(LIFETIME_STORY_PRICE)) > 0.001 || currency !== LIFETIME_STORY_CURRENCY) {
      return json({ error: "PayPal amount verification failed.", code: "PAYPAL_AMOUNT_MISMATCH" }, 409);
    }

    await markUserPaidOnce(env, user.id, capture?.create_time || new Date().toISOString(), checkout.environment || config.mode);
    const duplicateOwnership = await activeLifetimePurchase(env, user.id, checkout.permanent_story_id);
    if (duplicateOwnership) {
      await env.DB.prepare(`UPDATE lifetime_story_checkout_sessions
        SET status='DUPLICATE_COMPLETED',paypal_capture_id=?,completed_at=? WHERE token=?`)
        .bind(String(capture.id), new Date().toISOString(), checkout.token).run().catch(() => null);
      return json({ error: "This story was already owned before this second PayPal payment completed. Contact Admin so the duplicate payment can be reviewed.", code: "DUPLICATE_PAID_ORDER" }, 409);
    }

    const purchaseId = crypto.randomUUID();
    const now = new Date().toISOString();
    const captureId = String(capture.id);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO story_lifetime_purchases(
        id,user_id,user_name_snapshot,user_email_snapshot,permanent_story_id,original_story_id,original_title,
        original_drive_url,original_drive_folder_id,original_cover,amount,currency,provider,environment,
        paypal_order_id,paypal_capture_id,purchase_status,entitlement_status,purchased_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'Completed','Active',?,?)`)
        .bind(purchaseId, user.id, user.name || "", user.email || "", checkout.permanent_story_id,
          checkout.story_id_snapshot, checkout.title_snapshot, checkout.drive_url_snapshot, checkout.drive_folder_id_snapshot,
          checkout.cover_snapshot, LIFETIME_STORY_PRICE, LIFETIME_STORY_CURRENCY, "paypal", checkout.environment || config.mode,
          orderId, captureId, now, now),
      env.DB.prepare(`UPDATE lifetime_story_checkout_sessions
        SET status='COMPLETED',paypal_capture_id=?,completed_at=? WHERE token=?`)
        .bind(captureId, now, checkout.token),
      env.DB.prepare(`INSERT OR IGNORE INTO payment_events(
        provider,provider_event_id,event_type,user_id,provider_subscription_id,amount,currency,environment,status,occurred_at,created_at,user_name_snapshot,user_email_snapshot
      ) VALUES('paypal',?,'OX.LIFETIME_STORY.COMPLETED',?,NULL,?,?,?,?,?,?,?,?)`)
        .bind(`LIFETIME:${captureId}`, user.id, LIFETIME_STORY_PRICE, LIFETIME_STORY_CURRENCY,
          checkout.environment || config.mode, "Processed", now, now, user.name || "", user.email || ""),
      env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('payment','Lifetime story purchase completed',?,?)")
        .bind(`${user.email} · ${checkout.title_snapshot} · $${LIFETIME_STORY_PRICE} · ${captureId}.`, now)
    ]);

    await recordPromotionPaymentAttribution(env, user.id, "paypal-lifetime:" + captureId, LIFETIME_STORY_PRICE, LIFETIME_STORY_CURRENCY, "paypal", now);

    await createAdminNotification(env, {
      type: "payment",
      title: "Lifetime story purchased",
      body: `${user.name || user.email} · ${checkout.title_snapshot} · $${LIFETIME_STORY_PRICE}`,
      route: "lifetime",
      userId: user.id,
      relatedKey: `lifetime:${captureId}`
    }).catch(() => null);

    return json({
      ok: true,
      completed: true,
      purchaseId,
      storyId: checkout.story_id_snapshot,
      permanentStoryId: checkout.permanent_story_id,
      title: checkout.title_snapshot,
      amount: LIFETIME_STORY_PRICE,
      currency: LIFETIME_STORY_CURRENCY,
      captureId
    });
  } catch (error) {
    console.error("Lifetime PayPal capture failed", error);
    return json({ error: error.message || "Unable to complete PayPal lifetime checkout.", code: "PAYPAL_CAPTURE_FAILED" }, 400);
  }
}

async function handlePaypalSupportContext(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: "Log in before sending Support.", code: "LOGIN_REQUIRED" }, 401);
  if (!membershipIsActive(user)) return json({ error: "Support is available to active members only." }, 403);
  const config = await getPaypalSettings(env);
  const supportTarget = String(config.supportTarget || config.supportEmail || "").trim();
  const paypalMe = normalizePaypalMeTarget(supportTarget);
  const apiReady = validPaypalSupportEmail(supportTarget) && config.clientId && config.secretConfigured;
  const ready = config.supportEnabled && Boolean(paypalMe || apiReady);
  if (!ready) return json({ error: "Support payments are not configured yet.", code: "SUPPORT_NOT_READY" }, 409);
  return json({ ok: true, mode: config.mode, checkoutType: paypalMe ? "paypalme" : "orders", minimum: config.supportMinAmount, currency: "USD" });
}

async function handlePaypalSupportCreate(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: "Log in before sending Support.", code: "LOGIN_REQUIRED" }, 401);
  if (!membershipIsActive(user)) return json({ error: "Support is available to active members only." }, 403);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const config = await getPaypalSettings(env);
  const amount = normalizeSupportAmount(body.amount, config.supportMinAmount);
  if (amount === null) return json({ error: `Support amount must be a whole number of at least $${config.supportMinAmount}.` }, 400);
  const supportTarget = String(config.supportTarget || config.supportEmail || "").trim();
  const paypalMe = normalizePaypalMeTarget(supportTarget);
  if (!config.supportEnabled || (!paypalMe && (!validPaypalSupportEmail(supportTarget) || !config.clientId || !config.secretConfigured))) {
    return json({ error: "Support payments are not configured yet.", code: "SUPPORT_NOT_READY" }, 409);
  }
  if (paypalMe) {
    return json({ ok: true, direct: true, checkoutType: "paypalme", approveUrl: paypalMeAmountUrl(paypalMe, amount, "USD"), amount: amount.toFixed(2), currency: "USD" });
  }
  const origin = new URL(request.url).origin;
  const token = crypto.randomUUID();
  const siteRow = await env.DB.prepare("SELECT value FROM site_settings WHERE key='appearance'").first().catch(() => null);
  const appearance = normalizeAppearance(safeParse(siteRow?.value || "{}", DEFAULT_APPEARANCE));
  try {
    const order = await paypalRequest(env, "/v2/checkout/orders", {
      method: "POST",
      headers: { "PayPal-Request-Id": `ox-support-${token}` },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: "OX-SUPPORT",
          custom_id: token,
          description: `Support ${appearance.name || "this site"}`.slice(0, 127),
          amount: { currency_code: "USD", value: amount.toFixed(2) },
          payee: { email_address: supportTarget }
        }],
        application_context: {
          brand_name: String(appearance.name || "Story Site").slice(0, 127),
          landing_page: "LOGIN",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: `${origin}/?paypal_support=return`,
          cancel_url: `${origin}/?paypal_support=cancel`
        }
      })
    }, config);
    const orderId = String(order.id || "").trim();
    const approveUrl = (order.links || []).find(link => link.rel === "approve")?.href || "";
    if (!orderId || !approveUrl) throw new Error("PayPal did not return an approval link.");
    const now = new Date();
    const expires = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    await env.DB.prepare(`INSERT INTO support_checkout_sessions(token,provider_order_id,user_id,amount,currency,environment,status,created_at,expires_at)
      VALUES(?,?,?,?,?,?, 'CREATED',?,?)`).bind(token, orderId, user.id, amount.toFixed(2), "USD", config.mode, now.toISOString(), expires.toISOString()).run();
    return json({ ok: true, orderId, approveUrl, amount: amount.toFixed(2), currency: "USD" });
  } catch (error) {
    return json({ error: error.message || "Unable to start PayPal Support checkout." }, 400);
  }
}

async function handlePaypalSupportCapture(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: "Log in to finish the Support payment." }, 401);
  if (!membershipIsActive(user)) return json({ error: "Support is available to active members only." }, 403);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const orderId = String(body.orderId || "").trim().slice(0, 80);
  if (!orderId) return json({ error: "Missing PayPal order ID." }, 400);
  const checkout = await env.DB.prepare(`SELECT token,provider_order_id,user_id,amount,currency,environment,status,expires_at,completed_at
    FROM support_checkout_sessions WHERE provider_order_id=?`).bind(orderId).first();
  if (!checkout || checkout.user_id !== user.id) return json({ error: "This Support payment does not belong to your account." }, 403);
  if (checkout.status === "COMPLETED") return json({ ok: true, completed: true, amount: checkout.amount, currency: checkout.currency });
  if (new Date(checkout.expires_at).getTime() < Date.now()) return json({ error: "This Support checkout expired. Please start again." }, 409);
  const config = await getPaypalSettings(env);
  try {
    const captured = await paypalRequest(env, `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST", headers: { "PayPal-Request-Id": `ox-support-capture-${checkout.token}` }, body: "{}"
    }, config);
    const capture = captured.purchase_units?.[0]?.payments?.captures?.[0] || null;
    const status = String(captured.status || capture?.status || "").toUpperCase();
    const captureId = String(capture?.id || captured.id || orderId);
    const paidAmount = String(capture?.amount?.value || checkout.amount || "");
    const currency = String(capture?.amount?.currency_code || checkout.currency || "USD");
    if (status !== "COMPLETED") return json({ error: `PayPal Support payment is ${status || "not completed"}.` }, 409);
    if (Math.abs(Number(paidAmount) - Number(checkout.amount)) > 0.001 || currency !== checkout.currency) {
      return json({ error: "PayPal Support amount verification failed." }, 409);
    }
    const now = new Date().toISOString();
    const eventId = `SUPPORT:${captureId}`;
    await env.DB.batch([
      env.DB.prepare("UPDATE support_checkout_sessions SET status='COMPLETED',completed_at=? WHERE provider_order_id=?").bind(now, orderId),
      env.DB.prepare(`INSERT OR IGNORE INTO payment_events(provider,provider_event_id,event_type,user_id,provider_subscription_id,amount,currency,environment,status,occurred_at,created_at)
        VALUES('paypal',?,'OX.SUPPORT.COMPLETED',?,NULL,?,?,?,'Processed',?,?)`).bind(eventId, user.id, paidAmount, currency, checkout.environment || config.mode, now, now),
      env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('payment','Support payment received',?,?)")
        .bind(`${user.email} · ${currency} ${paidAmount} · ${captureId}.`, now)
    ]);
    await createAdminNotification(env, {
      type: "payment", title: "Support payment received", body: `${user.name || user.email} sent $${Number(paidAmount).toFixed(2)} support.`,
      route: "finance", userId: user.id, relatedKey: `support:${captureId}`
    });
    return json({ ok: true, completed: true, amount: paidAmount, currency, captureId });
  } catch (error) {
    return json({ error: error.message || "Unable to complete PayPal Support payment." }, 400);
  }
}

async function handlePaypalCheckoutContext(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: "Log in before joining a membership.", code: "LOGIN_REQUIRED" }, 401);
  if (membershipIsActive(user)) return json({ error: "Your membership is already active." }, 409);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const tierId = String(body.tierId || "").trim();
  const tier = await env.DB.prepare("SELECT id,name,price,cycle,status FROM membership_tiers WHERE id=? AND status='Published'").bind(tierId).first();
  if (!tier) return json({ error: "This membership tier is not available." }, 404);
  const config = await getPaypalSettings(env);
  const planId = String(config.plans[tierId] || "").trim();
  if (!config.enabled || !config.clientId || !config.secretConfigured || !planId) {
    return json({ error: "PayPal checkout is not fully configured for this tier yet.", code: "PAYPAL_NOT_READY" }, 409);
  }
  const token = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 60 * 1000);
  await env.DB.prepare(`INSERT INTO payment_checkout_sessions(token,user_id,tier_id,provider,external_plan_id,environment,created_at,expires_at)
    VALUES(?,?,?,'paypal',?,?,?,?)`).bind(token, user.id, tierId, planId, config.mode, now.toISOString(), expires.toISOString()).run();
  return json({ ok: true, provider: "paypal", mode: config.mode, clientId: config.clientId, planId, customId: token,
    tier: { id: tier.id, name: tier.name, price: tier.price, cycle: tier.cycle } });
}

async function fetchPaypalSubscription(env, subscriptionId, config = null) {
  const id = String(subscriptionId || "").trim();
  if (!/^I-[A-Z0-9]+$/i.test(id)) throw new Error("Invalid PayPal subscription ID.");
  return paypalRequest(env, `/v1/billing/subscriptions/${encodeURIComponent(id)}`, { method: "GET" }, config);
}

async function savePaypalSubscription(env, userId, tierId, details, { paymentCompleted = false, environment = "" } = {}) {
  const now = new Date().toISOString();
  const subscriptionId = String(details.id || "");
  const planId = String(details.plan_id || "");
  const status = String(details.status || "APPROVAL_PENDING").toUpperCase();
  const existing = subscriptionId
    ? await env.DB.prepare("SELECT next_billing_at,last_payment_at,status FROM member_subscriptions WHERE provider_subscription_id=?").bind(subscriptionId).first()
    : null;
  const incomingNextBilling = details.billing_info?.next_billing_time || null;
  const nextBilling = incomingNextBilling || existing?.next_billing_at || null;
  const paypalLastPayment = details.billing_info?.last_payment?.time || null;
  const lastPaymentAt = paypalLastPayment || (paymentCompleted ? now : null) || existing?.last_payment_at || null;
  const startedAt = details.start_time || details.status_update_time || now;
  const cancelledAt = ["CANCELLED","EXPIRED"].includes(status) ? (details.status_update_time || now) : null;

  await env.DB.prepare(`INSERT INTO member_subscriptions(provider_subscription_id,provider,user_id,tier_id,external_plan_id,environment,status,next_billing_at,last_payment_at,started_at,cancelled_at,created_at,updated_at)
    VALUES(?,'paypal',?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider_subscription_id) DO UPDATE SET user_id=excluded.user_id,
    tier_id=excluded.tier_id,external_plan_id=excluded.external_plan_id,environment=CASE WHEN excluded.environment<>'' THEN excluded.environment ELSE member_subscriptions.environment END,status=excluded.status,
    next_billing_at=COALESCE(excluded.next_billing_at,member_subscriptions.next_billing_at),
    last_payment_at=COALESCE(excluded.last_payment_at,member_subscriptions.last_payment_at),started_at=COALESCE(member_subscriptions.started_at,excluded.started_at),
    cancelled_at=excluded.cancelled_at,updated_at=excluded.updated_at`)
    .bind(subscriptionId,userId,tierId||null,planId,String(environment||"").toLowerCase(),status,incomingNextBilling,lastPaymentAt,startedAt,cancelledAt,now,now).run();

  const tier = tierId ? await env.DB.prepare("SELECT id,name,price FROM membership_tiers WHERE id=?").bind(tierId).first() : null;
  // Migrated RAPTOR subscriptions keep their original PayPal billing amount. The
  // mapped OX tier controls entitlement only; it must not rewrite the customer's
  // legacy $17.99/$24.99 (or other historical) amount during later refreshes.
  const raptorMigration = subscriptionId
    ? await env.DB.prepare("SELECT raptor_price FROM raptor_migration_claims WHERE provider_subscription_id=? LIMIT 1").bind(subscriptionId).first().catch(() => null)
    : null;
  const raptorPrice = String(raptorMigration?.raptor_price || "").trim();
  const displayAmount = raptorPrice && /^\d+(?:\.\d{1,2})?$/.test(raptorPrice) ? `$${raptorPrice}` : (tier?.price || "$0.00");
  if (status === "ACTIVE" && tier) {
    await env.DB.prepare(`UPDATE users SET account_status='Active',membership_status='Active',membership_tier_id=?,membership_plan=?,
      membership_started_at=COALESCE(membership_started_at,?),membership_expires_at=NULL,payment_status='Paid',latest_amount=?,updated_at=? WHERE id=?`)
      .bind(tier.id,tier.name,startedAt,displayAmount,now,userId).run();
  } else if (status === "CANCELLED") {
    const paidThrough = nextBilling && new Date(nextBilling).getTime() > Date.now() ? nextBilling : null;
    if (paidThrough) {
      if (tier) {
        await env.DB.prepare(`UPDATE users SET account_status='Active',membership_status='Active',membership_tier_id=?,membership_plan=?,membership_expires_at=?,payment_status='Cancelled',latest_amount=?,updated_at=? WHERE id=?`)
          .bind(tier.id,tier.name,paidThrough,displayAmount,now,userId).run();
      } else {
        await env.DB.prepare(`UPDATE users SET membership_status='Active',membership_expires_at=?,payment_status='Cancelled',updated_at=? WHERE id=?`)
          .bind(paidThrough,now,userId).run();
      }
    } else {
      await env.DB.prepare("UPDATE users SET membership_status='Cancelled',membership_expires_at=NULL,payment_status='Cancelled',updated_at=? WHERE id=?")
        .bind(now,userId).run();
    }
  } else if (status === "EXPIRED") {
    await env.DB.prepare("UPDATE users SET membership_status='Expired',membership_expires_at=NULL,payment_status='Expired',updated_at=? WHERE id=?")
      .bind(now,userId).run();
  } else if (status === "SUSPENDED") {
    await env.DB.prepare("UPDATE users SET membership_status='Expired',membership_expires_at=NULL,payment_status='Suspended',updated_at=? WHERE id=?")
      .bind(now,userId).run();
  }

  if (paidOnceEnvironmentEligible(environment) &&
      (lastPaymentAt || ["ACTIVE","CANCELLED","EXPIRED","SUSPENDED"].includes(status))) {
    await markUserPaidOnce(env, userId, lastPaymentAt || startedAt || now, environment);
  }
  return { status, nextBilling, lastPaymentAt };
}

async function resolvePaypalSubscriptionOwner(env, details) {
  const existing = await env.DB.prepare("SELECT user_id,tier_id FROM member_subscriptions WHERE provider_subscription_id=?").bind(details.id).first();
  if (existing) return existing;
  const customId = String(details.custom_id || "").trim();
  if (!customId) return null;
  const checkout = await env.DB.prepare(`SELECT user_id,tier_id,external_plan_id FROM payment_checkout_sessions
    WHERE token=? AND provider='paypal'`).bind(customId).first();
  if (!checkout || String(checkout.external_plan_id) !== String(details.plan_id || "")) return null;
  return { user_id: checkout.user_id, tier_id: checkout.tier_id };
}

async function handlePaypalRefreshStatus(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: "Log in to refresh your PayPal membership." }, 401);

  const subscription = await latestPaypalSubscriptionForUser(env, user.id);
  if (!subscription || String(subscription.provider || "").toLowerCase() !== "paypal" || !subscription.provider_subscription_id) {
    return json({ error: "No PayPal subscription is linked to this account." }, 404);
  }

  const config = await getPaypalSettings(env);
  const subscriptionEnvironment = String(subscription.environment || "").toLowerCase();
  if (subscriptionEnvironment && subscriptionEnvironment !== config.mode) {
    return json({
      error: `This subscription belongs to PayPal ${subscriptionEnvironment === "live" ? "Live" : "Sandbox"}, but this website is currently configured for ${config.mode === "live" ? "Live" : "Sandbox"}.`
    }, 409);
  }
  if (!config.clientId || !config.secretConfigured) {
    return json({ error: "PayPal credentials are not configured on the server." }, 409);
  }

  try {
    const details = await fetchPaypalSubscription(env, subscription.provider_subscription_id, config);
    const planId = String(details.plan_id || "");
    let tierId = subscription.tier_id || null;
    if (!tierId && planId) {
      const planMap = await env.DB.prepare(`SELECT tier_id FROM membership_payment_plans
        WHERE provider='paypal' AND external_plan_id=? LIMIT 1`).bind(planId).first();
      tierId = planMap?.tier_id || null;
    }
    const saved = await savePaypalSubscription(env, user.id, tierId, details, {
      paymentCompleted: false,
      environment: subscriptionEnvironment || config.mode
    });
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('payment',?,?,?)")
      .bind("PayPal status refreshed", `${user.email} · ${details.id} · ${saved.status}.`, now).run();

    return json({
      ok: true,
      status: saved.status,
      subscriptionId: details.id,
      nextBillingAt: saved.nextBilling || null,
      lastPaymentAt: saved.lastPaymentAt || null
    });
  } catch (error) {
    return json({ error: error.message || "Unable to refresh PayPal subscription status." }, 400);
  }
}

async function handlePaypalConfirm(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: "Log in to confirm membership." }, 401);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const config = await getPaypalSettings(env);
  if (!config.enabled) return json({ error: "PayPal checkout is disabled." }, 409);
  try {
    const details = await fetchPaypalSubscription(env, body.subscriptionId, config);
    const customId = String(details.custom_id || "").trim();
    const checkout = await env.DB.prepare(`SELECT token,user_id,tier_id,external_plan_id,environment,expires_at FROM payment_checkout_sessions
      WHERE token=? AND provider='paypal'`).bind(customId).first();
    if (!checkout || checkout.user_id !== user.id) return json({ error: "This PayPal checkout does not belong to your account." }, 403);
    if (new Date(checkout.expires_at).getTime() < Date.now()) return json({ error: "This checkout session expired. Start again." }, 409);
    if (String(details.plan_id || "") !== String(checkout.external_plan_id || "")) return json({ error: "PayPal plan verification failed." }, 409);
    const active = String(details.status || "").toUpperCase() === "ACTIVE";
    // OX plans are immediate paid monthly subscriptions (no trial). Mark the initial
    // verified ACTIVE checkout as a completed payment even if PayPal's first GET has
    // not populated billing_info.last_payment yet. A later webhook replaces this
    // fallback naturally in Finance.
    await savePaypalSubscription(env, user.id, checkout.tier_id, details, { paymentCompleted: active, environment: checkout.environment || config.mode });
    await env.DB.prepare("UPDATE payment_checkout_sessions SET used_at=? WHERE token=?").bind(new Date().toISOString(), checkout.token).run();
    await env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('payment',?,?,?)")
      .bind(active ? "PayPal membership activated" : "PayPal membership awaiting activation", `${user.email} · ${details.id} · ${details.status}.`, new Date().toISOString()).run();
    await createAdminNotification(env, {
      type: "payment", title: active ? "Membership payment activated" : "Membership awaiting activation",
      body: `${user.name || user.email} · ${details.id} · ${details.status}`, route: active ? "finance" : "users", userId: user.id,
      relatedKey: `subscription:${details.id}:${details.status}`
    });
    return json({ ok: true, active, status: details.status, subscriptionId: details.id });
  } catch (error) {
    return json({ error: error.message || "Unable to verify PayPal subscription." }, 400);
  }
}

async function verifyPaypalWebhook(request, env, event, config) {
  if (!config.webhookId) throw new Error("PayPal Webhook ID is not configured.");
  const token = await paypalAccessToken(env, config);
  const verifyBody = {
    auth_algo: request.headers.get("paypal-auth-algo") || "",
    cert_url: request.headers.get("paypal-cert-url") || "",
    transmission_id: request.headers.get("paypal-transmission-id") || "",
    transmission_sig: request.headers.get("paypal-transmission-sig") || "",
    transmission_time: request.headers.get("paypal-transmission-time") || "",
    webhook_id: config.webhookId,
    webhook_event: event
  };
  const response = await fetch(`${paypalApiBase(config.mode)}/v1/notifications/verify-webhook-signature`, {
    method: "POST", headers: { "authorization": `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(verifyBody)
  });
  const payload = await response.json().catch(() => ({}));
  return response.ok && payload.verification_status === "SUCCESS";
}

function paypalWebhookRelatedIds(resource = {}) {
  return resource?.supplementary_data?.related_ids || {};
}

async function lifetimePurchaseForPaypalResource(env, resource = {}) {
  const related = paypalWebhookRelatedIds(resource);
  const captureCandidates = [...new Set([
    String(related.capture_id || "").trim(),
    String(resource.capture_id || "").trim(),
    String(resource.id || "").trim()
  ].filter(Boolean))];
  for (const captureId of captureCandidates) {
    const row = await env.DB.prepare(`SELECT * FROM story_lifetime_purchases WHERE paypal_capture_id=? LIMIT 1`)
      .bind(captureId).first().catch(() => null);
    if (row) return row;
  }
  const orderId = String(related.order_id || resource.order_id || "").trim();
  if (orderId) {
    const row = await env.DB.prepare(`SELECT * FROM story_lifetime_purchases WHERE paypal_order_id=? LIMIT 1`)
      .bind(orderId).first().catch(() => null);
    if (row) return row;
  }
  return null;
}

async function lifetimeCheckoutForPaypalOrder(env, orderId) {
  const clean = String(orderId || "").trim();
  if (!clean) return null;
  return env.DB.prepare(`SELECT * FROM lifetime_story_checkout_sessions WHERE paypal_order_id=? LIMIT 1`)
    .bind(clean).first().catch(() => null);
}

async function finalizeLifetimeCheckoutFromPaypalOrder(env, checkout, order, config, source = "webhook") {
  if (!checkout || !order) return { completed: false };
  const orderId = String(order.id || checkout.paypal_order_id || "").trim();
  const { unit, capture } = paypalOrderCaptureFromPayload(order, checkout.permanent_story_id);
  const orderStatus = String(order.status || "").toUpperCase();
  const captureStatus = String(capture?.status || "").toUpperCase();
  if (String(unit?.reference_id || "") !== String(checkout.permanent_story_id || "")) {
    throw new Error("Lifetime PayPal webhook story verification failed.");
  }
  const customId = String(unit?.custom_id || "").trim();
  if (customId && customId !== String(checkout.token || "")) {
    throw new Error("Lifetime PayPal webhook checkout verification failed.");
  }
  if (orderStatus !== "COMPLETED" || captureStatus !== "COMPLETED" || !capture?.id) {
    return { completed: false, status: captureStatus || orderStatus || "UNKNOWN" };
  }
  const paidAmount = String(capture?.amount?.value || "");
  const currency = String(capture?.amount?.currency_code || "").toUpperCase();
  if (Math.abs(Number(paidAmount) - Number(LIFETIME_STORY_PRICE)) > 0.001 || currency !== LIFETIME_STORY_CURRENCY) {
    throw new Error("Lifetime PayPal webhook amount verification failed.");
  }
  await markUserPaidOnce(env, checkout.user_id, capture?.create_time || new Date().toISOString(), checkout.environment || config.mode);
  const captureId = String(capture.id || "").trim();
  const existing = await env.DB.prepare(`SELECT * FROM story_lifetime_purchases WHERE paypal_order_id=? OR paypal_capture_id=? LIMIT 1`)
    .bind(orderId, captureId).first().catch(() => null);
  if (existing) {
    await env.DB.prepare(`UPDATE lifetime_story_checkout_sessions SET status='COMPLETED',paypal_capture_id=?,completed_at=COALESCE(completed_at,?) WHERE token=?`)
      .bind(captureId, new Date().toISOString(), checkout.token).run().catch(() => null);
    return { completed: true, existing: true, purchase: existing };
  }
  const duplicateOwnership = await activeLifetimePurchase(env, checkout.user_id, checkout.permanent_story_id);
  if (duplicateOwnership) {
    await env.DB.prepare(`UPDATE lifetime_story_checkout_sessions SET status='DUPLICATE_COMPLETED',paypal_capture_id=?,completed_at=? WHERE token=?`)
      .bind(captureId, new Date().toISOString(), checkout.token).run().catch(() => null);
    await createAdminNotification(env, {
      type: "payment", title: "Duplicate lifetime payment needs review",
      body: `${checkout.title_snapshot || "Story"} · PayPal ${captureId}`,
      route: "lifetime", userId: checkout.user_id, relatedKey: `lifetime-duplicate:${captureId}`
    }).catch(() => null);
    return { completed: false, duplicate: true, purchase: duplicateOwnership };
  }
  const user = await env.DB.prepare(`SELECT id,name,email FROM users WHERE id=? LIMIT 1`).bind(checkout.user_id).first().catch(() => null);
  const purchaseId = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO story_lifetime_purchases(
        id,user_id,user_name_snapshot,user_email_snapshot,permanent_story_id,original_story_id,original_title,
        original_drive_url,original_drive_folder_id,original_cover,amount,currency,provider,environment,
        paypal_order_id,paypal_capture_id,purchase_status,entitlement_status,purchased_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'Completed','Active',?,?)`)
        .bind(purchaseId, checkout.user_id, user?.name || "", user?.email || "", checkout.permanent_story_id,
          checkout.story_id_snapshot, checkout.title_snapshot, checkout.drive_url_snapshot, checkout.drive_folder_id_snapshot,
          checkout.cover_snapshot, LIFETIME_STORY_PRICE, LIFETIME_STORY_CURRENCY, "paypal", checkout.environment || config.mode,
          orderId, captureId, now, now),
      env.DB.prepare(`UPDATE lifetime_story_checkout_sessions SET status='COMPLETED',paypal_capture_id=?,completed_at=? WHERE token=?`)
        .bind(captureId, now, checkout.token),
      env.DB.prepare(`INSERT OR IGNORE INTO payment_events(
        provider,provider_event_id,event_type,user_id,provider_subscription_id,amount,currency,environment,status,occurred_at,created_at,user_name_snapshot,user_email_snapshot
      ) VALUES('paypal',?,'OX.LIFETIME_STORY.COMPLETED',?,NULL,?,?,?,?,?,?,?,?)`)
        .bind(`LIFETIME:${captureId}`, checkout.user_id, LIFETIME_STORY_PRICE, LIFETIME_STORY_CURRENCY,
          checkout.environment || config.mode, "Processed", now, now, user?.name || "", user?.email || ""),
      env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('payment','Lifetime story purchase completed',?,?)")
        .bind(`${user?.email || checkout.user_id} · ${checkout.title_snapshot} · $${LIFETIME_STORY_PRICE} · ${captureId} · ${source}.`, now)
    ]);
  } catch (error) {
    const raced = await env.DB.prepare(`SELECT * FROM story_lifetime_purchases WHERE paypal_order_id=? OR paypal_capture_id=? LIMIT 1`)
      .bind(orderId, captureId).first().catch(() => null);
    if (!raced) throw error;
    return { completed: true, existing: true, purchase: raced };
  }
  await createAdminNotification(env, {
    type: "payment", title: "Lifetime story purchased",
    body: `${user?.name || user?.email || "Customer"} · ${checkout.title_snapshot} · $${LIFETIME_STORY_PRICE}`,
    route: "lifetime", userId: checkout.user_id, relatedKey: `lifetime:${captureId}`
  }).catch(() => null);
  return { completed: true, purchase: { id: purchaseId, user_id: checkout.user_id, original_title: checkout.title_snapshot, paypal_capture_id: captureId } };
}

async function processLifetimePaypalWebhook(env, event, config) {
  const type = String(event?.event_type || "");
  const resource = event?.resource || {};
  const related = paypalWebhookRelatedIds(resource);
  const orderId = String(related.order_id || resource.order_id || (type === "CHECKOUT.ORDER.APPROVED" ? resource.id : "") || "").trim();
  const now = new Date().toISOString();

  if (type === "CHECKOUT.ORDER.APPROVED" && orderId) {
    const checkout = await lifetimeCheckoutForPaypalOrder(env, orderId);
    if (!checkout) return { handled: false };
    if (checkout.environment && checkout.environment !== config.mode) return { handled: true, userId: checkout.user_id };
    let order = await paypalRequest(env, `/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" }, config);
    if (String(order.status || "").toUpperCase() === "APPROVED") {
      try {
        await paypalRequest(env, `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
          method: "POST", headers: { "PayPal-Request-Id": `ox-lifetime-capture-${checkout.token}` }, body: "{}"
        }, config);
      } catch (error) {
        const issues = Array.isArray(error?.payload?.details) ? error.payload.details.map(item => String(item?.issue || "")) : [];
        if (!issues.includes("ORDER_ALREADY_CAPTURED")) throw error;
      }
      order = await paypalRequest(env, `/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" }, config);
    }
    const final = await finalizeLifetimeCheckoutFromPaypalOrder(env, checkout, order, config, "webhook-approved");
    return {
      handled: true, userId: checkout.user_id,
      notice: final.completed ? ["Lifetime payment completed", `${checkout.title_snapshot} · $${LIFETIME_STORY_PRICE} lifetime access granted.`, "lifetime"] : null
    };
  }

  if (["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.PENDING", "PAYMENT.CAPTURE.DECLINED"].includes(type) && orderId) {
    const checkout = await lifetimeCheckoutForPaypalOrder(env, orderId);
    if (!checkout) return { handled: false };
    if (type === "PAYMENT.CAPTURE.COMPLETED") {
      const order = await paypalRequest(env, `/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" }, config);
      const final = await finalizeLifetimeCheckoutFromPaypalOrder(env, checkout, order, config, "webhook-capture");
      return { handled: true, userId: checkout.user_id,
        notice: final.completed ? ["Lifetime payment completed", `${checkout.title_snapshot} · $${LIFETIME_STORY_PRICE} lifetime access granted.`, "lifetime"] : null };
    }
    const status = type === "PAYMENT.CAPTURE.PENDING" ? "PENDING" : "DECLINED";
    await env.DB.prepare(`UPDATE lifetime_story_checkout_sessions SET status=? WHERE token=? AND status<>'COMPLETED'`)
      .bind(status, checkout.token).run().catch(() => null);
    return { handled: true, userId: checkout.user_id,
      notice: [status === "PENDING" ? "Lifetime payment pending" : "Lifetime payment declined",
        `${checkout.title_snapshot} · PayPal payment ${status.toLowerCase()}.`, "lifetime"] };
  }

  if (type === "CHECKOUT.PAYMENT-APPROVAL.REVERSED" && orderId) {
    const checkout = await lifetimeCheckoutForPaypalOrder(env, orderId);
    if (!checkout) return { handled: false };
    await env.DB.prepare(`UPDATE lifetime_story_checkout_sessions SET status='APPROVAL_REVERSED' WHERE token=? AND status<>'COMPLETED'`)
      .bind(checkout.token).run().catch(() => null);
    return { handled: true, userId: checkout.user_id,
      notice: ["Lifetime checkout reversed", `${checkout.title_snapshot} · PayPal reversed the approval before capture.`, "lifetime"] };
  }

  if (["PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED", "PAYMENT.REFUND.PENDING", "PAYMENT.REFUND.FAILED"].includes(type)) {
    const purchase = await lifetimePurchaseForPaypalResource(env, resource);
    if (!purchase) return { handled: false };
    if (type === "PAYMENT.CAPTURE.REVERSED") {
      await env.DB.prepare(`UPDATE story_lifetime_purchases SET purchase_status='Reversed',entitlement_status='Inactive',updated_at=? WHERE id=?`)
        .bind(now, purchase.id).run();
      await env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('payment','Lifetime story payment reversed',?,?)")
        .bind(`${purchase.user_email_snapshot || purchase.user_id || "Customer"} · ${purchase.original_title} · ${purchase.paypal_capture_id || ""}.`, now).run().catch(() => null);
      return { handled: true, userId: purchase.user_id,
        notice: ["Lifetime payment reversed", `${purchase.original_title} · lifetime access disabled.`, "lifetime"] };
    }
    if (type === "PAYMENT.CAPTURE.REFUNDED") {
      const relatedCaptureId = String(related.capture_id || resource.capture_id || purchase.paypal_capture_id || "").trim();
      let fullRefund = false;
      if (relatedCaptureId) {
        try {
          const capture = await paypalRequest(env, `/v2/payments/captures/${encodeURIComponent(relatedCaptureId)}`, { method: "GET" }, config);
          const captureStatus = String(capture?.status || "").toUpperCase();
          if (captureStatus === "REFUNDED") fullRefund = true;
          if (captureStatus === "PARTIALLY_REFUNDED") fullRefund = false;
        } catch {}
      }
      if (!fullRefund) {
        const refundAmount = Number(resource?.amount?.value || resource?.amount?.total || 0);
        const purchaseAmount = Number(purchase.amount || LIFETIME_STORY_PRICE);
        if (refundAmount > 0 && refundAmount + 0.001 >= purchaseAmount) fullRefund = true;
      }
      if (fullRefund) {
        await env.DB.prepare(`UPDATE story_lifetime_purchases SET purchase_status='Refunded',entitlement_status='Inactive',updated_at=? WHERE id=?`)
          .bind(now, purchase.id).run();
      }
      await env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('payment',?,?,?)")
        .bind(fullRefund ? "Lifetime story purchase refunded" : "Lifetime story purchase partially refunded",
          `${purchase.user_email_snapshot || purchase.user_id || "Customer"} · ${purchase.original_title} · ${purchase.paypal_capture_id || ""}.`, now).run().catch(() => null);
      return { handled: true, userId: purchase.user_id,
        notice: [fullRefund ? "Lifetime purchase refunded" : "Lifetime purchase partially refunded",
          fullRefund ? `${purchase.original_title} · lifetime access disabled.` : `${purchase.original_title} · partial refund recorded; access remains active.`, "lifetime"] };
    }
    if (type === "PAYMENT.REFUND.PENDING") {
      return { handled: true, userId: purchase.user_id,
        notice: ["Lifetime refund pending", `${purchase.original_title} · PayPal refund is still pending; access remains active until completed.`, "lifetime"] };
    }
    if (type === "PAYMENT.REFUND.FAILED") {
      return { handled: true, userId: purchase.user_id,
        notice: ["Lifetime refund failed", `${purchase.original_title} · refund failed; existing access was not changed.`, "lifetime"] };
    }
  }

  return { handled: false };
}


function getRaptorPaypalWebhookConfig(env) {
  return {
    mode: "live",
    clientId: String(env.RAPTOR_PAYPAL_CLIENT_ID || "").trim(),
    clientSecret: String(env.RAPTOR_PAYPAL_CLIENT_SECRET || "").trim(),
    webhookId: String(env.RAPTOR_PAYPAL_WEBHOOK_ID || "").trim()
  };
}

async function raptorPaypalAccessToken(env, config = null) {
  const cfg = config || getRaptorPaypalWebhookConfig(env);
  if (!cfg.clientId || !cfg.clientSecret) throw new Error("RAPTOR PayPal Client ID or Client Secret is not configured.");
  const auth = btoa(`${cfg.clientId}:${cfg.clientSecret}`);
  const response = await fetch("https://api-m.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: { "authorization": `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || "Unable to authenticate RAPTOR PayPal app.");
  return payload.access_token;
}

async function verifyRaptorPaypalWebhook(request, env, event, config = null) {
  const cfg = config || getRaptorPaypalWebhookConfig(env);
  if (!cfg.webhookId) throw new Error("RAPTOR PayPal Webhook ID is not configured.");
  const token = await raptorPaypalAccessToken(env, cfg);
  const verifyBody = {
    auth_algo: request.headers.get("paypal-auth-algo") || "",
    cert_url: request.headers.get("paypal-cert-url") || "",
    transmission_id: request.headers.get("paypal-transmission-id") || "",
    transmission_sig: request.headers.get("paypal-transmission-sig") || "",
    transmission_time: request.headers.get("paypal-transmission-time") || "",
    webhook_id: cfg.webhookId,
    webhook_event: event
  };
  const response = await fetch("https://api-m.paypal.com/v1/notifications/verify-webhook-signature", {
    method: "POST",
    headers: { "authorization": `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(verifyBody)
  });
  const payload = await response.json().catch(() => ({}));
  return response.ok && payload.verification_status === "SUCCESS";
}

function raptorPaypalWebhookSubscriptionId(event = {}) {
  const type = String(event.event_type || "").trim();
  const resource = event.resource || {};
  const related = resource?.supplementary_data?.related_ids || {};
  return String(
    resource.billing_agreement_id ||
    resource.subscription_id ||
    related.billing_agreement_id ||
    related.subscription_id ||
    (type.startsWith("BILLING.SUBSCRIPTION.") ? resource.id : "") ||
    ""
  ).trim();
}

async function handleRaptorPaypalWebhook(request, env) {
  const webhookConfig = getRaptorPaypalWebhookConfig(env);
  if (!webhookConfig.clientId || !webhookConfig.clientSecret || !webhookConfig.webhookId) {
    return json({ error: "RAPTOR PayPal webhook is not configured." }, 503);
  }

  let event = {};
  try { event = await request.json(); } catch { return json({ error: "Invalid webhook JSON." }, 400); }

  try {
    if (!(await verifyRaptorPaypalWebhook(request, env, event, webhookConfig))) {
      return json({ error: "Invalid RAPTOR PayPal webhook signature." }, 400);
    }

    const eventId = String(event.id || "").trim();
    if (!eventId) return json({ error: "Missing PayPal event ID." }, 400);

    const type = String(event.event_type || "UNKNOWN");
    const resource = event.resource || {};
    const subscriptionId = raptorPaypalWebhookSubscriptionId(event);

    // The RAPTOR REST app can still contain subscriptions that have not migrated.
    // Acknowledge those events but leave them entirely alone until the customer
    // completes the signed transfer to OX.
    if (!subscriptionId) return json({ ok: true, ignored: true, reason: "no_subscription_id" });

    const migration = await env.DB.prepare(`SELECT * FROM raptor_migration_claims
      WHERE provider_subscription_id=? AND ox_user_id IS NOT NULL LIMIT 1`).bind(subscriptionId).first();
    if (!migration) return json({ ok: true, ignored: true, reason: "not_migrated", subscriptionId });

    const duplicate = await env.DB.prepare("SELECT id FROM payment_events WHERE provider_event_id=? LIMIT 1").bind(eventId).first();
    if (duplicate) return json({ ok: true, duplicate: true });

    const oxConfig = await getPaypalSettings(env);
    if (oxConfig.mode !== "live" || !oxConfig.clientId || !oxConfig.secretConfigured) {
      return json({ error: "OX PayPal Live credentials are not configured." }, 503);
    }

    const details = await fetchPaypalSubscription(env, subscriptionId, oxConfig);
    const paypalCustomId = String(details.custom_id || "").trim();
    if (!paypalCustomId || paypalCustomId !== String(migration.raptor_user_id || "")) {
      await createAdminNotification(env, {
        type: "payment", title: "RAPTOR webhook ownership mismatch",
        body: `${subscriptionId} · PayPal custom_id did not match migrated RAPTOR user.`, route: "users",
        userId: migration.ox_user_id || null, relatedKey: `raptor-webhook-owner:${eventId}`
      }).catch(() => null);
      return json({ ok: true, ignored: true, reason: "ownership_mismatch" });
    }

    const existingSubscription = await env.DB.prepare(`SELECT user_id,tier_id FROM member_subscriptions
      WHERE provider_subscription_id=? LIMIT 1`).bind(subscriptionId).first();
    const userId = migration.ox_user_id;
    const tierId = existingSubscription?.tier_id || null;
    const saved = await savePaypalSubscription(env, userId, tierId, details, {
      paymentCompleted: type === "PAYMENT.SALE.COMPLETED",
      environment: "live"
    });

    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE raptor_migration_claims SET paypal_status=?,next_billing_at=?,last_verified_at=?
      WHERE provider_subscription_id=?`).bind(saved.status, saved.nextBilling || null, now, subscriptionId).run();

    if (type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED") {
      await env.DB.prepare("UPDATE users SET payment_status='Failed',updated_at=? WHERE id=?").bind(now, userId).run();
    }
    if (type === "PAYMENT.SALE.COMPLETED") {
      const amount = String(resource.amount?.total || resource.amount?.value || "").trim();
      const currency = String(resource.amount?.currency || resource.amount?.currency_code || "").toUpperCase();
      const legacyPrice = String(migration.raptor_price || "").trim();
      const latestAmount = amount ? `${currency === "USD" ? "$" : ""}${amount}` : (legacyPrice ? `$${legacyPrice}` : "");
      if (latestAmount) {
        await env.DB.prepare("UPDATE users SET payment_status='Paid',latest_amount=?,updated_at=? WHERE id=?").bind(latestAmount, now, userId).run();
      } else {
        await env.DB.prepare("UPDATE users SET payment_status='Paid',updated_at=? WHERE id=?").bind(now, userId).run();
      }
    }

    const amount = String(resource.amount?.total || resource.amount?.value || "");
    const currency = String(resource.amount?.currency || resource.amount?.currency_code || "");
    const userSnapshot = await env.DB.prepare("SELECT name,email FROM users WHERE id=? LIMIT 1").bind(userId).first().catch(() => null);

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO payment_events(provider,provider_event_id,event_type,user_id,provider_subscription_id,amount,currency,environment,status,occurred_at,created_at,user_name_snapshot,user_email_snapshot)
        VALUES('paypal',?,?,?,?,?,?,?,'Processed',?,?,?,?)`)
        .bind(eventId,type,userId,subscriptionId,amount,currency,"live",event.create_time||null,now,userSnapshot?.name||"",userSnapshot?.email||""),
      env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('payment','RAPTOR PayPal webhook processed',?,?)")
        .bind(`${type} · ${subscriptionId} · ${saved.status}.`,now)
    ]);

    const webhookNotice = {
      "PAYMENT.SALE.COMPLETED": ["RAPTOR renewal received", amount ? `${currency || "USD"} ${amount} recurring payment completed.` : "Recurring RAPTOR membership payment completed.", "finance"],
      "PAYMENT.SALE.REFUNDED": ["RAPTOR payment refunded", amount ? `${currency || "USD"} ${amount} was refunded.` : "A RAPTOR payment was refunded.", "finance"],
      "PAYMENT.SALE.REVERSED": ["RAPTOR payment reversed", amount ? `${currency || "USD"} ${amount} was reversed.` : "A RAPTOR payment was reversed.", "finance"],
      "BILLING.SUBSCRIPTION.ACTIVATED": ["RAPTOR subscription active", "A migrated RAPTOR subscription is active in PayPal.", "users"],
      "BILLING.SUBSCRIPTION.UPDATED": ["RAPTOR subscription updated", "A migrated RAPTOR subscription was updated in PayPal.", "users"],
      "BILLING.SUBSCRIPTION.PAYMENT.FAILED": ["RAPTOR payment failed", "A migrated RAPTOR recurring payment failed.", "finance"],
      "BILLING.SUBSCRIPTION.CANCELLED": ["RAPTOR subscription cancelled", "A migrated RAPTOR customer cancelled future PayPal renewal.", "users"],
      "BILLING.SUBSCRIPTION.SUSPENDED": ["RAPTOR subscription suspended", "PayPal suspended a migrated RAPTOR subscription.", "users"],
      "BILLING.SUBSCRIPTION.EXPIRED": ["RAPTOR subscription expired", "A migrated RAPTOR subscription expired.", "users"]
    }[type];
    if (webhookNotice) {
      await createAdminNotification(env, {
        type: "payment", title: webhookNotice[0], body: webhookNotice[1], route: webhookNotice[2], userId,
        relatedKey: `raptor-paypal-event:${eventId}`
      }).catch(() => null);
    }

    return json({ ok: true, migrated: true, subscriptionId, status: saved.status });
  } catch (error) {
    console.error("RAPTOR PayPal webhook error", error);
    return json({ error: error.message || "Unable to process RAPTOR PayPal webhook." }, 500);
  }
}

async function handlePaypalWebhook(request, env) {
  const config = await getPaypalSettings(env);
  if (!config.clientId || !config.secretConfigured || !config.webhookId) return json({ error: "PayPal webhook is not configured." }, 503);
  let event = {};
  try { event = await request.json(); } catch { return json({ error: "Invalid webhook JSON." }, 400); }
  try {
    if (!(await verifyPaypalWebhook(request, env, event, config))) return json({ error: "Invalid PayPal webhook signature." }, 400);
    const eventId = String(event.id || "").trim();
    if (!eventId) return json({ error: "Missing PayPal event ID." }, 400);
    const duplicate = await env.DB.prepare("SELECT id FROM payment_events WHERE provider_event_id=?").bind(eventId).first();
    if (duplicate) return json({ ok: true, duplicate: true });
    const type = String(event.event_type || "UNKNOWN");
    const resource = event.resource || {};
    const subscriptionId = String(resource.billing_agreement_id || (type.startsWith("BILLING.SUBSCRIPTION.") ? resource.id : "") || "").trim();
    let userId = null, tierId = null, details = null;

    // Lifetime-story events are handled only when the PayPal order/capture maps to
    // OX lifetime checkout/purchase tables. Unrelated PayPal events continue through
    // the existing membership webhook logic unchanged.
    const lifetime = await processLifetimePaypalWebhook(env, event, config);
    if (lifetime?.userId) userId = lifetime.userId;

    if (subscriptionId) {
      try { details = await fetchPaypalSubscription(env, subscriptionId, config); } catch {}
      if (details) {
        const owner = await resolvePaypalSubscriptionOwner(env, details);
        if (owner) { userId = owner.user_id; tierId = owner.tier_id; await savePaypalSubscription(env, userId, tierId, details, { paymentCompleted: type === "PAYMENT.SALE.COMPLETED", environment: config.mode }); }
      }
    }
    if (userId && type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED") {
      await env.DB.prepare("UPDATE users SET payment_status='Failed',updated_at=? WHERE id=?").bind(new Date().toISOString(),userId).run();
    }
    if (userId && type === "PAYMENT.SALE.COMPLETED") {
      const amount = resource.amount?.total || resource.amount?.value || "";
      const currency = resource.amount?.currency || resource.amount?.currency_code || "";
      await env.DB.prepare("UPDATE users SET payment_status='Paid',latest_amount=?,updated_at=? WHERE id=?")
        .bind(amount ? `${currency === 'USD' ? '$' : ''}${amount}` : "$0.00",new Date().toISOString(),userId).run();
    }
    const amount = String(resource.amount?.total || resource.amount?.value || "");
    const currency = String(resource.amount?.currency || resource.amount?.currency_code || "");
    const now = new Date().toISOString();
    const userSnapshot = userId ? await env.DB.prepare("SELECT name,email FROM users WHERE id=? LIMIT 1").bind(userId).first().catch(() => null) : null;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO payment_events(provider,provider_event_id,event_type,user_id,provider_subscription_id,amount,currency,environment,status,occurred_at,created_at,user_name_snapshot,user_email_snapshot)
        VALUES('paypal',?,?,?,?,?,?,?, 'Processed',?,?,?,?)`).bind(eventId,type,userId,subscriptionId||null,amount,currency,config.mode,event.create_time||null,now,userSnapshot?.name||"",userSnapshot?.email||""),
      env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('payment','PayPal webhook processed',?,?)").bind(`${type}${subscriptionId ? ` · ${subscriptionId}` : ""}.`,now)
    ]);
    if (userId && (type === "PAYMENT.SALE.COMPLETED" || lifetime?.handled)) {
      await recordPromotionPaymentAttribution(env, userId, eventId, amount, currency || "USD", "paypal", event.create_time || now);
    }
    const webhookNotice = lifetime?.notice || {
      "PAYMENT.SALE.COMPLETED": ["Payment received", amount ? `${currency || "USD"} ${amount} recurring payment completed.` : "Recurring membership payment completed.", "finance"],
      "BILLING.SUBSCRIPTION.PAYMENT.FAILED": ["Payment failed", "A recurring membership payment failed and needs follow-up.", "finance"],
      "BILLING.SUBSCRIPTION.CANCELLED": ["Subscription cancelled", "A member cancelled future PayPal renewal.", "users"],
      "BILLING.SUBSCRIPTION.SUSPENDED": ["Subscription suspended", "PayPal suspended a member subscription.", "users"],
      "BILLING.SUBSCRIPTION.EXPIRED": ["Subscription expired", "A PayPal membership subscription expired.", "users"],
      "PAYMENT.SALE.REFUNDED": ["Payment refunded", amount ? `${currency || "USD"} ${amount} was refunded.` : "A PayPal payment was refunded.", "finance"],
      "PAYMENT.CAPTURE.REFUNDED": ["Payment refunded", amount ? `${currency || "USD"} ${amount} was refunded.` : "A PayPal payment was refunded.", "finance"],
      "PAYMENT.CAPTURE.PENDING": ["Payment pending", amount ? `${currency || "USD"} ${amount} is pending.` : "A PayPal payment is pending.", "finance"],
      "PAYMENT.CAPTURE.DECLINED": ["Payment declined", amount ? `${currency || "USD"} ${amount} was declined.` : "A PayPal payment was declined.", "finance"],
      "PAYMENT.CAPTURE.REVERSED": ["Payment reversed", amount ? `${currency || "USD"} ${amount} was reversed.` : "A PayPal payment was reversed.", "finance"],
      "PAYMENT.REFUND.PENDING": ["Refund pending", "A PayPal refund is pending.", "finance"],
      "PAYMENT.REFUND.FAILED": ["Refund failed", "A PayPal refund failed.", "finance"]
    }[type];
    if (webhookNotice) await createAdminNotification(env, { type: "payment", title: webhookNotice[0], body: webhookNotice[1], route: webhookNotice[2], userId, relatedKey: `paypal-event:${eventId}` });
    return json({ ok: true, lifetimeHandled: Boolean(lifetime?.handled) });
  } catch (error) {
    return json({ error: error.message || "Unable to process PayPal webhook." }, 500);
  }
}


// ---------------------------------------------------------------------------
// Promotions: source attribution, partner management and immutable payment snapshots
// ---------------------------------------------------------------------------
async function promotionOptionsForUser(env, userId) {
  const [partners, attribution] = await Promise.all([
    env.DB.prepare("SELECT id,name,channel_url FROM promotion_partners WHERE status='active' ORDER BY name COLLATE NOCASE").all(),
    env.DB.prepare("SELECT partner_id,source_label,partner_name_snapshot,selected_at FROM promotion_customer_attributions WHERE user_id=? LIMIT 1").bind(userId).first().catch(() => null)
  ]);
  return { partners: partners.results || [], attribution: attribution ? {
    partnerId: attribution.partner_id || "", sourceLabel: attribution.source_label || "",
    partnerName: attribution.partner_name_snapshot || "", selectedAt: attribution.selected_at || null
  } : null };
}
async function handlePromotionOptions(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: "Log in before continuing to purchase.", code: "LOGIN_REQUIRED" }, 401);
  try { return json({ ok: true, ...await promotionOptionsForUser(env, user.id) }); }
  catch { return json({ error: "Promotions are not initialized. Apply the local database migrations first." }, 503); }
}
async function handlePromotionAttribution(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: "Log in before continuing to purchase.", code: "LOGIN_REQUIRED" }, 401);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid questionnaire response." }, 400); }
  const partnerId = String(body.partnerId || "").trim().slice(0, 100);
  const sourceLabel = String(body.sourceLabel || "").trim().slice(0, 180);
  let partner = null;
  if (partnerId) {
    partner = await env.DB.prepare("SELECT id,name FROM promotion_partners WHERE id=? AND status='active' LIMIT 1").bind(partnerId).first();
    if (!partner) return json({ error: "That referral source is no longer available. Refresh and choose again." }, 409);
  }
  if (!partner && !sourceLabel) return json({ error: "Choose where you heard about OX Novels." }, 400);
  const label = partner ? partner.name : sourceLabel;
  const now = new Date().toISOString();
  const existing = await env.DB.prepare("SELECT selected_at FROM promotion_customer_attributions WHERE user_id=? LIMIT 1").bind(user.id).first().catch(() => null);
  const selectedAt = existing && existing.selected_at ? existing.selected_at : now;
  await env.DB.prepare("INSERT INTO promotion_customer_attributions(id,user_id,partner_id,source_label,partner_name_snapshot,selected_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET partner_id=excluded.partner_id,source_label=excluded.source_label,partner_name_snapshot=excluded.partner_name_snapshot,updated_at=excluded.updated_at")
    .bind(crypto.randomUUID(), user.id, partner ? partner.id : null, partner ? "Partner referral" : sourceLabel, label, selectedAt, now).run();
  return json({ ok: true, saved: true, source: label });
}
async function recordPromotionPaymentAttribution(env, userId, eventRef, amount, currency, provider, purchasedAt) {
  if (!userId || !eventRef) return;
  const attribution = await env.DB.prepare("SELECT partner_id,source_label,partner_name_snapshot FROM promotion_customer_attributions WHERE user_id=? LIMIT 1").bind(userId).first().catch(() => null);
  if (!attribution) return;
  await env.DB.prepare("INSERT OR IGNORE INTO promotion_payment_attributions(id,user_id,event_ref,partner_id,source_label,partner_name_snapshot,amount,currency,provider,purchased_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), userId, String(eventRef), attribution.partner_id || null, attribution.source_label || "",
      attribution.partner_name_snapshot || "", String(amount || ""), String(currency || "USD"), String(provider || ""),
      purchasedAt || new Date().toISOString(), new Date().toISOString()).run().catch(() => null);
}
async function handleAdminPromotions(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  try {
    const [partners, customers] = await Promise.all([
      env.DB.prepare("SELECT p.id,p.name,p.channel_url,p.created_at,(SELECT COUNT(*) FROM promotion_customer_attributions c WHERE c.partner_id=p.id) AS customer_count,(SELECT COUNT(*) FROM promotion_payment_attributions h WHERE h.partner_id=p.id) AS payment_count FROM promotion_partners p WHERE p.status='active' ORDER BY p.name COLLATE NOCASE").all(),
      env.DB.prepare("SELECT c.user_id,c.partner_id,c.source_label,c.partner_name_snapshot,c.selected_at,c.updated_at,u.name,u.email,(SELECT COUNT(*) FROM promotion_payment_attributions h WHERE h.user_id=c.user_id) AS payment_count FROM promotion_customer_attributions c LEFT JOIN users u ON u.id=c.user_id ORDER BY c.updated_at DESC").all()
    ]);
    return json({ ok: true, partners: partners.results || [], customers: customers.results || [] });
  } catch { return json({ error: "Promotions tables are missing. Apply migrations 0026 and 0027 first." }, 503); }
}
async function handleAdminPromotionPartnerCreate(request, env) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 100);
  const channelUrl = String(body.channelUrl || "").trim().slice(0, 500);
  if (!name) return json({ error: "Enter the friend's name or channel name." }, 400);
  if (channelUrl) {
    try { const u = new URL(channelUrl); if (!["http:","https:"].includes(u.protocol)) throw new Error(); }
    catch { return json({ error: "Enter a valid YouTube or website URL." }, 400); }
  }
  const now = new Date().toISOString(), id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO promotion_partners(id,name,channel_url,status,created_at,updated_at) VALUES(?,?,?,'active',?,?)").bind(id,name,channelUrl,now,now).run();
  await env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('system','Promotion partner added',?,?)").bind(name,now).run().catch(() => null);
  return json({ ok: true, id, name, channelUrl });
}
async function handleAdminPromotionPartnerDelete(request, env, partnerId) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  const partner = await env.DB.prepare("SELECT id,name FROM promotion_partners WHERE id=?").bind(partnerId).first();
  if (!partner) return json({ error: "Friend not found in Promotions." }, 404);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM promotion_customer_attributions WHERE partner_id=?").bind(partnerId),
    env.DB.prepare("UPDATE promotion_payment_attributions SET partner_id=NULL WHERE partner_id=?").bind(partnerId),
    env.DB.prepare("DELETE FROM promotion_partners WHERE id=?").bind(partnerId),
    env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('system','Promotion partner deleted',?,?)").bind(partner.name + ". Historical payment snapshots were retained.",new Date().toISOString())
  ]);
  return json({ ok: true, deleted: true, historicalPaymentsRetained: true });
}
async function handleAdminPromotionCustomerUpdate(request, env, userId) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const existing = await env.DB.prepare("SELECT * FROM promotion_customer_attributions WHERE user_id=?").bind(userId).first();
  if (!existing) return json({ error: "This customer has no Promotions record." }, 404);
  const partnerId = String(body.partnerId || "").trim();
  let partner = null;
  if (partnerId) {
    partner = await env.DB.prepare("SELECT id,name FROM promotion_partners WHERE id=? AND status='active'").bind(partnerId).first();
    if (!partner) return json({ error: "Choose an active promotion partner." }, 400);
  }
  const sourceLabel = partner ? "Partner referral" : String(body.sourceLabel || "Other").trim().slice(0,180);
  const snapshot = partner ? partner.name : sourceLabel, now = new Date().toISOString();
  await env.DB.prepare("UPDATE promotion_customer_attributions SET partner_id=?,source_label=?,partner_name_snapshot=?,updated_at=? WHERE user_id=?")
    .bind(partner ? partner.id : null,sourceLabel,snapshot,now,userId).run();
  await env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('user','Promotion attribution corrected',?,?)")
    .bind(userId + ": " + (existing.partner_name_snapshot || existing.source_label || "Unknown") + " → " + snapshot + ". Original selection date retained: " + existing.selected_at + ".",now).run().catch(() => null);
  return json({ ok: true, updated: true, selectedAt: existing.selected_at, partnerName: snapshot });
}
async function handleAdminPromotionCustomerDelete(request, env, userId) {
  if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
  const existing = await env.DB.prepare("SELECT user_id FROM promotion_customer_attributions WHERE user_id=?").bind(userId).first();
  if (!existing) return json({ error: "Promotions customer not found." }, 404);
  await env.DB.prepare("DELETE FROM promotion_customer_attributions WHERE user_id=?").bind(userId).run();
  await env.DB.prepare("INSERT INTO activity_log(type,title,detail,created_at) VALUES('user','Promotions customer deleted',?,?)")
    .bind(userId + ". OX account, memberships and payment history were not deleted.",new Date().toISOString()).run().catch(() => null);
  return json({ ok: true, deleted: true, oxAccountPreserved: true, historicalPaymentsRetained: true });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    if(pathname==="/api/internal/player-library") return request.method==="GET"?b92InternalLibrary(request,env):json({error:"Method not allowed"},405);

    if ((pathname === "/49" || pathname === "/49/") && (request.method === "GET" || request.method === "HEAD")) {
      const assetUrl = new URL("/49.html", url);
      assetUrl.search = url.search;
      return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
    }

    if ((pathname === "/raptor-migrate" || pathname === "/raptor-migrate/") && (request.method === "GET" || request.method === "HEAD")) {
      const assetUrl = new URL("/raptor-migrate.html", url);
      assetUrl.search = url.search;
      return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
    }

    if (pathname === "/api/promotions/options" && request.method === "GET") return handlePromotionOptions(request, env);
    if (pathname === "/api/promotions/attribution" && request.method === "POST") return handlePromotionAttribution(request, env);
    if (pathname === "/api/admin/promotions" && request.method === "GET") return handleAdminPromotions(request, env);
    if (pathname === "/api/admin/promotions/partners" && request.method === "POST") return handleAdminPromotionPartnerCreate(request, env);
    const promotionPartnerMatch = pathname.match(/^\/api\/admin\/promotions\/partners\/([^/]+)$/);
    if (promotionPartnerMatch && request.method === "DELETE") return handleAdminPromotionPartnerDelete(request, env, decodeURIComponent(promotionPartnerMatch[1]));
    const promotionCustomerMatch = pathname.match(/^\/api\/admin\/promotions\/customers\/([^/]+)$/);
    if (promotionCustomerMatch && request.method === "PUT") return handleAdminPromotionCustomerUpdate(request, env, decodeURIComponent(promotionCustomerMatch[1]));
    if (promotionCustomerMatch && request.method === "DELETE") return handleAdminPromotionCustomerDelete(request, env, decodeURIComponent(promotionCustomerMatch[1]));

    if (pathname === "/api/site" && request.method === "GET") return handlePublicSite(env);
    if (pathname === "/api/stories" && request.method === "GET") return handlePublicStories(env);
    if (pathname === "/api/posts" && request.method === "GET") return handlePublicPosts(env);
    if (pathname === "/api/posts/status" && request.method === "GET") return handlePostsStatus(request, env, url);
    if (pathname === "/api/posts/seen" && request.method === "POST") return handlePostsSeen(request, env);
    if (pathname === "/api/session" && request.method === "GET") return handlePublicSession(request, env, url);
    if (pathname === "/api/auth/google/config" && request.method === "GET") return handleGoogleAuthConfig(env);
    if (pathname === "/api/auth/google" && request.method === "POST") return handleGoogleMemberAuth(request, env, url);

    if (pathname === "/api/migration/raptor/preview" && request.method === "POST") return handleRaptorMigrationPreview(request, env);
    if (pathname === "/api/migration/raptor/claim" && request.method === "POST") return handleRaptorMigrationClaim(request, env);

    if ((pathname === "/api/auth/register" || pathname === "/api/auth/login") && request.method === "POST") return json({ error: "Password sign-in has been replaced by Continue with Google.", code: "GOOGLE_ONLY_AUTH" }, 410);
    if (pathname === "/api/auth/logout" && request.method === "POST") return handleMemberLogout(request, env, url);

    if (pathname === "/api/account/profile-image" && request.method === "POST") return handleMemberProfileUpload(request, env);
    if (pathname === "/api/account/profile-image" && request.method === "DELETE") return handleMemberProfileDelete(request, env);
    if (pathname === "/api/account/client-context" && request.method === "POST") return handleMemberClientContext(request, env);

    if (pathname === "/api/chat/status" && request.method === "GET") return handleMemberChatStatus(request, env);
    if (pathname === "/api/chat/messages" && request.method === "GET") return handleMemberChatMessages(request, env, url);
    if (pathname === "/api/chat/messages" && request.method === "POST") return handleMemberChatSend(request, env);

    if (pathname === "/api/telegram/status" && request.method === "GET") return handleTelegramStatus(request, env);
    if (pathname === "/api/telegram/link" && request.method === "POST") return handleTelegramCreateLink(request, env);
    if (pathname === "/api/telegram/webhook" && request.method === "POST") return handleTelegramWebhook(request, env);

    if (pathname === "/api/story-purchases/catalog" && request.method === "GET") return handleLifetimeStoryCatalog(request, env);
    if (pathname === "/api/story-purchases/mine" && request.method === "GET") return handleLifetimeStoryMine(request, env);
    if (pathname === "/api/story-purchases/create-order" && request.method === "POST") return handleLifetimeStoryCreateOrder(request, env);
    if (pathname === "/api/story-purchases/capture-order" && request.method === "POST") return handleLifetimeStoryCaptureOrder(request, env);
    if (pathname === "/api/story-purchases/dodo-test-checkout" && request.method === "POST") return handleDodoLifetimeTestCheckout(request, env, url);

    if (pathname === "/api/payments/dodo/test-checkout" && request.method === "POST") return handleDodoTestCheckout(request, env, url);
    if (pathname === "/api/payments/dodo/test-webhook" && request.method === "POST") return handleDodoTestWebhook(request, env);

    if (pathname === "/api/payments/paypal/checkout-context" && request.method === "POST") return handlePaypalCheckoutContext(request, env);
    if (pathname === "/api/payments/paypal/confirm" && request.method === "POST") return handlePaypalConfirm(request, env);
    if (pathname === "/api/payments/paypal/refresh-status" && request.method === "POST") return handlePaypalRefreshStatus(request, env);
    if (pathname === "/api/payments/paypal/support-context" && request.method === "GET") return handlePaypalSupportContext(request, env);
    if (pathname === "/api/payments/paypal/support/create" && request.method === "POST") return handlePaypalSupportCreate(request, env);
    if (pathname === "/api/payments/paypal/support/capture" && request.method === "POST") return handlePaypalSupportCapture(request, env);
    if (pathname === "/api/payments/paypal/raptor-webhook" && request.method === "POST") return handleRaptorPaypalWebhook(request, env);
    if (pathname === "/api/payments/paypal/webhook" && request.method === "POST") return handlePaypalWebhook(request, env);

    if ((pathname === "/api/story-cover" || pathname === "/api/story-cover/") && ["POST","PUT","PATCH","DELETE"].includes(request.method)) {
      // Consume any upload body before responding so Wrangler/Miniflare never sees
      // an unread request stream after a response has already been returned.
      if (request.body) { try { await request.arrayBuffer(); } catch {} }
      return json({ error: "A valid story id is required for a cover upload." }, 400);
    }

    const storyCoverMatch = pathname.match(/^\/api\/story-cover\/([^/]+)$/);
    if (storyCoverMatch && request.method === "GET") {
      if (!(await databaseReady(env))) return new Response(generatedStoryCoverSvg(decodeURIComponent(storyCoverMatch[1]), decodeURIComponent(storyCoverMatch[1])), { headers: { "content-type": "image/svg+xml; charset=utf-8" } });
      return getStoryCover(request, env, decodeURIComponent(storyCoverMatch[1]));
    }
    if (storyCoverMatch && request.method === "POST") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      return uploadStoryCover(request, env, decodeURIComponent(storyCoverMatch[1]));
    }
    if (storyCoverMatch && request.method === "DELETE") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      return resetStoryCover(env, decodeURIComponent(storyCoverMatch[1]));
    }

    const mediaMatch = pathname.match(/^\/api\/media\/([^/]+)$/);
    if (mediaMatch && request.method === "GET") {
      if (!(await databaseReady(env))) return new Response("Not found", { status: 404 });
      return getMediaAsset(request, env, decodeURIComponent(mediaMatch[1]));
    }
    const adminMediaMatch = pathname.match(/^\/api\/admin\/media\/([^/]+)$/);
    if (adminMediaMatch) {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      if (request.method === "POST") return uploadMediaAsset(request, env, decodeURIComponent(adminMediaMatch[1]));
      if (request.method === "DELETE") return deleteMediaAsset(env, decodeURIComponent(adminMediaMatch[1]));
    }

    if (pathname === "/api/admin/integrations/status" && request.method === "GET") return handleAdminIntegrationsStatus(request, env);
    if (pathname === "/api/admin/player-delivery" && (request.method === "GET" || request.method === "PUT")) return handleAdminPlayerDelivery(request, env);
    if (pathname === "/api/admin/player-catalogs" && request.method === "GET") return handleAdminPlayerCatalogs(request, env);
    if (pathname === "/api/admin/player-catalogs/snapshot" && request.method === "GET") return handleAdminPlayerCatalogSnapshot(request, env);
    if (pathname === "/api/admin/player-catalogs/drive-check" && request.method === "POST") return handleAdminPlayerCatalogDriveCheck(request, env);
    if (pathname === "/api/admin/auth/google" && (request.method === "GET" || request.method === "PUT")) return handleAdminGoogleAuth(request, env);


    if (pathname === "/api/admin/drive/chunk" && request.method === "POST") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      let body = {};
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
      try {
        const part = await scanDriveFolderChunkApi(env, body.rootId || body.rootFolderId || "", body.pending);
        return json({ ok: true, ...part });
      } catch (error) {
        return json({ error: String(error?.message || error), code: error?.code || "DRIVE_CHUNK_FAILED" }, error?.code === "GOOGLE_DRIVE_NOT_CONFIGURED" ? 409 : 500);
      }
    }

    if (pathname === "/api/admin/drive/classify" && request.method === "POST") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      let body = {};
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
      try {
        const result = await classifyDriveTreeApi(env, body.rootId || body.rootFolderId || "", body.nodes);
        return json({ ok: true, ...result });
      } catch (error) {
        return json({ error: String(error?.message || error), code: error?.code || "DRIVE_CLASSIFY_FAILED" }, error?.code === "GOOGLE_DRIVE_NOT_CONFIGURED" ? 409 : 500);
      }
    }

    if (pathname === "/api/admin/drive/analyze" && request.method === "POST") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      let body = {};
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
      try {
        const scan = await scanDriveRoots(env, Array.isArray(body.links) ? body.links : []);
        return json({ ok: true, ...scan });
      } catch (error) {
        return json({ error: String(error?.message || error), code: error?.code || "DRIVE_SCAN_FAILED" }, error?.code === "GOOGLE_DRIVE_NOT_CONFIGURED" ? 409 : 500);
      }
    }

    if (pathname === "/api/admin/story-check" && request.method === "POST") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      return json({ error: "Automatic AI checking is disabled. Use Admin > Story Checks > Check stories to copy the manual AI research prompt." }, 410);
    }

    if (pathname === "/api/admin/status" && request.method === "GET") return handleAdminStatus(request, env);
    if (pathname === "/api/admin/login" && request.method === "POST") return handleAdminLogin(request, env, url);
    if (pathname === "/api/admin/logout" && request.method === "POST") return handleAdminLogout(request, env, url);

    if (pathname === "/api/admin/posts" && request.method === "GET") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      return handleAdminPostsGet(env);
    }
    if (pathname === "/api/admin/posts" && request.method === "POST") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      return handleAdminPostsCreate(request, env);
    }
    const adminPostMatch = pathname.match(/^\/api\/admin\/posts\/([^/]+)$/);
    if (adminPostMatch && request.method === "PUT") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      return handleAdminPostUpdate(request, env, decodeURIComponent(adminPostMatch[1]));
    }
    if (adminPostMatch && request.method === "DELETE") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      return handleAdminPostDelete(env, decodeURIComponent(adminPostMatch[1]));
    }

    if (pathname === "/api/admin/notifications" && request.method === "GET") return handleAdminNotifications(request, env, url);
    if (pathname === "/api/admin/notifications/read" && request.method === "POST") return handleAdminNotificationsRead(request, env);
    if (pathname === "/api/admin/payments/paypal" && request.method === "GET") return handleAdminPaypalGet(request, env);
    if (pathname === "/api/admin/payments/paypal" && request.method === "PUT") return handleAdminPaypalSave(request, env);
    if (pathname === "/api/admin/payments/paypal/test" && request.method === "POST") return handleAdminPaypalTest(request, env);
    if (pathname === "/api/admin/stories/lifetime-protection" && request.method === "POST") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      return handleAdminStoryLifetimeProtection(request, env);
    }
    if (pathname === "/api/admin/stories" && request.method === "DELETE") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      const body=await request.clone().json().catch(()=>({}));
      const result=await handleAdminStoryDelete(request, env);
      if(result.ok) b92NotifyPlayer(ctx,env,[],Array.isArray(body.ids)?body.ids.map(String):[]);
      return result;
    }
    if (pathname === "/api/admin/lifetime-purchases" && request.method === "GET") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      return handleAdminLifetimePurchases(env);
    }
    if (pathname === "/api/admin/lifetime-purchases/assignment" && request.method === "PUT") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      return handleAdminLifetimeAssignment(request, env);
    }
    if (pathname === "/api/admin/lifetime-purchases/reconcile" && request.method === "POST") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      return handleAdminLifetimeReconcile(env);
    }
    if (pathname === "/api/admin/finance" && request.method === "GET") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      return handleAdminFinance(env, url);
    }
    if (pathname === "/api/admin/finance/override" && request.method === "PUT") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      return handleAdminFinanceOverride(request, env);
    }
    if (pathname === "/api/admin/backup" && (request.method === "GET" || request.method === "POST")) return handleAdminBackup(request, env, url);
    if (pathname === "/api/admin/maintenance/deleted-user-cleanup" && request.method === "POST") return handleDeletedUserCleanup(request, env);

    if (pathname === "/api/admin/chat/broadcast/preview" && request.method === "POST") return handleAdminChatBroadcastPreview(request, env);
    if (pathname === "/api/admin/chat/broadcast/send" && request.method === "POST") return handleAdminChatBroadcastSend(request, env);
    if (pathname === "/api/admin/chat/broadcasts" && request.method === "GET") return handleAdminChatBroadcastHistory(request, env, url);
    if (pathname === "/api/admin/chat/status" && request.method === "GET") return handleAdminChatStatus(request, env);
    if (pathname === "/api/admin/chat/conversations" && request.method === "GET") return handleAdminChatConversations(request, env);
    if (pathname === "/api/admin/activity" && (request.method === "GET" || request.method === "POST")) {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      if (request.method === "GET") return handleAdminActivityGet(env, url);
      return handleAdminActivityPost(request, env);
    }
    const adminChatMessagesMatch = pathname.match(/^\/api\/admin\/chat\/messages\/([^/]+)$/);
    if (adminChatMessagesMatch && request.method === "GET") return handleAdminChatMessages(request, env, decodeURIComponent(adminChatMessagesMatch[1]), url);
    if (adminChatMessagesMatch && request.method === "POST") return handleAdminChatSend(request, env, decodeURIComponent(adminChatMessagesMatch[1]));

    if (pathname === "/api/admin/core") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      if (request.method === "GET") return json({ ok: true, ...(await getCoreState(env)) });
      if (request.method === "PUT") {
        let body = {};
        try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
        const beforeRows=(await env.DB.prepare('SELECT id,drive_url,visible FROM stories').all()).results||[];
        const before=new Map(beforeRows.map(r=>[String(r.id),{driveUrl:String(r.drive_url||''),visible:Number(r.visible||0)===1}]));
        const saved = await saveCoreState(env, body);
        const changed=[];
        for(const row of saved.stories){const id=String(row.id||''),old=before.get(id);
          const currentDrive=String(row.driveUrl||''), currentVisible=row.visible===true;
          if(!old||old.driveUrl!==currentDrive||old.visible!==currentVisible)changed.push(id);
          before.delete(id);
        }
        b92NotifyPlayer(ctx,env,changed,[...before.keys()]);
        return json({ ok: true, ...saved });
      }
    }

    if (pathname === "/api/admin/users" && request.method === "GET") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      return json({ ok: true, users: await listAdminUsers(env) });
    }
    if (pathname === "/api/admin/users" && request.method === "DELETE") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      let body = {};
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
      const result = await deleteAdminUsers(env, Array.isArray(body.ids) ? body.ids : []);
      if (result.error) return json({ error: result.error }, result.status || 400);
      return json({ ok: true, ...result });
    }

    const adminUserRecordMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (adminUserRecordMatch && request.method === "PUT") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      let body = {};
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
      const result = await updateAdminUser(env, decodeURIComponent(adminUserRecordMatch[1]), body);
      if (result.error) return json({ error: result.error }, result.status || 400);
      return json({ ok: true, ...result });
    }
    if (adminUserRecordMatch && request.method === "DELETE") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      const result = await deleteAdminUsers(env, [decodeURIComponent(adminUserRecordMatch[1])]);
      if (result.error) return json({ error: result.error }, result.status || 400);
      return json({ ok: true, ...result });
    }

    if (pathname === "/api/admin/telegram/setup" && request.method === "GET") return handleAdminTelegramSetupStatus(request, env);
    if (pathname === "/api/admin/telegram/setup" && request.method === "POST") return handleAdminTelegramSetup(request, env);

    const adminUserTestControlsMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/test-controls$/);
    if (adminUserTestControlsMatch && request.method === "PUT") {
      return handleAdminUserTestControls(request, env, decodeURIComponent(adminUserTestControlsMatch[1]));
    }

    const adminUserTelegramResetMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/telegram\/reset$/);
    if (adminUserTelegramResetMatch && request.method === "DELETE") {
      return handleAdminTelegramReset(request, env, decodeURIComponent(adminUserTelegramResetMatch[1]));
    }

    const adminUserPaypalMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/paypal-subscription$/);
    if (adminUserPaypalMatch && request.method === "POST") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      return handleAdminUserPaypalAttach(request, env, decodeURIComponent(adminUserPaypalMatch[1]));
    }
    if (adminUserPaypalMatch && request.method === "DELETE") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      return handleAdminUserPaypalDetach(request, env, decodeURIComponent(adminUserPaypalMatch[1]));
    }

    const adminLifetimePurchaseRecordMatch = pathname.match(/^\/api\/admin\/lifetime-purchases\/([^/]+)$/);
    if (adminLifetimePurchaseRecordMatch && request.method === "DELETE") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      return handleAdminLifetimePurchaseHardDelete(env, decodeURIComponent(adminLifetimePurchaseRecordMatch[1]));
    }

    const adminUserActionMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/action$/);
    if (adminUserActionMatch && request.method === "POST") {
      if (!(await isAdminAuthenticated(request, env))) return json({ error: "Admin login required." }, 401);
      let body = {};
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
      const result = await applyAdminUserAction(env, decodeURIComponent(adminUserActionMatch[1]), body.action);
      if (result.error) return json({ error: result.error }, result.status || 400);
      return json({ ok: true, ...result });
    }

    const playerHandoffMatch = pathname.match(/^\/api\/story\/([^/]+)\/player-handoff$/);
    if (playerHandoffMatch && request.method === "GET") {
      const storyId = decodeURIComponent(playerHandoffMatch[1]);
      if (!(await databaseReady(env))) return json({ error: "Backend database is not initialized.", code: "DB_NOT_READY" }, 503);

      const story = await env.DB.prepare("SELECT id,title,description,genre,cover,drive_url FROM stories WHERE id=? AND visible=1").bind(storyId).first();
      if (!story) return json({ error: "Story not found." }, 404);

      const user = await getCurrentUser(request, env);
      if (!user) return json({ error: "Log in to listen.", code: "LOGIN_REQUIRED" }, 401);
      const access = await userAccessContext(env, user);
      let lifetimeAccess = false;
      if (!access.membershipActive) {
        if (access.testMode) {
          lifetimeAccess = Boolean(access.lifetimeEnabled && String(access.lifetimeStoryId) === String(storyId));
        } else {
          const owned = await env.DB.prepare(`SELECT lp.id FROM lifetime_story_products p
            JOIN story_lifetime_purchases lp ON lp.permanent_story_id=p.id
            WHERE p.current_story_id=? AND p.state='Active' AND lp.user_id=?
              AND lp.purchase_status='Completed' AND lp.entitlement_status='Active' LIMIT 1`)
            .bind(storyId, user.id).first().catch(() => null);
          lifetimeAccess = Boolean(owned);
        }
        if (!lifetimeAccess) return json({ error: "Active membership or lifetime purchase required.", code: "ACCESS_REQUIRED" }, 403);
      }
      if (!story.drive_url) return json({ error: "The Drive link has not been added for this story yet.", code: "DRIVE_LINK_MISSING" }, 409);

      const now = Math.floor(Date.now() / 1000);
      let sessionExp = now + OX_PLAYER_SESSION_MAX_SECONDS;
      if (access.membershipActive && user.membership_expires_at) {
        const membershipExpiry = Math.floor(new Date(user.membership_expires_at).getTime() / 1000);
        if (Number.isFinite(membershipExpiry) && membershipExpiry > now) sessionExp = Math.min(sessionExp, membershipExpiry);
      }
      if (sessionExp <= now + 10) return json({ error: "Your access is about to expire. Refresh your OX account status and try again.", code: "ACCESS_EXPIRING" }, 403);

      const accessType = access.membershipActive
        ? (access.testMode ? "test-membership" : "membership")
        : (access.testMode ? "test-lifetime" : "lifetime");
      const appearanceRow = await env.DB.prepare("SELECT value FROM site_settings WHERE key='appearance'").first().catch(() => null);
      const playerAppearance = normalizeAppearance(safeParse(appearanceRow?.value || "{}", DEFAULT_APPEARANCE));
      const absoluteOxUrl = (value) => {
        const raw = String(value || "").trim();
        if (!raw) return "";
        try { const u = new URL(raw, "https://oxnovels.top"); return u.protocol === "https:" && u.hostname === "oxnovels.top" ? u.href : ""; } catch { return ""; }
      };
      const rawCover = String(story.cover || "").trim();
      const normalizedCover = (!rawCover || (String(story.id) !== "wolves-blood-moon" && rawCover === "/covers/wolves-blood-moon.svg"))
        ? "/api/story-cover/" + encodeURIComponent(String(story.id))
        : rawCover;
      const memberPlan = access.testMode
        ? (["Active","Granted"].includes(access.membershipStatus) ? "OX Test Simulation" : "None")
        : String(user.membership_plan || "None");

      const handoff = {
        v: 1, kind: "handoff", iss: "oxnovels.top", aud: "ox-player",
        storyId: String(story.id), storyTitle: String(story.title || "Story"),
        storyDescription: String(story.description || ""), storyGenre: String(story.genre || ""),
        storyCover: absoluteOxUrl(normalizedCover),
        siteName: String(playerAppearance.name || "OX Novels"), siteLogo: absoluteOxUrl(playerAppearance.logo), siteAccent: String(playerAppearance.accent || "#13c3b3"),
        displayName: String(user.name || ""), access: accessType, membershipStatus: String(access.membershipStatus || ""),
        membershipPlan: memberPlan, membershipExpiresAt: String(user.membership_expires_at || ""),
        iat: now, exp: now + OX_PLAYER_HANDOFF_TTL_SECONDS, sessionExp
      };

      try {
        const token = await createOxPlayerHandoffToken(env, handoff);
        return json({ ok: true, playerUrl: `${oxPlayerBaseUrl(env)}/handoff`, token, expiresIn: OX_PLAYER_HANDOFF_TTL_SECONDS });
      } catch (error) {
        return json({ error: String(error?.message || error), code: error?.code || "PLAYER_HANDOFF_FAILED" }, 503);
      }
    }

    const openMatch = pathname.match(/^\/api\/story\/([^/]+)\/open$/);
    if (openMatch && request.method === "GET") {
      const storyId = decodeURIComponent(openMatch[1]);
      if (!(await databaseReady(env))) {
        return json({ error: "Backend database is not initialized.", code: "DB_NOT_READY" }, 503);
      }

      const story = await env.DB.prepare("SELECT id, drive_url FROM stories WHERE id = ? AND visible = 1").bind(storyId).first();
      if (!story) return json({ error: "Story not found." }, 404);

      const user = await getCurrentUser(request, env);
      if (!user) return json({ error: "Log in to listen.", code: "LOGIN_REQUIRED" }, 401);
      const access = await userAccessContext(env, user);
      let lifetimeAccess = false;
      if (!access.membershipActive) {
        if (access.testMode) {
          lifetimeAccess = Boolean(access.lifetimeEnabled && String(access.lifetimeStoryId) === String(storyId));
        } else {
          const owned = await env.DB.prepare(`SELECT lp.id FROM lifetime_story_products p
            JOIN story_lifetime_purchases lp ON lp.permanent_story_id=p.id
            WHERE p.current_story_id=? AND p.state='Active' AND lp.user_id=?
              AND lp.purchase_status='Completed' AND lp.entitlement_status='Active' LIMIT 1`)
            .bind(storyId, user.id).first().catch(() => null);
          lifetimeAccess = Boolean(owned);
        }
        if (!lifetimeAccess) return json({ error: "Active membership or lifetime purchase required.", code: "ACCESS_REQUIRED" }, 403);
      }
      if (!story.drive_url) {
        return json({ error: "The Drive link has not been added for this story yet.", code: "DRIVE_LINK_MISSING" }, 409);
      }
      return json({ url: story.drive_url });
    }

    return env.ASSETS.fetch(request);
  }
};
