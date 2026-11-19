import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const oxRoot = path.resolve(here, '..');
const target = path.join(oxRoot, 'local-player-b5', 'src', 'worker-B5-template.js');
const backup = path.join(oxRoot, 'local-player-b5', 'src', 'worker-B5-template.before-B6.4.js');

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}
if (!fs.existsSync(target)) fail(`Could not find ${target}`);
let source = fs.readFileSync(target, 'utf8');
if (!source.includes('OX_B63_BUFFER_GUARD')) fail('B6.3 must be applied before B6.4.');
if (source.includes('OX_B64_STREAM_DIAGNOSTICS')) {
  console.log('B6.4 is already applied. No changes were needed.');
  process.exit(0);
}
if (!fs.existsSync(backup)) fs.copyFileSync(target, backup);

function replaceOnce(oldText, newText, label) {
  const first = source.indexOf(oldText);
  if (first < 0) fail(`Expected code was not found while patching: ${label}.`);
  if (source.indexOf(oldText, first + oldText.length) >= 0) fail(`More than one match found while patching: ${label}.`);
  source = source.slice(0, first) + newText + source.slice(first + oldText.length);
}

replaceOnce(
`    if (url.pathname === "/api/audio/stream" && (request.method === "GET" || request.method === "HEAD")) {
      return handleAudioStream(request, env, url);
    }
`,
`    if (url.pathname === "/api/audio/stream" && (request.method === "GET" || request.method === "HEAD")) {
      return handleAudioStream(request, env, url);
    }
    if (url.pathname === "/api/audio/diagnose" && request.method === "GET") {
      return handleAudioDiagnose(request, env, url);
    }
`,
'diagnostic route'
);

const serverStart = source.indexOf('async function handleAudioStream(request, env, url) {');
const serverEnd = source.indexOf('async function readPlayerSession(request, env) {', serverStart);
if (serverStart < 0 || serverEnd < 0) fail('Could not locate the B5 stream handler block.');

