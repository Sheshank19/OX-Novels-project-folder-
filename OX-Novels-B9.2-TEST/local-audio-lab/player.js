const STORY_KEY = "ox-audio-lab-state-v1";
const SPEED_KEY = "ox-audio-lab-speed-v1";

const tree = {
  id: "root", name: "Local Test Story", type: "folder", children: [
    { id: "vol-1", name: "Volume 1", type: "folder", children: [
      { id: "ep-1", name: "Episode 001 — First Test", type: "track", src: "./audio/episode-001.wav" },
      { id: "ep-2", name: "Episode 002 — Continue Test", type: "track", src: "./audio/episode-002.wav" }
    ]},
    { id: "vol-2", name: "Volume 2", type: "folder", children: [
      { id: "ep-3", name: "Episode 003 — Auto Next Test", type: "track", src: "./audio/episode-003.wav" }
    ]}
  ]
};

const $ = sel => document.querySelector(sel);
const els = {
  browser: $("#browser"), breadcrumbs: $("#breadcrumbs"), folderBack: $("#folderBack"),
  continueButton: $("#continueButton"), resetButton: $("#resetButton"),
  playerSheet: $("#playerSheet"), playerTrack: $("#playerTrack"), playerError: $("#playerError"), playerErrorText: $("#playerErrorText"),
  retryButton: $("#retryButton"), buffering: $("#buffering"), currentTime: $("#currentTime"), duration: $("#duration"), seek: $("#seek"),
  previousButton: $("#previousButton"), nextButton: $("#nextButton"), backButton: $("#backButton"), forwardButton: $("#forwardButton"), playButton: $("#playButton"),
  speedSelect: $("#speedSelect"), sleepSelect: $("#sleepSelect"), volume: $("#volume"), muteButton: $("#muteButton"),
  minimizePlayer: $("#minimizePlayer"), closePlayer: $("#closePlayer"), audio: $("#audioEngine"),
  miniPlayer: $("#miniPlayer"), miniTrack: $("#miniTrack"), miniTime: $("#miniTime"), miniPlay: $("#miniPlay"), expandPlayer: $("#expandPlayer"),
  audioRequestCount: $("#audioRequestCount")
};

let path = [tree];
let activeTrack = null;
let lastTrackSrc = "";
let sleepTimer = null;
let stopAtEpisodeEnd = false;
let isSeeking = false;
let lastSavedSecond = -1;
let logicalTrackStarts = 0;

const allTracks = (() => {
  const out = [];
  const walk = node => { if (node.type === "track") out.push(node); else (node.children || []).forEach(walk); };
  walk(tree); return out;
})();

function formatTime(value) {
  const seconds = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORY_KEY) || "{}"); } catch { return {}; }
}
function saveState(extra = {}) {
  const old = loadState();
  localStorage.setItem(STORY_KEY, JSON.stringify({ ...old, ...extra, updatedAt: Date.now() }));
  refreshContinue();
}
function refreshContinue() {
  const saved = loadState();
  const track = allTracks.find(item => item.id === saved.trackId);
  if (!track || !(Number(saved.position) > 1)) { els.continueButton.hidden = true; return; }
  els.continueButton.hidden = false;
  els.continueButton.textContent = `Continue ${track.name} · ${formatTime(saved.position)}`;
}

function renderBrowser() {
  const current = path[path.length - 1];
  els.breadcrumbs.innerHTML = path.map((node, index) => `<button class="crumb" data-crumb="${index}" type="button">${escapeHtml(node.name)}</button>${index < path.length - 1 ? "<span>›</span>" : ""}`).join("");
  els.folderBack.hidden = path.length <= 1;
  els.browser.innerHTML = (current.children || []).map(item => `
    <button class="browser-row" type="button" data-item="${item.id}">
      <span class="row-icon">${item.type === "folder" ? "▰" : "▶"}</span>
      <span class="row-copy"><strong>${escapeHtml(item.name)}</strong><span>${item.type === "folder" ? `${item.children?.length || 0} items` : "Audio episode"}</span></span>
      <span class="row-action">${item.type === "folder" ? "Open" : "Play"}</span>
    </button>`).join("") || `<p>No items in this folder.</p>`;
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch])); }
function findChild(id) { return (path[path.length - 1].children || []).find(item => item.id === id); }
function openFolder(item) { path.push(item); renderBrowser(); }
function goBack() { if (path.length > 1) { path.pop(); renderBrowser(); } }

