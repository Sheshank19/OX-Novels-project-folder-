/* OX B9.2.2 — TEST ONLY. Durable D1-like scan and token checkpoints.
 * Deliberately NOT wired into Player Worker, Cron or Queues, and NEVER publishes KV.
 * D1 stage database is private. Raw Drive IDs must never be returned to customers.
 * Every method is bounded (<= 40 scan entries/page or <= 12 encryptions/call).
 */
import { encryptTrackChunk } from './b921-chunk-prototype.js';

const ID = /^[a-z0-9][a-z0-9._-]{0,159}$/;
const DRIVE = /^[A-Za-z0-9_-]{10,}$/;
const JOB = /^[A-Za-z0-9_-]{8,100}$/;
const VERSION = /^[A-Za-z0-9_-]{5,100}$/;
const MAX_TRACKS_PAGE = 40;
const MAX_FOLDERS_PAGE = 25;
const MAX_PAGES = 500;
const MAX_DEPTH = 12;
const trim = v => String(v ?? '').trim();
const iso = () => new Date().toISOString();
const prep = (db, sql, ...params) => db.prepare(sql).bind(...params);
const row = (db, sql, ...params) => prep(db, sql, ...params).first();
const data = (db, sql, ...params) => prep(db, sql, ...params).all();
function ensure(ok, msg) { if (!ok) throw new Error(msg); }
function database(db) { ensure(db && typeof db.prepare === 'function' && typeof db.batch === 'function', 'Private staging D1 binding is missing'); return db; }
function safeId(v, re, label) { v=trim(v); ensure(re.test(v), `Invalid ${label}`); return v; }
async function digest(value) {
 const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
 return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function validName(v,label){v=trim(v);ensure(v.length>0&&v.length<=500,`Invalid ${label}`);return v;}
function validPage(payload) {
 ensure(payload && payload.truncated !== true && payload.complete !== false, 'Incomplete/truncated resolver page — keep previous catalog');
 ensure(Number.isInteger(payload.pageNo)&&payload.pageNo>=0, 'Invalid page index');
 ensure(Number.isInteger(payload.totalPages)&&payload.totalPages>0&&payload.totalPages<=MAX_PAGES, 'Invalid page count');
 ensure(payload.pageNo<payload.totalPages,'Page outside advertised page count');
 ensure(Array.isArray(payload.tracks)&&payload.tracks.length<=MAX_TRACKS_PAGE, 'Scan page exceeds 40 tracks');
 ensure(Array.isArray(payload.folders)&&payload.folders.length<=MAX_FOLDERS_PAGE, 'Scan page exceeds 25 folders');
 const folders=payload.folders.map(f=>({id:safeId(f.id,DRIVE,'child folder ID'),name:validName(f.name,'child folder name')}));
 const tracks=payload.tracks.map(t=>({id:safeId(t.id,DRIVE,'audio file ID'),name:validName(t.name,'track name'),mimeType:trim(t.mimeType).slice(0,150),size:Number(t.size||0),modifiedAt:trim(t.modifiedAt).slice(0,100)}));
 ensure(tracks.every(t=>Number.isSafeInteger(t.size)&&t.size>=0),'Invalid track sizes');
 ensure(new Set(folders.map(f=>f.id)).size===folders.length,'Repeated folder ID in page');
 ensure(new Set(tracks.map(t=>t.id)).size===tracks.length,'Repeated file ID in page');
 const name=validName(payload.name||'Folder','folder name');
 return {pageNo:payload.pageNo,totalPages:payload.totalPages,folders,tracks,name};
}
export async function beginStage(db,{jobId,storyId,rootFolderId,sourceVersion,generationId,cycle='manual'}={}){
 database(db);jobId=safeId(jobId,JOB,'job ID');storyId=safeId(storyId,ID,'story ID');rootFolderId=safeId(rootFolderId,DRIVE,'root Drive folder');sourceVersion=safeId(sourceVersion,VERSION,'source version');generationId=safeId(generationId,VERSION,'generation ID');
 ensure(trim(cycle).length>0&&trim(cycle).length<=100,'Invalid scan cycle');
 const old=await row(db,'SELECT * FROM b922_jobs WHERE job_id=?',jobId);
 if(old){ensure(old.story_id===storyId&&old.root_folder_id===rootFolderId&&old.source_version===sourceVersion&&old.generation_id===generationId,'Conflicting existing scan job');return {jobId,phase:old.phase,resumed:true};}
 const now=iso();await db.batch([
  prep(db,`INSERT INTO b922_jobs(job_id,story_id,root_folder_id,source_version,generation_id,cycle,phase,created_at,updated_at) VALUES(?,?,?,?,?,?,'SCANNING',?,?)`,jobId,storyId,rootFolderId,sourceVersion,generationId,trim(cycle),now,now),
  prep(db,`INSERT INTO b922_folders(job_id,folder_id,parent_id,name,depth,status,expected_pages,received_pages) VALUES(?,?,NULL,'Root',0,'PENDING',0,0)`,jobId,rootFolderId)
 ]);
 return {jobId,phase:'SCANNING',resumed:false};
}
export async function nextFolderPage(db,jobId){
 database(db);safeId(jobId,JOB,'job ID');const job=await row(db,'SELECT phase FROM b922_jobs WHERE job_id=?',jobId);
 ensure(job,'Unknown scan job');if(job.phase!=='SCANNING')return null;
 const node=await row(db,`SELECT folder_id,name,depth,received_pages,expected_pages FROM b922_folders WHERE job_id=? AND status='PENDING' ORDER BY depth,folder_id LIMIT 1`,jobId);
 return node?{folderId:node.folder_id,folderName:node.name,depth:node.depth,pageNo:node.received_pages,expectedPages:node.expected_pages}:null;
}
export async function checkpointFolderPage(db,jobId,folderId,payload){
 database(db);safeId(jobId,JOB,'job ID');folderId=safeId(folderId,DRIVE,'folder ID');const node=validPage(payload);
 const job=await row(db,'SELECT phase FROM b922_jobs WHERE job_id=?',jobId);
 ensure(job?.phase==='SCANNING','Job is not scanning');
 const folder=await row(db,'SELECT * FROM b922_folders WHERE job_id=? AND folder_id=?',jobId,folderId);
 ensure(folder,'Page does not belong to this story scan');
 ensure(folder.depth<=MAX_DEPTH,'Folder depth exceeds bound');
 const checksum=await digest({name:node.name,folders:node.folders,tracks:node.tracks,pageNo:node.pageNo,totalPages:node.totalPages});
 const previous=await row(db,`SELECT hash FROM b922_pages WHERE job_id=? AND folder_id=? AND page_no=?`,jobId,folderId,node.pageNo);
 if(previous){ensure(previous.hash===checksum,'Conflicting resolver page replay — catalog remains unchanged');return {replayed:true,folderDone:folder.status==='DONE',received:folder.received_pages};}
 ensure(folder.status==='PENDING','Folder already completed; unexpected page');
 ensure(node.pageNo===folder.received_pages,'Out-of-order page, cannot skip content');
 ensure(folder.expected_pages===0 || folder.expected_pages===node.totalPages,'Resolver page-count changed mid-scan');
 ensure(node.folders.every(f=>f.id!==folderId),'Circular self-referencing folder');
 ensure(folder.depth<MAX_DEPTH||node.folders.length===0,'Folder depth exceeds bound');
 const children=[];
 for(const f of node.folders){
  const existing=await row(db,'SELECT parent_id FROM b922_folders WHERE job_id=? AND folder_id=?',jobId,f.id);
  ensure(!existing || existing.parent_id===folderId,'Folder reached from incompatible parent — possible cycle');
  children.push(prep(db,`INSERT OR IGNORE INTO b922_folders(job_id,folder_id,parent_id,name,depth,status,expected_pages,received_pages) VALUES(?,?,?,?,?,'PENDING',0,0)`,jobId,f.id,folderId,f.name,folder.depth+1));
 }
 const tracks=node.tracks.map((t,i)=>prep(db,`INSERT INTO b922_tracks(job_id,file_id,folder_id,page_no,track_pos,name,mime_type,size,modified_at,token) VALUES(?,?,?,?,?,?,?,?,?,NULL)`,jobId,t.id,folderId,node.pageNo,i,t.name,t.mimeType,t.size,t.modifiedAt));
 const done=node.pageNo+1===node.totalPages;
 // D1 batch is atomic: no DONE state is committed without all page records.
 await db.batch([
  ...children,...tracks,
  prep(db,`INSERT INTO b922_pages(job_id,folder_id,page_no,total_pages,hash) VALUES(?,?,?,?,?)`,jobId,folderId,node.pageNo,node.totalPages,checksum),
  prep(db,`UPDATE b922_folders SET name=?,expected_pages=?,received_pages=?,status=? WHERE job_id=? AND folder_id=? AND status='PENDING' AND received_pages=?`,node.name,node.totalPages,node.pageNo+1,done?'DONE':'PENDING',jobId,folderId,node.pageNo),
  prep(db,'UPDATE b922_jobs SET updated_at=? WHERE job_id=?',iso(),jobId)
 ]);
 return {replayed:false,folderDone:done,received:node.pageNo+1,tracksAdded:node.tracks.length,foldersAdded:node.folders.length};
}
export async function sealStage(db,jobId){
 database(db);safeId(jobId,JOB,'job ID');const job=await row(db,'SELECT * FROM b922_jobs WHERE job_id=?',jobId);ensure(job,'Unknown scan job');
 if(job.phase==='TOKENIZING'||job.phase==='READY_LOCAL')return stageStatus(db,jobId);
 ensure(job.phase==='SCANNING','Job cannot be sealed');
 const todo=await row(db,`SELECT COUNT(*) AS n FROM b922_folders WHERE job_id=? AND status!='DONE'`,jobId);
 ensure(todo.n===0,'Cannot seal incomplete Drive folder scan');
 const folders=await row(db,'SELECT COUNT(*) AS n FROM b922_folders WHERE job_id=?',jobId);
 const tracks=await row(db,'SELECT COUNT(*) AS n FROM b922_tracks WHERE job_id=?',jobId);
 ensure(tracks.n>0,'Empty catalog rejected — previous catalog remains active');
 const check=await row(db,`SELECT COUNT(*) AS n FROM b922_folders WHERE job_id=? AND (expected_pages=0 OR received_pages!=expected_pages)`,jobId);
 ensure(check.n===0,'Missing Drive scan pages');
 await prep(db,`UPDATE b922_jobs SET phase='TOKENIZING',folder_total=?,track_total=?,updated_at=? WHERE job_id=? AND phase='SCANNING'`,folders.n,tracks.n,iso(),jobId).run();
 return stageStatus(db,jobId);
}
export async function tokenizeNextChunk(db,jobId,secret){
 database(db);safeId(jobId,JOB,'job ID');const job=await row(db,'SELECT * FROM b922_jobs WHERE job_id=?',jobId);
 ensure(job?.phase==='TOKENIZING'||job?.phase==='READY_LOCAL','Job must be sealed before tokenization');
 if(job.phase==='READY_LOCAL')return {processed:0,complete:true};
 const remaining=(await data(db,`SELECT file_id AS id, mime_type AS mimeType FROM b922_tracks WHERE job_id=? AND token IS NULL ORDER BY folder_id,page_no,track_pos LIMIT 12`,jobId)).results;
 if(remaining.length===0)return {processed:0,complete:true};
 const encrypted=await encryptTrackChunk({secret,storyId:job.story_id,sourceVersion:job.source_version,generationId:job.generation_id,tracks:remaining});
 const statements=encrypted.map(x=>prep(db,`UPDATE b922_tracks SET token=? WHERE job_id=? AND file_id=? AND token IS NULL`,x.key,jobId,x.id));
 await db.batch([...statements,prep(db,'UPDATE b922_jobs SET updated_at=? WHERE job_id=?',iso(),jobId)]);
 return {processed:encrypted.length,complete:false};
}
export async function completeStage(db,jobId){
 database(db);safeId(jobId,JOB,'job ID');const job=await row(db,'SELECT phase,track_total FROM b922_jobs WHERE job_id=?',jobId);
 ensure(job?.phase==='TOKENIZING'||job?.phase==='READY_LOCAL','Stage not ready for final verification');
 const remaining=await row(db,`SELECT COUNT(*) AS n FROM b922_tracks WHERE job_id=? AND token IS NULL`,jobId);
 ensure(remaining.n===0,'Some files have not been encrypted');
 const count=await row(db,'SELECT COUNT(*) AS n FROM b922_tracks WHERE job_id=?',jobId);
 ensure(count.n===job.track_total,'Track count changed during staging');
 await prep(db,`UPDATE b922_jobs SET phase='READY_LOCAL',updated_at=? WHERE job_id=? AND phase='TOKENIZING'`,iso(),jobId).run();
 return stageStatus(db,jobId);
}
export async function stageStatus(db,jobId){
 database(db);safeId(jobId,JOB,'job ID');const j=await row(db,`SELECT job_id,story_id,phase,folder_total,track_total,created_at,updated_at FROM b922_jobs WHERE job_id=?`,jobId);
 if(!j)return null;
 const f=await row(db,`SELECT SUM(CASE WHEN status='DONE' THEN 1 ELSE 0 END) AS done, COUNT(*) AS total FROM b922_folders WHERE job_id=?`,jobId);
 const t=await row(db,`SELECT COUNT(*) AS total, SUM(CASE WHEN token IS NOT NULL THEN 1 ELSE 0 END) AS encrypted FROM b922_tracks WHERE job_id=?`,jobId);
 return {jobId:j.job_id,storyId:j.story_id,phase:j.phase,foldersCompleted:f.done||0,foldersDiscovered:f.total||0,tracksStaged:t.total||0,tracksEncrypted:t.encrypted||0,createdAt:j.created_at,updatedAt:j.updated_at,productionActivation:false};
}
// Quota-aware estimate only; Queue throughput, CPU and D1 row metering require live staging.
export function estimateStageOps({totalFolders,totalTracks,tracksPerPage=40,tokensPerJob=12,queueOpsPerMessage=3}={}){
 ensure(Number.isInteger(totalFolders)&&totalFolders>=1&&Number.isInteger(totalTracks)&&totalTracks>=0,'Invalid stage estimates');
 const minScanPages=Math.max(totalFolders,Math.ceil(totalTracks/tracksPerPage));
 const tokenJobs=Math.ceil(totalTracks/tokensPerJob);
 const queueMessages=minScanPages+tokenJobs+2;
 return {minScanPages,tokenJobs,queueMessages,queueOperations:queueMessages*queueOpsPerMessage,minD1RowsWritten:totalFolders+totalTracks,underConservativeD1Budget:totalFolders+totalTracks<=85000,underConservativeQueueBudget:queueMessages*queueOpsPerMessage<=8500,warning:'Lower bound only. DO NOT stage all 242 stories into D1 nightly; 154,699 track rows alone exceed 100,000 Free writes/day. Scan metadata first, and stage changed stories only. Excludes retries, database bookkeeping rows and Worker CPU.'};
}
