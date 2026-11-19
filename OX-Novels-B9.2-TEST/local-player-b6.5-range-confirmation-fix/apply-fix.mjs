import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const oxRoot = path.resolve(here, '..');
const target = path.join(oxRoot, 'local-player-b5', 'src', 'worker-B5-template.js');
const backup = path.join(oxRoot, 'local-player-b5', 'src', 'worker-B5-template.before-B6.5.js');

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(target)) fail(`Could not find ${target}`);
let source = fs.readFileSync(target, 'utf8');
if (!source.includes('OX_B64_STREAM_DIAGNOSTICS')) fail('B6.4 must be applied before B6.5.');
if (source.includes('OX_B65_RANGE_CONFIRMATION_FIX')) {
  console.log('B6.5 is already applied. No changes were needed.');
  process.exit(0);
}
if (!fs.existsSync(backup)) fs.copyFileSync(target, backup);

// B6.4 installer accidentally lost regex backslashes while writing template literals.
// Fix the generated Worker source first.
source = source.replace(
  "else if (range && !/^bytess+d+-d+/d+$/i.test(contentRange)) reason = \"invalid_content_range\";",
  "else if (range && !/^bytes\\s+\\d+-\\d+\\/\\d+$/i.test(contentRange)) reason = \"invalid_content_range\";"
);
source = source.replace(
  "if (range && !/^bytes=d*-d*$/.test(range)) {",
  "if (range && !/^bytes=\\d*-\\d*$/.test(range)) {"
);

if (!source.includes('!/^bytes=\\d*-\\d*$/.test(range)')) fail('Could not repair the browser Range validator.');
if (!source.includes('!/^bytes\\s+\\d+-\\d+\\/\\d+$/i.test(contentRange)')) fail('Could not repair Content-Range validation.');

const fetchStart = source.indexOf('async function fetchDriveAudio(fileId, range = "") {');
const fetchEnd = source.indexOf('async function handleAudioStream(request, env, url) {', fetchStart);
if (fetchStart < 0 || fetchEnd < 0) fail('Could not locate the B6.4 Drive fetch block.');

