/* OX B9.2.3 — OFFLINE metadata-only change gate.
 * No network, KV, Queues, D1, Worker registration, or production publication.
 * A complete verified Drive listing is required before declaring unchanged.
 * The in-memory preflight is deliberately NOT a 10 ms Cloudflare Free solution;
 * production needs a paginated remote resolver + durable metadata checkpointing.
 */
const STORY=/^[a-z0-9][a-z0-9._-]{0,159}$/;
const DRIVE=/^[A-Za-z0-9_-]{10,}$/;
const SHA=/^[a-f0-9]{64}$/;
const SCAN_MAX_FOLDERS=1000;
const PAGE_MAX_TRACKS=40;
const PAGE_MAX_FOLDERS=25;
const PAGE_MAX_COUNT=500;
const TEXT_MAX=500;
const str=x=>String(x??'').trim();
function must(ok, message){if(!ok)throw Error(message);}
function name(x,label){const v=str(x);must(v.length>0&&v.length<=TEXT_MAX,`Invalid ${label}`);return v;}
function driveId(v,label){const id=str(v);must(DRIVE.test(id),`Invalid ${label}`);return id;}
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
async function hash(value){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))));}
function newFolder(parentId,depth){return {parentId,depth,name:null,pages:[],totalPages:null,completed:false,folders:[],tracks:[]};}
export function createMetadataPreflight({storyId,rootFolderId,sourceVersion,baselineFingerprint=null,baselineSourceVersion=null,baselineRootFolderId=null}={}){
 must(STORY.test(str(storyId)),'Invalid story ID');
 const root=driveId(rootFolderId,'root Drive folder ID');
 must(str(sourceVersion).length>0&&str(sourceVersion).length<=100,'Invalid source version');
 if(baselineFingerprint!=null)must(SHA.test(baselineFingerprint),'Invalid baseline fingerprint');
 if(baselineSourceVersion!=null)must(str(baselineSourceVersion).length>0,'Invalid baseline source version');
 if(baselineRootFolderId!=null)driveId(baselineRootFolderId,'baseline root folder');
 return {storyId:str(storyId),rootFolderId:root,sourceVersion:str(sourceVersion),baselineFingerprint,baselineSourceVersion,baselineRootFolderId,
  folders:new Map([[root,newFolder(null,0)]]),fileIds:new Set(),pages:0,finished:false};
}
export function nextMetadataPage(preflight){
 must(preflight?.folders instanceof Map&&!preflight.finished,'Invalid or finalized preflight');
 for(const [folderId,folder] of preflight.folders){if(!folder.completed)return {folderId,pageNo:folder.pages.length,depth:folder.depth};}
 return null;
}
function verifyPage(page){
 must(page&&page.complete===true&&page.truncated===false,'Drive resolver page is not explicitly complete and untruncated');
 must(Number.isInteger(page.pageNo)&&page.pageNo>=0,'Invalid page number');
 must(Number.isInteger(page.totalPages)&&page.totalPages>0&&page.totalPages<=PAGE_MAX_COUNT&&page.pageNo<page.totalPages,'Invalid total pages');
 must(Array.isArray(page.folders)&&page.folders.length<=PAGE_MAX_FOLDERS,'Malformed/oversized folder page');
 must(Array.isArray(page.tracks)&&page.tracks.length<=PAGE_MAX_TRACKS,'Malformed/oversized track page');
 const folders=page.folders.map(f=>({id:driveId(f?.id,'child folder ID'),name:name(f?.name,'folder name')}));
 const tracks=page.tracks.map(t=>{
  const size=Number(t?.size??0);
  must(Number.isSafeInteger(size)&&size>=0,'Invalid track size');
  return {id:driveId(t?.id,'track ID'),name:name(t?.name,'track name'),mimeType:str(t?.mimeType),size,modifiedAt:str(t?.modifiedAt)};
 });
 must(new Set(folders.map(f=>f.id)).size===folders.length,'Duplicate folder ID within page');
 must(new Set(tracks.map(t=>t.id)).size===tracks.length,'Duplicate track ID within page');
 return {pageNo:page.pageNo,totalPages:page.totalPages,name:name(page.name,'page folder name'),folders,tracks};
}
export async function acceptMetadataPage(preflight,folderId,payload){
 must(preflight?.folders instanceof Map&&!preflight.finished,'Invalid or finalized preflight');
 const id=driveId(folderId,'page folder ID'),folder=preflight.folders.get(id);
 must(folder,'Page belongs to an undiscovered folder');
 const page=verifyPage(payload);
 const checksum=await hash(page);
 if(page.pageNo<folder.pages.length){
  must(folder.pages[page.pageNo]===checksum,'Conflicting page replay; do not trust metadata');
  return {replayed:true,folderCompleted:folder.completed};
 }
 must(!folder.completed,'Already completed folder');
 must(page.pageNo===folder.pages.length,'Skipped or out-of-order resolver page');
 must(folder.totalPages===null||page.totalPages===folder.totalPages,'Changing resolver pagination while scanning');
 must(folder.name===null||folder.name===page.name,'Folder renamed midway through listing');
 must(preflight.folders.size+page.folders.filter(f=>!preflight.folders.has(f.id)).length<=SCAN_MAX_FOLDERS,'Too many folders');
 const ids=new Set();
 for(const f of page.folders){
  must(f.id!==id,'Self-referencing folder');
  must(!ids.has(f.id)&&!folder.folders.some(x=>x.id===f.id),'Repeated folder across pages');
  ids.add(f.id);
  const existing=preflight.folders.get(f.id);
  must(!existing,'Folder exists elsewhere in traversal (duplicate or cycle)');
  must(folder.depth<12,'Folder depth limit exceeded');
 }
 for(const t of page.tracks){must(!preflight.fileIds.has(t.id),'Duplicate file ID across folders/pages');}
 // No local mutation happens until every page check above passes.
 folder.totalPages=page.totalPages;
 folder.name=page.name;
 folder.pages.push(checksum);
 folder.folders.push(...page.folders);
 folder.tracks.push(...page.tracks);
 for(const f of page.folders)preflight.folders.set(f.id,newFolder(id,folder.depth+1));
 for(const t of page.tracks)preflight.fileIds.add(t.id);
 folder.completed=folder.pages.length===folder.totalPages;
 preflight.pages++;
 return {replayed:false,folderCompleted:folder.completed};
}
export async function finalizeMetadataPreflight(preflight){
 must(preflight?.folders instanceof Map&&!preflight.finished,'Invalid or finalized preflight');
 must([...preflight.folders.values()].every(f=>f.completed&&f.pages.length===f.totalPages&&f.name!==null),'Incomplete Drive listing; no unchanged claim');
 const rows=[];
 for(const [folderId,node] of [...preflight.folders].sort(([a],[b])=>a.localeCompare(b))){
  rows.push(['F',folderId,node.name]);
  for(const f of [...node.folders].sort((a,b)=>a.id.localeCompare(b.id)))rows.push(['D',folderId,f.id,f.name]);
  for(const t of [...node.tracks].sort((a,b)=>a.id.localeCompare(b.id)))rows.push(['T',folderId,t.id,t.name,t.mimeType,t.size,t.modifiedAt]);
 }
 const fingerprint=await hash(rows);
 const matches=preflight.baselineFingerprint===fingerprint &&
   (preflight.baselineSourceVersion==null||preflight.baselineSourceVersion===preflight.sourceVersion) &&
   (preflight.baselineRootFolderId==null||preflight.baselineRootFolderId===preflight.rootFolderId);
 const status=preflight.baselineFingerprint==null?'new':matches?'unchanged':'changed';
 // Two original published static baselines contain 0 tracks. They can remain unchanged,
 // but an empty NEW or CHANGED result must never overwrite or activate a catalog.
 must(preflight.fileIds.size>0||status==='unchanged','Empty changed/new catalog; retain last working baseline');
 preflight.finished=true;
 // Publicly displayable decision: do not return raw Drive IDs or metadata rows.
 return Object.freeze({storyId:preflight.storyId,status,fingerprint,folderCount:preflight.folders.size,trackCount:preflight.fileIds.size,
  resolverPages:preflight.pages,verifiedComplete:true,emptyPublishedBaseline:preflight.fileIds.size===0,needsStage:status!=='unchanged',productionActivation:false});
}
/** Conservative local budget preview; never authorizes Cloudflare deployment.
 * The queue cost of full-library metadata preflight MUST be measured before staging.
 * A missing/incomplete expected story blocks the plan, rather than counting as unchanged.
 */
