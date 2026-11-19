/* OX B9.2.4 — LOCAL-ONLY compact, resumable metadata commitments.
 * Not installed in Worker, Cron, Queues, D1 or KV. No networking or publication.
 * Metadata pages are small; unchanged scans write page hashes, not track rows.
 * A separate verified Drive pagination + stable-snapshot protocol is STILL REQUIRED.
 */
const STORY=/^[a-z0-9][a-z0-9._-]{0,159}$/;
const DRIVE=/^[A-Za-z0-9_-]{10,}$/;
const JOB=/^[A-Za-z0-9_-]{8,100}$/;
const SHA=/^[a-f0-9]{64}$/;
const trim=x=>String(x??'').trim();
const fail=(condition,message)=>{if(!condition)throw Error(message);};
const check=(value,regex,label)=>{const v=trim(value);fail(regex.test(v),`Invalid ${label}`);return v;};
const now=()=>new Date().toISOString();
const prep=(db,sql,...params)=>db.prepare(sql).bind(...params);
const first=(db,sql,...params)=>prep(db,sql,...params).first();
const all=async(db,sql,...params)=>(await prep(db,sql,...params).all()).results;
const database=db=>{fail(db&&typeof db.prepare==='function'&&typeof db.batch==='function','Private D1-style database is missing');return db;};
// B9.2.6: TEST-ONLY atomic fencing. The inserted row is removed in the same
// transaction; the SQLite trigger rejects an expired/stolen lease. A separate
// validateLease() followed by an ordinary write is NOT sufficient.
function fenceCommands(db,scanId,fence){
 if(fence==null)return {prefix:[],suffix:[]}; // preserve legacy OFFLINE mock APIs only
 fail(typeof fence.leaseToken==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(fence.leaseToken),'Invalid lease token');
 fail(Number.isSafeInteger(fence.leaseEpoch)&&fence.leaseEpoch>0,'Invalid lease epoch');
 fail(Number.isSafeInteger(fence.checkedAtMs)&&fence.checkedAtMs>=0,'Invalid fencing timestamp');
 return {prefix:[prep(db,`INSERT INTO b926_fence_assertions(scan_id,lease_token,lease_epoch,checked_at_ms) VALUES(?,?,?,?)`,scanId,fence.leaseToken,fence.leaseEpoch,fence.checkedAtMs)],
  suffix:[prep(db,`DELETE FROM b926_fence_assertions WHERE scan_id=? AND lease_token=? AND lease_epoch=?`,scanId,fence.leaseToken,fence.leaseEpoch)]};
}

