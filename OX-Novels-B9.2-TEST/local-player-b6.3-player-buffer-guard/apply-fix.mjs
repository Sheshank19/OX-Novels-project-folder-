import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const oxRoot = path.resolve(here, '..');
const target = path.join(oxRoot, 'local-player-b5', 'src', 'worker-B5-template.js');
const backup = path.join(oxRoot, 'local-player-b5', 'src', 'worker-B5-template.before-B6.3.js');

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(target)) fail(`Could not find ${target}`);
let source = fs.readFileSync(target, 'utf8');
if (source.includes('OX_B63_BUFFER_GUARD')) {
  console.log('B6.3 is already applied. No changes were needed.');
  process.exit(0);
}

if (!fs.existsSync(backup)) fs.copyFileSync(target, backup);

function replaceOnce(oldText, newText, label) {
  const first = source.indexOf(oldText);
  if (first < 0) fail(`Expected B5 code was not found while patching: ${label}. The backup was left untouched.`);
  if (source.indexOf(oldText, first + oldText.length) >= 0) fail(`More than one match was found while patching: ${label}. No unsafe automatic replacement was made.`);
  source = source.slice(0, first) + newText + source.slice(first + oldText.length);
}

replaceOnce(
`  let sourceGeneration = 0;\n  const SPEED_KEY = 'ox-player-speed-v1';`,
`  let sourceGeneration = 0;\n  // OX_B63_BUFFER_GUARD: serialize source changes and suppress stale media errors.\n  let startSequence = 0;\n  let sourceBusy = false;\n  let suppressMediaErrorsUntil = 0;\n  const SPEED_KEY = 'ox-player-speed-v1';`,
'source state'
);

replaceOnce(
`  function closePlayer(){sourceGeneration++;minimizedByUser=false;els.audio.pause();els.audio.removeAttribute('src');els.audio.load();active=null;els.playerSheet.hidden=true;els.miniPlayer.hidden=true;clearError();els.buffering.hidden=true;updateButtons();}\n  function clearError(){els.playerError.hidden=true;}\n  function showError(text){els.playerErrorText.textContent=text;els.playerError.hidden=false;els.buffering.hidden=true;}\n  function updateButtons(){const playing=!els.audio.paused&&!els.audio.ended;els.playButton.textContent=playing?'❚❚':'▶';els.miniPlay.textContent=playing?'❚❚':'▶';}`,
`  function closePlayer(){startSequence++;sourceGeneration++;minimizedByUser=false;sourceBusy=false;els.audio.pause();els.audio.removeAttribute('src');els.audio.load();active=null;els.playerSheet.hidden=true;els.miniPlayer.hidden=true;clearError();els.buffering.hidden=true;setSourceBusy(false);}\n  function clearError(){els.playerError.hidden=true;}\n  function showError(text){els.playerErrorText.textContent=text;els.playerError.hidden=false;els.buffering.hidden=true;setSourceBusy(false);}\n  function updateButtons(){if(sourceBusy){els.playButton.textContent='';els.miniPlay.textContent='';els.playButton.classList.add('is-loading');els.miniPlay.classList.add('is-loading');return;}els.playButton.classList.remove('is-loading');els.miniPlay.classList.remove('is-loading');const playing=!els.audio.paused&&!els.audio.ended;els.playButton.textContent=playing?'❚❚':'▶';els.miniPlay.textContent=playing?'❚❚':'▶';}\n  function setSourceBusy(value){sourceBusy=Boolean(value);els.buffering.hidden=true;for(const control of [els.playButton,els.miniPlay,els.previousButton,els.nextButton,els.backButton,els.forwardButton,els.seek,els.speedSelect,els.sleepSelect,els.volume,els.muteButton])control.disabled=sourceBusy;els.continueButton.disabled=sourceBusy;els.folderBack.disabled=sourceBusy;for(const button of els.breadcrumbs.querySelectorAll('button'))button.disabled=sourceBusy;for(const button of els.browser.querySelectorAll('button'))button.disabled=sourceBusy;updateButtons();}\n  function friendlyPlaybackError(error){if(error?.name==='NotSupportedError')return 'This episode could not start in this browser. Press Retry once.';if(error?.name==='NotAllowedError')return 'Playback was blocked by the browser. Press Play again.';return 'This episode could not be streamed. Press Retry once.';}`,
'player state helpers'
);

