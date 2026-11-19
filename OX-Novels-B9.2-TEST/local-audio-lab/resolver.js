const $ = selector => document.querySelector(selector);
const els = {
  brandHome: $('#brandHome'), brandMark: $('#brandMark'), brandName: $('#brandName'), menuSiteName: $('#menuSiteName'), openOxAccount: $('#openOxAccount'),
  siteMenuToggle: $('#siteMenuToggle'), siteMenuPopover: $('#siteMenuPopover'), closeSiteMenu: $('#closeSiteMenu'),
  storyTitle: $('#storyTitle'), storySummary: $('#storySummary'), storyFacts: $('#storyFacts'), storyCover: $('#storyCover'),
  loadStory: $('#loadStory'), refreshStory: $('#refreshStory'), sourceBadge: $('#sourceBadge'), continueButton: $('#continueButton'), resetProgressButton: $('#resetProgressButton'),
  setupCard: $('#setupCard'), audioRequests: $('#audioRequests'), metadataCalls: $('#metadataCalls'), streamRequests: $('#streamRequests'), rangeRequests: $('#rangeRequests'), activeStreams: $('#activeStreams'), peakStreams: $('#peakStreams'),
  catalogState: $('#catalogState'), catalogDetail: $('#catalogDetail'), syncState: $('#syncState'), syncDetail: $('#syncDetail'), storageState: $('#storageState'), storageDetail: $('#storageDetail'),
  transportState: $('#transportState'), transportDetail: $('#transportDetail'),
  breadcrumbs: $('#breadcrumbs'), browser: $('#browser'), folderBack: $('#folderBack'), statusLine: $('#statusLine'),
  loadingPanel: $('#loadingPanel'), loadingTitle: $('#loadingTitle'), loadingDetail: $('#loadingDetail'), loadingElapsed: $('#loadingElapsed'),
  playerSheet: $('#playerSheet'), playerStory: $('#playerStory'), playerTrack: $('#playerTrack'), playerCover: $('#playerCover'),
  playerError: $('#playerError'), playerErrorText: $('#playerErrorText'), retryButton: $('#retryButton'), buffering: $('#buffering'),
  currentTime: $('#currentTime'), duration: $('#duration'), seek: $('#seek'), previousButton: $('#previousButton'), nextButton: $('#nextButton'),
  backButton: $('#backButton'), forwardButton: $('#forwardButton'), playButton: $('#playButton'), speedSelect: $('#speedSelect'), sleepSelect: $('#sleepSelect'),
  volume: $('#volume'), muteButton: $('#muteButton'), minimizePlayer: $('#minimizePlayer'), closePlayer: $('#closePlayer'), audio: $('#audioEngine'),
  miniPlayer: $('#miniPlayer'), miniTrack: $('#miniTrack'), miniTime: $('#miniTime'), miniPlay: $('#miniPlay'), expandPlayer: $('#expandPlayer'), miniCover: $('#miniCover')
};

const params = new URLSearchParams(location.search);
let storyId = params.get('story') || '';
let story = null;
let pathStack = [];
let navigationBusy = false;
let loadingStartedAt = 0;
let loadingTimer = 0;
let activeRow = null;
let syncPollTimer = 0;
let openWhenReady = false;
let activePlayback = null;
const trackRegistry = new Map();
let sleepTimer = null;
let stopAtEpisodeEnd = false;
let isSeeking = false;
let lastSavedSecond = -1;
const SPEED_KEY = 'ox-listen-speed-v1';
function progressKey() { return `ox-listen-progress-v1:${storyId || 'story'}`; }


function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[ch]));
}
function formatBytes(value) {
  let bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B','KB','MB','GB']; let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes >= 100 || i === 0 ? Math.round(bytes) : bytes.toFixed(1)} ${units[i]}`;
}
function siteInitials(name = 'OX Novels') {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'OX';
  if (words.length === 1) return words[0].slice(0,2).toUpperCase();
  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}