export function planChangedOnlyStages({decisions,expectedStoryIds,queueOpsAlreadyUsed=null,d1RowsAlreadyWritten=null,
 reserveQueueOps=1500,reserveD1Rows=15000}={}){
 must(Array.isArray(decisions)&&Array.isArray(expectedStoryIds),'Decisions and expected stories are required');
 const expected=new Set(expectedStoryIds);
 must(expected.size===expectedStoryIds.length&&expectedStoryIds.every(s=>STORY.test(s)),'Invalid/duplicate expected story IDs');
 const ids=new Set();let invalid=0;
 for(const x of decisions){
  must(x&&STORY.test(x.storyId)&&expected.has(x.storyId)&&!ids.has(x.storyId),'Unknown/duplicate preflight story');
  ids.add(x.storyId);
  if(x.verifiedComplete!==true||!['unchanged','changed','new'].includes(x.status)||!Number.isInteger(x.trackCount)||(x.trackCount<1&&x.status!=='unchanged')||!Number.isInteger(x.folderCount)||x.folderCount<1||!Number.isInteger(x.resolverPages)||x.resolverPages<x.folderCount)invalid++;
 }
 const missing=expectedStoryIds.filter(x=>!ids.has(x));
 const changed=decisions.filter(x=>x.verifiedComplete===true&&['new','changed'].includes(x.status));
 const unchanged=decisions.filter(x=>x.verifiedComplete===true&&x.status==='unchanged');
 const stageTracks=changed.reduce((s,x)=>s+x.trackCount,0);
 const stageFolders=changed.reduce((s,x)=>s+x.folderCount,0);
 const stagePages=changed.reduce((s,x)=>s+x.resolverPages,0);
 // Conservatively includes inserts, token updates, page+job bookkeeping and retries margin.
 const estimatedD1Rows=stageTracks*2+stageFolders*3+stagePages*3+changed.length*10;
 const stageMessages=changed.reduce((s,x)=>s+x.resolverPages+Math.ceil(x.trackCount/12)+2,0);
 const estimatedQueueOps=stageMessages*3;
 const measured=Number.isSafeInteger(queueOpsAlreadyUsed)&&queueOpsAlreadyUsed>=0 && Number.isSafeInteger(d1RowsAlreadyWritten)&&d1RowsAlreadyWritten>=0;
 const queueBudget=10000-reserveQueueOps;
 const d1Budget=100000-reserveD1Rows;
 const withinBudget=measured&&(estimatedQueueOps+queueOpsAlreadyUsed<=queueBudget)&&(estimatedD1Rows+d1RowsAlreadyWritten<=d1Budget);
 const complete=missing.length===0&&invalid===0&&decisions.length===expected.size;
 const reasons=[];
 if(!complete)reasons.push('Incomplete/invalid library preflight');
 if(!measured)reasons.push('Account-wide quota consumption is unknown');
 if(measured&&!withinBudget)reasons.push('Conservative Free-plan staging reserve exceeded');
 return {expectedStories:expected.size,checked:decisions.length,missingStories:missing,invalidDecisions:invalid,
  unchanged:unchanged.length,changed:changed.length,changedStoryIds:changed.map(x=>x.storyId),
  stageTracks,stageFolders,stagePages,estimatedD1Rows,estimatedQueueOps,queueBudget,d1Budget,
  readyForOfflineStaging:complete&&withinBudget,
  remoteDeploymentApproved:false,reason:reasons.join('; ')||'Offline planning only: remote CPU, Drive pagination, and current Cloudflare usage unverified'};
}

