import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const oxRoot = path.resolve(here, '..');
const b6Root = path.join(oxRoot, 'local-player-b6');
const b6Scripts = path.join(b6Root, 'scripts');
const commonPath = path.join(b6Scripts, 'common.mjs');
const syncScript = path.join(b6Scripts, 'sync-story.mjs');
const reportsDir = path.join(b6Root, 'reports');
const htmlPath = path.join(here, 'ui.html');
const playerBase = 'https://listen.ox-audio-player.workers.dev';

if (!fs.existsSync(commonPath) || !fs.existsSync(syncScript)) {
  throw new Error('B8 requires the existing local-player-b6 folder beside this folder.');
}

const common = await import(pathToFileURL(commonPath).href);
const {
  currentStories,
  currentStory,
  loadPublishedManifest,
  savePublishedManifest,
  loadResolverConfig,
  catalogPathFor,
  verifyCatalog,
  b5CatalogDir,
  safeStoryId
} = common;

fs.mkdirSync(reportsDir, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => new Date().toISOString();

function preparedCurrent(story) {
  try {
    const p = catalogPathFor(story);
    if (!fs.existsSync(p)) return false;
    return Boolean(verifyCatalog(story, JSON.parse(fs.readFileSync(p, 'utf8'))));
  } catch {
    return false;
  }
}

function computeState() {
  const source = currentStories();
  const published = loadPublishedManifest().catalogs || [];
  const byPub = new Map(published.map(p => [String(p.storyId), p]));
  const byCurrent = new Map(source.stories.map(s => [s.id, s]));
  const rows = [];

  for (const s of source.stories) {
    const p = byPub.get(s.id);
    const prepared = preparedCurrent(s);
    let status = 'MISSING_CATALOG';
    if (!s.visible) status = 'HIDDEN';
    else if (!s.hasDriveSource) status = 'NO_DRIVE_SOURCE';
    else if (p && String(p.sourceVersion) === String(s.sourceVersion)) status = 'PUBLISHED_CURRENT';
    else if (prepared) status = 'PREPARED_NOT_PUBLISHED';
    else if (p && String(p.sourceVersion) !== String(s.sourceVersion)) status = 'SOURCE_CHANGED';

    rows.push({
      storyId: s.id,
      title: s.title,
      visible: s.visible,
      status,
      prepared,
      currentSourceVersion: s.sourceVersion,
      publishedSourceVersion: p?.sourceVersion || '',
      generation: p?.generationId || '',
      trackCount: Number(p?.trackCount || 0),
      folderId: s.folderId || ''
    });
  }

  for (const p of published) {
    const id = String(p.storyId);
    if (!byCurrent.has(id)) {
      rows.push({
        storyId: id, title: '', visible: false, status: 'ORPHANED_PUBLISHED',
        prepared: false, currentSourceVersion: '', publishedSourceVersion: String(p.sourceVersion || ''),
        generation: String(p.generationId || ''), trackCount: Number(p.trackCount || 0), folderId: ''
      });
    }
  }

  rows.sort((a, b) => (a.title || a.storyId).localeCompare(b.title || b.storyId));
  const counts = {};
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;

  return {
    generatedAt: now(),
    storySource: source.source,
    currentStories: source.stories.length,
    publishedCatalogs: published.length,
    counts,
    rows
  };
}

function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function appendFailure(entry) {
  const file = path.join(reportsDir, 'b8-failure-history.jsonl');
  fs.appendFileSync(file, JSON.stringify({ ...entry, recordedAt: now() }) + '\n');
}

function shortFailure(text) {
  const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const useful = lines.filter(x => !x.startsWith('Node.js v') && !x.startsWith('at ') && x !== '^');
  const chosen =
    useful.find(x => /^Error:/i.test(x)) ||
    useful.find(x => /resolver|failed|error|unable|permission|not found|non-json|timeout|429|quota/i.test(x)) ||
    useful[useful.length - 1] ||
    'Unknown failure';
  return chosen.slice(0, 1200);
}

function runSyncOnce(storyId, onLine) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [syncScript, storyId], {
      cwd: b6Root,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const keep = chunk => {
      const s = chunk.toString();
      output += s;
      if (output.length > 160000) output = output.slice(-160000);
      for (const line of s.split(/\r?\n/)) if (line.trim()) onLine(line.trim());
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('error', err => resolve({ ok: false, exitCode: null, error: String(err?.message || err), output }));
    child.on('close', code => resolve({
      ok: code === 0,
      exitCode: code,
      error: code === 0 ? '' : shortFailure(output),
      output
    }));
  });
}