const serverBlock = `async function resolveProtectedTrack(request, env, url) {
  const session = await readPlayerSession(request, env);
  if (!session) return { error: textResponse("Player session expired. Return to OX Novels and open Listen again.", 401) };
  const trackToken = String(url.searchParams.get("track") || "").trim();
  if (!trackToken || trackToken.length > 900) return { error: textResponse("Track is missing or invalid.", 400) };
  const secret = String(env.OX_HANDOFF_KEY || "").trim();
  let track;
  try { track = await decryptToken(trackToken, secret, TRACK_AAD, "t1"); }
  catch { return { error: textResponse("This track key is invalid or has been altered.", 401) }; }
  const storyId = String(session.storyId || "");
  const catalog = CATALOG_INDEX[storyId] || null;
  if (!catalog) return { error: textResponse("This story catalog is not published on the Player yet.", 503) };
  if (track?.kind !== "track" || String(track.storyId || "") !== storyId) return { error: textResponse("This track does not belong to this story.", 403) };
  if (String(track.sourceVersion || "") !== String(catalog.sourceVersion || "") || String(track.generationId || "") !== String(catalog.generationId || "")) {
    return { error: textResponse("This track belongs to an older catalog generation. Reopen the story from OX Novels.", 409) };
  }
  const fileId = String(track.fileId || "").trim();
  if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) return { error: textResponse("The protected audio source is invalid.", 400) };
  return { session, track, storyId, catalog, fileId };
}

function preferredAudioType(track, upstreamType = "") {
  const upstream = String(upstreamType || "").split(";")[0].trim().toLowerCase();
  const declared = String(track?.mimeType || "").split(";")[0].trim().toLowerCase();
  if (upstream.startsWith("audio/")) return upstream;
  if (declared.startsWith("audio/")) return declared;
  const name = String(track?.name || "").toLowerCase();
  if (name.endsWith(".mp3")) return "audio/mpeg";
  if (name.endsWith(".m4a") || name.endsWith(".m4b") || name.endsWith(".mp4")) return "audio/mp4";
  if (name.endsWith(".aac")) return "audio/aac";
  if (name.endsWith(".wav")) return "audio/wav";
  if (name.endsWith(".ogg") || name.endsWith(".oga")) return "audio/ogg";
  if (name.endsWith(".flac")) return "audio/flac";
  return upstream || declared || "application/octet-stream";
}

function classifyDriveHtml(text = "") {
  const value = String(text || "").toLowerCase();
  if (value.includes("too many users have viewed or downloaded") || value.includes("download quota") || value.includes("quota exceeded")) return "drive_quota";
  if (value.includes("sign in") || value.includes("request access") || value.includes("access denied") || value.includes("you need access")) return "drive_permission";
  if (value.includes("virus scan") || value.includes("can't scan this file for viruses") || value.includes("cannot scan this file for viruses")) return "drive_confirmation";
  return "drive_html";
}

async function fetchDriveAudio(fileId, range = "") {
  const id = encodeURIComponent(fileId);
  const candidates = [
    "https://drive.usercontent.google.com/download?id=" + id + "&export=download&confirm=t",
    "https://drive.google.com/uc?export=download&id=" + id + "&confirm=t"
  ];
  const diagnostics = [];
  let lastError = null;
  for (let i = 0; i < candidates.length; i++) {
    const target = candidates[i];
    try {
      const headers = new Headers({ "user-agent": "OX-Audio-Player-B6.4/1.0" });
      if (range) headers.set("range", range);
      const response = await fetch(target, { method: "GET", redirect: "follow", headers });
      const type = String(response.headers.get("content-type") || "").toLowerCase();
      const contentRange = String(response.headers.get("content-range") || "");
      const looksHtml = type.includes("text/html");
      let reason = "";
      if (looksHtml) {
        let html = "";
        try { html = (await response.text()).slice(0, 12000); } catch {}
        reason = classifyDriveHtml(html);
      } else if (response.status === 429) reason = "drive_rate_limit";
      else if (response.status === 403) reason = "drive_forbidden";
      else if (response.status === 404) reason = "drive_not_found";
      else if (response.status >= 500) reason = "drive_server_error";
      else if (range && response.status !== 206) reason = "range_not_honored";
      else if (range && !/^bytes\s+\d+-\d+\/\d+$/i.test(contentRange)) reason = "invalid_content_range";
      else if (!(response.ok || response.status === 206)) reason = "drive_http_" + response.status;

      diagnostics.push({ candidate: i + 1, status: response.status, type: type.slice(0, 120), contentRange: contentRange.slice(0, 120), reason: reason || "ok" });
      if (!reason && response.body) return { response, diagnostics, candidate: i + 1 };
      try { await response.body?.cancel(); } catch {}
      lastError = new Error(reason || "Drive source unavailable");
    } catch (error) {
      diagnostics.push({ candidate: i + 1, status: 0, type: "", contentRange: "", reason: "network_error" });
      lastError = error;
    }
  }
  const error = lastError || new Error("Drive source unavailable");
  error.driveDiagnostics = diagnostics;
  throw error;
}

async function handleAudioStream(request, env, url) {
  const resolved = await resolveProtectedTrack(request, env, url);
  if (resolved.error) return resolved.error;
  const { track, fileId } = resolved;
  const range = String(request.headers.get("range") || "").trim();
  if (range && !/^bytes=\d*-\d*$/.test(range)) {
    return new Response("Only a single byte range is supported.", {
      status: 416,
      headers: { ...securityHeaders(), "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "accept-ranges": "bytes" }
    });
  }
  try {
    const fetched = await fetchDriveAudio(fileId, range);
    const upstream = fetched.response;
    const headers = new Headers();
    headers.set("content-type", preferredAudioType(track, upstream.headers.get("content-type")));
    headers.set("cache-control", "private, no-store");
    headers.set("accept-ranges", "bytes");
    headers.set("referrer-policy", "no-referrer");
    headers.set("x-ox-player-stream", "b6.4-range-validated-stream");
    headers.set("x-ox-drive-candidate", String(fetched.candidate || 0));
    headers.set("x-ox-range-mode", range ? "validated-206" : "full");
    for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (request.method === "HEAD") {
      try { await upstream.body?.cancel(); } catch {}
      return new Response(null, { status: upstream.status === 206 ? 206 : 200, headers });
    }
    return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
  } catch (error) {
    const last = Array.isArray(error?.driveDiagnostics) ? error.driveDiagnostics.at(-1) : null;
    const headers = { ...securityHeaders(), "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "accept-ranges": "bytes" };
    if (last?.reason) headers["x-ox-drive-reason"] = String(last.reason).slice(0, 80);
    if (last?.status) headers["x-ox-drive-status"] = String(last.status);
    return new Response("The protected Drive audio source is temporarily unavailable.", { status: 502, headers });
  }
}

async function handleAudioDiagnose(request, env, url) {
  const resolved = await resolveProtectedTrack(request, env, url);
  if (resolved.error) return resolved.error;
  const { track, fileId } = resolved;
  try {
    const fetched = await fetchDriveAudio(fileId, "bytes=0-1");
    const upstream = fetched.response;
    const result = {
      ok: true,
      status: upstream.status,
      contentType: preferredAudioType(track, upstream.headers.get("content-type")),
      contentRange: String(upstream.headers.get("content-range") || ""),
      candidate: fetched.candidate || 0,
      reason: "ok"
    };
    try { await upstream.body?.cancel(); } catch {}
    return json(result);
  } catch (error) {
    const diagnostics = Array.isArray(error?.driveDiagnostics) ? error.driveDiagnostics : [];
    const last = diagnostics.at(-1) || {};
    return json({
      ok: false,
      status: Number(last.status || 0),
      contentType: String(last.type || ""),
      contentRange: String(last.contentRange || ""),
      candidate: Number(last.candidate || 0),
      reason: String(last.reason || "drive_unavailable")
    }, 200);
  }
}

// OX_B64_STREAM_DIAGNOSTICS

`;
source = source.slice(0, serverStart) + serverBlock + source.slice(serverEnd);