/** Queue estimate based on actual verified metadata pages.
 * One Queue message per resolver page is explicitly NOT a viable default.
 * Grouping many pages into a single invocation remains unverified for 10 ms CPU.
 */
export function estimateMetadataQueuePlan(decisions,{existingOperations=0,operationsPerMessage=3,reserveOperations=1500}={}){
 must(Array.isArray(decisions)&&decisions.every(x=>x?.verifiedComplete===true&&Number.isInteger(x.resolverPages)&&x.resolverPages>=x.folderCount),'Only completed metadata results may be estimated');
 must(Number.isSafeInteger(existingOperations)&&existingOperations>=0,'Invalid existing Queue usage');
 const stories=decisions.length,pages=decisions.reduce((sum,x)=>sum+x.resolverPages,0);
 const perPageOperations=pages*operationsPerMessage;
 const perStoryOperations=stories*operationsPerMessage;
 return {stories,pages,perPageOperations,perStoryOperations,freeOperationsPerDay:10000,
  reserveOperations,perPageFitsFreeBudget:existingOperations+perPageOperations<=10000-reserveOperations,
  perStoryFitsOperationBudget:existingOperations+perStoryOperations<=10000-reserveOperations,
  perStoryCpuValidated:false,remoteDeploymentApproved:false,
  warning:'A per-story Queue plan does not prove one invocation can traverse a story within Cloudflare Free 10 ms CPU or 50 external subrequests. The existing resolver does not provide verified pagination. No Queue schedule is approved.'};
}