async function playTrack(track, { resumePosition = null } = {}) {
  if (!track) return;
  activeTrack = track;
  clearError();
  showPlayer();
  els.playerTrack.textContent = track.name;
  els.miniTrack.textContent = track.name;
  configureMediaSession(track);

  const changingSource = lastTrackSrc !== track.src;
  if (changingSource) {
    logicalTrackStarts += 1;
    els.audioRequestCount.textContent = String(logicalTrackStarts);
    els.audio.pause();
    els.audio.removeAttribute("src");
    els.audio.load();
    lastTrackSrc = track.src;
    els.audio.src = track.src;
  }
  els.audio.playbackRate = Number(els.speedSelect.value) || 1;
  if (resumePosition !== null) {
    const seekWhenReady = () => {
      if (Number.isFinite(els.audio.duration)) els.audio.currentTime = Math.min(Number(resumePosition) || 0, Math.max(0, els.audio.duration - .25));
      els.audio.removeEventListener("loadedmetadata", seekWhenReady);
    };
    if (els.audio.readyState >= 1) seekWhenReady(); else els.audio.addEventListener("loadedmetadata", seekWhenReady);
  }
  try { await els.audio.play(); }
  catch (error) { showError(error?.message || "Playback could not start."); }
}

function showPlayer() { els.playerSheet.hidden = false; els.miniPlayer.hidden = true; }
function minimizePlayer() { if (!activeTrack) return; els.playerSheet.hidden = true; els.miniPlayer.hidden = false; }
function closePlayer() {
  els.audio.pause();
  els.audio.removeAttribute("src");
  els.audio.load();
  activeTrack = null; lastTrackSrc = "";
  els.playerSheet.hidden = true; els.miniPlayer.hidden = true;
  updatePlayButtons();
}
function showError(text) { els.playerErrorText.textContent = text; els.playerError.hidden = false; els.buffering.hidden = true; }
function clearError() { els.playerError.hidden = true; }
function updatePlayButtons() {
  const playing = !els.audio.paused && !els.audio.ended;
  els.playButton.textContent = playing ? "❚❚" : "▶";
  els.miniPlay.textContent = playing ? "❚❚" : "▶";
  els.playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
}
function currentTrackIndex() { return activeTrack ? allTracks.findIndex(item => item.id === activeTrack.id) : -1; }
function adjacentTrack(delta) { const idx = currentTrackIndex(); return idx >= 0 ? allTracks[idx + delta] || null : null; }
function jump(seconds) { if (Number.isFinite(els.audio.duration)) els.audio.currentTime = Math.max(0, Math.min(els.audio.duration, els.audio.currentTime + seconds)); }

function setSleepTimer(value) {
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = null; stopAtEpisodeEnd = value === "episode";
  const minutes = Number(value);
  if (Number.isFinite(minutes) && minutes > 0) sleepTimer = setTimeout(() => { els.audio.pause(); els.sleepSelect.value = "off"; sleepTimer = null; }, minutes * 60 * 1000);
}

function configureMediaSession(track) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: track.name, artist: "OX Novels", album: "Local Test Story" });
}
if ("mediaSession" in navigator) {
  const safe = (name, fn) => { try { navigator.mediaSession.setActionHandler(name, fn); } catch {} };
  safe("play", () => els.audio.play()); safe("pause", () => els.audio.pause());
  safe("seekbackward", details => jump(-(details.seekOffset || 10))); safe("seekforward", details => jump(details.seekOffset || 10));
  safe("previoustrack", () => { const track = adjacentTrack(-1); if (track) playTrack(track); });
  safe("nexttrack", () => { const track = adjacentTrack(1); if (track) playTrack(track); });
  safe("seekto", details => { if (Number.isFinite(details.seekTime)) els.audio.currentTime = details.seekTime; });
}