async function runSyncWithRetry(story, onLine, maxAttempts = 3) {
  const waits = [2000, 5000, 10000];
  let last = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    onLine(`Attempt ${attempt}/${maxAttempts}: ${story.storyId || story.id} — ${story.title || ''}`);
    const run = await runSyncOnce(story.storyId || story.id, onLine);
    if (run.ok) {
      onLine(`SUCCESS: ${story.storyId || story.id}`);
      return { ok: true, attempts: attempt, exitCode: run.exitCode, error: null };
    }
    last = run;
    appendFailure({
      storyId: story.storyId || story.id,
      title: story.title || '',
      attempt,
      error: run.error
    });
    onLine(`Attempt ${attempt} failed: ${run.error}`);
    if (attempt < maxAttempts) {
      const delay = waits[attempt - 1] || 10000;
      onLine(`Waiting ${Math.round(delay / 1000)}s before retry...`);
      await sleep(delay);
    }
  }
  return { ok: false, attempts: maxAttempts, exitCode: last?.exitCode ?? null, error: last?.error || 'Unknown failure' };
}

async function checkDrive(storyId) {
  const story = currentStory(storyId);
  if (!story.folderId) return { ok: false, error: 'Story has no Drive folder source.' };
  const cfg = loadResolverConfig();
  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch(cfg.resolverUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: cfg.resolverSecret, mode: 'list_children', folderId: story.folderId })
      });
      const text = await r.text();
      let p;
      try { p = JSON.parse(text); } catch { throw new Error('Resolver returned non-JSON response.'); }
      if (!r.ok || p?.ok !== true) throw new Error(String(p?.error || `Resolver failed (${r.status})`));
      return {
        ok: true,
        storyId,
        title: story.title,
        rootFolders: Array.isArray(p.folders) ? p.folders.length : 0,
        rootTracks: Array.isArray(p.tracks) ? p.tracks.length : 0
      };
    } catch (e) {
      lastError = String(e?.message || e);
      if (attempt < 2) await sleep(1500);
    }
  }
  return { ok: false, storyId, title: story.title, error: lastError };
}

let job = {
  active: false,
  type: '',
  startedAt: '',
  finishedAt: '',
  total: 0,
  completed: 0,
  succeeded: 0,
  failed: 0,
  currentStoryId: '',
  currentTitle: '',
  logs: [],
  results: [],
  cancelRequested: false
};

function resetJob(type, total = 0) {
  job = {
    active: true,
    type,
    startedAt: now(),
    finishedAt: '',
    total,
    completed: 0,
    succeeded: 0,
    failed: 0,
    currentStoryId: '',
    currentTitle: '',
    logs: [],
    results: [],
    cancelRequested: false
  };
  saveJob();
}
function logJob(line) {
  job.logs.push(`[${new Date().toLocaleTimeString()}] ${line}`);
  if (job.logs.length > 500) job.logs = job.logs.slice(-500);
  saveJob();
}
function saveJob() {
  writeJsonAtomic(path.join(reportsDir, 'b8-last-job.json'), job);
}
function finishJob() {
  job.active = false;
  job.finishedAt = now();
  job.currentStoryId = '';
  job.currentTitle = '';
  saveJob();
}

async function startPrepareOne(storyId) {
  if (job.active) throw new Error('Another B8 job is already running.');
  const story = currentStory(storyId);
  resetJob('prepare-one', 1);
  queueMicrotask(async () => {
    try {
      job.currentStoryId = story.id; job.currentTitle = story.title; saveJob();
      logJob(`Preparing ${story.id} — ${story.title}`);
      const r = await runSyncWithRetry(story, logJob, 3);
      job.completed = 1;
      if (r.ok) job.succeeded = 1; else job.failed = 1;
      job.results.push({ storyId: story.id, title: story.title, ...r, completedAt: now() });
      logJob(r.ok ? 'Preparation finished successfully.' : `Preparation failed after retries: ${r.error}`);
    } catch (e) {
      job.failed = 1; job.completed = 1;
      job.results.push({ storyId, ok: false, error: String(e?.message || e), completedAt: now() });
      logJob(`ERROR: ${e?.message || e}`);
    } finally { finishJob(); }
  });
}