replaceOnce(
`  let sourceBusy = false;
  let suppressMediaErrorsUntil = 0;`,
`  let sourceBusy = false;
  let suppressMediaErrorsUntil = 0;
  let failureCheckInFlight = false;
  const automaticRetries = new Map();`,
'client diagnostics state'
);

replaceOnce(
`  function setSourceBusy(value){sourceBusy=Boolean(value);els.buffering.hidden=true;for(const control of [els.playButton,els.miniPlay,els.previousButton,els.nextButton,els.backButton,els.forwardButton,els.seek,els.speedSelect,els.sleepSelect,els.volume,els.muteButton])control.disabled=sourceBusy;els.continueButton.disabled=sourceBusy;els.folderBack.disabled=sourceBusy;for(const button of els.breadcrumbs.querySelectorAll('button'))button.disabled=sourceBusy;for(const button of els.browser.querySelectorAll('button'))button.disabled=sourceBusy;updateButtons();}
  function friendlyPlaybackError(error){if(error?.name==='NotSupportedError')return 'This episode could not start in this browser. Press Retry once.';if(error?.name==='NotAllowedError')return 'Playback was blocked by the browser. Press Play again.';return 'This episode could not be streamed. Press Retry once.';}`, 
`  function setSourceBusy(value){sourceBusy=Boolean(value);els.buffering.hidden=true;els.playerSheet.setAttribute('aria-busy',sourceBusy?'true':'false');for(const control of [els.playButton,els.miniPlay,els.previousButton,els.nextButton,els.backButton,els.forwardButton,els.seek,els.speedSelect,els.sleepSelect,els.volume,els.muteButton,els.retryButton])control.disabled=sourceBusy;els.continueButton.disabled=sourceBusy;els.folderBack.disabled=sourceBusy;for(const button of els.breadcrumbs.querySelectorAll('button'))button.disabled=sourceBusy;for(const button of els.browser.querySelectorAll('button'))button.disabled=sourceBusy;updateButtons();}
  function friendlyPlaybackError(error){if(error?.name==='NotAllowedError')return 'Playback was blocked by the browser. Press Play again.';return 'This audio source could not start. The Player is checking the Drive response…';}
  function driveFailureMessage(reason){if(reason==='drive_quota'||reason==='drive_rate_limit')return 'Google Drive is temporarily limiting this audio file. Repeated Retry clicks will not help; please wait and try again later.';if(reason==='drive_permission'||reason==='drive_forbidden')return 'Google Drive is refusing access to this audio file. The source permissions need to be checked.';if(reason==='drive_not_found')return 'This audio file is no longer available in Google Drive.';if(reason==='range_not_honored'||reason==='invalid_content_range')return 'Google Drive did not return the byte range required for reliable audio playback. Please try again shortly.';if(reason==='drive_confirmation'||reason==='drive_html')return 'Google Drive returned a download page instead of audio bytes. Please try again later.';if(reason==='drive_server_error'||reason==='network_error')return 'The Drive audio source is temporarily unavailable. Please try again shortly.';return 'This episode could not be streamed right now. Please try again shortly.';}
  async function diagnoseAndRecover(track,position,sequence){if(failureCheckInFlight||!track?.key)return;failureCheckInFlight=true;setSourceBusy(true);try{const response=await fetch('/api/audio/diagnose?track='+encodeURIComponent(track.key)+'&check='+Date.now(),{cache:'no-store'});const info=await response.json().catch(()=>({ok:false,reason:'diagnostic_failed'}));if(sequence!==startSequence||active?.key!==track.key)return;if(info?.ok===true){const count=Number(automaticRetries.get(track.key)||0);if(count<1){automaticRetries.set(track.key,count+1);setSourceBusy(false);await new Promise(r=>setTimeout(r,650));if(sequence===startSequence&&active?.key===track.key)start(track,position,{force:true,automatic:true});return;}showError('Drive returned a valid audio range, but the browser still could not start this file. Close the player once and reopen the story.');return;}showError(driveFailureMessage(String(info?.reason||'')));}catch{if(sequence===startSequence&&active?.key===track.key)showError('The Player could not verify the Drive audio source. Please try again shortly.');}finally{failureCheckInFlight=false;}}`,
'client reliability helpers'
);