const replacement = `const DRIVE_CONFIRM_CACHE = new Map();

function decodeDriveHtml(value = "") {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function driveCookieHeader(response) {
  try {
    const values = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
    return values.map(value => String(value || "").split(";", 1)[0]).filter(Boolean).join("; ");
  } catch {
    return "";
  }
}

function parseHtmlAttributes(tag = "") {
  const attrs = {};
  const re = /([A-Za-z_:][-A-Za-z0-9_:.]*)\\s*=\\s*(["'])(.*?)\\2/g;
  let match;
  while ((match = re.exec(String(tag || "")))) attrs[String(match[1] || "").toLowerCase()] = decodeDriveHtml(match[3] || "");
  return attrs;
}

function extractDriveConfirmation(html = "", fileId = "") {
  const text = String(html || "");
  const forms = text.match(/<form\\b[^>]*>/gi) || [];
  let action = "";
  for (const form of forms) {
    const attrs = parseHtmlAttributes(form);
    const candidate = String(attrs.action || "");
    if (/^https:\\/\\/(?:drive\\.usercontent\\.google\\.com|drive\\.google\\.com)\\//i.test(candidate)) {
      action = candidate;
      break;
    }
  }
  if (!action) {
    const href = text.match(/https:\\/\\/(?:drive\\.usercontent\\.google\\.com|drive\\.google\\.com)\\/download\\?[^"'<>\\s]+/i);
    if (href) action = decodeDriveHtml(href[0]);
  }
  if (!action) return null;

  let target;
  try { target = new URL(decodeDriveHtml(action)); } catch { return null; }
  if (!/^(?:drive\\.usercontent\\.google\\.com|drive\\.google\\.com)$/i.test(target.hostname)) return null;

  const inputs = text.match(/<input\\b[^>]*>/gi) || [];
  for (const input of inputs) {
    const attrs = parseHtmlAttributes(input);
    const name = String(attrs.name || "");
    if (!name || !("value" in attrs)) continue;
    if (["id", "export", "confirm", "uuid", "authuser", "at"].includes(name)) target.searchParams.set(name, attrs.value);
  }
  if (!target.searchParams.get("id") && fileId) target.searchParams.set("id", fileId);
  if (!target.searchParams.get("export")) target.searchParams.set("export", "download");
  return target.toString();
}

function driveResponseReason(response, range = "", bodyText = "") {
  const type = String(response?.headers?.get("content-type") || "").toLowerCase();
  const contentRange = String(response?.headers?.get("content-range") || "");
  if (type.includes("text/html")) return classifyDriveHtml(bodyText);
  if (response.status === 429) return "drive_rate_limit";
  if (response.status === 403) return "drive_forbidden";
  if (response.status === 404) return "drive_not_found";
  if (response.status >= 500) return "drive_server_error";
  if (range && response.status !== 206) return "range_not_honored";
  if (range && !/^bytes\\s+\\d+-\\d+\\/\\d+$/i.test(contentRange)) return "invalid_content_range";
  if (!(response.ok || response.status === 206)) return "drive_http_" + response.status;
  return "";
}

async function driveFetchOnce(target, range = "", cookie = "") {
  const headers = new Headers({ "user-agent": "OX-Audio-Player-B6.5/1.0", "accept": "*/*" });
  if (range) headers.set("range", range);
  if (cookie) headers.set("cookie", cookie);
  return fetch(target, { method: "GET", redirect: "follow", headers });
}

async function evaluateDriveResponse(response, { fileId, range, candidate, diagnostics, allowConfirmation = true }) {
  const type = String(response.headers.get("content-type") || "").toLowerCase();
  const contentRange = String(response.headers.get("content-range") || "");
  if (!type.includes("text/html")) {
    const reason = driveResponseReason(response, range, "");
    diagnostics.push({ candidate, status: response.status, type: type.slice(0, 120), contentRange: contentRange.slice(0, 120), reason: reason || "ok" });
    if (!reason && response.body) return { response, candidate };
    try { await response.body?.cancel(); } catch {}
    const error = new Error(reason || "Drive source unavailable");
    error.reason = reason;
    throw error;
  }

  let html = "";
  try { html = (await response.text()).slice(0, 20000); } catch {}
  const initialReason = classifyDriveHtml(html);
  if (allowConfirmation && (initialReason === "drive_confirmation" || initialReason === "drive_html")) {
    const confirmedTarget = extractDriveConfirmation(html, fileId);
    if (confirmedTarget) {
      const cookie = driveCookieHeader(response);
      DRIVE_CONFIRM_CACHE.set(fileId, { url: confirmedTarget, cookie, expiresAt: Date.now() + 8 * 60 * 1000 });
      let confirmed;
      try { confirmed = await driveFetchOnce(confirmedTarget, range, cookie); }
      catch (error) {
        diagnostics.push({ candidate: candidate + "c", status: 0, type: "", contentRange: "", reason: "network_error" });
        throw error;
      }
      const confirmedType = String(confirmed.headers.get("content-type") || "").toLowerCase();
      const confirmedRange = String(confirmed.headers.get("content-range") || "");
      let confirmedHtml = "";
      if (confirmedType.includes("text/html")) {
        try { confirmedHtml = (await confirmed.text()).slice(0, 12000); } catch {}
      }
      const confirmedReason = driveResponseReason(confirmed, range, confirmedHtml);
      diagnostics.push({ candidate: candidate + "c", status: confirmed.status, type: confirmedType.slice(0, 120), contentRange: confirmedRange.slice(0, 120), reason: confirmedReason || "ok" });
      if (!confirmedReason && confirmed.body) return { response: confirmed, candidate: candidate + "c" };
      try { await confirmed.body?.cancel(); } catch {}
      DRIVE_CONFIRM_CACHE.delete(fileId);
      const error = new Error(confirmedReason || "Drive confirmation failed");
      error.reason = confirmedReason;
      throw error;
    }
  }

  diagnostics.push({ candidate, status: response.status, type: type.slice(0, 120), contentRange: contentRange.slice(0, 120), reason: initialReason || "drive_html" });
  const error = new Error(initialReason || "Drive HTML response");
  error.reason = initialReason || "drive_html";
  throw error;
}

async function fetchDriveAudio(fileId, range = "") {
  const id = encodeURIComponent(fileId);
  const diagnostics = [];
  let lastError = null;

  const cached = DRIVE_CONFIRM_CACHE.get(fileId);
  if (cached && Number(cached.expiresAt || 0) > Date.now()) {
    try {
      const response = await driveFetchOnce(cached.url, range, cached.cookie || "");
      const result = await evaluateDriveResponse(response, { fileId, range, candidate: "cache", diagnostics, allowConfirmation: false });
      return { ...result, diagnostics };
    } catch (error) {
      DRIVE_CONFIRM_CACHE.delete(fileId);
      lastError = error;
    }
  } else if (cached) {
    DRIVE_CONFIRM_CACHE.delete(fileId);
  }

  const candidates = [
    "https://drive.usercontent.google.com/download?id=" + id + "&export=download&confirm=t",
    "https://drive.google.com/uc?export=download&id=" + id + "&confirm=t"
  ];

  for (let i = 0; i < candidates.length; i++) {
    const target = candidates[i];
    try {
      let response;
      try {
        response = await driveFetchOnce(target, range);
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 300));
        response = await driveFetchOnce(target, range);
      }
      const result = await evaluateDriveResponse(response, { fileId, range, candidate: i + 1, diagnostics, allowConfirmation: true });
      return { ...result, diagnostics };
    } catch (error) {
      lastError = error;
      if (["drive_server_error", "network_error"].includes(String(error?.reason || ""))) {
        await new Promise(resolve => setTimeout(resolve, 450));
      }
    }
  }

  const error = lastError || new Error("Drive source unavailable");
  error.driveDiagnostics = diagnostics;
  throw error;
}

// OX_B65_RANGE_CONFIRMATION_FIX

`;