function applySiteShell(site = {}) {
  const name = String(site.name || 'OX Novels').trim() || 'OX Novels';
  const accent = /^#[0-9a-fA-F]{6}$/.test(String(site.accent || '')) ? site.accent : '#13c3b3';
  const homeUrl = String(site.homeUrl || 'https://oxnovels.top/').trim() || 'https://oxnovels.top/';
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-dark', `color-mix(in srgb, ${accent} 76%, #000)`);
  document.documentElement.style.setProperty('--accent-soft', `color-mix(in srgb, ${accent} 12%, #fff)`);
  document.title = `${name} — Protected Playback Lab`;
  els.brandName.textContent = name;
  els.menuSiteName.textContent = name;
  els.brandHome.href = homeUrl;
  els.openOxAccount.href = homeUrl;
  const logo = String(site.logo || '').trim();
  if (logo) {
    els.brandMark.hidden = false;
    els.brandMark.classList.add('has-custom-image');
    els.brandMark.style.backgroundImage = `url("${logo.replaceAll('"','%22')}")`;
    els.brandMark.textContent = '';
  } else {
    const initials = siteInitials(name);
    els.brandMark.hidden = false;
    els.brandMark.textContent = initials;
  }
}
function updateLoadingClock() {
  const seconds = Math.max(0, (performance.now() - loadingStartedAt) / 1000);
  els.loadingElapsed.textContent = `${seconds.toFixed(1)}s`;
  if (seconds >= 3) els.loadingDetail.textContent = 'This is taking longer than expected. The customer path is still reading only the prepared catalog.';
}
function beginNavigation(title, button = null) {
  if (navigationBusy) return false;
  navigationBusy = true;
  activeRow = button;
  els.loadStory.disabled = true;
  els.folderBack.disabled = true;
  els.browser.classList.add('is-busy');
  els.browser.setAttribute('aria-busy', 'true');
  els.loadingTitle.textContent = title || 'Loading…';
  els.loadingDetail.textContent = 'Please wait. Your click was received.';
  els.loadingElapsed.textContent = '0.0s';
  els.loadingPanel.hidden = false;
  if (button) {
    button.classList.add('is-opening');
    const action = button.querySelector('.row-action');
    if (action) action.textContent = 'Opening…';
  }
  loadingStartedAt = performance.now();
  clearInterval(loadingTimer);
  loadingTimer = setInterval(updateLoadingClock, 200);
  return true;
}
function endNavigation() {
  navigationBusy = false;
  clearInterval(loadingTimer); loadingTimer = 0;
  els.loadStory.disabled = false;
  els.folderBack.disabled = false;
  els.browser.classList.remove('is-busy');
  els.browser.removeAttribute('aria-busy');
  els.loadingPanel.hidden = true;
  if (activeRow && activeRow.isConnected) {
    activeRow.classList.remove('is-opening');
    const action = activeRow.querySelector('.row-action');
    if (action) action.textContent = activeRow.dataset.type === 'folder' ? 'Open' : 'Play';
  }
  activeRow = null;
}
async function api(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const payload = await response.json().catch(() => ({ ok:false, error:'Invalid local API response.' }));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.error || `Request failed (${response.status}).`);
    Object.assign(error, payload);
    throw error;
  }
  return payload;
}
function stateClass(status) {
  return `catalog-state is-${String(status || '').toLowerCase().replace(/[^a-z0-9_-]+/g,'-')}`;
}
function renderCatalog(catalog = {}) {
  const status = String(catalog.status || 'not-built');
  els.catalogState.className = stateClass(status);
  if (status === 'ready') {
    els.catalogState.textContent = 'READY';
    els.catalogDetail.textContent = `${Number(catalog.folderCount || 0)} folders · ${Number(catalog.trackCount || 0)} tracks · customer navigation uses the active catalog only`;
  } else {
    els.catalogState.textContent = 'NOT READY';
    els.catalogDetail.textContent = 'No active catalog is available yet. Background preparation must finish before customer navigation opens.';
  }
}
function renderSync(sync = {}) {
  const status = String(sync.status || 'waiting');
  els.syncState.className = stateClass(status === 'preparing' ? 'preparing' : status === 'error' ? 'error' : 'ready');
  if (status === 'preparing') {
    els.syncState.textContent = 'SYNCING';
    els.syncDetail.textContent = `Building the next generation in background · ${Number(sync.folderCount || 0)} folders · ${Number(sync.trackCount || 0)} tracks found so far · active catalog stays available`;
  } else if (status === 'error') {
    els.syncState.textContent = 'RETRY NEEDED';
    els.syncDetail.textContent = `${sync.error || 'Background synchronization failed.'} The previously active catalog was not replaced.`;
  } else if (status === 'ready') {
    els.syncState.textContent = 'UPDATED';
    els.syncDetail.textContent = 'The newest generation completed successfully. Older catalog generations were cleaned immediately after activation.';
  } else if (status === 'idle') {
    els.syncState.textContent = 'IDLE';
    els.syncDetail.textContent = 'No synchronization is running. Customer navigation remains independent of Google Drive.';
  } else {
    els.syncState.textContent = 'WAITING';
    els.syncDetail.textContent = 'Waiting for the background catalog preparation process.';
  }
}
function renderStorage(storage = {}) {
  const active = Number(storage.activeCatalogs || 0);
  const old = Number(storage.oldCatalogs || 0);
  const temp = Number(storage.tempArtifacts || 0);
  const bytes = Number(storage.activeBytes || 0);
  const clean = old === 0 && temp === 0;
  els.storageState.className = stateClass(clean ? 'ready' : 'preparing');
  els.storageState.textContent = clean ? 'CLEAN' : 'CLEANING';
  els.storageDetail.textContent = `${active} active catalog · ${formatBytes(bytes)} metadata · old generations ${old} · temporary files ${temp} · no audio bytes stored here`;
}
function renderSnapshot(payload = {}) {
  if (payload.metadataCalls != null) els.metadataCalls.textContent = String(payload.metadataCalls);
  renderCatalog(payload.catalog || {});
  renderSync(payload.sync || {});
  renderStorage(payload.storage || {});
}
async function refreshSyncStatus({ keepPolling = true } = {}) {
  if (!storyId) return null;
  try {
    const payload = await api(`/api/sync/status?storyId=${encodeURIComponent(storyId)}`);
    renderSnapshot(payload);
    const syncing = payload.sync?.status === 'preparing';
    clearTimeout(syncPollTimer);
    if (syncing && keepPolling) syncPollTimer = setTimeout(() => refreshSyncStatus({ keepPolling: true }), 1200);
    if (!syncing && openWhenReady && payload.catalog?.status === 'ready') {
      openWhenReady = false;
      await loadRoot();
    }
    return payload;
  } catch { return null; }
}
function watchSync() {
  clearTimeout(syncPollTimer);
  syncPollTimer = setTimeout(() => refreshSyncStatus({ keepPolling: true }), 500);
}
async function init() {
  try {
    const status = await api('/api/status');
    applySiteShell(status.site || {});
    storyId = storyId || status.defaultStoryId;
    els.metadataCalls.textContent = String(status.metadataCalls || 0);
    els.audioRequests.textContent = String(status.audioRequests || 0);
    els.setupCard.hidden = status.resolverConfigured;
    const payload = await api(`/api/story?storyId=${encodeURIComponent(storyId)}`);
    story = payload.story;
    renderStory();
    const snapshot = await refreshSyncStatus({ keepPolling: true });
    if (snapshot?.catalog?.status === 'ready') els.statusLine.textContent = 'Prepared catalog is ready. Opening folders will not call Google Drive.';
    else if (snapshot?.sync?.status === 'preparing') els.statusLine.textContent = 'This story is being prepared in the background. No customer click started that Drive scan.';
  } catch (error) {
    els.storyTitle.textContent = 'Local setup needs attention';
    els.storySummary.textContent = error.message;
  }
}
function renderStory() {
  els.storyTitle.textContent = story.title || story.id;
  els.storySummary.textContent = story.description || 'The Listen system reuses this story directly from OX.';
  const facts = [story.genre, story.status].filter(Boolean);
  els.storyFacts.innerHTML = facts.map(value => `<span class="story-fact">${escapeHtml(value)}</span>`).join('');
  els.storyFacts.hidden = facts.length === 0;
  els.sourceBadge.hidden = false;
  els.sourceBadge.textContent = `Source version ${story.sourceVersion} · ${story.hasDriveSource ? 'Drive source found' : 'No Drive source'}`;
  els.playerStory.textContent = story.title || story.id;
  if (story.cover) {
    const coverUrl = JSON.stringify(story.cover).slice(1,-1);
    els.storyCover.style.backgroundImage = `linear-gradient(rgba(0,0,0,.04),rgba(0,0,0,.04)),url(${coverUrl})`;
    els.storyCover.classList.add('has-cover');
    for (const cover of [els.playerCover, els.miniCover]) { cover.classList.add('has-cover'); cover.style.backgroundImage = `url(${coverUrl})`; cover.textContent = ''; }
  }
  refreshContinueButton();
}
function renderBreadcrumbs() {
  els.breadcrumbs.innerHTML = pathStack.map((entry, index) => `<button class="crumb" data-crumb="${index}" type="button">${escapeHtml(entry.name)}</button>${index < pathStack.length - 1 ? '<span>›</span>' : ''}`).join('');
  els.folderBack.hidden = pathStack.length <= 1;
}
function renderListing(payload) {
  if (payload.metadataCalls != null) els.metadataCalls.textContent = String(payload.metadataCalls);
  renderCatalog(payload.catalog || {});
  if (payload.sync) renderSync(payload.sync);
  if (payload.storage) renderStorage(payload.storage);
  els.statusLine.textContent = 'Opened from the active OX audio catalog. No Google Drive request was created by this customer navigation.';
  if (payload.truncated) els.statusLine.textContent += ' This folder listing was truncated by the resolver safety limit.';
  for (const item of (payload.items || [])) {
    if (item.type === 'track' && item.trackKey) trackRegistry.set(item.trackKey, item);
  }
  els.browser.innerHTML = (payload.items || []).map(item => {
    const isFolder = item.type === 'folder';
    const detail = isFolder ? 'Folder' : [item.mimeType, formatBytes(item.size)].filter(Boolean).join(' · ');
    const prevKey = item.previous?.key || '', prevName = item.previous?.name || '';
    const nextKey = item.next?.key || '', nextName = item.next?.name || '';
    return `<button class="browser-row" type="button" data-token="${escapeHtml(item.token)}" data-type="${escapeHtml(item.type)}" data-track-key="${escapeHtml(item.trackKey || '')}" data-track-name="${escapeHtml(item.name || '')}" data-prev-key="${escapeHtml(prevKey)}" data-prev-name="${escapeHtml(prevName)}" data-next-key="${escapeHtml(nextKey)}" data-next-name="${escapeHtml(nextName)}">
      <span class="row-icon" aria-hidden="true">${isFolder ? '▰' : '▶'}</span>
      <span class="row-copy"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(detail)}</span></span>
      <span class="row-action">${isFolder ? 'Open' : 'Play'}</span>
    </button>`;
  }).join('') || '<div class="empty-state">No child folders or recognized audio files were found in the active catalog for this folder.</div>';
  renderBreadcrumbs();
}
async function loadRoot() {
  if (!storyId || !beginNavigation('Opening prepared story contents…')) return;
  els.statusLine.textContent = 'Reading the active OX audio catalog…';
  try {
    const storyPayload = await api(`/api/story?storyId=${encodeURIComponent(storyId)}`);
    story = storyPayload.story; renderStory();
    const payload = await api(`/api/audio/root?storyId=${encodeURIComponent(storyId)}`);
    pathStack = [{ name: payload.folder?.name || story.title, kind: 'root' }];
    renderListing(payload);
    els.setupCard.hidden = true;
  } catch (error) {
    if (error.catalogPreparing) {
      els.statusLine.textContent = 'Background synchronization is preparing this story. Customer navigation is not scanning Drive. It will open automatically when the active catalog is ready.';
      openWhenReady = true;
      renderCatalog(error.catalog || {});
      watchSync();
    } else {
      els.statusLine.textContent = error.message;
      if (error.setupRequired) els.setupCard.hidden = false;
    }
  } finally { endNavigation(); }
}
async function syncLatest() {
  if (!storyId || els.refreshStory.disabled) return;
  els.refreshStory.disabled = true;
  const originalText = els.refreshStory.textContent;
  els.refreshStory.textContent = 'Starting Sync…';
  els.statusLine.textContent = 'Starting a background Drive synchronization. The current active catalog remains available while the next generation is built.';
  try {
    const payload = await api('/api/sync/story', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ storyId, force: true, reason: 'manual-local-sync' })
    });
    renderSnapshot(payload);
    els.statusLine.textContent = payload.started
      ? 'Background synchronization started. You can continue opening the current catalog while it runs.'
      : 'A background synchronization is already running or the current catalog is already prepared.';
    watchSync();
  } catch (error) {
    els.statusLine.textContent = error.message;
  } finally {
    els.refreshStory.disabled = false;
    els.refreshStory.textContent = originalText;
  }
}
async function openFolder(button) {
  if (navigationBusy) return;
  const token = button.dataset.token;
  const name = button.querySelector('.row-copy strong')?.textContent || 'Folder';
  if (!beginNavigation(`Opening ${name}…`, button)) return;
  try {
    const payload = await api(`/api/audio/folder?token=${encodeURIComponent(token)}`);
    const last = pathStack[pathStack.length - 1];
    if (!last || last.token !== token) pathStack.push({ name, kind: 'folder', token });
    renderListing(payload);
  } catch (error) {
    if (error.sourceChanged) {
      els.statusLine.textContent = 'The OX story now points to a different Drive source. Its replacement catalog must finish preparing before this story is opened again.';
      openWhenReady = true;
      watchSync();
    } else els.statusLine.textContent = error.message;
  } finally { endNavigation(); }
}
function formatTime(value) {
  const seconds = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), sec = seconds % 60;
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
}
function loadProgress() { try { return JSON.parse(localStorage.getItem(progressKey()) || '{}'); } catch { return {}; } }
function saveProgress(extra = {}) { const old = loadProgress(); localStorage.setItem(progressKey(), JSON.stringify({ ...old, ...extra, updatedAt: Date.now() })); refreshContinueButton(); }
function refreshContinueButton() {
  if (!els.continueButton || !storyId) return;
  const saved = loadProgress();
  if (!saved.trackKey || !(Number(saved.position) > 1)) { els.continueButton.hidden = true; return; }
  els.continueButton.hidden = false;
  els.continueButton.textContent = `Continue ${saved.trackName || 'Listening'} · ${formatTime(Number(saved.position) || 0)}`;
}
function showPlayer() { els.playerSheet.hidden = false; els.miniPlayer.hidden = true; }
function minimizePlayer() { if (!activePlayback) return; els.playerSheet.hidden = true; els.miniPlayer.hidden = false; }
function closePlayer() {
  els.audio.pause(); els.audio.removeAttribute('src'); els.audio.load();
  activePlayback = null; els.playerSheet.hidden = true; els.miniPlayer.hidden = true; updatePlayButtons();
}
function clearPlayerError() { els.playerError.hidden = true; }
function showPlayerError(text) { els.playerErrorText.textContent = text; els.playerError.hidden = false; els.buffering.hidden = true; }
function updatePlayButtons() {
  const playing = !els.audio.paused && !els.audio.ended;
  els.playButton.textContent = playing ? '❚❚' : '▶'; els.miniPlay.textContent = playing ? '❚❚' : '▶';
  els.playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
}
function jump(seconds) { if (Number.isFinite(els.audio.duration)) els.audio.currentTime = Math.max(0, Math.min(els.audio.duration, els.audio.currentTime + seconds)); }
function setSleepTimer(value) {
  if (sleepTimer) clearTimeout(sleepTimer); sleepTimer = null; stopAtEpisodeEnd = value === 'episode';
  const minutes = Number(value); if (Number.isFinite(minutes) && minutes > 0) sleepTimer = setTimeout(() => { els.audio.pause(); els.sleepSelect.value = 'off'; sleepTimer = null; }, minutes * 60 * 1000);
}
function configureMediaSession(playback) {
  if (!('mediaSession' in navigator) || !playback) return;
  const artwork = story?.cover ? [{ src: new URL(story.cover, location.href).href }] : [];
  navigator.mediaSession.metadata = new MediaMetadata({ title: playback.track.name, artist: 'OX Novels', album: story?.title || 'OX Novels', artwork });
}
async function safePlayAudio() {
  try {
    await els.audio.play();
    return true;
  } catch (error) {
    if (error?.name === 'AbortError' && els.audio.paused) {
      els.buffering.hidden = true;
      clearPlayerError();
      updatePlayButtons();
      return false;
    }
    throw error;
  }
}