replaceOnce(
`  async function start(track,resume=0){if(!track?.key||sourceBusy)return;const sequence=++startSequence;clearError();showPlayer();active=track;els.playerTrack.textContent=track.name||'Audio';els.miniTrack.textContent=track.name||'Audio';configureMedia(track);setSourceBusy(true);const streamUrl='/api/audio/stream?track='+encodeURIComponent(track.key)+'&play='+encodeURIComponent(String(Date.now())+'-'+sequence);const generation=applySource(streamUrl,resume);try{const started=await safePlay(sequence);if(sequence!==startSequence||generation!==sourceGeneration)return;if(!started&&els.audio.paused)setSourceBusy(false);}catch(e){if(sequence!==startSequence||generation!==sourceGeneration)return;showError(friendlyPlaybackError(e));}}`,
`  async function start(track,resume=0,options={}){const force=options?.force===true;if(!track?.key||(!force&&sourceBusy))return;const sequence=++startSequence;clearError();showPlayer();active=track;els.playerTrack.textContent=track.name||'Audio';els.miniTrack.textContent=track.name||'Audio';configureMedia(track);setSourceBusy(true);const streamUrl='/api/audio/stream?track='+encodeURIComponent(track.key)+'&play='+encodeURIComponent(String(Date.now())+'-'+sequence);const generation=applySource(streamUrl,resume);try{const started=await safePlay(sequence);if(sequence!==startSequence||generation!==sourceGeneration)return;if(!started&&els.audio.paused){if(options?.automatic===true)showError('This episode still could not start after an automatic retry.');else diagnoseAndRecover(track,Number(resume)||0,sequence);}}catch(e){if(sequence!==startSequence||generation!==sourceGeneration)return;if(e?.name==='NotAllowedError'){showError(friendlyPlaybackError(e));return;}diagnoseAndRecover(track,Number(resume)||0,sequence);}}`,
'client start/recovery'
);

replaceOnce(
`els.retryButton.addEventListener('click',()=>{if(!active)return;const position=Number(els.audio.currentTime)||Number(loadProgress().position)||0;clearError();start(active,position);});`,
`els.retryButton.addEventListener('click',()=>{if(!active||sourceBusy)return;automaticRetries.delete(active.key);const position=Number(els.audio.currentTime)||Number(loadProgress().position)||0;clearError();start(active,position,{force:true});});`,
'manual retry'
);

replaceOnce(
`  els.audio.addEventListener('play',updateButtons);els.audio.addEventListener('pause',updateButtons);els.audio.addEventListener('waiting',()=>{if(active)setSourceBusy(true)});els.audio.addEventListener('playing',()=>{setSourceBusy(false);clearError();updateButtons();});els.audio.addEventListener('canplay',()=>{setSourceBusy(false);clearError();});els.audio.addEventListener('error',()=>{const mediaError=els.audio.error;if(!active||!els.audio.getAttribute('src')||!mediaError)return;if(performance.now()<suppressMediaErrorsUntil)return;showError(mediaError.code===4?'This episode could not start in this browser. Press Retry once.':'This episode could not be streamed. Press Retry once.');});`,
`  els.audio.addEventListener('play',updateButtons);els.audio.addEventListener('pause',updateButtons);els.audio.addEventListener('waiting',()=>{if(active)setSourceBusy(true)});els.audio.addEventListener('playing',()=>{if(active?.key)automaticRetries.delete(active.key);setSourceBusy(false);clearError();updateButtons();});els.audio.addEventListener('canplay',()=>{clearError();});els.audio.addEventListener('error',()=>{const mediaError=els.audio.error;if(!active||!els.audio.getAttribute('src')||!mediaError)return;if(performance.now()<suppressMediaErrorsUntil)return;const track=active,position=Number(els.audio.currentTime)||Number(loadProgress().position)||0,sequence=startSequence;diagnoseAndRecover(track,position,sequence);});`,
'media error diagnosis and strict lock'
);

replaceOnce(
`.continue{border:0;background:var(--accent);color:#fff;border-radius:11px;padding:12px 15px;font-weight:900;max-width:260px}`,
`.continue{border:0;background:var(--accent);color:#fff;border-radius:11px;padding:12px 15px;font-weight:900;max-width:260px}.continue:disabled{pointer-events:none;opacity:.52}`,
'continue lock styling'
);

fs.writeFileSync(target, source, 'utf8');
console.log(`Backup: ${backup}`);
console.log(`Updated: ${target}`);
console.log('B6.4 stream reliability diagnostics applied.');
console.log('- Continue Listening and all source-changing controls remain locked until actual PLAYING.');
console.log('- Generic Drive/HTML/permission/range failures are classified instead of shown as browser codec errors.');
console.log('- One automatic recovery is attempted only after a failed start and a successful 2-byte Drive range probe.');
console.log('- Audio MIME type now prefers known audio metadata over generic application/octet-stream.');
console.log('- Client Range requests must receive a valid 206 Content-Range from Drive.');
