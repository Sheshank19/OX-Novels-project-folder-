import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const b6Root = path.resolve(here, '..');
export const oxRoot = path.resolve(b6Root, '..');
export const b5Root = path.join(oxRoot, 'local-player-b5');
export const cacheDir = path.join(oxRoot, 'local-audio-lab', 'cache');
export const resolverConfigPath = path.join(oxRoot, 'local-audio-lab', 'config', 'resolver.local.json');
export const snapshotPath = path.join(b6Root, 'PRODUCTION-STORY-SNAPSHOT.json');
export const b5ManifestPath = path.join(b5Root, 'B5-PUBLISHED-CATALOGS.json');
export const b5CatalogDir = path.join(b5Root, 'public', 'catalogs');
export const reportsDir = path.join(b6Root, 'reports');

export function extractFolderId(value) {
  const text = String(value || '').trim();
  let m = text.match(/(?:drive\/folders|folders)\/([A-Za-z0-9_-]{10,})/i);
  if (m) return m[1];
  m = text.match(/[?&]id=([A-Za-z0-9_-]{10,})/i);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(text) ? text : '';
}
export function sourceVersion(folderId) { return crypto.createHash('sha256').update(String(folderId || '')).digest('hex').slice(0,12); }
export function safeStoryId(id) { return String(id || 'story').replace(/[^a-z0-9._-]+/gi,'-'); }
export function catalogPathFor(story) { return path.join(cacheDir, `${safeStoryId(story.id)}-${story.sourceVersion}.json`); }

function normalizeStory(r) {
  const folderId = extractFolderId(r.drive_url ?? r.driveUrl ?? r.folderId ?? '');
  return {
    id: String(r.id || '').trim(),
    title: String(r.title || r.id || '').trim(),
    visible: Number(r.visible ?? 1) === 1 || r.visible === true,
    driveUrl: String(r.drive_url ?? r.driveUrl ?? ''),
    folderId,
    sourceVersion: sourceVersion(folderId),
    hasDriveSource: Boolean(folderId)
  };
}
function locateD1() {
  const dir = path.join(oxRoot,'.wrangler','state','v3','d1','miniflare-D1DatabaseObject');
  if (!fs.existsSync(dir)) throw new Error('Local D1 folder not found. Start OX localhost once first, or import PRODUCTION-STORY-SNAPSHOT.json.');
  const files = fs.readdirSync(dir).filter(n=>n.endsWith('.sqlite') && n!=='metadata.sqlite');
  const candidates=[];
  for (const name of files) {
    let db;
    try {
      const dbPath=path.join(dir,name); db=new DatabaseSync(dbPath,{readOnly:true});
      if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stories'").get()) { db.close(); continue; }
      const count=Number(db.prepare('SELECT COUNT(*) n FROM stories').get()?.n||0);
      candidates.push({db,count});
    } catch { try{db?.close()}catch{} }
  }
  if(!candidates.length) throw new Error('Could not locate local D1 stories database.');
  candidates.sort((a,b)=>b.count-a.count); for(const c of candidates.slice(1)) try{c.db.close()}catch{}
  return candidates[0].db;
}
export function currentStories() {
  if (fs.existsSync(snapshotPath)) {
    const snap=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
    if(!Array.isArray(snap.stories)) throw new Error('PRODUCTION-STORY-SNAPSHOT.json must contain a stories array.');
    return {source:'production-snapshot',generatedAt:String(snap.generatedAt||''),stories:snap.stories.map(normalizeStory).filter(x=>x.id)};
  }
  const db=locateD1();
  try {
    const rows=db.prepare('SELECT id,title,drive_url,visible FROM stories ORDER BY title COLLATE NOCASE').all();
    return {source:'local-d1',generatedAt:'',stories:rows.map(normalizeStory).filter(x=>x.id)};
  } finally { db.close(); }
}
export function currentStory(id) {
  const state=currentStories(); const s=state.stories.find(x=>x.id===String(id||''));
  if(!s) throw new Error(`Story not found in current story source: ${id}`); return {...s,_source:state.source};
}
export function loadResolverConfig() {
  if(!fs.existsSync(resolverConfigPath)) throw new Error('resolver.local.json not found. Keep your working Audio Lab resolver configuration.');
  const c=JSON.parse(fs.readFileSync(resolverConfigPath,'utf8'));
  const resolverUrl=String(c.resolverUrl||'').trim(), resolverSecret=String(c.resolverSecret||'').trim();
  if(!/^https:\/\/script\.google\.com\//i.test(resolverUrl)||!resolverSecret) throw new Error('Audio resolver is not configured.');
  return {resolverUrl,resolverSecret};
}
export function nodeFromPayload(payload,fallbackName='Folder') {
  return {
    name:String(payload.folder?.name||fallbackName||'Folder'),
    folders:(Array.isArray(payload.folders)?payload.folders:[]).map(x=>({id:String(x.id||''),name:String(x.name||'Folder')})).filter(x=>x.id),
    tracks:(Array.isArray(payload.tracks)?payload.tracks:[]).map(x=>({id:String(x.id||''),name:String(x.name||'Audio'),mimeType:String(x.mimeType||''),size:Number(x.size||0),modifiedAt:String(x.modifiedAt||'')})).filter(x=>x.id),
    truncated:Boolean(payload.truncated)
  };
}
export function catalogFingerprint(catalog) {
  const rows=[];
  for(const [folderId,node] of Object.entries(catalog?.nodes||{}).sort(([a],[b])=>a.localeCompare(b))){
    rows.push(['F',folderId,String(node?.name||'')]);
    for(const f of (node?.folders||[]).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)))) rows.push(['D',folderId,String(f.id||''),String(f.name||'')]);
    for(const t of (node?.tracks||[]).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)))) rows.push(['T',folderId,String(t.id||''),String(t.name||''),String(t.mimeType||''),Number(t.size||0),String(t.modifiedAt||'')]);
  }
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
export function verifyCatalog(story,catalog){return catalog?.storyId===story.id&&catalog?.sourceVersion===story.sourceVersion&&catalog?.rootFolderId===story.folderId&&catalog?.nodes?.[story.folderId];}
export function loadPublishedManifest(){
  if(!fs.existsSync(b5ManifestPath)) return {generatedAt:'',catalogs:[]};
  const m=JSON.parse(fs.readFileSync(b5ManifestPath,'utf8')); if(!Array.isArray(m.catalogs))m.catalogs=[]; return m;
}
export function savePublishedManifest(m){fs.mkdirSync(path.dirname(b5ManifestPath),{recursive:true});fs.writeFileSync(b5ManifestPath,JSON.stringify({...m,generatedAt:new Date().toISOString()},null,2));}
export function ensureB5(){if(!fs.existsSync(b5Root))throw new Error('local-player-b5 not found beside local-player-b6. Keep Phase B5 installed.');}