function applyPlaybackSource(url, resumePosition = null) {
  els.audio.pause();
  els.audio.removeAttribute('src');
  els.audio.load();
  els.audio.src = url;
  els.audio.playbackRate = Number(els.speedSelect.value) || 1;
  if (resumePosition !== null) {
    const seekWhenReady = () => {
      if (Number.isFinite(els.audio.duration)) {
        els.audio.currentTime = Math.min(Number(resumePosition) || 0, Math.max(0, els.audio.duration - .25));
      }
      els.audio.removeEventListener('loadedmetadata', seekWhenReady);
    };
    if (els.audio.readyState >= 1) seekWhenReady();
    else els.audio.addEventListener('loadedmetadata', seekWhenReady);
  }
}

function makeNeighbor(key, name) {
  return key ? { key, name: name || 'Episode' } : null;
}
function directStreamUrl(trackKey) {
  return `/api/playback/stream?storyId=${encodeURIComponent(storyId)}&trackKey=${encodeURIComponent(trackKey)}`;
}
async function startPlayback({ trackKey = '', trackName = '', previous = null, next = null, resumePosition = null } = {}) {
  if (!trackKey) throw new Error('This prepared track is missing its OX playback key. Reopen the story contents.');
  clearPlayerError(); showPlayer(); els.buffering.hidden = false;
  activePlayback = {
    transport: 'single-request-same-origin-stream-test',
    track: { key: trackKey, name: trackName || 'Audio' },
    previous,
    next,
    story: { id: storyId, title: story?.title || 'OX Novels', cover: story?.cover || '' },
    streamUrls: [directStreamUrl(trackKey)],
    _streamIndex: 0
  };
  els.playerStory.textContent = activePlayback.story.title;
  els.playerTrack.textContent = activePlayback.track.name;
  els.miniTrack.textContent = activePlayback.track.name;
  configureMediaSession(activePlayback);
  applyPlaybackSource(activePlayback.streamUrls[0], resumePosition);
  try { await safePlayAudio(); }
  catch (error) { showPlayerError(error.message || 'Playback could not start.'); }
}

