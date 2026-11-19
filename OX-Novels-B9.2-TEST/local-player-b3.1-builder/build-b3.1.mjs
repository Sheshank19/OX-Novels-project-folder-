import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const cacheDir = path.join(root, 'local-audio-lab', 'cache');
const keyFile = path.join(root, 'local-player-handoff', '.env.player-handoff');
const templatePath = path.join(here, 'worker-B3.1-template.js');
const outPath = path.join(root, 'worker-B3.1.generated.js');
const manifestPath = path.join(root, 'B3.1-PUBLISHED-CATALOGS.json');

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(cacheDir)) fail('local-audio-lab\\cache was not found. Keep the working Audio Lab inside OX-Novels and prepare the story catalog first.');
if (!fs.existsSync(keyFile)) fail('local-player-handoff\\.env.player-handoff was not found. Phase B2 must already be installed and working.');
if (!fs.existsSync(templatePath)) fail('worker-B3-template.js is missing from local-player-b3-builder.');

const secret = fs.readFileSync(keyFile, 'utf8').trim();
let key;
try {
  key = Buffer.from(secret.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
} catch {
  fail('The local Player handoff key could not be decoded.');
}
if (key.length !== 32) fail('The local Player handoff key must decode to exactly 32 bytes.');

const TRACK_AAD = Buffer.from('OX_PLAYER_TRACK_V1', 'utf8');
const b64url = value => Buffer.from(value).toString('base64url');

function encryptTrack(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(TRACK_AAD);
  const plain = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `t1.${b64url(iv)}.${b64url(Buffer.concat([encrypted, tag]))}`;
}

function folderKey(storyId, sourceVersion, folderId) {
  return crypto.createHash('sha256').update(`folder\0${storyId}\0${sourceVersion}\0${folderId}`).digest('base64url').slice(0, 22);
}

function isCatalog(value) {
  return value && typeof value === 'object' && typeof value.storyId === 'string' && typeof value.sourceVersion === 'string' && typeof value.rootFolderId === 'string' && value.nodes && typeof value.nodes === 'object' && value.nodes[value.rootFolderId];
}

const files = fs.readdirSync(cacheDir).filter(name => name.toLowerCase().endsWith('.json'));
const selected = new Map();
for (const name of files) {
  const full = path.join(cacheDir, name);
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(full, 'utf8')); } catch { continue; }
  if (!isCatalog(parsed)) continue;
  const stat = fs.statSync(full);
  const current = selected.get(parsed.storyId);
  if (!current || stat.mtimeMs > current.mtimeMs) selected.set(parsed.storyId, { catalog: parsed, file: full, mtimeMs: stat.mtimeMs });
}

if (!selected.size) fail('No valid active audio catalog JSON was found in local-audio-lab\\cache. Open the Audio Lab and make sure the catalog is READY first.');

