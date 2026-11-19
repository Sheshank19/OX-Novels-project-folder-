import http from 'node:http';
import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { readFile, stat, writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, '..');
const configPath = path.join(root, 'config', 'resolver.local.json');
const cacheDir = path.join(root, 'cache');
const defaultPort = 4173;
const port = Number(process.env.PORT || defaultPort);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};
const tokenMap = new Map();
const playbackTickets = new Map();
const PLAYBACK_TICKET_MS = 30 * 60 * 1000;
const folderCache = new Map();
const inflightFolderReads = new Map();
const catalogMemory = new Map();
const catalogBuilds = new Map();
const CACHE_MS = 30_000;
const CATALOG_MAX_DEPTH = 12;
const CATALOG_MAX_FOLDERS = 500;
const CATALOG_CONCURRENCY = 3;
let metadataCalls = 0;
let audioRequests = 0;
let streamRequests = 0;
let rangeRequests = 0;
let activeStreams = 0;
let peakStreams = 0;
let startupSyncStarted = false;

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

function send404(res) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

function safeJson(value, fallback = {}) {
  try { return JSON.parse(String(value || '')); } catch { return fallback; }
}

function extractFolderId(value) {
  const text = String(value || '').trim();
  let match = text.match(/(?:drive\/folders|folders)\/([A-Za-z0-9_-]{10,})/i);
  if (match) return match[1];
  match = text.match(/[?&]id=([A-Za-z0-9_-]{10,})/i);
  if (match) return match[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(text) ? text : '';
}

function sourceVersion(folderId) {
  return createHash('sha256').update(String(folderId || '')).digest('hex').slice(0, 12);
}

function publicTrackKey(story, fileId) {
  return createHash('sha256')
    .update(`${story.id}\0${story.sourceVersion}\0${String(fileId || '')}`)
    .digest('base64url')
    .slice(0, 24);
}

function orderedCatalogTracks(catalog, story) {
  const out = [];
  const seenFolders = new Set();
  const walk = folderId => {
    if (!folderId || seenFolders.has(folderId)) return;
    seenFolders.add(folderId);
    const node = catalog?.nodes?.[folderId];
    if (!node) return;
    for (const track of Array.isArray(node.tracks) ? node.tracks : []) {
      out.push({ ...track, folderId, key: publicTrackKey(story, track.id) });
    }
    for (const child of Array.isArray(node.folders) ? node.folders : []) walk(child.id);
  };
  walk(catalog?.rootFolderId || story.folderId);
  return out;
}

function findCatalogTrack(catalog, story, { fileId = '', trackKey = '' } = {}) {
  const tracks = orderedCatalogTracks(catalog, story);
  const index = tracks.findIndex(track => fileId ? track.id === fileId : track.key === trackKey);
  if (index < 0) return null;
  return { track: tracks[index], index, tracks };
}

function cleanupPlaybackTickets() {
  const now = Date.now();
  for (const [ticket, meta] of playbackTickets) if (!meta || meta.expiresAt <= now) playbackTickets.delete(ticket);
}

function issuePlaybackTicket(story, catalog, found) {
  cleanupPlaybackTickets();
  const ticket = 'play_' + randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + PLAYBACK_TICKET_MS;
  const track = found.track;
  playbackTickets.set(ticket, {
    storyId: story.id,
    sourceVersion: story.sourceVersion,
    fileId: track.id,
    trackKey: track.key,
    name: track.name,
    mimeType: track.mimeType,
    size: Number(track.size || 0),
    expiresAt
  });
  audioRequests += 1;
  const prev = found.tracks[found.index - 1] || null;
  const next = found.tracks[found.index + 1] || null;
  return {
    ok: true,
    transport: 'same-origin-drive-stream-test',
    expiresAt: new Date(expiresAt).toISOString(),
    streamUrl: `/api/playback/stream?ticket=${encodeURIComponent(ticket)}`,
    streamUrls: [`/api/playback/stream?ticket=${encodeURIComponent(ticket)}`],
    audioRequests,
    track: {
      key: track.key,
      name: String(track.name || 'Audio'),
      mimeType: String(track.mimeType || ''),
      size: Number(track.size || 0)
    },
    previous: prev ? { key: prev.key, name: String(prev.name || 'Previous episode') } : null,
    next: next ? { key: next.key, name: String(next.name || 'Next episode') } : null,
    story: { id: story.id, title: story.title, cover: story.cover }
  };
}

function driveDownloadCandidates(fileId) {
  const id = encodeURIComponent(String(fileId || ''));
  return [
    `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${id}&confirm=t`
  ];
}

async function fetchDriveAudio(fileId, rangeHeader = '') {
  let lastError = null;
  for (const target of driveDownloadCandidates(fileId)) {
    try {
      const headers = { 'user-agent': 'OX-Audio-Local-Lab/3.7' };
      if (rangeHeader) headers.range = rangeHeader;
      const response = await fetch(target, { method: 'GET', redirect: 'follow', headers });
      const type = String(response.headers.get('content-type') || '').toLowerCase();
      const looksHtml = type.includes('text/html');
      if ((response.ok || response.status === 206) && !looksHtml && response.body) return response;
      try { await response.body?.cancel(); } catch {}
      lastError = new Error(`Google Drive returned ${response.status}${looksHtml ? ' HTML instead of audio' : ''}.`);
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('The stream gateway could not retrieve this Drive audio file.');
}

async function handlePlaybackStream(req, res, url) {
  const storyId = String(url.searchParams.get('storyId') || '').trim();
  const trackKey = String(url.searchParams.get('trackKey') || '').trim();
  if (!storyId || !trackKey) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    return res.end('Story and track are required.');
  }

  let story;
  let found;
  try {
    story = readStory(storyId);
    const catalog = await loadCatalog(story);
    if (!catalog) {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      return res.end('The active audio catalog is not ready.');
    }
    found = findCatalogTrack(catalog, story, { trackKey });
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(error.message || 'Playback lookup failed.');
  }
  if (!found) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    return res.end('This track is not present in the active catalog.');
  }

  // PRODUCTION: put the existing OX session + membership/Lifetime entitlement check
  // here. That keeps authorization and streaming in the SAME inbound request.
  const track = found.track;
  const rangeHeader = String(req.headers.range || '');
  streamRequests += 1;
  audioRequests += 1;
  if (rangeHeader) rangeRequests += 1;
  activeStreams += 1;
  peakStreams = Math.max(peakStreams, activeStreams);
  let closed = false;
  const finish = () => { if (!closed) { closed = true; activeStreams = Math.max(0, activeStreams - 1); } };
  res.once('close', finish);
  res.once('finish', finish);
  try {
    const upstream = await fetchDriveAudio(track.id, rangeHeader);
    const headers = {
      'content-type': upstream.headers.get('content-type') || track.mimeType || 'application/octet-stream',
      'cache-control': 'private, no-store',
      'accept-ranges': upstream.headers.get('accept-ranges') || 'bytes',
      'x-ox-playback-mode': 'single-request-stream-test'
    };
    for (const name of ['content-length','content-range','etag','last-modified']) {
      const value = upstream.headers.get(name); if (value) headers[name] = value;
    }
    res.writeHead(upstream.status === 206 ? 206 : 200, headers);
    if (req.method === 'HEAD') { try { await upstream.body?.cancel(); } catch {} finish(); return res.end(); }
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    finish();
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end(`Local stream gateway could not read the Drive file: ${error.message}`);
  }
}

function opaqueToken(meta) {
  const token = 'ox_' + randomBytes(18).toString('base64url');
  tokenMap.set(token, meta);
  return token;
}

function locateD1() {
  const dir = path.join(projectRoot, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
  if (!existsSync(dir)) throw new Error('Local D1 folder was not found. Run your normal OX localhost setup once first.');
  const files = readdirSync(dir).filter(name => name.endsWith('.sqlite') && name !== 'metadata.sqlite');
  const candidates = [];
  for (const name of files) {
    const dbPath = path.join(dir, name);
    let db;
    try {
      db = new DatabaseSync(dbPath, { readOnly: true });
      const found = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stories'").get();
      if (!found) { db.close(); continue; }
      const storyCount = Number(db.prepare('SELECT COUNT(*) AS n FROM stories').get()?.n || 0);
      const hasCovers = Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='story_covers'").get());
      const coverCount = hasCovers ? Number(db.prepare('SELECT COUNT(*) AS n FROM story_covers').get()?.n || 0) : 0;
      candidates.push({ db, dbPath, score: storyCount * 10000 + coverCount });
    } catch {
      try { db?.close(); } catch {}
    }
  }
  if (!candidates.length) throw new Error('Could not find a local D1 database containing the stories table.');
  candidates.sort((a,b) => b.score - a.score);
  for (const item of candidates.slice(1)) { try { item.db.close(); } catch {} }
  return { db: candidates[0].db, dbPath: candidates[0].dbPath };
}

function readStory(storyId) {
  const { db } = locateD1();
  try {
    const row = db.prepare('SELECT id,title,description,genre,status,cover,drive_url,visible FROM stories WHERE id=? LIMIT 1').get(String(storyId || ''));
    if (!row) throw new Error('Story was not found in the local D1 copy.');
    const folderId = extractFolderId(row.drive_url);
    return {
      id: String(row.id || ''),
      title: String(row.title || ''),
      description: String(row.description || ''),
      genre: String(row.genre || ''),
      status: String(row.status || ''),
      cover: `/api/local-story-cover/${encodeURIComponent(String(row.id || ''))}`,
      visible: Number(row.visible || 0) === 1,
      folderId,
      sourceVersion: sourceVersion(folderId),
      hasDriveSource: Boolean(folderId)
    };
  } finally {
    db.close();
  }
}

function readSiteShell() {
  const { db } = locateD1();
  try {
    const row = db.prepare("SELECT value FROM site_settings WHERE key='appearance' LIMIT 1").get();
    const appearance = safeJson(row?.value || '{}', {});
    const name = String(appearance.name || 'OX Novels').trim() || 'OX Novels';
    const accent = /^#[0-9a-fA-F]{6}$/.test(String(appearance.accent || '')) ? String(appearance.accent) : '#13c3b3';
    const mediaTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='media_assets'").get();
    const hasLogo = Boolean(mediaTable && db.prepare("SELECT asset_key FROM media_assets WHERE asset_key='appearance-logo' LIMIT 1").get());
    return {
      name,
      handle: String(appearance.handle || ''),
      accent,
      logo: hasLogo ? '/api/local-site-media/appearance-logo' : '',
      profileImage: mediaTable && db.prepare("SELECT asset_key FROM media_assets WHERE asset_key='appearance-profile' LIMIT 1").get() ? '/api/local-site-media/appearance-profile' : '',
      homeUrl: 'https://oxnovels.top/'
    };
  } finally { db.close(); }
}

async function readLocalMedia(assetKey) {
  const { db } = locateD1();
  try {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='media_assets'").get();
    if (!table) return null;
    const row = db.prepare('SELECT mime_type,image_data,size_bytes,updated_at FROM media_assets WHERE asset_key=? LIMIT 1').get(String(assetKey || ''));
    if (!row || !row.image_data) return null;
    const bytes = Buffer.isBuffer(row.image_data) ? row.image_data : Buffer.from(row.image_data);
    return { bytes, mimeType: String(row.mime_type || 'image/webp'), updatedAt: String(row.updated_at || ''), size: Number(row.size_bytes || bytes.length) };
  } finally { db.close(); }
}

async function handleLocalMedia(req, res, assetKey) {
  try {
    const asset = await readLocalMedia(assetKey);
    if (!asset) return send404(res);
    res.writeHead(200, {
      'content-type': asset.mimeType,
      'cache-control': 'private, max-age=3600',
      'content-length': asset.bytes.length
    });
    res.end(asset.bytes);
  } catch { send404(res); }
}

async function loadConfig() {
  if (!existsSync(configPath)) return { resolverUrl: '', resolverSecret: '', defaultStoryId: 'a-dragon-s-revenge' };
  try {
    const parsed = JSON.parse(await readFile(configPath, 'utf8'));
    return {
      resolverUrl: String(parsed.resolverUrl || '').trim(),
      resolverSecret: String(parsed.resolverSecret || '').trim(),
      defaultStoryId: String(parsed.defaultStoryId || 'a-dragon-s-revenge').trim() || 'a-dragon-s-revenge'
    };
  } catch {
    return { resolverUrl: '', resolverSecret: '', defaultStoryId: 'a-dragon-s-revenge' };
  }
}

async function callResolver(folderId, { bypassCache = false } = {}) {
  const config = await loadConfig();
  if (!config.resolverUrl || !config.resolverSecret || !/^https:\/\/script\.google\.com\//i.test(config.resolverUrl)) {
    const error = new Error('Audio resolver is not configured yet.');
    error.code = 'SETUP_REQUIRED';
    throw error;
  }

  const cached = folderCache.get(folderId);
  if (!bypassCache && cached && Date.now() - cached.at < CACHE_MS) return { ...cached.value, cacheHit: true };

  const existing = inflightFolderReads.get(folderId);
  if (existing) {
    const value = await existing;
    return { ...value, cacheHit: false, coalesced: true };
  }

  const work = (async () => {
    metadataCalls += 1;
    const response = await fetch(config.resolverUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: config.resolverSecret, mode: 'list_children', folderId })
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error('Resolver returned a non-JSON response. Please wait a moment and retry once.'); }
    if (!response.ok || !payload || payload.ok !== true) throw new Error(String(payload?.error || `Resolver request failed (${response.status}).`));
    folderCache.set(folderId, { at: Date.now(), value: payload });
    return payload;
  })();

  inflightFolderReads.set(folderId, work);
  try {
    const payload = await work;
    return { ...payload, cacheHit: false, coalesced: false };
  } finally {
    if (inflightFolderReads.get(folderId) === work) inflightFolderReads.delete(folderId);
  }
}