els.browser.addEventListener("click", event => {
  const button = event.target.closest("[data-item]"); if (!button) return;
  const item = findChild(button.dataset.item); if (!item) return;
  item.type === "folder" ? openFolder(item) : playTrack(item);
});
els.breadcrumbs.addEventListener("click", event => { const button = event.target.closest("[data-crumb]"); if (!button) return; const index = Number(button.dataset.crumb); path = path.slice(0, index + 1); renderBrowser(); });
els.folderBack.addEventListener("click", goBack);
els.continueButton.addEventListener("click", () => { const saved = loadState(); const track = allTracks.find(item => item.id === saved.trackId); if (track) playTrack(track, { resumePosition: Number(saved.position) || 0 }); });
els.resetButton.addEventListener("click", () => { localStorage.removeItem(STORY_KEY); refreshContinue(); });
els.playButton.addEventListener("click", () => { if (!activeTrack) return; els.audio.paused ? els.audio.play() : els.audio.pause(); });
els.miniPlay.addEventListener("click", () => { if (!activeTrack) return; els.audio.paused ? els.audio.play() : els.audio.pause(); });
els.previousButton.addEventListener("click", () => { const track = adjacentTrack(-1); if (track) playTrack(track); });
els.nextButton.addEventListener("click", () => { const track = adjacentTrack(1); if (track) playTrack(track); });
els.backButton.addEventListener("click", () => jump(-10)); els.forwardButton.addEventListener("click", () => jump(10));
els.minimizePlayer.addEventListener("click", minimizePlayer); els.expandPlayer.addEventListener("click", showPlayer); els.closePlayer.addEventListener("click", closePlayer);
els.retryButton.addEventListener("click", () => activeTrack && playTrack(activeTrack, { resumePosition: els.audio.currentTime || 0 }));
els.speedSelect.addEventListener("change", () => { const rate = Number(els.speedSelect.value) || 1; els.audio.playbackRate = rate; localStorage.setItem(SPEED_KEY, String(rate)); });
els.volume.addEventListener("input", () => { els.audio.volume = Number(els.volume.value); if (els.audio.muted && Number(els.volume.value) > 0) els.audio.muted = false; els.muteButton.textContent = els.audio.muted ? "Unmute" : "Mute"; });
els.muteButton.addEventListener("click", () => { els.audio.muted = !els.audio.muted; els.muteButton.textContent = els.audio.muted ? "Unmute" : "Mute"; });
els.sleepSelect.addEventListener("change", () => setSleepTimer(els.sleepSelect.value));
els.seek.addEventListener("pointerdown", () => { isSeeking = true; });
els.seek.addEventListener("pointerup", () => { isSeeking = false; });
els.seek.addEventListener("input", () => { if (Number.isFinite(els.audio.duration) && els.audio.duration > 0) els.audio.currentTime = (Number(els.seek.value) / 1000) * els.audio.duration; });

els.audio.addEventListener("play", updatePlayButtons); els.audio.addEventListener("pause", updatePlayButtons);
els.audio.addEventListener("waiting", () => { els.buffering.hidden = false; });
els.audio.addEventListener("playing", () => { els.buffering.hidden = true; clearError(); updatePlayButtons(); });
els.audio.addEventListener("canplay", () => { els.buffering.hidden = true; });
els.audio.addEventListener("error", () => showError("The audio source could not be loaded. Use Retry after checking the connection/source."));
els.audio.addEventListener("loadedmetadata", () => { els.duration.textContent = formatTime(els.audio.duration); });
els.audio.addEventListener("timeupdate", () => {
  const current = els.audio.currentTime || 0, duration = els.audio.duration || 0;
  els.currentTime.textContent = formatTime(current); els.miniTime.textContent = formatTime(current);
  if (!isSeeking && duration > 0) els.seek.value = String(Math.round((current / duration) * 1000));
  if (activeTrack) {
    const wholeSecond = Math.floor(current);
    if (wholeSecond !== lastSavedSecond && wholeSecond > 0 && wholeSecond % 5 === 0) {
      lastSavedSecond = wholeSecond;
      saveState({ trackId: activeTrack.id, position: current });
    }
  }
  if ("mediaSession" in navigator && "setPositionState" in navigator.mediaSession && duration > 0 && Number.isFinite(duration)) {
    try { navigator.mediaSession.setPositionState({ duration, playbackRate: els.audio.playbackRate, position: Math.min(current, duration) }); } catch {}
  }
});
els.audio.addEventListener("ended", () => {
  if (activeTrack) saveState({ trackId: activeTrack.id, position: 0 });
  if (stopAtEpisodeEnd) { stopAtEpisodeEnd = false; els.sleepSelect.value = "off"; updatePlayButtons(); return; }
  const next = adjacentTrack(1); if (next) playTrack(next); else updatePlayButtons();
});

// The visible counter intentionally tracks logical track-source starts, not low-level HTTP
// byte-range requests. Browsers may legitimately make multiple Range requests for one track
// when seeking; that is normal and should not be confused with multiple audio players.


const savedRate = Number(localStorage.getItem(SPEED_KEY));
if ([.75,1,1.25,1.5,1.75,2].includes(savedRate)) els.speedSelect.value = String(savedRate);
els.audio.playbackRate = Number(els.speedSelect.value) || 1;
renderBrowser(); refreshContinue(); updatePlayButtons();