async function retryActivePlayback() {
  if (!activePlayback?.track?.key) return;
  const position = Number(els.audio.currentTime || loadProgress().position || 0);
  await startPlayback({ trackKey: activePlayback.track.key, trackName: activePlayback.track.name, previous: activePlayback.previous, next: activePlayback.next, resumePosition: position });
}
async function playNeighbor(which) {
  const neighbor = activePlayback?.[which]; if (!neighbor?.key) return;
  const known = trackRegistry.get(neighbor.key) || null;
  const previous = known?.previous ? makeNeighbor(known.previous.key, known.previous.name) : (which === 'next' ? { key: activePlayback.track.key, name: activePlayback.track.name } : null);
  const next = known?.next ? makeNeighbor(known.next.key, known.next.name) : (which === 'previous' ? { key: activePlayback.track.key, name: activePlayback.track.name } : null);
  await startPlayback({ trackKey: neighbor.key, trackName: neighbor.name, previous, next, resumePosition: 0 });
}
async function inspectTrack(button) {
  if (navigationBusy) return;
  const trackKey = button.dataset.trackKey || '';
  const name = button.dataset.trackName || button.querySelector('.row-copy strong')?.textContent || 'Audio';
  const previous = makeNeighbor(button.dataset.prevKey || '', button.dataset.prevName || '');
  const next = makeNeighbor(button.dataset.nextKey || '', button.dataset.nextName || '');
  if (!beginNavigation(`Starting ${name}…`, button)) return;
  try { await startPlayback({ trackKey, trackName: name, previous, next, resumePosition: 0 }); }
  catch (error) { els.statusLine.textContent = error.message; }
  finally { endNavigation(); }
}