function catalogKey(story) { return `${story.id}:${story.sourceVersion}`; }
function catalogPathFor(story) {
  const safeId = String(story.id || 'story').replace(/[^a-z0-9._-]+/gi, '-');
  return path.join(cacheDir, `${safeId}-${story.sourceVersion}.json`);
}
async function loadCatalog(story) {
  const key = catalogKey(story);
  if (catalogMemory.has(key)) return catalogMemory.get(key);
  const file = catalogPathFor(story);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (parsed?.storyId !== story.id || parsed?.sourceVersion !== story.sourceVersion || !parsed?.nodes?.[story.folderId]) return null;
    catalogMemory.set(key, parsed);
    return parsed;
  } catch { return null; }
}
function safeStoryCachePrefix(story) {
  const safeId = String(story.id || 'story').replace(/[^a-z0-9._-]+/gi, '-');
  return `${safeId}-`;
}
async function catalogStorageStats(story) {
  await mkdir(cacheDir, { recursive: true });
  const prefix = safeStoryCachePrefix(story);
  const activeName = path.basename(catalogPathFor(story));
  const names = readdirSync(cacheDir).filter(name => name.startsWith(prefix));
  let activeBytes = 0;
  let oldCatalogs = 0;
  let tempArtifacts = 0;
  for (const name of names) {
    if (name.includes('.next-') || name.endsWith('.tmp')) { tempArtifacts += 1; continue; }
    if (!name.endsWith('.json')) continue;
    if (name === activeName) {
      try { activeBytes = Number((await stat(path.join(cacheDir, name))).size || 0); } catch {}
    } else oldCatalogs += 1;
  }
  return { activeCatalogs: existsSync(catalogPathFor(story)) ? 1 : 0, oldCatalogs, tempArtifacts, activeBytes };
}
async function cleanupOldCatalogsAfterActivation(story) {
  await mkdir(cacheDir, { recursive: true });
  const prefix = safeStoryCachePrefix(story);
  const activeName = path.basename(catalogPathFor(story));
  for (const name of readdirSync(cacheDir)) {
    if (!name.startsWith(prefix)) continue;
    const full = path.join(cacheDir, name);
    if (name === activeName) continue;
    if (name.endsWith('.json') || name.includes('.next-') || name.endsWith('.tmp')) {
      try { await unlink(full); } catch {}
    }
  }
  for (const key of [...catalogMemory.keys()]) {
    if (key.startsWith(`${story.id}:`) && key !== catalogKey(story)) catalogMemory.delete(key);
  }
}
async function saveCatalog(story, catalog) {
  await mkdir(cacheDir, { recursive: true });
  const finalPath = catalogPathFor(story);
  const tempPath = `${finalPath}.next-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const text = JSON.stringify(catalog);
  // Build the next generation separately. The currently active catalog remains untouched until this is complete.
  await writeFile(tempPath, text, 'utf8');
  const verified = JSON.parse(await readFile(tempPath, 'utf8'));
  if (verified?.storyId !== story.id || verified?.sourceVersion !== story.sourceVersion || !verified?.nodes?.[story.folderId]) {
    try { await unlink(tempPath); } catch {}
    throw new Error('The new catalog generation failed verification. The previous active catalog was kept.');
  }
  // Activate only after the new generation is complete and verified.
  await writeFile(finalPath, text, 'utf8');
  catalogMemory.set(catalogKey(story), verified);
  try { await unlink(tempPath); } catch {}
  // User requirement: immediately remove older catalog generations after the new one becomes active.
  await cleanupOldCatalogsAfterActivation(story);
}
function nodeFromPayload(payload, fallbackName = 'Folder') {
  return {
    name: String(payload.folder?.name || fallbackName || 'Folder'),
    folders: (Array.isArray(payload.folders) ? payload.folders : []).map(item => ({ id: String(item.id || ''), name: String(item.name || 'Folder') })).filter(item => item.id),
    tracks: (Array.isArray(payload.tracks) ? payload.tracks : []).map(item => ({
      id: String(item.id || ''),
      name: String(item.name || 'Audio'),
      mimeType: String(item.mimeType || ''),
      size: Number(item.size || 0),
      modifiedAt: String(item.modifiedAt || '')
    })).filter(item => item.id),
    truncated: Boolean(payload.truncated)
  };
}
function catalogSummary(catalog) {
  if (!catalog) return { status: 'not-built', folderCount: 0, trackCount: 0, builtAt: '' };
  const nodes = Object.values(catalog.nodes || {});
  return {
    status: 'ready',
    folderCount: nodes.length,
    trackCount: nodes.reduce((n, node) => n + (Array.isArray(node.tracks) ? node.tracks.length : 0), 0),
    builtAt: String(catalog.builtAt || '')
  };
}
function currentCatalogState(story) {
  const build = catalogBuilds.get(catalogKey(story));
  if (!build) return null;
  return {
    status: build.status,
    folderCount: build.folderCount || 0,
    trackCount: build.trackCount || 0,
    startedAt: build.startedAt || '',
    error: build.error || '',
    reason: build.reason || 'background',
    completedAt: build.completedAt || ''
  };
}
function createLimiter(limit) {
  let active = 0;
  const waiting = [];
  const runNext = () => {
    if (active >= limit || !waiting.length) return;
    active += 1;
    const { task, resolve, reject } = waiting.shift();
    Promise.resolve().then(task).then(resolve, reject).finally(() => { active -= 1; runNext(); });
  };
  return task => new Promise((resolve, reject) => { waiting.push({ task, resolve, reject }); runNext(); });
}
function ensureCatalogBuild(story, { force = false, seedRoot = null } = {}) {
  const key = catalogKey(story);
  const existing = catalogBuilds.get(key);
  if (existing?.promise && existing.status === 'preparing') return existing.promise;

  const state = { status: 'preparing', startedAt: new Date().toISOString(), completedAt: '', reason: 'background', folderCount: 0, trackCount: 0, error: '', nodes: {}, promise: null };
  const limit = createLimiter(CATALOG_CONCURRENCY);
  const seen = new Set();

  const work = (async () => {
    try {
      let scanned = 0;
      async function walk(folderId, name, depth, seedPayload = null) {
        if (!folderId || seen.has(folderId) || depth > CATALOG_MAX_DEPTH || scanned >= CATALOG_MAX_FOLDERS) return;
        seen.add(folderId);
        scanned += 1;
        const payload = seedPayload || await limit(() => callResolver(folderId, { bypassCache: force }));
        const node = nodeFromPayload(payload, name);
        state.nodes[folderId] = node;
        state.folderCount = Object.keys(state.nodes).length;
        state.trackCount = Object.values(state.nodes).reduce((n, item) => n + item.tracks.length, 0);
        await Promise.all(node.folders.map(child => walk(child.id, child.name, depth + 1)));
      }
      await walk(story.folderId, story.title, 0, seedRoot);
      const catalog = {
        version: 1,
        storyId: story.id,
        sourceVersion: story.sourceVersion,
        rootFolderId: story.folderId,
        builtAt: new Date().toISOString(),
        generationId: `g_${Date.now()}_${randomBytes(4).toString('hex')}`,
        nodes: state.nodes
      };
      await saveCatalog(story, catalog);
      state.status = 'ready';
      state.completedAt = new Date().toISOString();
      return catalog;
    } catch (error) {
      state.status = 'error';
      state.completedAt = new Date().toISOString();
      state.error = error.message || String(error);
      throw error;
    }
  })();
  state.promise = work;
  catalogBuilds.set(key, state);
  work.catch(() => {});
  return work;
}

async function readJsonBody(req, maxBytes = 65536) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Invalid JSON request body.'); }
}

async function startStorySync(story, { force = false, reason = 'background' } = {}) {
  const current = await loadCatalog(story);
  if (current && !force) {
    await cleanupOldCatalogsAfterActivation(story);
    return { started: false, catalog: current, status: 'ready' };
  }
  const key = catalogKey(story);
  const existing = catalogBuilds.get(key);
  if (existing?.status === 'preparing' && existing?.promise) return { started: false, promise: existing.promise, status: 'preparing' };
  const promise = ensureCatalogBuild(story, { force });
  const state = catalogBuilds.get(key);
  if (state) state.reason = reason;
  promise.catch(() => {});
  return { started: true, promise, status: 'preparing' };
}

async function syncSnapshot(story) {
  const catalog = await loadCatalog(story);
  const build = currentCatalogState(story);
  const storage = await catalogStorageStats(story);
  return {
    catalog: catalogSummary(catalog),
    sync: build || { status: catalog ? 'idle' : 'waiting', folderCount: 0, trackCount: 0, startedAt: '', completedAt: '', reason: '', error: '' },
    storage,
    metadataCalls
  };
}

function safeListingFromNode(node, story, { catalogHit = false, cacheHit = false, coalesced = false } = {}) {
  const folders = Array.isArray(node?.folders) ? node.folders : [];
  const tracks = Array.isArray(node?.tracks) ? node.tracks : [];
  // v3.8.1: customer listings use the already-loaded active catalog from the
  // in-memory catalog cache. v3.8 accidentally referenced a removed
  // `activeCatalogs` map, which caused `activeCatalogs is not defined`.
  const activeCatalog = catalogMemory.get(catalogKey(story)) || null;
  const ordered = activeCatalog ? orderedCatalogTracks(activeCatalog, story) : [];
  const neighborById = new Map();
  for (let i = 0; i < ordered.length; i += 1) {
    const current = ordered[i];
    const prev = ordered[i - 1] || null;
    const next = ordered[i + 1] || null;
    neighborById.set(String(current.id || ''), {
      previous: prev ? { key: prev.key, name: String(prev.name || 'Previous episode') } : null,
      next: next ? { key: next.key, name: String(next.name || 'Next episode') } : null
    });
  }
  return {
    ok: true,
    story: { id: story.id, title: story.title, description: story.description, genre: story.genre, status: story.status, cover: story.cover, sourceVersion: story.sourceVersion },
    folder: { name: String(node?.name || story.title || 'Story') },
    items: [
      ...folders.map(item => ({
        token: opaqueToken({ kind: 'folder', id: String(item.id || ''), storyId: story.id, sourceVersion: story.sourceVersion }),
        type: 'folder',
        name: String(item.name || 'Folder')
      })),
      ...tracks.map(item => {
        const key = publicTrackKey(story, String(item.id || ''));
        const neighbors = neighborById.get(String(item.id || '')) || { previous: null, next: null };
        return {
          token: opaqueToken({ kind: 'track', id: String(item.id || ''), trackKey: key, storyId: story.id, sourceVersion: story.sourceVersion, name: String(item.name || ''), mimeType: String(item.mimeType || ''), size: Number(item.size || 0) }),
          trackKey: key,
          type: 'track',
          name: String(item.name || 'Audio'),
          mimeType: String(item.mimeType || ''),
          size: Number(item.size || 0),
          modifiedAt: String(item.modifiedAt || ''),
          previous: neighbors.previous,
          next: neighbors.next
        };
      })
    ],
    truncated: Boolean(node?.truncated),
    catalogHit,
    cacheHit,
    coalesced,
    metadataCalls
  };
}

function safeListing(payload, story, parentName) {
  return safeListingFromNode(nodeFromPayload(payload, parentName), story, {
    cacheHit: Boolean(payload.cacheHit),
    coalesced: Boolean(payload.coalesced)
  });
}

async function readLocalStoryCover(storyId) {
  const { db } = locateD1();
  try {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='story_covers'").get();
    if (!table) return null;
    const row = db.prepare('SELECT mime_type,image_data,size_bytes,updated_at FROM story_covers WHERE story_id=? LIMIT 1').get(String(storyId || ''));
    if (!row || !row.image_data) return null;
    const bytes = Buffer.isBuffer(row.image_data) ? row.image_data : Buffer.from(row.image_data);
    return { bytes, mimeType: String(row.mime_type || 'image/webp'), updatedAt: String(row.updated_at || ''), size: Number(row.size_bytes || bytes.length) };
  } finally { db.close(); }
}

async function handleLocalStoryCover(req, res, storyId) {
  try {
    const cover = await readLocalStoryCover(storyId);
    if (!cover) return send404(res);
    res.writeHead(200, {
      'content-type': cover.mimeType,
      'cache-control': 'private, max-age=3600',
      'content-length': cover.bytes.length
    });
    res.end(cover.bytes);
  } catch { send404(res); }
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/status' && req.method === 'GET') {
    const config = await loadConfig();
    let dbReady = false;
    let dbError = '';
    try { const found = locateD1(); found.db.close(); dbReady = true; } catch (error) { dbError = error.message; }
    let site = { name: 'OX Novels', accent: '#13c3b3', logo: '' };
    try { site = readSiteShell(); } catch {}
    return json(res, 200, {
      ok: true,
      resolverConfigured: Boolean(config.resolverUrl && config.resolverSecret),
      localD1Ready: dbReady,
      localD1Error: dbError,
      defaultStoryId: config.defaultStoryId,
      audioRequests,
      metadataCalls,
      site
    });
  }

  if (url.pathname === '/api/site-shell' && req.method === 'GET') {
    try { return json(res, 200, { ok: true, site: readSiteShell() }); }
    catch (error) { return json(res, 500, { ok: false, error: error.message }); }
  }

  if (url.pathname === '/api/story' && req.method === 'GET') {
    const config = await loadConfig();
    const storyId = String(url.searchParams.get('storyId') || config.defaultStoryId || '').trim();
    try {
      const story = readStory(storyId);
      return json(res, 200, { ok: true, story: { id: story.id, title: story.title, description: story.description, genre: story.genre, status: story.status, cover: story.cover, visible: story.visible, hasDriveSource: story.hasDriveSource, sourceVersion: story.sourceVersion } });
    } catch (error) {
      return json(res, 404, { ok: false, error: error.message });
    }
  }

  if (url.pathname === '/api/catalog/status' && req.method === 'GET') {
    const config = await loadConfig();
    const storyId = String(url.searchParams.get('storyId') || config.defaultStoryId || '').trim();
    try {
      const story = readStory(storyId);
      const snapshot = await syncSnapshot(story);
      return json(res, 200, { ok: true, ...snapshot });
    } catch (error) { return json(res, 500, { ok: false, error: error.message }); }
  }

  if (url.pathname === '/api/sync/story' && req.method === 'POST') {
    try {
      const config = await loadConfig();
      const body = await readJsonBody(req);
      const storyId = String(body.storyId || config.defaultStoryId || '').trim();
      const story = readStory(storyId);
      if (!story.folderId) return json(res, 409, { ok: false, error: 'This story currently has no valid Google Drive folder source.' });
      const result = await startStorySync(story, { force: body.force !== false, reason: String(body.reason || 'manual-local-sync') });
      const snapshot = await syncSnapshot(story);
      return json(res, 202, { ok: true, started: result.started, ...snapshot });
    } catch (error) {
      if (error.code === 'SETUP_REQUIRED') return json(res, 503, { ok: false, setupRequired: true, error: error.message });
      return json(res, 500, { ok: false, error: error.message });
    }
  }

  if (url.pathname === '/api/sync/status' && req.method === 'GET') {
    const config = await loadConfig();
    const storyId = String(url.searchParams.get('storyId') || config.defaultStoryId || '').trim();
    try {
      const story = readStory(storyId);
      return json(res, 200, { ok: true, ...(await syncSnapshot(story)) });
    } catch (error) { return json(res, 500, { ok: false, error: error.message }); }
  }

  if (url.pathname === '/api/audio/root' && req.method === 'GET') {
    const config = await loadConfig();
    const storyId = String(url.searchParams.get('storyId') || config.defaultStoryId || '').trim();
    try {
      const story = readStory(storyId);
      if (!story.folderId) return json(res, 409, { ok: false, error: 'This story currently has no valid Google Drive folder source.' });
      const catalog = await loadCatalog(story);
      const node = catalog?.nodes?.[story.folderId];
      if (!node) {
        const build = currentCatalogState(story);
        return json(res, 503, {
          ok: false,
          catalogPreparing: build?.status === 'preparing',
          catalog: build || catalogSummary(catalog),
          metadataCalls,
          error: build?.status === 'preparing'
            ? 'This story catalog is being prepared in the background. Customer navigation is not scanning Google Drive.'
            : 'This story catalog is not prepared yet. Start the background sync first.'
        });
      }
      const listing = safeListingFromNode(node, story, { catalogHit: true });
      listing.catalog = catalogSummary(catalog);
      listing.sync = currentCatalogState(story) || { status: 'idle' };
      listing.storage = await catalogStorageStats(story);
      return json(res, 200, listing);
    } catch (error) {
      return json(res, 500, { ok: false, error: error.message });
    }
  }

  if (url.pathname === '/api/audio/folder' && req.method === 'GET') {
    const token = String(url.searchParams.get('token') || '');
    const meta = tokenMap.get(token);
    if (!meta || meta.kind !== 'folder') return json(res, 404, { ok: false, error: 'Folder token is invalid or expired. Return to the story root and open it again.' });
    try {
      const story = readStory(meta.storyId);
      if (story.sourceVersion !== meta.sourceVersion) return json(res, 409, { ok: false, sourceChanged: true, error: 'This story Drive source changed. The updated background catalog must become ready first.' });
      const catalog = await loadCatalog(story);
      const node = catalog?.nodes?.[meta.id];
      if (!node) return json(res, 409, { ok: false, error: 'This folder is not present in the active catalog. Wait for the next background synchronization.' });
      const listing = safeListingFromNode(node, story, { catalogHit: true });
      listing.catalog = catalogSummary(catalog);
      listing.sync = currentCatalogState(story) || { status: 'idle' };
      listing.storage = await catalogStorageStats(story);
      return json(res, 200, listing);
    } catch (error) { return json(res, 500, { ok: false, error: error.message }); }
  }

  if (url.pathname === '/api/playback/ticket' && req.method === 'POST') {
    return json(res, 410, { ok: false, error: 'v3.8 no longer creates a separate playback ticket. Authorization and streaming share one request.' });
  }


  if (url.pathname === '/api/debug/playback-metrics' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      logicalTrackStarts: audioRequests,
      streamRequests,
      rangeRequests,
      fullRequests: Math.max(0, streamRequests - rangeRequests),
      activeStreams,
      peakStreams,
      metadataCalls
    });
  }

  if (url.pathname === '/api/audio/track' && req.method === 'GET') {
    const token = String(url.searchParams.get('token') || '');
    const meta = tokenMap.get(token);
    if (!meta || meta.kind !== 'track') return json(res, 404, { ok: false, error: 'Track token is invalid or expired.' });
    try {
      const story = readStory(meta.storyId);
      if (story.sourceVersion !== meta.sourceVersion) return json(res, 409, { ok: false, sourceChanged: true, error: 'This story Drive source changed. Refresh the story contents first.' });
      return json(res, 200, {
        ok: true,
        phase: 'metadata-only',
        track: { name: meta.name },
        message: 'Track discovered successfully. Playback is intentionally disabled in this phase so no Drive file URL or audio bytes are exposed.'
      });
    } catch (error) {
      return json(res, 500, { ok: false, error: error.message });
    }
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const coverMatch = url.pathname.match(/^\/api\/local-story-cover\/([^/]+)$/);
    if (coverMatch && req.method === 'GET') return handleLocalStoryCover(req, res, decodeURIComponent(coverMatch[1]));
    const mediaMatch = url.pathname.match(/^\/api\/local-site-media\/([^/]+)$/);
    if (mediaMatch && req.method === 'GET') return handleLocalMedia(req, res, decodeURIComponent(mediaMatch[1]));
    if (url.pathname === '/api/playback/stream' && (req.method === 'GET' || req.method === 'HEAD')) return handlePlaybackStream(req, res, url);
    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url);
      if (handled !== false) return;
    }

    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.resolve(root, rel);
    const privatePaths = [`${path.sep}config${path.sep}`, `${path.sep}cache${path.sep}`];
    if ((!file.startsWith(root + path.sep) && file !== root) || privatePaths.some(segment => file.includes(segment))) return send404(res);
    const info = await stat(file);
    if (!info.isFile()) return send404(res);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'no-store',
      'content-length': info.size
    });
    createReadStream(file).pipe(res);
  } catch {
    send404(res);
  }
});

server.listen(port, '127.0.0.1', async () => {
  const config = await loadConfig();
  console.log(`OX Free Direct-Drive Playback Lab v3.6: http://127.0.0.1:${port}`);
  console.log('Production OX files: untouched');
  console.log('Audio playback: SINGLE-REQUEST SAME-ORIGIN STREAM TEST (local only)');
  console.log('Goal: one normal inbound Worker stream request per episode start; no separate playback-ticket request');
  console.log('Customer navigation: active catalog only; never scans Drive');
  console.log('Catalog cleanup: old generations removed immediately after successful activation');
  console.log(`Resolver configured: ${Boolean(config.resolverUrl && config.resolverSecret) ? 'YES' : 'NO - run setup-resolver.mjs first'}`);

  if (!startupSyncStarted) {
    startupSyncStarted = true;
    setTimeout(async () => {
      try {
        const story = readStory(config.defaultStoryId);
        const catalog = await loadCatalog(story);
        if (catalog) {
          await cleanupOldCatalogsAfterActivation(story);
          const storage = await catalogStorageStats(story);
          console.log(`Background sync: current catalog already ready (${catalogSummary(catalog).trackCount} tracks; old=${storage.oldCatalogs}; temp=${storage.tempArtifacts})`);
        } else if (story.folderId && config.resolverUrl && config.resolverSecret) {
          console.log('Background sync: no current catalog found; preparing it without waiting for a customer click...');
          const started = await startStorySync(story, { force: false, reason: 'server-startup' });
          started.promise?.then(async catalogReady => {
            const storage = await catalogStorageStats(story);
            console.log(`Background sync complete: ${catalogSummary(catalogReady).trackCount} tracks; old=${storage.oldCatalogs}; temp=${storage.tempArtifacts}`);
          }).catch(error => console.error('Background sync failed; no active catalog was replaced:', error.message));
        }
      } catch (error) {
        console.error('Background sync startup check failed:', error.message);
      }
    }, 250);
  }
});