function buildSafeCatalog(catalog) {
  const storyId = String(catalog.storyId);
  const sourceVersion = String(catalog.sourceVersion);
  const generationId = String(catalog.generationId || `g_${Date.now()}`);
  const folderKeys = new Map();
  for (const id of Object.keys(catalog.nodes || {})) folderKeys.set(id, folderKey(storyId, sourceVersion, id));

  const orderedTracks = [];
  const seenFolders = new Set();
  function walk(folderId) {
    if (!folderId || seenFolders.has(folderId)) return;
    seenFolders.add(folderId);
    const node = catalog.nodes?.[folderId];
    if (!node) return;
    for (const track of Array.isArray(node.tracks) ? node.tracks : []) {
      if (!track?.id) continue;
      orderedTracks.push({ folderId, track });
    }
    for (const child of Array.isArray(node.folders) ? node.folders : []) walk(String(child.id || ''));
  }
  walk(catalog.rootFolderId);

  const tokenByFileId = new Map();
  for (const { track } of orderedTracks) {
    const fileId = String(track.id || '');
    if (!fileId) continue;
    tokenByFileId.set(fileId, encryptTrack({
      kind: 'track',
      storyId,
      sourceVersion,
      generationId,
      fileId,
      mimeType: String(track.mimeType || '')
    }));
  }

  const neighborByFileId = new Map();
  for (let i = 0; i < orderedTracks.length; i += 1) {
    const current = orderedTracks[i]?.track;
    if (!current?.id) continue;
    const prev = orderedTracks[i - 1]?.track || null;
    const next = orderedTracks[i + 1]?.track || null;
    neighborByFileId.set(String(current.id), {
      previousKey: prev?.id ? tokenByFileId.get(String(prev.id)) || '' : '',
      nextKey: next?.id ? tokenByFileId.get(String(next.id)) || '' : ''
    });
  }

  const folders = {};
  for (const [rawId, node] of Object.entries(catalog.nodes || {})) {
    const keyValue = folderKeys.get(rawId);
    if (!keyValue) continue;
    folders[keyValue] = {
      name: String(node?.name || 'Folder'),
      folders: (Array.isArray(node?.folders) ? node.folders : []).map(child => ({
        key: folderKeys.get(String(child.id || '')) || '',
        name: String(child.name || 'Folder')
      })).filter(child => child.key),
      tracks: (Array.isArray(node?.tracks) ? node.tracks : []).map(track => {
        const fileId = String(track.id || '');
        const key = tokenByFileId.get(fileId) || '';
        const neighbor = neighborByFileId.get(fileId) || { previousKey: '', nextKey: '' };
        return {
          key,
          name: String(track.name || 'Audio'),
          mimeType: String(track.mimeType || ''),
          size: Number(track.size || 0),
          modifiedAt: String(track.modifiedAt || ''),
          previousKey: neighbor.previousKey,
          nextKey: neighbor.nextKey
        };
      }).filter(track => track.key)
    };
  }

  return {
    version: 1,
    storyId,
    sourceVersion,
    generationId,
    builtAt: String(catalog.builtAt || ''),
    rootKey: folderKeys.get(String(catalog.rootFolderId)) || '',
    folderCount: Object.keys(folders).length,
    trackCount: orderedTracks.length,
    folders
  };
}

const embedded = {};
const manifest = [];
for (const { catalog, file } of [...selected.values()].sort((a, b) => String(a.catalog.storyId).localeCompare(String(b.catalog.storyId)))) {
  const safe = buildSafeCatalog(catalog);
  embedded[safe.storyId] = safe;
  manifest.push({
    storyId: safe.storyId,
    sourceVersion: safe.sourceVersion,
    generationId: safe.generationId,
    folderCount: safe.folderCount,
    trackCount: safe.trackCount,
    sourceCatalogFile: path.basename(file)
  });
}

const catalogText = JSON.stringify(embedded);
const maxPilotBytes = 1_500_000;
if (Buffer.byteLength(catalogText, 'utf8') > maxPilotBytes) {
  fail(`The embedded B3.1 pilot catalog is ${Math.round(Buffer.byteLength(catalogText) / 1024)} KB, above the ${Math.round(maxPilotBytes / 1024)} KB safety limit. B3.1 is a pilot; do not embed the full 241-story library this way.`);
}

const template = fs.readFileSync(templatePath, 'utf8');
const marker = '/*__OX_B3_CATALOGS__*/';
if (!template.includes(marker)) fail('The B3.1 Worker template marker is missing.');
const generated = template.replace(marker, `const EMBEDDED_CATALOGS = ${catalogText};`);
fs.writeFileSync(outPath, generated, 'utf8');
fs.writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), catalogs: manifest }, null, 2), 'utf8');

console.log('\nB3.1 Player Worker generated successfully.');
console.log(`Output: ${outPath}`);
console.log(`Manifest: ${manifestPath}`);
for (const item of manifest) console.log(`- ${item.storyId}: ${item.folderCount} folders, ${item.trackCount} tracks`);
console.log(`Generated Worker size: ${Math.round(Buffer.byteLength(generated, 'utf8') / 1024)} KB`);
console.log('\nIMPORTANT: the generated browser catalog contains encrypted track tokens, not raw Google Drive file IDs.');
console.log('Next: open worker-B3.1.generated.js, copy all code into Player Account B -> listen -> Edit code, and Deploy.');