els.loadStory.addEventListener('click', loadRoot);
els.refreshStory.addEventListener('click', syncLatest);
els.folderBack.addEventListener('click', async () => {
  if (navigationBusy || pathStack.length <= 1) return;
  const targetPath = pathStack.slice(0, -1);
  const target = targetPath[targetPath.length - 1];
  if (target.kind === 'root') return loadRoot();
  if (!beginNavigation(`Returning to ${target.name}…`)) return;
  try {
    const payload = await api(`/api/audio/folder?token=${encodeURIComponent(target.token)}`);
    pathStack = targetPath;
    renderListing(payload);
  } catch (error) { els.statusLine.textContent = error.message; }
  finally { endNavigation(); }
});
els.breadcrumbs.addEventListener('click', async event => {
  if (navigationBusy) return;
  const button = event.target.closest('[data-crumb]'); if (!button) return;
  const index = Number(button.dataset.crumb); if (!Number.isInteger(index) || index < 0 || index >= pathStack.length) return;
  const target = pathStack[index];
  if (index === pathStack.length - 1) return;
  if (target.kind === 'root') return loadRoot();
  if (!beginNavigation(`Opening ${target.name}…`)) return;
  try {
    const payload = await api(`/api/audio/folder?token=${encodeURIComponent(target.token)}`);
    pathStack = pathStack.slice(0, index + 1);
    renderListing(payload);
  } catch (error) { els.statusLine.textContent = error.message; }
  finally { endNavigation(); }
});
els.browser.addEventListener('click', event => {
  const button = event.target.closest('[data-token]'); if (!button || navigationBusy) return;
  if (button.dataset.type === 'folder') return openFolder(button);
  return inspectTrack(button);
});
els.continueButton.addEventListener('click', async () => {
  const saved = loadProgress();
  if (saved.trackKey) await startPlayback({ trackKey: saved.trackKey, trackName: saved.trackName || 'Audio', previous: saved.previous || null, next: saved.next || null, resumePosition: Number(saved.position) || 0 });
});
els.resetProgressButton.addEventListener('click', () => { localStorage.removeItem(progressKey()); refreshContinueButton(); });
els.playButton.addEventListener('click', async () => { if (!activePlayback) return; if (els.audio.paused) { try { await safePlayAudio(); } catch (error) { showPlayerError(error.message || 'Playback could not start.'); } } else els.audio.pause(); });
els.miniPlay.addEventListener('click', async () => { if (!activePlayback) return; if (els.audio.paused) { try { await safePlayAudio(); } catch (error) { showPlayerError(error.message || 'Playback could not start.'); } } else els.audio.pause(); });
els.previousButton.addEventListener('click', () => playNeighbor('previous'));
els.nextButton.addEventListener('click', () => playNeighbor('next'));
els.backButton.addEventListener('click', () => jump(-10));
els.forwardButton.addEventListener('click', () => jump(10));
els.minimizePlayer.addEventListener('click', minimizePlayer); els.expandPlayer.addEventListener('click', showPlayer); els.closePlayer.addEventListener('click', closePlayer);
els.retryButton.addEventListener('click', retryActivePlayback);
els.speedSelect.addEventListener('change', () => { const rate = Number(els.speedSelect.value) || 1; els.audio.playbackRate = rate; localStorage.setItem(SPEED_KEY, String(rate)); });
els.volume.addEventListener('input', () => { els.audio.volume = Number(els.volume.value); if (els.audio.muted && Number(els.volume.value) > 0) els.audio.muted = false; els.muteButton.textContent = els.audio.muted ? 'Unmute' : 'Mute'; });
els.muteButton.addEventListener('click', () => { els.audio.muted = !els.audio.muted; els.muteButton.textContent = els.audio.muted ? 'Unmute' : 'Mute'; });
els.sleepSelect.addEventListener('change', () => setSleepTimer(els.sleepSelect.value));
els.seek.addEventListener('pointerdown', () => { isSeeking = true; }); els.seek.addEventListener('pointerup', () => { isSeeking = false; });
els.seek.addEventListener('input', () => { if (Number.isFinite(els.audio.duration) && els.audio.duration > 0) els.audio.currentTime = (Number(els.seek.value) / 1000) * els.audio.duration; });
els.audio.addEventListener('play', updatePlayButtons); els.audio.addEventListener('pause', updatePlayButtons);
els.audio.addEventListener('waiting', () => { els.buffering.hidden = false; });
els.audio.addEventListener('playing', () => { els.buffering.hidden = true; clearPlayerError(); updatePlayButtons(); });
els.audio.addEventListener('canplay', () => { els.buffering.hidden = true; });
els.audio.addEventListener('error', async () => {
  if (activePlayback?.streamUrls && (activePlayback._streamIndex + 1) < activePlayback.streamUrls.length) {
    const resumeAt = Number(els.audio.currentTime || loadProgress().position || 0);
    activePlayback._streamIndex += 1;
    clearPlayerError();
    els.buffering.hidden = false;
    applyPlaybackSource(activePlayback.streamUrls[activePlayback._streamIndex], resumeAt);
    try { await safePlayAudio(); return; } catch {}
  }
  showPlayerError('The local stream test could not play this episode. Retry once; if it persists, send the screenshot and the request counters.');
});
els.audio.addEventListener('loadedmetadata', () => { els.duration.textContent = formatTime(els.audio.duration); });
els.audio.addEventListener('timeupdate', () => {
  const current = els.audio.currentTime || 0, duration = els.audio.duration || 0;
  els.currentTime.textContent = formatTime(current); els.miniTime.textContent = formatTime(current);
  if (!isSeeking && duration > 0) els.seek.value = String(Math.round((current / duration) * 1000));
  if (activePlayback?.track?.key) {
    const whole = Math.floor(current);
    if (whole !== lastSavedSecond && whole > 0 && whole % 5 === 0) { lastSavedSecond = whole; saveProgress({ trackKey: activePlayback.track.key, trackName: activePlayback.track.name, previous: activePlayback.previous || null, next: activePlayback.next || null, position: current }); }
  }
  if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && duration > 0 && Number.isFinite(duration)) { try { navigator.mediaSession.setPositionState({ duration, playbackRate: els.audio.playbackRate, position: Math.min(current, duration) }); } catch {} }
});
els.audio.addEventListener('ended', async () => {
  if (activePlayback?.track?.key) saveProgress({ trackKey: activePlayback.track.key, trackName: activePlayback.track.name, previous: activePlayback.previous || null, next: activePlayback.next || null, position: 0 });
  if (stopAtEpisodeEnd) { stopAtEpisodeEnd = false; els.sleepSelect.value = 'off'; updatePlayButtons(); return; }
  if (activePlayback?.next?.key) await playNeighbor('next'); else updatePlayButtons();
});
if ('mediaSession' in navigator) {
  const safe = (name, fn) => { try { navigator.mediaSession.setActionHandler(name, fn); } catch {} };
  safe('play', () => safePlayAudio().catch(error => showPlayerError(error.message || 'Playback could not start.'))); safe('pause', () => els.audio.pause()); safe('seekbackward', d => jump(-(d.seekOffset || 10))); safe('seekforward', d => jump(d.seekOffset || 10));
  safe('previoustrack', () => playNeighbor('previous')); safe('nexttrack', () => playNeighbor('next')); safe('seekto', d => { if (Number.isFinite(d.seekTime)) els.audio.currentTime = d.seekTime; });
}

