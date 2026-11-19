import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { readDevVars } from './dev-vars.mjs';

function extractFolderIds(text = '') {
  const ids = [];
  const seen = new Set();
  for (const token of String(text).split(/[\s,;]+/).filter(Boolean)) {
    let m = token.match(/(?:drive\/folders|folders)\/([A-Za-z0-9_-]{10,})/);
    if (!m) m = token.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
    const id = m?.[1] || (/^[A-Za-z0-9_-]{10,}$/.test(token) ? token : '');
    if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
  }
  return ids;
}

function collectMultilineInput() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    const lines = [];
    let finished = false;
    const finish = () => { if (finished) return; finished = true; rl.close(); resolve(lines.join('\n')); };
    rl.on('line', (line) => {
      const text = String(line ?? '').trim();
      if (!text) { if (lines.length) finish(); return; }
      if (/^done$/i.test(text)) { finish(); return; }
      lines.push(text);
    });
    rl.on('close', () => { if (!finished) { finished = true; resolve(lines.join('\n')); } });
  });
}

async function fetchPost(endpoint, body) {
  const started = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'content-type': 'application/json', accept: 'application/json,text/plain,*/*' },
      body: JSON.stringify(body || {})
    });
    const text = await response.text();
    const elapsedMs = Date.now() - started;
    let payload;
    try { payload = JSON.parse(text); }
    catch { throw new Error(`non-JSON response: ${text.replace(/\s+/g, ' ').slice(0, 180)}`); }
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `HTTP ${response.status}`);
    return { ok: true, payload, elapsedMs };
  } catch (error) {
    const cause = error?.cause;
    const detail = cause ? `${cause.code || cause.name || 'cause'}: ${cause.message || cause}` : '';
    return { ok: false, error: `${error?.message || error}${detail ? ` | ${detail}` : ''}`, elapsedMs: Date.now() - started };
  }
}

async function fetchPostRetry(endpoint, body, attempts = 3) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await fetchPost(endpoint, body);
    if (result.ok) return result;
    last = result;
  }
  return last || { ok: false, error: 'Apps Script request failed after retries.', elapsedMs: 0 };
}

async function scanOneChunked(endpoint, secret, id, onChunk) {
  const started = Date.now();
  const nodes = new Map();
  const visited = new Set();
  const errors = [];
  let pending;
  let chunks = 0;
  let traversalElapsedMs = 0;

  while (true) {
    const body = { key: secret, mode: 'folder_chunk', rootFolderId: id, maxFolders: 220 };
    if (pending !== undefined) body.pending = pending;
    const result = await fetchPostRetry(endpoint, body, 3);
    if (!result.ok) return { ok: false, error: result.error, elapsedMs: Date.now() - started, chunks };
    const p = result.payload || {};
    chunks++;
    traversalElapsedMs += Number(p.elapsedMs || 0);

    for (const node of Array.isArray(p.nodes) ? p.nodes : []) {
      const nid = String(node?.id || '').trim();
      if (!nid) continue;
      nodes.set(nid, {
        id: nid,
        name: String(node?.name || '').trim(),
        parentId: String(node?.parentId || '').trim(),
        depth: Math.max(0, Number(node?.depth || 0)),
        ownerEmail: String(node?.ownerEmail || '').trim()
      });
    }
    for (const pid of Array.isArray(p.processedIds) ? p.processedIds : []) {
      const nid = String(pid || '').trim();
      if (nid) visited.add(nid);
    }
    if (Array.isArray(p.errors)) errors.push(...p.errors);

    const next = [];
    const queued = new Set();
    for (const item of Array.isArray(p.nextPending) ? p.nextPending : []) {
      const nid = String(item?.id || item || '').trim();
      if (!nid || visited.has(nid) || queued.has(nid)) continue;
      queued.add(nid);
      next.push({ id: nid, parentId: String(item?.parentId || '').trim(), depth: Math.max(0, Number(item?.depth || 0)) });
    }

    if (typeof onChunk === 'function') onChunk({ chunks, folders: nodes.size, pending: next.length, elapsedMs: result.elapsedMs });
    if (p.done || next.length === 0) break;
    if (chunks >= 200) return { ok: false, error: '200-chunk safety limit reached', elapsedMs: Date.now() - started, chunks };
    pending = next;
  }

  if (!nodes.has(id)) return { ok: false, error: 'Root folder was not returned by chunked discovery.', elapsedMs: Date.now() - started, chunks };
  const classified = await fetchPostRetry(endpoint, { key: secret, mode: 'classify_tree', rootFolderId: id, nodes: [...nodes.values()] }, 3);
  if (!classified.ok) return { ok: false, error: classified.error, elapsedMs: Date.now() - started, chunks };
  const payload = classified.payload || {};
  payload.scannedFolders = nodes.size;
  payload.indexedFolders = nodes.size;
  payload.traversalChunks = chunks;
  payload.traversalElapsedMs = traversalElapsedMs;
  payload.classificationElapsedMs = Number(payload.elapsedMs || 0);
  payload.elapsedMs = Date.now() - started;
  payload.folderChunkErrors = errors;
  payload.incompleteSearch = errors.length > 0;
  if (Array.isArray(payload.rootResults) && payload.rootResults[0]) {
    payload.rootResults[0].foldersDiscovered = nodes.size;
    payload.rootResults[0].traversalChunks = chunks;
    payload.rootResults[0].folderReadErrors = errors.length;
    payload.rootResults[0].elapsedMs = payload.elapsedMs;
  }
  return { ok: true, payload, elapsedMs: payload.elapsedMs, chunks };
}

