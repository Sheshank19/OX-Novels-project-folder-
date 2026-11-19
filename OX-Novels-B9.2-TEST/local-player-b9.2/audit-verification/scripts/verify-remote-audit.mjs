/**
 * OX B9.2: read-only verification of the already-completed D1 canary.
 * Input: Wrangler d1 execute --remote --json SELECT result over stdin.
 * NEVER writes D1, reads Drive, downloads audio, or activates catalogs.
 * Never echoes the query result, source IDs, filenames, cursor strings or URLs.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const fail = code => {throw new Error(code)};
const hex = v => crypto.createHash('sha256').update(v,'utf8').digest('hex');
const word = /^[a-z0-9][a-z0-9._-]{0,159}$/;
const drive = /^[A-Za-z0-9_-]{10,}$/;
const h64 = /^[a-f0-9]{64}$/;
const cycleRx = /^pacific-\d{4}-\d{2}-\d{2}$/;
const VERSION = 'ox-stage-multiroot-v2';
const prefix = '[OX B9.2 VERIFIED READ-ONLY AUDIT]';

function d1Rows(stdout) {
  if (typeof stdout !== 'string' || stdout.length > 18_000_000 || !stdout.trim()) fail('D1_OUTPUT_EMPTY_OR_EXCESSIVE');
  let parsed;
  try { parsed=JSON.parse(stdout.trim()); }
  catch { fail('WRANGLER_JSON_UNREADABLE'); }
  const v = Array.isArray(parsed)?parsed[0]:parsed;
  if (!v || v.success === false || !Array.isArray(v.results)) fail('D1_QUERY_FAILED_OR_UNEXPECTED_FORMAT');
  if (v.results.length < 1 || v.results.length > 1600) fail('D1_PAGE_COUNT_INVALID');
  return v.results;
}

function verifyD1Rows(rows,staticMeta) {
  const j = rows[0];
  if (j?.story_id !== 'a-dragon-s-revenge' || !cycleRx.test(j.cycle_id||'') ||
      !drive.test(j.root_id||'') || !/^[a-f0-9]{12}$/.test(j.source_version||'') ||
      j.status !== 'OBSERVED_UNPINNED' || !Number.isSafeInteger(j.page_count) ||
      !Number.isSafeInteger(j.folder_count) || !Number.isSafeInteger(j.track_count) ||
      j.page_count < 1 || j.page_count > 1600 || j.folder_count < 1 || j.folder_count > 61 ||
      j.track_count < 1 || j.track_count > 20000 || rows.length !== j.page_count)
    fail('AUDIT_JOB_NOT_VALID_OR_INCOMPLETE');
  let checkpoint;
  try {checkpoint=JSON.parse(j.state_json);}catch{fail('AUDIT_CHECKPOINT_UNREADABLE');}
  if (!checkpoint || !Array.isArray(checkpoint.queue) || checkpoint.queue.length ||
      !Array.isArray(checkpoint.known) || checkpoint.known.length !== j.folder_count ||
      checkpoint.known[0] !== j.root_id ||
      new Set(checkpoint.known).size !== checkpoint.known.length) fail('AUDIT_CHECKPOINT_INCOMPLETE');

  const seenPages=new Map(), folderEntries=new Map(), trackEntries=new Map(), folderSet=new Set(checkpoint.known);
  const normalizedPages=[];
  for (const r of rows) {
    if (r.cycle_id!==j.cycle_id || r.story_id!==j.story_id || r.root_id!==j.root_id ||
        r.source_version!==j.source_version || r.status!==j.status ||
        r.page_count!==j.page_count || r.folder_count!==j.folder_count ||
        r.track_count!==j.track_count || r.state_json!==j.state_json ||
        !drive.test(r.folder_id||'') || !Number.isSafeInteger(r.page_no) ||
        r.page_no<0 || r.page_no>1000 || !folderSet.has(r.folder_id) ||
        typeof r.body_json!=='string' || r.body_json.length>400000 ||
        !h64.test(r.page_hash||'') || hex(r.body_json)!==r.page_hash) fail('STORED_PAGE_INVALID');
    let body;
    try{body=JSON.parse(r.body_json);}catch{fail('STORED_PAGE_JSON_INVALID');}
    if (body?.ok!==true || body.version!==VERSION || body.storyId!==j.story_id ||
        body.storyRootId!==j.root_id || body.folderId!==r.folder_id ||
        body.pageNo!==r.page_no || body.readOnly!==true ||
        body.pinnedSnapshot!==false || body.stableSnapshot!==false ||
        body.publishAllowed!==false || !Array.isArray(body.tracks) || !Array.isArray(body.folders) ||
        body.tracks.length>40 || body.folders.length>20 || typeof body.complete!=='boolean' ||
        body.hasMore!==!body.complete ||
        (body.complete ? body.nextCursor!==null : typeof body.nextCursor!=='string'||!body.nextCursor))
      fail('RESOLVER_PAGE_SCOPE_OR_FLAGS_INVALID');
    const seq=seenPages.get(r.folder_id)||{next:0,completed:false};
    if (seq.completed || r.page_no!==seq.next) fail('PAGE_ORDER_INVALID');
    seenPages.set(r.folder_id,{next:seq.next+1,completed:body.complete});
    const localIds=new Set();
    for (const f of body.folders){
      if (f?.type!=='folder'||!drive.test(f.id||'')||!f.name||localIds.has(f.id)||
          f.id===j.root_id||folderEntries.has(f.id)) fail('FOLDER_DUPLICATE_OR_INVALID');
      localIds.add(f.id);folderEntries.set(f.id,r.folder_id);
    }
    for (const t of body.tracks){
      if(t?.type!=='track'||!drive.test(t.id||'')||!t.name||localIds.has(t.id)||
         trackEntries.has(t.id)||!Number.isSafeInteger(t.size)||t.size<0||
         !Number.isFinite(Date.parse(t.modifiedAt))||typeof t.mimeType!=='string')
         fail('TRACK_DUPLICATE_OR_INVALID');
      localIds.add(t.id);trackEntries.set(t.id,r.folder_id);
    }
    normalizedPages.push([r.folder_id,r.page_no,r.page_hash]);
  }
  if(seenPages.size!==j.folder_count || folderEntries.size+1!==j.folder_count ||
     trackEntries.size!==j.track_count || !seenPages.has(j.root_id) ||
     [...seenPages.values()].some(s=>!s.completed) ||
     [...folderEntries].some(([child,parent])=>!seenPages.has(child)||!seenPages.has(parent)) ||
     [...trackEntries.values()].some(parent=>!seenPages.has(parent))) fail('STORED_TREE_NOT_COMPLETE');
  if (!staticMeta || staticMeta.storyId!==j.story_id || staticMeta.sourceVersion!==j.source_version ||
      !Number.isSafeInteger(staticMeta.folderCount) || !Number.isSafeInteger(staticMeta.trackCount))
      fail('STATIC_CATALOG_SOURCE_MISMATCH');
  // This is a commitment to the stored page hashes, not an atomic or change-free Drive snapshot.
  const digest=hex(JSON.stringify([j.cycle_id,j.story_id,j.source_version,normalizedPages]));
  const countsMatch=staticMeta.folderCount===j.folder_count && staticMeta.trackCount===j.track_count;
  return Object.freeze({cycle:j.cycle_id,folders:j.folder_count,tracks:j.track_count,
    staticFolders:staticMeta.folderCount,staticTracks:staticMeta.trackCount,countsMatch,
    pages:j.page_count,digest:digest.slice(0,16),result:'STORED_AUDIT_STRUCTURALLY_VERIFIED',
    pinnedSnapshot:false,publicationAllowed:false});
}

function main() {
  // The relative path is the existing static Player baseline. No credentials are read.
  const staticPath=path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    '../../../local-player-b5/public/catalogs/a-dragon-s-revenge.json');
  if(!fs.existsSync(staticPath)) fail('STATIC_CATALOG_NOT_FOUND');
  const stat=fs.lstatSync(staticPath);
  if(!stat.isFile()||stat.isSymbolicLink())fail('STATIC_CATALOG_PATH_UNSAFE');
  const meta=JSON.parse(fs.readFileSync(staticPath,'utf8'));
  const rows=d1Rows(fs.readFileSync(0,'utf8'));
  const r=verifyD1Rows(rows,meta);
  console.log(prefix);
  console.log('Completed cycle          : '+r.cycle);
  console.log('Stored pages verified    : '+r.pages);
  console.log('Folders / tracks         : '+r.folders+' / '+r.tracks);
  console.log('Static folders / tracks  : '+r.staticFolders+' / '+r.staticTracks);
  console.log('Static count parity      : '+(r.countsMatch?'SAME':'DIFFERENT'));
  console.log('Full content parity      : NOT ESTABLISHED');
  console.log('Page-hash commitment     : '+r.digest+'...');
  console.log('Atomic Drive snapshot    : NOT PROVEN');
  console.log('Publication / activation : DISABLED');
  console.log('RESULT                   : '+r.result);
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main()}catch(ex){console.error(prefix+' STOP: '+String(ex?.message||'VALIDATION_ERROR').replace(/[^A-Z0-9_]/g,'').slice(0,65));process.exitCode=1;}
}
export {verifyD1Rows,d1Rows};