async function startPrepareAll() {
  if (job.active) throw new Error('Another B8 job is already running.');
  const state = computeState();
  const targets = state.rows.filter(r => ['MISSING_CATALOG', 'SOURCE_CHANGED'].includes(r.status));
  resetJob('prepare-all-missing-changed', targets.length);
  queueMicrotask(async () => {
    try {
      if (!targets.length) {
        logJob('No missing or source-changed catalogs need preparation.');
        return;
      }
      logJob(`Preparing ${targets.length} catalog(s). Each story gets up to 3 attempts with backoff.`);
      for (let i = 0; i < targets.length; i++) {
        if (job.cancelRequested) { logJob('Cancel requested. Stopping before the next story.'); break; }
        const s = targets[i];
        job.currentStoryId = s.storyId; job.currentTitle = s.title; saveJob();
        logJob(`[${i + 1}/${targets.length}] ${s.storyId} — ${s.title}`);
        const r = await runSyncWithRetry(s, logJob, 3);
        job.completed++;
        if (r.ok) job.succeeded++; else job.failed++;
        job.results.push({ storyId: s.storyId, title: s.title, ...r, completedAt: now() });
        saveJob();
      }
      logJob(`Finished: ${job.succeeded} succeeded, ${job.failed} failed.`);
    } catch (e) {
      logJob(`ERROR: ${e?.message || e}`);
    } finally { finishJob(); }
  });
}

function removeOrphan(storyId, confirmation) {
  if (confirmation !== `REMOVE ${storyId}`) throw new Error('Removal confirmation did not match.');
  const m = loadPublishedManifest();
  const before = (m.catalogs || []).length;
  const exists = (m.catalogs || []).some(x => String(x.storyId) === storyId);
  if (!exists) throw new Error('Published catalog was not found.');
  const currentIds = new Set(currentStories().stories.map(s => s.id));
  if (currentIds.has(storyId)) throw new Error('This story still exists in OX. Only true orphans can be removed here.');
  m.catalogs = (m.catalogs || []).filter(x => String(x.storyId) !== storyId);
  savePublishedManifest(m);
  fs.rmSync(path.join(b5CatalogDir, `${safeStoryId(storyId)}.json`), { force: true });
  return { ok: true, removed: before - m.catalogs.length };
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}
function text(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store'
  });
  res.end(body);
}
async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('Request body too large.');
  }
  if (!raw) return {};
  return JSON.parse(raw);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:8792');
    if (req.method === 'GET' && url.pathname === '/') {
      return text(res, 200, fs.readFileSync(htmlPath, 'utf8'), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, computeState());
    if (req.method === 'GET' && url.pathname === '/api/job') return json(res, 200, job);
    if (req.method === 'GET' && url.pathname === '/api/failure-history') {
      const file = path.join(reportsDir, 'b8-failure-history.jsonl');
      const rows = fs.existsSync(file)
        ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).slice(-200).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean)
        : [];
      return json(res, 200, { rows });
    }
    if (req.method === 'GET' && url.pathname === '/api/publish-info') {
      return json(res, 200, {
        command: 'local-player-b6\\BUILD-AND-DEPLOY-CURRENT-PLAYER.bat',
        note: 'B8.1 keeps deployment manual. Prepare/reconcile here, then run the existing B6 build/deploy BAT when you approve publication.'
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/prepare-one') {
      const body = await readBody(req);
      await startPrepareOne(String(body.storyId || '').trim());
      return json(res, 202, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/prepare-all') {
      await startPrepareAll();
      return json(res, 202, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/check-drive') {
      const body = await readBody(req);
      return json(res, 200, await checkDrive(String(body.storyId || '').trim()));
    }
    if (req.method === 'POST' && url.pathname === '/api/remove-orphan') {
      const body = await readBody(req);
      return json(res, 200, removeOrphan(String(body.storyId || '').trim(), String(body.confirmation || '')));
    }
    if (req.method === 'POST' && url.pathname === '/api/cancel') {
      if (!job.active) return json(res, 200, { ok: true, active: false });
      job.cancelRequested = true; saveJob();
      return json(res, 200, { ok: true, active: true });
    }

    return json(res, 404, { error: 'Not found.' });
  } catch (e) {
    return json(res, 500, { error: String(e?.message || e) });
  }
});

server.listen(8792, '127.0.0.1', () => {
  console.log('============================================================');
  console.log(' OX PLAYER CATALOG MANAGER — B8.1');
  console.log('============================================================');
  console.log(' Local dashboard: http://127.0.0.1:8792');
  console.log(' Bound to localhost only.');
  console.log(' No production OX code is modified by this manager.');
  console.log(' Press Ctrl+C to stop.');
});