try {
  const vars = readDevVars();
  const endpoint = String(vars.get('GOOGLE_APPS_SCRIPT_URL') || '').trim();
  const secret = String(vars.get('GOOGLE_APPS_SCRIPT_SECRET') || '').trim();
  if (!endpoint || !secret) throw new Error('Drive scanner is not configured. Run SETUP-GOOGLE-DRIVE.bat first.');

  console.log('Paste ONE or MANY Drive folder links/IDs.');
  console.log('You may paste ALL links at once, including a multi-line clipboard paste.');
  console.log('After the final link, press Enter on an empty line. You can also type DONE.');
  output.write('Drive links: ');
  const pasted = await collectMultilineInput();
  const ids = extractFolderIds(pasted);
  if (!ids.length) throw new Error('No valid Drive folder IDs found.');
  console.log(`\nParsed roots from your pasted input: ${ids.length}`);

  // The exact all-roots URL remains useful for a manual browser test, but the automated
  // test now scans each root in bounded POST chunks. The URL below is kept only as a
  // private manual reference; do not use the one-shot URL for very large roots.
  const allUrl = new URL(endpoint);
  allUrl.searchParams.set('mode', 'story_candidates');
  allUrl.searchParams.set('key', secret);
  allUrl.searchParams.set('links', ids.join(','));
  fs.writeFileSync(path.resolve('DRIVE-SCAN-TEST-URL.txt'), allUrl.toString() + '\n', 'utf8');
  console.log(`Exact all-roots Incognito URL written to:\n  ${path.resolve('DRIVE-SCAN-TEST-URL.txt')}`);
  console.log('IMPORTANT: that URL contains your private OX scanner key. Do not share it publicly.');
  console.log('\nRunning a resumable chunked diagnostic now. Large roots are split into short Apps Script requests...');

  const merged = {
    ok: true,
    mode: 'story_candidates',
    strategy: 'per-root-chunked-driveapp-diagnostic-v15.2',
    roots: ids.length,
    count: 0,
    indexedFolders: 0,
    scannedFolders: 0,
    iteratorScans: 0,
    apiCalls: 0,
    elapsedMs: 0,
    rootResults: [],
    ambiguous: [],
    ambiguousCount: 0,
    audioProbeFolders: 0,
    candidates: [],
    stories: []
  };
  const seenStories = new Set();
  const overallStarted = Date.now();

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    output.write(`\n[${i + 1}/${ids.length}] Scanning root ${id} ... `);
    const result = await scanOneChunked(endpoint, secret, id, ({chunks, folders, pending}) => {
      output.write(`\r[${i + 1}/${ids.length}] Scanning root ${id} ... chunk ${chunks} · ${folders} folders read · ${pending} pending   `);
    });
    if (!result.ok) {
      output.write('\n');
      console.log(`ERROR after ${(result.elapsedMs / 1000).toFixed(1)}s`);
      merged.rootResults.push({
        ok: false,
        rootFolderId: id,
        rootDriveUrl: `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`,
        error: result.error,
        elapsedMs: result.elapsedMs
      });
      continue;
    }

    const p = result.payload || {};
    output.write('\n');
    console.log(`OK · ${Number(p.scannedFolders || 0)} folders · ${Number(p.count || 0)} stories · ${(result.elapsedMs / 1000).toFixed(1)}s total · ${Number(p.traversalChunks || result.chunks || 0)} chunks`);
    merged.indexedFolders += Number(p.indexedFolders || p.scannedFolders || 0);
    merged.scannedFolders += Number(p.scannedFolders || 0);
    merged.iteratorScans += Number(p.iteratorScans || 0);
    merged.apiCalls += Number(p.apiCalls || 0);
    merged.elapsedMs += Number(p.elapsedMs || 0);
    merged.audioProbeFolders += Number(p.audioProbeFolders || 0);
    if (Array.isArray(p.ambiguous)) merged.ambiguous.push(...p.ambiguous);
    if (Array.isArray(p.rootResults) && p.rootResults.length) merged.rootResults.push(...p.rootResults);
    else merged.rootResults.push({ ok: true, rootFolderId: id, storiesFound: Number(p.count || 0), foldersDiscovered: Number(p.scannedFolders || 0), elapsedMs: Number(p.elapsedMs || 0) });

    const rows = Array.isArray(p.candidates) ? p.candidates : (Array.isArray(p.stories) ? p.stories : []);
    for (const item of rows) {
      const sid = String(item.storyFolderId || item.folderId || '').trim();
      if (!sid || seenStories.has(sid)) continue;
      seenStories.add(sid);
      merged.candidates.push(item);
    }
  }

  merged.candidates.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { numeric: true, sensitivity: 'base' }));
  merged.candidates.forEach((item, i) => { item.displayOrder = i + 1; });
  merged.stories = merged.candidates;
  merged.count = merged.candidates.length;
  merged.ambiguousCount = merged.ambiguous.length;
  merged.httpElapsedMs = Date.now() - overallStarted;

  fs.writeFileSync(path.resolve('DRIVE-SCAN-RESULT.json'), JSON.stringify(merged, null, 2), 'utf8');

  console.log(`\n\nAll-root diagnostic finished in ${(merged.httpElapsedMs / 1000).toFixed(1)} seconds.`);
  console.log(`Roots sent by TEST tool: ${ids.length}`);
  console.log(`Roots attempted separately: ${merged.rootResults.length}`);
  console.log(`Total folders checked: ${merged.scannedFolders}`);
  console.log(`Unique stories found: ${merged.count}`);
  console.log(`Ambiguous folder reviews: ${merged.ambiguousCount}`);
  console.log(`Folders lightly probed for direct audio: ${merged.audioProbeFolders}`);
  const failed = merged.rootResults.filter(r => r && r.ok === false);
  console.log(`Failed roots: ${failed.length}`);
  console.log('\nPer-root results:');
  merged.rootResults.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.ok ? 'OK' : 'ERROR'} | ${r.rootOwnerEmail || 'owner unavailable'} | ${r.rootFolderName || r.rootFolderId || ''} | folders ${r.foldersDiscovered ?? '?'} | stories ${r.storiesFound ?? '?'} | ${((r.elapsedMs || 0) / 1000).toFixed(1)}s${r.error ? ' | ' + r.error : ''}`);
  });
  console.log(`\nFull merged JSON saved to:\n  ${path.resolve('DRIVE-SCAN-RESULT.json')}`);
} catch (error) {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
}
