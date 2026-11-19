import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const b5Root = path.resolve(here, '..');
export const oxRoot = path.resolve(b5Root, '..');
export const cacheDir = path.join(oxRoot, 'local-audio-lab', 'cache');
export const resolverConfigPath = path.join(oxRoot, 'local-audio-lab', 'config', 'resolver.local.json');
export const keyFile = path.join(oxRoot, 'local-player-handoff', '.env.player-handoff');

export function fail(message) { console.error(`\nERROR: ${message}\n`); process.exit(1); }
export function extractFolderId(value) {
  const text = String(value || '').trim();
  let m = text.match(/(?:drive\/folders|folders)\/([A-Za-z0-9_-]{10,})/i);
  if (m) return m[1];
  m = text.match(/[?&]id=([A-Za-z0-9_-]{10,})/i);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(text) ? text : '';
}
export function sourceVersion(folderId) { return crypto.createHash('sha256').update(String(folderId || '')).digest('hex').slice(0, 12); }
export function safeStoryId(id) { return String(id || 'story').replace(/[^a-z0-9._-]+/gi, '-'); }
export function catalogPathFor(story) { return path.join(cacheDir, `${safeStoryId(story.id)}-${story.sourceVersion}.json`); }
export function locateD1() {
  const dir = path.join(oxRoot, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
  if (!fs.existsSync(dir)) throw new Error('Local D1 folder not found. Start OX localhost once first.');
  const files = fs.readdirSync(dir).filter(n => n.endsWith('.sqlite') && n !== 'metadata.sqlite');
  const candidates=[];
  for (const name of files) {
    let db;
    try {
      const dbPath=path.join(dir,name); db=new DatabaseSync(dbPath,{readOnly:true});
      if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stories'").get()) { db.close(); continue; }
      const count=Number(db.prepare('SELECT COUNT(*) n FROM stories').get()?.n||0);
      candidates.push({db,dbPath,count});
    } catch { try{db?.close()}catch{} }
  }
  if (!candidates.length) throw new Error('Could not locate local D1 stories database.');
  candidates.sort((a,b)=>b.count-a.count); for (const c of candidates.slice(1)) try{c.db.close()}catch{}
  return candidates[0];
}
export function listStories() {
  const {db}=locateD1();
  try {
    return db.prepare('SELECT id,title,drive_url,visible FROM stories ORDER BY title COLLATE NOCASE').all().map(r=>{
      const folderId=extractFolderId(r.drive_url); return {id:String(r.id||''),title:String(r.title||''),visible:Number(r.visible||0)===1,folderId,sourceVersion:sourceVersion(folderId),hasDriveSource:Boolean(folderId)};
    });
  } finally { db.close(); }
}
export function getStory(id) {
  const {db}=locateD1();
  try {
    const r=db.prepare('SELECT id,title,drive_url,visible FROM stories WHERE id=? LIMIT 1').get(String(id||''));
    if (!r) throw new Error('Story not found in local D1.');
    const folderId=extractFolderId(r.drive_url);
    return {id:String(r.id||''),title:String(r.title||''),visible:Number(r.visible||0)===1,folderId,sourceVersion:sourceVersion(folderId),hasDriveSource:Boolean(folderId)};
  } finally { db.close(); }
}
export function loadResolverConfig() {
  if (!fs.existsSync(resolverConfigPath)) throw new Error('resolver.local.json not found. Keep your working Audio Lab resolver configuration.');
  const c=JSON.parse(fs.readFileSync(resolverConfigPath,'utf8'));
  const resolverUrl=String(c.resolverUrl||'').trim(), resolverSecret=String(c.resolverSecret||'').trim();
  if (!/^https:\/\/script\.google\.com\//i.test(resolverUrl) || !resolverSecret) throw new Error('Audio resolver is not configured.');
  return {resolverUrl,resolverSecret};
}
export function nodeFromPayload(payload, fallbackName='Folder') {
  return {
    name:String(payload.folder?.name||fallbackName||'Folder'),
    folders:(Array.isArray(payload.folders)?payload.folders:[]).map(x=>({id:String(x.id||''),name:String(x.name||'Folder')})).filter(x=>x.id),
    tracks:(Array.isArray(payload.tracks)?payload.tracks:[]).map(x=>({id:String(x.id||''),name:String(x.name||'Audio'),mimeType:String(x.mimeType||''),size:Number(x.size||0),modifiedAt:String(x.modifiedAt||'')})).filter(x=>x.id),
    truncated:Boolean(payload.truncated)
  };
}
export function catalogFingerprint(catalog) {
  const rows=[];
  for (const [folderId,node] of Object.entries(catalog?.nodes||{}).sort(([a],[b])=>a.localeCompare(b))) {
    rows.push(['F',folderId,String(node?.name||'')]);
    for (const f of (node?.folders||[]).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)))) rows.push(['D',folderId,String(f.id||''),String(f.name||'')]);
    for (const t of (node?.tracks||[]).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)))) rows.push(['T',folderId,String(t.id||''),String(t.name||''),String(t.mimeType||''),Number(t.size||0),String(t.modifiedAt||'')]);
  }
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
export function verifyCatalog(story,catalog) { return catalog?.storyId===story.id && catalog?.sourceVersion===story.sourceVersion && catalog?.rootFolderId===story.folderId && catalog?.nodes?.[story.folderId]; }
