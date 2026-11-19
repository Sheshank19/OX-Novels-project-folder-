/**
 * OX B9.2 read-only staging: inventory ONE existing staging root and its direct
 * child folders twice. Keeps ONLY keyed HMAC commitments in a local baseline.
 * No Drive writes, no KV/D1, no catalog publishing and no Cloudflare calls.
 * A matching dual read is NOT a pinned Google Drive snapshot.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.join(dir, 'resolver-stage.local.json');
const BASELINE = path.join(dir, 'stage-story-baseline.local.json');
const idPattern = /^[A-Za-z0-9_-]{10,}$/;
const MAX_CHILDREN = 60;
const MAX_PAGES_FOLDER = 80;
const MAX_TRACKS = 20000;
const MAX_CALLS = 450;
const MAX_RESULT_CHARS = 2_000_000;
const VERSION = 'ox-stage-readonly-v1';
// All requests are authenticated reads. Bounded retries never modify Drive.
const MAX_READ_ATTEMPTS = 3;
const READ_TIMEOUT_MS = 45000;
// Give Apps Script time between serial metadata reads to avoid bursts.
const MIN_REQUEST_GAP_MS = 1200;
const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function transportClass(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'TIMEOUT';
  const code = String(error?.cause?.code || '');
  if (['UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','ETIMEDOUT'].includes(code)) return 'TIMEOUT';
  if (['ECONNRESET','UND_ERR_SOCKET','EPIPE'].includes(code)) return 'CONNECTION_RESET';
  if (['ENOTFOUND','EAI_AGAIN'].includes(code)) return 'DNS_FAILURE';
  if (code === 'ECONNREFUSED') return 'CONNECTION_REFUSED';
  if (['CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN'].includes(code)) return 'TLS_CERTIFICATE';
  return 'NETWORK_OTHER';
}

const say = (k, value) => console.log(String(k).padEnd(32) + ': ' + String(value));
function fail(code) { throw Object.assign(new Error(code), { code }); }
function folderId(s) {
  s = String(s || '').trim();
  const m = s.match(/(?:drive\/folders|folders)\/([A-Za-z0-9_-]{10,})/) ||
    s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : idPattern.test(s) ? s : '';
}
function keyHmac(secret, tag, value) {
  return crypto.createHmac('sha256', secret).update('ox-b92-story-audit-v1\u0000'+tag+'\u0000'+value).digest('hex');
}
function digestRecord(secret, tag, id, details) {
  return [keyHmac(secret,tag+'-key',id), keyHmac(secret,tag+'-meta',JSON.stringify(details))];
}
function safeUrl(input) {
  const url = new URL(input || '');
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' ||
      !/^\/macros\/s\/[^/]+\/exec\/?$/.test(url.pathname) || url.search || url.hash)
    fail('INVALID_STAGE_ENDPOINT');
  return url.toString();
}
// Report only a fixed validation-rule name; NEVER return/log raw resolver JSON,
// folder IDs, track IDs, filenames, cursor values, endpoints or secrets.
function invalidPageRule(rule) {
  const error = Object.assign(new Error('INVALID_STAGE_PAGE'), {code: 'INVALID_STAGE_PAGE', pageRule: rule});
  throw error;
}
function validPage(p, rootId, folder, page, seenFolderIds, seenTrackIds) {
  if (!p || typeof p !== 'object' || Array.isArray(p) || p.ok !== true)
    invalidPageRule('NOT_A_SUCCESS_PAGE');
  if (p.version !== VERSION) invalidPageRule('VERSION_MISMATCH');
  if (p.folderId !== folder) invalidPageRule('FOLDER_ID_MISMATCH');
  if (p.pageNo !== page) invalidPageRule('PAGE_INDEX_MISMATCH');
  if (p.readOnly !== true || p.publishAllowed !== false)
    invalidPageRule('READ_ONLY_FLAGS_INVALID');
  if (p.pinnedSnapshot !== false || p.stableSnapshot !== false)
    invalidPageRule('SNAPSHOT_FLAGS_INVALID');
  if (!Array.isArray(p.folders)) invalidPageRule('FOLDERS_ARRAY_MISSING');
  if (!Array.isArray(p.tracks)) invalidPageRule('TRACKS_ARRAY_MISSING');
  if (p.folders.length > 20) invalidPageRule('FOLDERS_PAGE_LIMIT');
  if (p.tracks.length > 40) invalidPageRule('TRACKS_PAGE_LIMIT');
  if (typeof p.complete !== 'boolean') invalidPageRule('COMPLETE_FLAG_INVALID');
  if (p.hasMore !== !p.complete) invalidPageRule('MORE_FLAG_INCONSISTENT');
  if (p.complete && p.nextCursor !== null) invalidPageRule('TERMINAL_CURSOR_INVALID');
  if (!p.complete && (typeof p.nextCursor !== 'string' || !p.nextCursor))
    invalidPageRule('CONTINUATION_CURSOR_MISSING');
  for (const x of p.folders) {
    if (!x || !idPattern.test(x.id || '') || x.type !== 'folder' ||
        typeof x.name !== 'string' || !x.name || seenFolderIds.has(x.id) || seenTrackIds.has(x.id) || x.id === rootId)
      fail('INVALID_OR_DUPLICATE_FOLDER');
    seenFolderIds.add(x.id);
  }
  for (const x of p.tracks) {
    if (!x || !idPattern.test(x.id || '') || x.type !== 'track' ||
        typeof x.name !== 'string' || !x.name || typeof x.mimeType !== 'string' ||
        typeof x.modifiedAt !== 'string' || !Number.isFinite(Date.parse(x.modifiedAt)) ||
        typeof x.size !== 'number' || !Number.isSafeInteger(x.size) || x.size < 0 ||
        seenTrackIds.has(x.id) || seenFolderIds.has(x.id)) fail('INVALID_OR_DUPLICATE_AUDIO');
    seenTrackIds.add(x.id);
  }
}
function summaryDiff(before, after) {
  let added=0, removed=0, modified=0;
  for (const [k,v] of Object.entries(after)) {
    if (!(k in before)) added++;
    else if (before[k] !== v) modified++;
  }
  for (const k of Object.keys(before)) if (!(k in after)) removed++;
  return {added, removed, modified};
}
function identical(a,b) {
  return JSON.stringify(Object.entries(a).sort(([x],[y])=>x.localeCompare(y))) ===
    JSON.stringify(Object.entries(b).sort(([x],[y])=>x.localeCompare(y)));
}
function baselineMac(secret, b) {
  const { mac, ...rest } = b;
  return keyHmac(secret,'baseline-seal',JSON.stringify(rest));
}
let lastDiagnostic = null;
async function run() {
  if (!fs.existsSync(CONFIG)) fail('STAGING_CONFIG_MISSING');
  const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  const endpoint=safeUrl(cfg.resolverUrl);
  const secret=String(cfg.resolverSecret || '');
  const root=folderId(cfg.testStoryDriveUrl);
  if (secret.length < 32 || !idPattern.test(root || '')) fail('STAGING_CONFIG_INCOMPLETE');
  const rootMac=keyHmac(secret, 'story-root', root);
  let requests=0, requestsMs=0, lastStart=0;
  const diagnostic = {step:'initial GET', attempt:0, lastHttp:'NONE', failureType:'NONE', retries:0,
    responseHost:'NOT_KNOWN', redirected:'NOT_KNOWN', content404s:0, pageRule:'NONE',
    bindingMismatches:0, bindingRule:'NONE'};
  lastDiagnostic = diagnostic;
  async function jsonRequest(payload=null, step='initial GET') {
    diagnostic.step=step;
    const attemptLimit=MAX_READ_ATTEMPTS;
    for (let attempt=1; attempt<=attemptLimit; attempt++) {
      diagnostic.attempt=attempt;
      if (++requests > MAX_CALLS) fail('REQUEST_BUDGET_EXCEEDED');
      const wait=MIN_REQUEST_GAP_MS-(Date.now()-lastStart);
      if (wait>0) await sleep(wait);
      const t=Date.now();
      // A different unpredictable marker is required for each POST attempt.
      // Never log or save it. A mismatched reply is not trustworthy.
      const requestNonce = payload ? crypto.randomBytes(16).toString('hex') : null;
      let res;
      try {
        res=await fetch(endpoint, {redirect:'follow', signal:AbortSignal.timeout(READ_TIMEOUT_MS),
          ...(payload ? { method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({...payload, requestNonce, secret}),
            cache:'no-store' } : {})});
      } catch (err) {
        requestsMs+=Date.now()-t;
        lastStart=Date.now();
        diagnostic.failureType=transportClass(err);
        diagnostic.lastHttp='NO_RESPONSE';
        if (attempt<attemptLimit) {
          diagnostic.retries++;
          await sleep(900*attempt);
          continue;
        }
        fail('STAGING_NETWORK_ERROR');
      }
      requestsMs+=Date.now()-t;
      lastStart=Date.now();
      diagnostic.lastHttp=String(res.status);
      // Apps Script ContentService responds via a Google-controlled one-time
      // script.googleusercontent.com redirect. Classify without printing URLs,
      // query strings, IDs or the redirected response body.
      let host='UNKNOWN';
      try {
        const actualHost=new URL(res.url).hostname;
        host=actualHost==='script.googleusercontent.com' ? 'GOOGLE_CONTENT' :
          actualHost==='script.google.com' ? 'APPS_SCRIPT' : 'UNEXPECTED';
      } catch {}
      diagnostic.responseHost=host;
      diagnostic.redirected=res.redirected===true ? 'YES' : 'NO';
      if (host==='UNKNOWN' || host==='UNEXPECTED') {
        diagnostic.failureType='UNEXPECTED_RESPONSE_HOST';
        fail('UNEXPECTED_RESPONSE_HOST');
      }
      const content404 = res.status===404 && host==='GOOGLE_CONTENT' && res.redirected===true;
      if (content404) diagnostic.content404s++;
      if (res.status !== 200) {
        const retryable = content404 || RETRYABLE_HTTP.has(res.status);
        diagnostic.failureType=content404 ? 'GOOGLE_CONTENT_404' :
          retryable ? 'RETRYABLE_HTTP' : 'HTTP_ERROR';
        // Google has an acknowledged intermittent Apps Script ContentService
        // redirect 404 issue. It is safe to replay this ONE read-only request,
        // preserving the same folder/page/cursor and never publishing anything.
        // Genuine /exec 404s and untrusted redirects must fail immediately.
        if (retryable && attempt<attemptLimit) {
          diagnostic.retries++;
          await sleep(content404 ? 2500*attempt : 900*attempt);
          continue;
        }
        fail('STAGING_HTTP_ERROR');
      }
      if (Number(res.headers.get('content-length') || 0) > MAX_RESULT_CHARS) fail('OVERSIZED_RESPONSE');
      let body;
      try { body=await res.text(); }
      catch (err) {
        diagnostic.failureType=transportClass(err);
        if (attempt<attemptLimit) {
          diagnostic.retries++;
          await sleep(900*attempt);
          continue;
        }
        fail('STAGING_NETWORK_ERROR');
      }
      if (body.length > MAX_RESULT_CHARS) fail('OVERSIZED_RESPONSE');
      try {
        const data=JSON.parse(body);
        if (!data || typeof data!=='object' || Array.isArray(data)) {
          diagnostic.failureType='NON_OBJECT_JSON';
          fail('INVALID_JSON_RESPONSE');
        }
        // The staging Apps Script deliberately reports all internal exceptions
        // as {ok:false,error:<generic>}; never print that untrusted response.
        // An HTTP 200 alone does not mean the requested Drive page succeeded.
        if (data.ok===false) {
          diagnostic.failureType='STAGE_REJECTED';
          fail('STAGE_REJECTED');
        }
        if (payload) {
          let rule='NONE';
          if (data.requestNonce !== requestNonce) rule='REQUEST_MARKER_MISMATCH';
          else if (data.folderId !== payload.folderId) rule='FOLDER_ID_MISMATCH';
          else if (data.pageNo !== payload.pageNo) rule='PAGE_INDEX_MISMATCH';
          if (rule !== 'NONE') {
            diagnostic.bindingMismatches++;
            diagnostic.bindingRule=rule;
            diagnostic.failureType='RESPONSE_BINDING_INVALID';
            // Only replay exactly the same read-only page/cursor, with a new marker.
            // Do not touch the folder/page sets or the local baseline.
            if (attempt < attemptLimit) {
              diagnostic.retries++;
              await sleep(1800 * attempt);
              continue;
            }
            fail('STAGING_RESPONSE_BINDING_FAILED');
          }
        }
        diagnostic.failureType='NONE';
        return data;
      } catch (err) {
        if (err?.code) throw err;
        diagnostic.failureType='NON_JSON_BODY';
        fail('INVALID_JSON_RESPONSE');
      }
    }
    fail('STAGING_NETWORK_ERROR');
  }
  const ping=await jsonRequest();
  if (!ping?.ok || ping.version !== VERSION || ping.configured !== true ||
      ping.writesEnabled !== false || ping.pinnedSnapshot !== false) fail('WRONG_STAGE_SERVICE');
  if (ping.requestBinding !== 'nonce-echo-v1') fail('STAGING_RESOLVER_UPGRADE_REQUIRED');
  const scanPass = async (passNumber) => {
    const folders={}, tracks={}, childIds=[];
    const seenFolders=new Set(),seenTracks=new Set();
    let pages=0;
    async function scanFolder(id, isRoot, scopeLabel) {
      let complete=false, cursor=null;
      for (let page=0;page<MAX_PAGES_FOLDER;page++) {
        const p=await jsonRequest({mode:'list_children_page',folderId:id,pageNo:page,
          ...(cursor ? {cursor} : {})}, `pass ${passNumber} ${scopeLabel} page ${page}`);
        try { validPage(p,root,id,page,seenFolders,seenTracks); }
        catch (err) {
          if (err?.code === 'INVALID_STAGE_PAGE') {
            diagnostic.failureType='PAGE_SCHEMA_INVALID';
            diagnostic.pageRule=err.pageRule || 'UNCLASSIFIED';
          }
          throw err;
        }
        pages++;
        for (const x of p.folders) {
          if (!isRoot) fail('NESTED_SUBFOLDER_NEEDS_NEW_STAGE_SCOPE');
          childIds.push(x.id);
          if (childIds.length>MAX_CHILDREN) fail('TOO_MANY_STORY_FOLDERS');
          const [k,v]=digestRecord(secret,'folder',x.id, [x.name,rootMac]);
          folders[k]=v;
        }
        for (const x of p.tracks) {
          const [k,v]=digestRecord(secret,'track',x.id,[x.name,x.mimeType,x.size,x.modifiedAt,
            keyHmac(secret,'parent-id',id)]);
          tracks[k]=v;
          if (Object.keys(tracks).length>MAX_TRACKS) fail('TRACK_BUDGET_EXCEEDED');
        }
        if (p.complete) { complete=true; break; }
        cursor=p.nextCursor;
      }
      if (!complete) fail('INCOMPLETE_PAGINATION');
    }
    await scanFolder(root,true,'root');
    for (let i=0; i<childIds.length; i++)
      await scanFolder(childIds[i],false,`child ${i+1}/${childIds.length}`);
    // Folder listings have no specified stable ordering. Treat both results as sets.
    return {folders,tracks,folderCount:childIds.length,trackCount:Object.keys(tracks).length,pages};
  };
  say('Stage','one story, full direct-child inventory');
  say('Drive write operations','NONE');
  say('Catalog publication','DISABLED');
  const first=await scanPass(1);
  say('First pass','COMPLETE');
  const second=await scanPass(2);
  say('Folders (first / second)',`${first.folderCount} / ${second.folderCount}`);
  say('Tracks (first / second)',`${first.trackCount} / ${second.trackCount}`);
  say('Metadata pages (first / second)',`${first.pages} / ${second.pages}`);
  say('GET + POST requests',requests);
  say('Total request duration ms',requestsMs);
  say('Temporary retries',diagnostic.retries);
  say('Google content 404 responses',diagnostic.content404s);
  say('Response binding mismatches',diagnostic.bindingMismatches);
  if (!identical(first.folders,second.folders) || !identical(first.tracks,second.tracks)) {
    say('Observed between passes','CHANGED — baseline NOT updated');
    fail('DRIVE_CHANGED_DURING_TWO_PASSES');
  }
  say('Two-pass observation','MATCHED (not an atomic snapshot)');
  const next={schema:1,stageVersion:VERSION,rootMac,folderCount:second.folderCount,
    trackCount:second.trackCount,folders:second.folders,tracks:second.tracks};
  next.mac=baselineMac(secret,next);
  if (fs.existsSync(BASELINE)) {
    let previous;
    try { previous=JSON.parse(fs.readFileSync(BASELINE,'utf8')); }
    catch { fail('BASELINE_FILE_UNREADABLE'); }
    if (previous?.schema!==1 || previous.stageVersion!==VERSION ||
        previous.rootMac!==rootMac || previous.mac!==baselineMac(secret,previous) ||
        !previous.folders || !previous.tracks) fail('BASELINE_INVALID_OR_DIFFERENT_STORY');
    const f=summaryDiff(previous.folders,next.folders);
    const t=summaryDiff(previous.tracks,next.tracks);
    say('Change comparison','advisory only — no publication' );
    say('Folders + / - / modified',`${f.added} / ${f.removed} / ${f.modified}`);
    say('Tracks + / - / modified',`${t.added} / ${t.removed} / ${t.modified}`);
    if (!Object.values(f).some(Boolean) && !Object.values(t).some(Boolean))
      say('Since last successful audit','NO OBSERVED CHANGES');
  } else {
    say('Previous local baseline','NONE — establishing current inventory');
  }
  const tmp=BASELINE+'.tmp-'+process.pid;
  try {
    fs.writeFileSync(tmp,JSON.stringify(next),'utf8');
    fs.renameSync(tmp,BASELINE);
  } finally { try {if(fs.existsSync(tmp))fs.unlinkSync(tmp);}catch {} }
  say('Private local baseline','SAVED (keyed hashes; no names/IDs)');
  say('Snapshot proof','NOT VERIFIED');
  say('CHECK STATUS','ONE-STORY READ-ONLY AUDIT PASSED');
}
console.log('\nOX B9.2 — REAL ONE-STORY DRIVE INVENTORY / READ ONLY\n');
run().catch(err=>{
  const allowed = new Set(['STAGING_CONFIG_MISSING','STAGING_CONFIG_INCOMPLETE','INVALID_STAGE_ENDPOINT',
  'WRONG_STAGE_SERVICE','REQUEST_BUDGET_EXCEEDED','STAGING_NETWORK_ERROR','STAGING_HTTP_ERROR',
  'STAGE_REJECTED','UNEXPECTED_RESPONSE_HOST',
  'STAGING_RESOLVER_UPGRADE_REQUIRED','STAGING_RESPONSE_BINDING_FAILED',
  'OVERSIZED_RESPONSE','INVALID_JSON_RESPONSE','INVALID_STAGE_PAGE','INVALID_OR_DUPLICATE_FOLDER',
  'INVALID_OR_DUPLICATE_AUDIO','NESTED_SUBFOLDER_NEEDS_NEW_STAGE_SCOPE',
  'TOO_MANY_STORY_FOLDERS','TRACK_BUDGET_EXCEEDED','INCOMPLETE_PAGINATION',
  'DRIVE_CHANGED_DURING_TWO_PASSES','BASELINE_FILE_UNREADABLE','BASELINE_INVALID_OR_DIFFERENT_STORY']);
  say('CHECK STATUS','INCOMPLETE');
  say('Reason',allowed.has(err?.code)?err.code:'LOCAL_OR_REMOTE_STAGE_ERROR');
  if (lastDiagnostic) {
    say('Failed request step',lastDiagnostic.step);
    say('Last attempt',`${lastDiagnostic.attempt} / ${MAX_READ_ATTEMPTS}`);
    say('Transport category',lastDiagnostic.failureType);
    if (err?.code === 'INVALID_STAGE_PAGE') say('Page schema rule',lastDiagnostic.pageRule);
    say('Last HTTP status',lastDiagnostic.lastHttp);
    say('Response host category',lastDiagnostic.responseHost);
    say('Google redirect followed',lastDiagnostic.redirected);
    say('Google content 404 responses',lastDiagnostic.content404s);
    say('Response binding mismatches',lastDiagnostic.bindingMismatches);
    if (lastDiagnostic.bindingMismatches) say('Binding rule',lastDiagnostic.bindingRule);
    say('Read-only retries',lastDiagnostic.retries);
  }
  say('Private baseline','UNCHANGED after incomplete audit');
  process.exitCode=1;
});