const named=(value,label)=>{const text=trim(value);fail(text.length>0&&text.length<=500,`Invalid ${label}`);return text;};
export async function sha256(value){
 const raw=typeof value==='string'?value:JSON.stringify(value);
 const out=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
 return [...new Uint8Array(out)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
/** Same deterministic simulated resolver pages used in B9.2.3. NOT live pagination. */
export function splitCachedFolderIntoPages(node){
 fail(node&&Array.isArray(node.folders)&&Array.isArray(node.tracks),'Invalid source folder');
 const n=Math.max(1,Math.ceil(node.folders.length/25),Math.ceil(node.tracks.length/40));
 fail(n<=500,'Folder pagination exceeds bound');
 return Array.from({length:n},(_,pageNo)=>({name:node.name,pageNo,totalPages:n,complete:true,truncated:false,
  folders:node.folders.slice(pageNo*25,(pageNo+1)*25),tracks:node.tracks.slice(pageNo*40,(pageNo+1)*40)}));
}
/** Validated canonical page; never export these raw IDs to public endpoints. */
export function validateCompactPage(page){
 fail(page&&page.complete===true&&page.truncated===false,'Unverified, truncated or incomplete resolver page');
 fail(Number.isInteger(page.pageNo)&&page.pageNo>=0&&Number.isInteger(page.totalPages)&&page.totalPages>0&&page.totalPages<=500&&page.pageNo<page.totalPages,'Invalid page number/count');
 fail(Array.isArray(page.folders)&&page.folders.length<=25&&Array.isArray(page.tracks)&&page.tracks.length<=40,'Oversized or invalid page');
 const folderIds=new Set(),trackIds=new Set();
 const folders=page.folders.map(f=>{const id=check(f?.id,DRIVE,'child folder ID');fail(!folderIds.has(id),'Repeated folder on page');folderIds.add(id);return {id,name:named(f?.name,'folder name')};});
 const tracks=page.tracks.map(t=>{
  const id=check(t?.id,DRIVE,'track ID');fail(!trackIds.has(id),'Repeated track on page');trackIds.add(id);
  const size=Number(t?.size??0);fail(Number.isSafeInteger(size)&&size>=0,'Invalid track size');
  const mimeType=trim(t?.mimeType),modifiedAt=trim(t?.modifiedAt);fail(mimeType.length<=150&&modifiedAt.length<=100,'Invalid track metadata');
  return {id,name:named(t?.name,'track name'),mimeType,size,modifiedAt};
 });
 return {name:named(page.name,'page folder name'),pageNo:page.pageNo,totalPages:page.totalPages,folders,tracks};
}
export async function pageCommitment(folderId,page){
 const id=check(folderId,DRIVE,'folder ID');const p=validateCompactPage(page);
 // Include folder context to prevent identical pages being swapped between folders.
 return {hash:await sha256([id,p.name,p.pageNo,p.totalPages,p.folders,p.tracks]),
  childFolders:p.folders,trackCount:p.tracks.length,totalPages:p.totalPages,pageNo:p.pageNo};
}
/** Offline baseline fingerprints from the user's verified local 242 story caches.
 * No raw folder IDs, links, files or tokens are included in the output manifest.
 */
export async function makeCompactBaseline({storyId,sourceVersion,raw}){
 const id=check(storyId,STORY,'story ID');fail(trim(sourceVersion).length>0,'Missing source version');
 const root=check(raw?.rootFolderId,DRIVE,'root folder ID');
 fail(raw.nodes&&typeof raw.nodes==='object','Missing cached folder graph');
 const visited=new Set(),pending=[{id:root,depth:0}];const folders={};let tracks=0,pages=0;
 while(pending.length){
  const {id:folderId,depth}=pending.shift();fail(depth<=12&&!visited.has(folderId),'Duplicate folder or cycle');visited.add(folderId);
  const node=raw.nodes[folderId];fail(node,'Missing baseline folder');const hashes=[];
  for(const page of splitCachedFolderIntoPages(node)){
   const c=await pageCommitment(folderId,page);hashes.push(c.hash);tracks+=c.trackCount;pages++;
   for(const child of c.childFolders)pending.push({id:child.id,depth:depth+1});
  }
  folders[await sha256(folderId)]=hashes;
 }
 fail(visited.size===Object.keys(raw.nodes).length,'Baseline contains unattached folders');
 return {storyId:id,sourceVersion:trim(sourceVersion),rootHash:await sha256(root),folderCount:visited.size,trackCount:tracks,pageCount:pages,folders};
}
export async function startCompactScan(db,{scanId,storyId,rootFolderId,sourceVersion,snapshotRevision}={}){
 database(db);scanId=check(scanId,JOB,'scan ID');storyId=check(storyId,STORY,'story ID');rootFolderId=check(rootFolderId,DRIVE,'root folder ID');
 sourceVersion=named(sourceVersion,'source version');snapshotRevision=named(snapshotRevision,'snapshot revision');
 const old=await first(db,'SELECT scan_id,story_id,root_folder_id,source_version,snapshot_revision,phase FROM b924_scans WHERE scan_id=?',scanId);
 if(old){fail(old.story_id===storyId&&old.root_folder_id===rootFolderId&&old.source_version===sourceVersion&&old.snapshot_revision===snapshotRevision,'Conflicting scan resume');return {resumed:true,phase:old.phase,scanId};}
 const stamp=now();await db.batch([
  prep(db,`INSERT INTO b924_scans(scan_id,story_id,root_folder_id,source_version,snapshot_revision,phase,created_at,updated_at) VALUES(?,?,?,?,?,'SCANNING',?,?)`,scanId,storyId,rootFolderId,sourceVersion,snapshotRevision,stamp,stamp),
  prep(db,`INSERT INTO b924_folders(scan_id,folder_id,parent_id,depth,status,total_pages,received_pages) VALUES(?,?,NULL,0,'PENDING',0,0)`,scanId,rootFolderId)
 ]);
 return {resumed:false,phase:'SCANNING',scanId};
}
export async function nextCompactPage(db,scanId){
 database(db);check(scanId,JOB,'scan ID');const job=await first(db,'SELECT phase FROM b924_scans WHERE scan_id=?',scanId);fail(job,'Unknown scan');
 if(job.phase!=='SCANNING')return null;
 const folder=await first(db,`SELECT folder_id,depth,received_pages FROM b924_folders WHERE scan_id=? AND status='PENDING' ORDER BY depth,folder_id LIMIT 1`,scanId);
 return folder?{folderId:folder.folder_id,pageNo:folder.received_pages,depth:folder.depth}:null;
}
export async function commitCompactPage(db,scanId,folderId,payload,{snapshotRevision,fence=null}={}){
 database(db);scanId=check(scanId,JOB,'scan ID');folderId=check(folderId,DRIVE,'folder ID');const page=validateCompactPage(payload);
 const commitment=await pageCommitment(folderId,payload);
 const job=await first(db,'SELECT phase,snapshot_revision FROM b924_scans WHERE scan_id=?',scanId);
 fail(job?.phase==='SCANNING','Scan is not active');
 fail(trim(snapshotRevision)===job.snapshot_revision,'Resolver snapshot changed; preserve existing catalog');
 const folder=await first(db,'SELECT * FROM b924_folders WHERE scan_id=? AND folder_id=?',scanId,folderId);
 fail(folder,'Unregistered folder page');
 const old=await first(db,'SELECT hash FROM b924_pages WHERE scan_id=? AND folder_id=? AND page_no=?',scanId,folderId,page.pageNo);
 if(old){fail(old.hash===commitment.hash,'Conflicting page replay; preserve previous catalog');return {replayed:true,finished:folder.status==='DONE'};}
 fail(folder.status==='PENDING'&&folder.received_pages===page.pageNo,'Out-of-order or completed page');
 fail(folder.total_pages===0||folder.total_pages===page.totalPages,'Total pages changed midway');
 fail(folder.depth<12||page.folders.length===0,'Folder depth limit exceeded');
 fail(page.folders.every(f=>f.id!==folderId),'Folder references itself');
 // One indexed SELECT, not 25 D1 lookups; keep under Free invocation/query bounds.
 const ids=page.folders.map(x=>x.id);let seen=[];
 if(ids.length)seen=await all(db,`SELECT folder_id FROM b924_folders WHERE scan_id=? AND folder_id IN (${ids.map(()=>'?').join(',')})`,scanId,...ids);
 fail(seen.length===0,'Duplicate, repeated or cyclic Drive folder');
 const complete=page.pageNo+1===page.totalPages;
 const commands=[
  prep(db,`INSERT INTO b924_pages(scan_id,folder_id,page_no,hash,track_count,child_count) VALUES(?,?,?,?,?,?)`,scanId,folderId,page.pageNo,commitment.hash,commitment.trackCount,ids.length),
  ...page.folders.map(f=>prep(db,`INSERT INTO b924_folders(scan_id,folder_id,parent_id,depth,status,total_pages,received_pages) VALUES(?,?,?,?,'PENDING',0,0)`,scanId,f.id,folderId,folder.depth+1)),
  prep(db,`UPDATE b924_folders SET received_pages=received_pages+1,total_pages=?,status=? WHERE scan_id=? AND folder_id=? AND received_pages=?`,page.totalPages,complete?'DONE':'PENDING',scanId,folderId,page.pageNo),
  prep(db,`UPDATE b924_scans SET page_count=page_count+1,track_count=track_count+?,folder_count=folder_count+?,updated_at=? WHERE scan_id=?`,commitment.trackCount,ids.length,now(),scanId)
 ];
 const guard=fenceCommands(db,scanId,fence);
 await db.batch([...guard.prefix,...commands,...guard.suffix]);
 return {replayed:false,finished:complete,trackCount:commitment.trackCount,childCount:ids.length};
}
/** Compact comparison checks EVERY page hash and metadata count. Changed stories
 * must go through the separate full durable stage, never direct KV publication.
 * The revision check here is only a local-protocol contract: a real resolver must
 * supply a genuinely consistent snapshot or equivalent full end-of-scan verification.
 */
export async function finalizeCompactScan(db,scanId,{baseline=null,endSnapshotRevision,snapshotVerified=false,fence=null}={}){
 database(db);scanId=check(scanId,JOB,'scan ID');const job=await first(db,'SELECT * FROM b924_scans WHERE scan_id=?',scanId);
 fail(job,'Unknown scan');fail(job.phase==='SCANNING','Scan not in scanning phase');
 fail(snapshotVerified===true&&trim(endSnapshotRevision)===job.snapshot_revision,'Drive snapshot consistency is not verified');
 const pending=await first(db,`SELECT COUNT(*) AS count FROM b924_folders WHERE scan_id=? AND (status!='DONE' OR received_pages=0 OR total_pages!=received_pages)`,scanId);
 fail(Number(pending.count)===0,'Incomplete metadata pages; retain previous catalog');
 const folders=await all(db,`SELECT folder_id,received_pages FROM b924_folders WHERE scan_id=? ORDER BY folder_id`,scanId);
 const commits=await all(db,`SELECT folder_id,page_no,hash FROM b924_pages WHERE scan_id=? ORDER BY folder_id,page_no`,scanId);
 fail(folders.length===job.folder_count+1,'Missing or contradictory folder count');
 fail(commits.length===job.page_count,'Missing metadata pages');
 const referenceMatches=baseline && baseline.sourceVersion===job.source_version && baseline.rootHash===await sha256(job.root_folder_id)
  && baseline.folderCount===folders.length && baseline.trackCount===job.track_count && baseline.pageCount===commits.length;
 let matches=!!referenceMatches;
 if(matches){
  const b=baseline.folders||{};const expectedFolderIds=new Set(Object.keys(b));
  for(const f of folders){const hashed=await sha256(f.folder_id);const expected=b[hashed];
   if(!Array.isArray(expected)||expected.length!==f.received_pages){matches=false;break;}expectedFolderIds.delete(hashed);
  }
  if(expectedFolderIds.size>0)matches=false;
  if(matches)for(const c of commits){const expected=b[await sha256(c.folder_id)];if(expected?.[c.page_no]!==c.hash){matches=false;break;}}
 }
 const status=baseline?matches?'unchanged':'changed':'new';
 fail(job.track_count>0||status==='unchanged','Empty changed/new metadata result; retain published catalog');
 const phase=status==='unchanged'?'UNCHANGED':'NEEDS_FULL_STAGE';
 const phaseUpdate=prep(db,'UPDATE b924_scans SET phase=?,updated_at=? WHERE scan_id=? AND phase=?',phase,now(),scanId,'SCANNING');
 if(fence){const guard=fenceCommands(db,scanId,fence);await db.batch([...guard.prefix,phaseUpdate,...guard.suffix]);}
 else await phaseUpdate.run(); // for legacy offline tests only; never for cloud dispatch

 // Deliberately no Drive IDs, file names, tokens, folder hashes, or URLs in decision.
 return Object.freeze({storyId:job.story_id,scanId,status,verifiedComplete:true,trackCount:job.track_count,
  folderCount:folders.length,pageCount:commits.length,needsFullStage:status!=='unchanged',
  queueMessagesForPages:0,productionActivation:false});
}
/** Conservative model ONLY. One Queue message per story is not enough on its
 * own to execute thousands of pages: extra bounded Worker requests and a
 * trustworthy scheduler would be needed and remain unimplemented.
 */
export function estimateCompactDispatch({storyCount,pageCount,queueOpsAlreadyUsed=null,workerRequestsAlreadyUsed=null,
 reserveQueueOps=1500,reserveWorkerRequests=15000,maxWorkerPageStepsPerRequest=1}={}){
 for(const [n,label] of [[storyCount,'storyCount'],[pageCount,'pageCount'],[reserveQueueOps,'reserveQueueOps'],[reserveWorkerRequests,'reserveWorkerRequests']])fail(Number.isSafeInteger(n)&&n>=0,`Invalid ${label}`);
 fail(maxWorkerPageStepsPerRequest===1,'Only one page per invocation is locally modeled');
 const queueOps=storyCount*3,workerStepRequests=pageCount;
 const measured=Number.isSafeInteger(queueOpsAlreadyUsed)&&queueOpsAlreadyUsed>=0&&Number.isSafeInteger(workerRequestsAlreadyUsed)&&workerRequestsAlreadyUsed>=0;
 const fits=measured&&queueOps+queueOpsAlreadyUsed<=10000-reserveQueueOps&&workerStepRequests+workerRequestsAlreadyUsed<=100000-reserveWorkerRequests;
 return {storyCount,pageCount,queueOperationsIfStoryJobOnly:queueOps,queueOperationsIfPageQueued:pageCount*3,
  workerStepRequests,knownAccountUsage:measured,underConservativeLimits:fits,
  queueConsumerImplemented:false,stepSchedulerImplemented:false,driveProtocolImplemented:false,cloudCpuVerified:false,productionApproved:false,
  reason:!measured?'Account-wide Queue/Worker usage is unknown':!fits?'Conservative Free-plan reserve exceeded':'Estimated budget only; scheduler, snapshot protocol and cloud CPU validation missing'};
}
