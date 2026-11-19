// OX B9.2 - actual read-only staging probe. No Drive mutations or Cloudflare calls.
// Prints only counts, durations and categorical statuses, never URLs/IDs/names/cursors/secrets.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const cfgName = path.join(dir, 'resolver-stage.local.json');
const label = (k,v) => console.log(k.padEnd(30) + ': ' + v);
const problems = (s) => { label('CHECK STATUS','INCOMPLETE');label('Reason',s);process.exitCode=1; };
const driveId = (s) => {
  s = String(s || '').trim();
  const m = s.match(/(?:drive\/folders|folders)\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : '';
};
async function getJSON(u, init = {}) {
  const r = await fetch(u, {...init, redirect:'follow', signal:AbortSignal.timeout(25000)});
  if (r.status !== 200) throw Error('HTTP_NOT_OK');
  const n = Number(r.headers.get('content-length') || 0);
  if (n > 2_000_000) throw Error('OVERSIZED_RESPONSE');
  const text = await r.text();
  if (text.length > 2_000_000) throw Error('OVERSIZED_RESPONSE');
  try {return JSON.parse(text);} catch {throw Error('NOT_JSON');}
}
let calls = 0;
console.log('\nOX B9.2 ISOLATED STAGING — READ ONLY');
console.log('One test root and its first child; no cloud changes or publication.\n');
try {
  if (!fs.existsSync(cfgName)) { problems('STAGING_LOCAL_CONFIG_MISSING'); process.exit(); }
  const cfg = JSON.parse(fs.readFileSync(cfgName,'utf8'));
  const u = new URL(cfg.resolverUrl || '');
  if (u.protocol !== 'https:' || u.hostname !== 'script.google.com' ||
      !/^\/macros\/s\/[^/]+\/exec\/?$/.test(u.pathname) || u.search || u.hash) throw Error('INVALID_STAGING_ENDPOINT');
  const secret = String(cfg.resolverSecret || '');
  const root = driveId(cfg.testStoryDriveUrl);
  if (secret.length < 32 || !root) throw Error('LOCAL_STAGE_VALUES_MISSING');
  const ping = await getJSON(u.toString()); calls++;
  if (!ping?.ok || ping.version !== 'ox-stage-readonly-v1' || ping.configured !== true || ping.writesEnabled !== false || ping.requestBinding !== 'nonce-echo-v1') throw Error('STAGE_UPGRADE_REQUIRED');
  label('Staging resolver','reachable');
  label('Version', ping.version);
  const post = async (folderId, pageNo, cursor) => {
    const started = Date.now();
    const requestNonce=crypto.randomBytes(16).toString('hex');
    const p = await getJSON(u.toString(), { method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({mode:'list_children_page',folderId,pageNo,cursor:cursor || undefined,
        requestNonce,secret}),cache:'no-store' });
    calls++;
    if (!p?.ok || p.version !== 'ox-stage-readonly-v1' || p.folderId !== folderId || p.pageNo !== pageNo || p.requestNonce !== requestNonce ||
      p.readOnly !== true || p.publishAllowed !== false || p.pinnedSnapshot !== false ||
      !Array.isArray(p.folders) || !Array.isArray(p.tracks) || typeof p.complete !== 'boolean' ||
      p.hasMore !== !p.complete || (p.complete && p.nextCursor !== null) || (!p.complete && !p.nextCursor)) throw Error('BAD_STAGING_RESPONSE');
    for (const f of p.folders) if (!/^[A-Za-z0-9_-]{10,}$/.test(String(f.id || ''))) throw Error('BAD_FOLDER_ID');
    for (const t of p.tracks) if (!/^[A-Za-z0-9_-]{10,}$/.test(String(t.id || '')) ||
      !Number.isFinite(Number(t.size)) || Number(t.size)<0 || !t.modifiedAt) throw Error('BAD_AUDIO_METADATA');
    return {...p, elapsedMs:Date.now()-started};
  };
  let folderId = root, firstChild = null, totalFolders = 0, totalAudio = 0, pages = 0;
  for (const [i, kind] of ['root','first child'].entries()) {
    if (i === 1) {
      if (!firstChild) { label('Child listing','skipped (no child folder found)'); break; }
      folderId = firstChild;
    }
    let cursor=null, seen=new Set(), done=false, nFolders=0,nTracks=0, nPages=0, duration=0;
    for (let page=0;page<25;page++) {
      const p = await post(folderId,page,cursor);
      nPages++;duration+=p.elapsedMs;
      for (const x of p.folders) {if(seen.has(x.id)) throw Error('DUPLICATE_ID');seen.add(x.id);if(i===0 && !firstChild)firstChild=x.id;nFolders++;}
      for (const x of p.tracks) {if(seen.has(x.id)) throw Error('DUPLICATE_ID');seen.add(x.id);nTracks++;}
      if (p.complete) {done=true;break;}
      cursor=p.nextCursor;
    }
    label(kind==='root'?'Root pages':'Child pages',nPages);
    label(kind==='root'?'Root child folders':'Child nested folders',nFolders);
    label(kind==='root'?'Root audio tracks':'Child audio tracks',nTracks);
    label(kind==='root'?'Root scan complete':'Child scan complete',done);
    label(kind==='root'?'Root request ms':'Child request ms',duration);
    if (!done) throw Error('PAGE_BUDGET_REACHED_INCOMPLETE');
    totalFolders+=nFolders;totalAudio+=nTracks;pages+=nPages;
  }
  label('GET/POST requests',calls);
  label('Automatic catalog publish','DISABLED');
  label('Snapshot proof','NOT VERIFIED');
  label('CHECK STATUS','READ-ONLY STAGING PAGINATION SUCCEEDED');
} catch (err) {
  const known = new Set(['STAGING_LOCAL_CONFIG_MISSING','INVALID_STAGING_ENDPOINT','LOCAL_STAGE_VALUES_MISSING','WRONG_STAGE_VERSION','STAGE_UPGRADE_REQUIRED','BAD_STAGING_RESPONSE','BAD_FOLDER_ID','BAD_AUDIO_METADATA','DUPLICATE_ID','PAGE_BUDGET_REACHED_INCOMPLETE','HTTP_NOT_OK','OVERSIZED_RESPONSE','NOT_JSON']);
  problems(known.has(err?.message) ? err.message : 'STAGING_CONNECTIVITY_OR_ACCESS_ERROR');
}
