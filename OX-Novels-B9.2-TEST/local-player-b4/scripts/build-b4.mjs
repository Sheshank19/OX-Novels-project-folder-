import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const b4Root = path.resolve(here, '..');
const oxRoot = path.resolve(b4Root, '..');
const cacheDir = path.join(oxRoot, 'local-audio-lab', 'cache');
const keyFile = path.join(oxRoot, 'local-player-handoff', '.env.player-handoff');
const templatePath = path.join(b4Root, 'src', 'worker-B4-template.js');
const outWorker = path.join(b4Root, 'src', 'index.js');
const catalogDir = path.join(b4Root, 'public', 'catalogs');
const manifestPath = path.join(b4Root, 'B4-PUBLISHED-CATALOGS.json');

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(cacheDir)) fail('local-audio-lab\\cache was not found. Keep the working Audio Lab inside OX-Novels and prepare the story catalog first.');
if (!fs.existsSync(keyFile)) fail('local-player-handoff\\.env.player-handoff was not found. Keep the same working B2/B3 handoff key.');
if (!fs.existsSync(templatePath)) fail('src\\worker-B4-template.js is missing.');

const secret = fs.readFileSync(keyFile, 'utf8').trim();
let key;
try { key = Buffer.from(secret.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }
catch { fail('The local Player handoff key could not be decoded.'); }
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
    for (const track of Array.isArray(node.tracks) ? node.tracks : []) if (track?.id) orderedTracks.push({ folderId, track });
    for (const child of Array.isArray(node.folders) ? node.folders : []) walk(String(child.id || ''));
  }
  walk(catalog.rootFolderId);

  const tokenByFileId = new Map();
  for (const { track } of orderedTracks) {
    const fileId = String(track.id || '');
    if (!fileId) continue;
    tokenByFileId.set(fileId, encryptTrack({
      kind: 'track', storyId, sourceVersion, generationId, fileId,
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
    version: 1, storyId, sourceVersion, generationId,
    builtAt: String(catalog.builtAt || ''),
    rootKey: folderKeys.get(String(catalog.rootFolderId)) || '',
    folderCount: Object.keys(folders).length,
    trackCount: orderedTracks.length,
    folders
  };
}

fs.mkdirSync(catalogDir, { recursive: true });
for (const name of fs.readdirSync(catalogDir)) if (name.endsWith('.json')) fs.rmSync(path.join(catalogDir, name));

const index = {};
const manifest = [];
for (const { catalog, file } of [...selected.values()].sort((a, b) => String(a.catalog.storyId).localeCompare(String(b.catalog.storyId)))) {
  const safe = buildSafeCatalog(catalog);
  const fileName = `${safe.storyId}.json`;
  const outPath = path.join(catalogDir, fileName);
  fs.writeFileSync(outPath, JSON.stringify(safe), 'utf8');
  const bytes = fs.statSync(outPath).size;
  index[safe.storyId] = {
    storyId: safe.storyId,
    sourceVersion: safe.sourceVersion,
    generationId: safe.generationId,
    folderCount: safe.folderCount,
    trackCount: safe.trackCount,
    catalogPath: `/catalogs/${fileName}?v=${encodeURIComponent(safe.generationId)}`
  };
  manifest.push({
    ...index[safe.storyId],
    sourceCatalogFile: path.basename(file),
    staticCatalogBytes: bytes
  });
}

const template = fs.readFileSync(templatePath, 'utf8');
const marker = '/*__OX_B4_CATALOG_INDEX__*/';
if (!template.includes(marker)) fail('The B4 Worker template marker is missing.');
const generated = template.replace(marker, `const CATALOG_INDEX = ${JSON.stringify(index)};`);
fs.writeFileSync(outWorker, generated, 'utf8');
fs.writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), catalogs: manifest }, null, 2), 'utf8');

const publicText = fs.readdirSync(catalogDir).filter(n => n.endsWith('.json')).map(n => fs.readFileSync(path.join(catalogDir,n), 'utf8')).join('\n');
if (/drive\.google\.com|drive\.usercontent\.google\.com|"fileId"\s*:|"rootFolderId"\s*:/.test(publicText)) {
  fail('Safety check failed: a public B4 catalog appears to contain a raw Drive identifier or URL. Nothing should be deployed.');
}

console.log('\nB4 scalable Player build generated successfully.');
console.log(`Worker: ${outWorker}`);
console.log(`Static catalogs: ${catalogDir}`);
for (const item of manifest) console.log(`- ${item.storyId}: ${item.folderCount} folders, ${item.trackCount} tracks, ${Math.round(item.staticCatalogBytes/1024)} KB static catalog`);
console.log(`Dynamic Worker source: ${Math.round(Buffer.byteLength(generated,'utf8')/1024)} KB`);
console.log('\nIMPORTANT: public catalog assets contain encrypted track tokens, not raw Google Drive file IDs.');
console.log('Static catalog requests are designed to be served as Worker Static Assets, outside the dynamic Worker request path.');
