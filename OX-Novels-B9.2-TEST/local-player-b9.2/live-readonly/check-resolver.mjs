// OX B9.2 integration checkpoint: ONE read-only request against the existing Apps Script resolver.
// Do not enable auto-sync, create resources, or upload secrets. No raw identifiers ever printed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
function report(field, value) { console.log(String(field).padEnd(30) + ': ' + String(value)); }
function fail(category, remedy) {
  report('CHECK STATUS', 'INCOMPLETE');
  report('Reason', category);
  report('Next action', remedy);
  process.exitCode = 1;
}
function extractFolderId(value) {
  const s = String(value || '').trim();
  const m = s.match(/(?:drive\/folders|folders)\/([A-Za-z0-9_-]{10,})/i) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/i);
  return m ? m[1] : /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : '';
}
function findStoryDb() {
  const d = path.join(projectRoot, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
  if (!fs.existsSync(d)) return null;
  const result = [];
  for (const name of fs.readdirSync(d)) {
    if (!name.endsWith('.sqlite') || name === 'metadata.sqlite') continue;
    let db;
    try {
      db = new DatabaseSync(path.join(d, name), { readOnly: true });
      const has = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'stories'").get();
      if (!has) { db.close(); continue; }
      const n = Number(db.prepare('SELECT count(*) AS total FROM stories').get()?.total || 0);
      result.push({ db, n });
    } catch { try { db?.close(); } catch {} }
  }
  result.sort((a,b) => b.n-a.n);
  for (const x of result.slice(1)) x.db.close();
  return result.length ? result[0].db : null;
}
function shortLabel(s) { return String(s || '').replace(/[^A-Za-z0-9.\- _]/g, '').slice(0, 32) || 'not reported'; }
async function boundedFetch(url, options) {
  const resp = await fetch(url, { ...options, signal: AbortSignal.timeout(20000), redirect: 'follow' });
  if (!resp.ok) return { status: resp.status, body: null };
  const size = Number(resp.headers.get('content-length') || 0);
  if (size > 3_000_000) throw new Error('RESPONSE_TOO_LARGE');
  // Avoid storing/printing any raw response data after validation.
  const raw = await resp.text();
  if (raw.length > 3_000_000) throw new Error('RESPONSE_TOO_LARGE');
  let body;
  try { body = JSON.parse(raw); } catch { throw new Error('NON_JSON_RESPONSE'); }
  return { status: resp.status, body };
}

console.log('\nOX B9.2 LIVE RESOLVER — READ-ONLY COMPATIBILITY CHECK');
console.log('Only one GET + one POST. No updates, no full-library scan, no Cloudflare changes.');
console.log('Report omits secret, endpoint, Drive IDs, folder names and audio filenames.\n');

let db;
try {
  const cfgPath = path.join(projectRoot, 'local-audio-lab', 'config', 'resolver.local.json');
  if (!fs.existsSync(cfgPath)) { fail('LOCAL_RESOLVER_CONFIG_MISSING', 'Restore your existing LOCAL config on your PC only; do not send it in chat.'); process.exit(); }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const u = new URL(String(cfg.resolverUrl || ''));
  if (u.protocol !== 'https:' || u.hostname !== 'script.google.com' || !/^\/macros\/s\/[^/]+\/exec\/?$/.test(u.pathname) || u.username || u.password || u.search) {
    fail('ENDPOINT_NOT_VERIFIED', 'Check the existing Apps Script deployment URL locally.'); process.exit();
  }
  const secret = String(cfg.resolverSecret || '');
  if (!secret || secret.startsWith('PASTE_')) { fail('LOCAL_RESOLVER_SECRET_MISSING', 'Check resolver.local.json locally without sharing its contents.'); process.exit(); }
  db = findStoryDb();
  if (!db) { fail('LOCAL_D1_NOT_FOUND', 'The TEST folder needs the existing local D1 copy (read-only); no changes were made.'); process.exit(); }
  const count = Number(db.prepare('SELECT COUNT(*) AS n FROM stories').get()?.n || 0);
  report('Local D1 stories', count);
  if (!count) { fail('EMPTY_LOCAL_D1', 'Use the current local D1 copy, no deployment.'); process.exit(); }
  const selectedId = String(process.argv[2] || cfg.defaultStoryId || '').trim();
  let s;
  if (selectedId) s = db.prepare('SELECT drive_url FROM stories WHERE id = ?').get(selectedId);
  if (!s) s = db.prepare("SELECT drive_url FROM stories WHERE drive_url IS NOT NULL AND drive_url <> '' LIMIT 1").get();
  const folderId = extractFolderId(s?.drive_url);
  if (!folderId) { fail('SOURCE_FOLDER_NOT_FOUND', 'Use a local story with a valid Drive folder in D1.'); process.exit(); }
  report('Story selection', selectedId && s ? 'existing configured story' : 'existing local D1 story');
  db.close(); db = null;

  let serviceInfo = null;
  try {
    const g = await boundedFetch(u.toString(), { method: 'GET' });
    if (g.status === 200 && g.body && g.body.ok === true) serviceInfo = g.body;
  } catch {}
  report('GET service response', serviceInfo ? 'available' : 'not available');
  report('Reported resolver version', shortLabel(serviceInfo?.version));
  const started = Date.now();
  const r = await boundedFetch(u.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'list_children', folderId, secret })
  });
  report('Read-only POST HTTP', r.status);
  report('Request duration (ms)', Date.now() - started);
  if (!r.body || r.body.ok !== true) { fail('READ_ONLY_REQUEST_UNSUCCESSFUL', 'Check the Apps Script deployment and resolver access locally; do not share configuration.'); process.exit(); }
  const p = r.body;
  const shapeOK = p.folder && p.folder.id === folderId && Array.isArray(p.folders) && Array.isArray(p.tracks);
  if (!shapeOK) { fail('UNEXPECTED_RESOLVER_RESPONSE', 'Compare the live Apps Script source with the current local LAB source.'); process.exit(); }
  const missingMetadata = p.tracks.reduce((n,x) => n + (!(x && Number.isFinite(Number(x.size)) && typeof x.modifiedAt === 'string' && x.modifiedAt.length > 0) ? 1 : 0), 0);
  report('Child folder count', p.folders.length);
  report('Audio track count', p.tracks.length);
  report('Incomplete track metadata', missingMetadata);
  report('Folder-list truncated', p.folderTruncated === true);
  report('Audio-list truncated', p.fileTruncated === true);
  report('Any truncation', p.truncated === true);
  report('Automatic publish', 'DISABLED');
  report('Snapshot safety', 'NOT VERIFIED');
  report('Paginated mode', 'NOT TESTED / NOT ASSUMED');
  report('CHECK STATUS', 'READ-ONLY CONNECTION SUCCEEDED');
  if (p.truncated || missingMetadata) report('Next action', 'Resolver needs pagination/metadata review before catalog updates.');
  else report('Next action', 'Identify exact deployed Apps Script version; then build a separate staging resolver.');
} catch (err) {
  const categories = new Set(['RESPONSE_TOO_LARGE','NON_JSON_RESPONSE']);
  fail(categories.has(err?.message) ? err.message : 'NETWORK_OR_LOCAL_ACCESS_ERROR', 'Check local prerequisites and resolver accessibility; do not share secrets or raw errors.');
} finally { try { db?.close(); } catch {} }