replaceOnce(
`  async function safePlay(){try{await els.audio.play();return true;}catch(e){if(e?.name==='AbortError'&&els.audio.paused){els.buffering.hidden=true;clearError();updateButtons();return false;}throw e;}}\n  function applySource(url,resume=null){sourceGeneration++;const generation=sourceGeneration;clearError();els.audio.pause();els.audio.removeAttribute('src');els.audio.load();els.audio.src=url;els.audio.playbackRate=Number(els.speedSelect.value)||1;if(resume!==null){const fn=()=>{if(generation!==sourceGeneration)return;if(Number.isFinite(els.audio.duration))els.audio.currentTime=Math.min(Number(resume)||0,Math.max(0,els.audio.duration-.25));els.audio.removeEventListener('loadedmetadata',fn);};if(els.audio.readyState>=1)fn();else els.audio.addEventListener('loadedmetadata',fn);}}\n  async function start(track,resume=0){if(!track?.key)return;clearError();showPlayer();els.buffering.hidden=false;active=track;els.playerTrack.textContent=track.name||'Audio';els.miniTrack.textContent=track.name||'Audio';configureMedia(track);applySource('/api/audio/stream?track='+encodeURIComponent(track.key),resume);try{await safePlay();}catch(e){showError(e?.message||'Playback could not start.');}}`,
`  async function safePlay(sequence=startSequence){try{await els.audio.play();if(sequence!==startSequence)return false;return true;}catch(e){if(sequence!==startSequence||e?.name==='AbortError')return false;throw e;}}\n  function applySource(url,resume=null){sourceGeneration++;const generation=sourceGeneration;clearError();suppressMediaErrorsUntil=performance.now()+400;els.audio.pause();els.audio.removeAttribute('src');els.audio.load();els.audio.src=url;els.audio.playbackRate=Number(els.speedSelect.value)||1;if(resume!==null){const fn=()=>{if(generation!==sourceGeneration)return;if(Number.isFinite(els.audio.duration))els.audio.currentTime=Math.min(Number(resume)||0,Math.max(0,els.audio.duration-.25));els.audio.removeEventListener('loadedmetadata',fn);};if(els.audio.readyState>=1)fn();else els.audio.addEventListener('loadedmetadata',fn);}return generation;}\n  async function start(track,resume=0){if(!track?.key||sourceBusy)return;const sequence=++startSequence;clearError();showPlayer();active=track;els.playerTrack.textContent=track.name||'Audio';els.miniTrack.textContent=track.name||'Audio';configureMedia(track);setSourceBusy(true);const streamUrl='/api/audio/stream?track='+encodeURIComponent(track.key)+'&play='+encodeURIComponent(String(Date.now())+'-'+sequence);const generation=applySource(streamUrl,resume);try{const started=await safePlay(sequence);if(sequence!==startSequence||generation!==sourceGeneration)return;if(!started&&els.audio.paused)setSourceBusy(false);}catch(e){if(sequence!==startSequence||generation!==sourceGeneration)return;showError(friendlyPlaybackError(e));}}`,
'serialized source start'
);

replaceOnce(
`  els.continueButton.addEventListener('click',()=>{const s=loadProgress(),t=trackMap.get(s.trackKey);if(t)start(t,Number(s.position)||0);else{localStorage.removeItem(PROGRESS_KEY);refreshContinue();}});`,
`  els.continueButton.addEventListener('click',()=>{if(sourceBusy)return;const s=loadProgress(),t=trackMap.get(s.trackKey);if(t)start(t,Number(s.position)||0);else{localStorage.removeItem(PROGRESS_KEY);refreshContinue();}});`,
'continue guard'
);

replaceOnce(
`  els.audio.addEventListener('play',updateButtons);els.audio.addEventListener('pause',updateButtons);els.audio.addEventListener('waiting',()=>{if(active)els.buffering.hidden=false});els.audio.addEventListener('playing',()=>{els.buffering.hidden=true;clearError();updateButtons();});els.audio.addEventListener('canplay',()=>{els.buffering.hidden=true;clearError();});els.audio.addEventListener('error',()=>{const mediaError=els.audio.error;if(!active||!els.audio.getAttribute('src')||!mediaError)return;showError('This episode could not be streamed. Retry once.');});`,
`  els.audio.addEventListener('play',updateButtons);els.audio.addEventListener('pause',updateButtons);els.audio.addEventListener('waiting',()=>{if(active)setSourceBusy(true)});els.audio.addEventListener('playing',()=>{setSourceBusy(false);clearError();updateButtons();});els.audio.addEventListener('canplay',()=>{setSourceBusy(false);clearError();});els.audio.addEventListener('error',()=>{const mediaError=els.audio.error;if(!active||!els.audio.getAttribute('src')||!mediaError)return;if(performance.now()<suppressMediaErrorsUntil)return;showError(mediaError.code===4?'This episode could not start in this browser. Press Retry once.':'This episode could not be streamed. Press Retry once.');});`,
'media event guards'
);

replaceOnce(
`  els.playerSheet.hidden=true;els.miniPlayer.hidden=true;\n  const savedRate=`,
`  els.playerSheet.hidden=true;els.miniPlayer.hidden=true;\n  els.buffering.hidden=true;\n  const savedRate=`,
'initial buffering state'
);

replaceOnce(
`.transport .play{width:60px;height:60px;background:var(--accent);color:#fff;border-color:var(--accent);font-size:20px}.transport small`,
`.transport .play{width:60px;height:60px;background:var(--accent);color:#fff;border-color:var(--accent);font-size:20px;position:relative}.transport .play.is-loading,.mini-play.is-loading{color:transparent;position:relative}.transport .play.is-loading::after,.mini-play.is-loading::after{content:'';position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-12px 0 0 -12px;border:3px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:oxSpin .7s linear infinite}@keyframes oxSpin{to{transform:rotate(360deg)}}button:disabled,input:disabled,select:disabled{cursor:not-allowed;opacity:.58}.transport small`,
'loading spinner styles'
);

fs.writeFileSync(target, source, 'utf8');
console.log(`Backup: ${backup}`);
console.log(`Updated: ${target}`);
console.log('Rapid source switches are now serialized; stale AbortError transitions are ignored.');
console.log('During buffering the Play button shows a loader and source-changing controls are disabled.');
console.log('Each playback attempt receives a fresh same-origin stream URL.');
