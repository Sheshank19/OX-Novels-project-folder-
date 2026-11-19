/**
 * Private read-only reducer for completed B9.2 story audits.
 * Stored resolver pages are untrusted until every page, folder, track and
 * checkpoint is reconciled. A matching digest is evidence of agreement,
 * NOT a pinned Google Drive snapshot and NEVER authorizes publication.
 * Call outside the time-sensitive stream route or a scheduled hot path.
 */
import {assertPage} from './b92-audit-reader.js';
const ROOT=/^[A-Za-z0-9_-]{10,}$/;
const STORY=/^[a-z0-9][a-z0-9._-]{0,159}$/;
const H64=/^[a-f0-9]{64}$/;
const MAX_PAGES=1600,MAX_FOLDERS=61,MAX_TRACKS=20000;
const error=code=>{throw Object.assign(new Error(code),{code});};
const hex=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data))),b=>b.toString(16).padStart(2,'0')).join('');
const first=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const all=(db,sql,...args)=>db.prepare(sql).bind(...args).all();

/** Returns a private content digest, never the raw Drive IDs or filenames. */
export async function describeCompletedAudit(db,{cycleId,storyId}={}){
  if(!db||!/^pacific-\d{4}-\d{2}-\d{2}$/.test(cycleId||'')||!STORY.test(storyId||''))error('INVALID_AUDIT_SCOPE');
  const job=await first(db,`SELECT root_id,source_version,status,page_count,track_count,folder_count,state_json
    FROM b92_audit_jobs WHERE cycle_id=? AND story_id=?`,cycleId,storyId);
  if(!job||job.status!=='OBSERVED_UNPINNED'||!ROOT.test(job.root_id||'')||
      !/^[a-f0-9]{12}$/.test(job.source_version||'')||
      !Number.isSafeInteger(job.page_count)||job.page_count<1||job.page_count>MAX_PAGES||
      !Number.isSafeInteger(job.track_count)||job.track_count<1||job.track_count>MAX_TRACKS||
      !Number.isSafeInteger(job.folder_count)||job.folder_count<1||job.folder_count>MAX_FOLDERS)
    error('AUDIT_NOT_COMPLETE');
  let checkpoint;try{checkpoint=JSON.parse(job.state_json);}catch{error('AUDIT_CHECKPOINT_CORRUPT');}
  if(!checkpoint||!Array.isArray(checkpoint.queue)||checkpoint.queue.length!==0||
     !Array.isArray(checkpoint.known)||checkpoint.known.length!==job.folder_count||
     checkpoint.known[0]!==job.root_id||
     new Set(checkpoint.known).size!==checkpoint.known.length)
    error('AUDIT_CHECKPOINT_CORRUPT');
  const pages=await all(db,`SELECT folder_id,page_no,body_json,page_hash FROM b92_audit_pages
    WHERE cycle_id=? AND story_id=? ORDER BY folder_id,page_no`,cycleId,storyId);
  const rows=pages.results||[];
  if(rows.length!==job.page_count||rows.length>MAX_PAGES)error('AUDIT_PAGE_COUNT_MISMATCH');
  const visited=new Map(),folders=new Map(),tracks=new Map();
  for(const row of rows){
    if(!ROOT.test(row.folder_id||'')||!Number.isSafeInteger(row.page_no)||row.page_no<0||
       row.page_no>1000||typeof row.body_json!=='string'||row.body_json.length>400000||
       !H64.test(row.page_hash||'')||await hex(row.body_json)!==row.page_hash)
      error('AUDIT_PAGE_INTEGRITY_FAILED');
    let obj;try{obj=JSON.parse(row.body_json);}catch{error('AUDIT_PAGE_INTEGRITY_FAILED');}
    const scope={storyId,rootId:job.root_id,folderId:row.folder_id,pageNo:row.page_no};
    try{assertPage(obj,scope);}catch{error('AUDIT_PAGE_INTEGRITY_FAILED');}
    const previous=visited.get(row.folder_id)||{last:-1,complete:false};
    if(previous.complete||row.page_no!==previous.last+1)error('AUDIT_PAGE_SEQUENCE_INVALID');
    visited.set(row.folder_id,{last:row.page_no,complete:obj.complete});
    for(const f of obj.folders){
      if(f.id===job.root_id||folders.has(f.id))error('AUDIT_DUPLICATE_FOLDER');
      folders.set(f.id,[row.folder_id,f.name]);
    }
    for(const t of obj.tracks){
      if(tracks.has(t.id))error('AUDIT_DUPLICATE_TRACK');
      tracks.set(t.id,[row.folder_id,t.name,t.mimeType,t.size,t.modifiedAt]);
    }
  }
  if(visited.size!==job.folder_count||folders.size+1!==job.folder_count||
     tracks.size!==job.track_count||!visited.has(job.root_id)||
     visited.size!==checkpoint.known.length||
     checkpoint.known.some(id=>!visited.has(id))||
     [...visited.values()].some(x=>!x.complete)||
     [...folders].some(([id,[parent]])=>!visited.has(id)||!visited.has(parent))||
     [...tracks.values()].some(([parent])=>!visited.has(parent)))
    error('AUDIT_TREE_INCOMPLETE');
  const sorted=(map)=>[...map].sort(([a],[b])=>a.localeCompare(b));
  const fingerprint=await hex(JSON.stringify(['B92_AUDIT_INVENTORY_V1',storyId,job.source_version,
    job.root_id,sorted(folders),sorted(tracks)]));
  return Object.freeze({cycleId,storyId,sourceVersion:job.source_version,
    folderCount:visited.size,trackCount:tracks.size,pageCount:rows.length,
    fingerprint,atomicSnapshot:false,publicationAllowed:false});
}
/** Compare two independent, fully validated audit cycles. No publication grant. */
export function compareAuditObservations(a,b){
  if(!a||!b||a.storyId!==b.storyId||a.sourceVersion!==b.sourceVersion||
      a.cycleId===b.cycleId||!H64.test(a.fingerprint||'')||!H64.test(b.fingerprint||'')||
      a.atomicSnapshot!==false||b.atomicSnapshot!==false||
      a.publicationAllowed!==false||b.publicationAllowed!==false)
    error('AUDIT_OBSERVATIONS_INVALID');
  return {storyId:a.storyId,matching:a.fingerprint===b.fingerprint,
    folderCount:b.folderCount,trackCount:b.trackCount,
    atomicSnapshot:false,publicationAllowed:false};
}