async function refreshPlaybackMetrics() {
  try {
    const m = await api('/api/debug/playback-metrics');
    if (els.audioRequests) els.audioRequests.textContent = String(m.streamRequests || 0);
    if (els.streamRequests) els.streamRequests.textContent = String(m.streamRequests || 0);
    if (els.rangeRequests) els.rangeRequests.textContent = String(m.rangeRequests || 0);
    if (els.activeStreams) els.activeStreams.textContent = String(m.activeStreams || 0);
    if (els.peakStreams) els.peakStreams.textContent = String(m.peakStreams || 0);
  } catch {}
}
setInterval(refreshPlaybackMetrics, 800);
refreshPlaybackMetrics();

const savedRate = Number(localStorage.getItem(SPEED_KEY)); if ([.75,1,1.25,1.5,1.75,2].includes(savedRate)) els.speedSelect.value = String(savedRate); els.audio.playbackRate = Number(els.speedSelect.value) || 1;

els.siteMenuToggle.addEventListener('click', () => {
  const opening = els.siteMenuPopover.hidden;
  els.siteMenuPopover.hidden = !opening;
  els.siteMenuToggle.setAttribute('aria-expanded', String(opening));
});
els.closeSiteMenu.addEventListener('click', () => {
  els.siteMenuPopover.hidden = true;
  els.siteMenuToggle.setAttribute('aria-expanded', 'false');
});
document.addEventListener('click', event => {
  if (els.siteMenuPopover.hidden) return;
  if (event.target.closest('#siteMenuToggle') || event.target.closest('#siteMenuPopover')) return;
  els.siteMenuPopover.hidden = true;
  els.siteMenuToggle.setAttribute('aria-expanded', 'false');
});

refreshContinueButton(); updatePlayButtons();
init();