source = source.slice(0, fetchStart) + replacement + source.slice(fetchEnd);

const oldBusy = `  function setSourceBusy(value){sourceBusy=Boolean(value);els.buffering.hidden=true;els.playerSheet.setAttribute('aria-busy',sourceBusy?'true':'false');for(const control of [els.playButton,els.miniPlay,els.previousButton,els.nextButton,els.backButton,els.forwardButton,els.seek,els.speedSelect,els.sleepSelect,els.volume,els.muteButton,els.retryButton])control.disabled=sourceBusy;els.continueButton.disabled=sourceBusy;els.folderBack.disabled=sourceBusy;for(const button of els.breadcrumbs.querySelectorAll('button'))button.disabled=sourceBusy;for(const button of els.browser.querySelectorAll('button'))button.disabled=sourceBusy;updateButtons();}`;
const newBusy = `  function setSourceBusy(value){sourceBusy=Boolean(value);els.buffering.hidden=true;els.playerSheet.setAttribute('aria-busy',sourceBusy?'true':'false');for(const control of els.playerSheet.querySelectorAll('button,input,select')){if(control===els.minimizePlayer||control===els.closePlayer)continue;control.disabled=sourceBusy;}els.continueButton.disabled=sourceBusy;els.continueButton.setAttribute('aria-disabled',sourceBusy?'true':'false');els.folderBack.disabled=sourceBusy;for(const button of els.breadcrumbs.querySelectorAll('button'))button.disabled=sourceBusy;for(const button of els.browser.querySelectorAll('button'))button.disabled=sourceBusy;updateButtons();}`;
if (!source.includes(oldBusy)) fail('Could not locate the B6.4 player busy-lock function.');
source = source.replace(oldBusy, newBusy);

source = source.replace('x-ox-player-stream", "b6.4-range-validated-stream"', 'x-ox-player-stream", "b6.5-range-confirmation-stream"');

fs.writeFileSync(target, source, 'utf8');
console.log(`Backup: ${backup}`);
console.log(`Updated: ${target}`);
console.log('B6.5 applied successfully.');
console.log('- Repaired the B6.4 Range/Content-Range regex escaping bug.');
console.log('- Continue Listening and all player controls stay hard-locked while a source is starting; only Minimize and Close remain available.');
console.log('- Large-file Drive confirmation/download pages are followed server-side when a safe confirmation form is present.');
console.log('- Confirmation targets are kept briefly in Worker memory to reduce repeated interstitial requests during multi-range playback.');
console.log('- One small controlled retry is used for transient upstream network failures.');
