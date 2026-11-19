/* OX B9.2.5 -- TEST-ONLY D1-style durable one-step scan scheduler.
 * Does not create Queues, call Google Drive, activate KV or touch either Worker.
 * A live D1/Workers-safe fencing transaction and CPU measurements are NOT implemented.
 */
import {startCompactScan,nextCompactPage,commitCompactPage,finalizeCompactScan} from './b924-compact-checkpoints.js';
import {validateBeginEnvelope,validatePageEnvelope,validateEndEnvelope} from './b925-resolver-protocol.js';
const ID=/^[A-Za-z0-9_-]{8,100}$/;
const requireOk=(truth,msg)=>{if(!truth)throw Error(msg);};
const nowCheck=x=>{requireOk(Number.isSafeInteger(x)&&x>=0,'Invalid scheduler timestamp');return x;};
const statement=(db,sql,...args)=>db.prepare(sql).bind(...args);
const one=(db,sql,...args)=>statement(db,sql,...args).first();
const run=(db,sql,...args)=>statement(db,sql,...args).run();
function checkDB(db){requireOk(typeof db?.prepare==='function'&&typeof db?.batch==='function','Missing private D1-style DB');}
function scanID(scanId){requireOk(typeof scanId==='string'&&ID.test(scanId),'Invalid scan ID');return scanId;}
function validLease(lease){requireOk(lease&&typeof lease.leaseToken==='string'&&ID.test(lease.leaseToken)&&Number.isInteger(lease.leaseEpoch),'Invalid lease');}
function privateError(error){const s=String(error?.message||error||''); if(/expired|snapshot|revision|current/i.test(s))return 'Snapshot consistency or expiry failure';if(/truncat|incomplet|missing|page|cursor/i.test(s))return 'Incomplete or invalid Drive metadata page';return 'Drive resolver or checkpoint failure';}
function publicRow(s){return s?Object.freeze({scanId:s.scan_id,status:s.status,attempts:s.attempts,stepsCompleted:s.steps_completed,nextDueMs:s.next_due_ms,updatedAtMs:s.updated_at_ms,
 error:s.status==='FAILED'?s.last_error:''}):null;}
export async function inspectLocalSchedule(db,scanId){checkDB(db);scanID(scanId);return publicRow(await one(db,'SELECT * FROM b925_schedule WHERE scan_id=?',scanId));}
export async function registerLocalSchedule(db,args,{nowMs=0}={}){
 checkDB(db);nowCheck(nowMs);scanID(args?.scanId);
 await startCompactScan(db,args);
 await run(db,`INSERT OR IGNORE INTO b925_schedule(scan_id,status,next_due_ms,created_at_ms,updated_at_ms) VALUES(?,'READY',?,?,?)`,args.scanId,nowMs,nowMs,nowMs);
 return inspectLocalSchedule(db,args.scanId);
}
export async function claimLocalStep(db,scanId,{nowMs=0,leaseMs=30000}={}){
 checkDB(db);scanID(scanId);nowCheck(nowMs);
 requireOk(Number.isSafeInteger(leaseMs)&&leaseMs>=1000&&leaseMs<=120000,'Unsafe lease duration');
 const scan=await one(db,'SELECT phase FROM b924_scans WHERE scan_id=?',scanId);
 requireOk(scan,'Unknown scan');
 if(scan.phase==='UNCHANGED'||scan.phase==='NEEDS_FULL_STAGE'){
  await run(db,"UPDATE b925_schedule SET status='DONE', lease_token='',lease_until_ms=0,updated_at_ms=? WHERE scan_id=? AND status!='DONE'",nowMs,scanId);
  return {kind:'done',status:scan.phase};
 }
 if(scan.phase==='FAILED')return {kind:'failed'};
 const token='lease_'+crypto.randomUUID().replaceAll('-','');
 const rsp=await run(db,`UPDATE b925_schedule SET status='RUNNING',lease_token=?,lease_epoch=lease_epoch+1,lease_until_ms=?,updated_at_ms=?
 WHERE scan_id=? AND status IN ('READY','WAITING','RUNNING') AND next_due_ms<=? AND lease_until_ms<=?`,token,nowMs+leaseMs,nowMs,scanId,nowMs,nowMs);
 if(Number(rsp?.meta?.changes)!==1)return {kind:'busy'};
 const state=await one(db,'SELECT lease_epoch FROM b925_schedule WHERE scan_id=?',scanId);
 const page=await nextCompactPage(db,scanId);
 return {kind:page?'page':'seal',scanId,leaseToken:token,leaseEpoch:state.lease_epoch,untilMs:nowMs+leaseMs,...(page?{page}:{})};
}
async function validateLease(db,lease,nowMs){
 validLease(lease);nowCheck(nowMs);
 const row=await one(db,'SELECT lease_token,lease_epoch,lease_until_ms,status FROM b925_schedule WHERE scan_id=?',scanID(lease.scanId));
 requireOk(row&&row.status==='RUNNING'&&row.lease_token===lease.leaseToken&&row.lease_epoch===lease.leaseEpoch&&row.lease_until_ms>nowMs,'Stale, expired or stolen scan lease');
 return row;
}
export async function acknowledgeLocalPage(db,lease,{nowMs=0}={}){
 checkDB(db);await validateLease(db,lease,nowMs);requireOk(lease.kind==='page'&&lease.page,'No claimed page to acknowledge');
 const stored=await one(db,'SELECT 1 AS ok FROM b924_pages WHERE scan_id=? AND folder_id=? AND page_no=?',lease.scanId,lease.page.folderId,lease.page.pageNo);
 requireOk(stored,'Cannot acknowledge an uncommitted metadata page');
 const changed=await run(db,`UPDATE b925_schedule SET status='WAITING',lease_token='',lease_until_ms=0,next_due_ms=?,steps_completed=steps_completed+1,updated_at_ms=?
 WHERE scan_id=? AND status='RUNNING' AND lease_token=? AND lease_epoch=? AND lease_until_ms>?`,nowMs,nowMs,lease.scanId,lease.leaseToken,lease.leaseEpoch,nowMs);
 requireOk(Number(changed?.meta?.changes)===1,'Lost lease during page acknowledgment');
 return inspectLocalSchedule(db,lease.scanId);
}
export async function acknowledgeLocalSeal(db,lease,{nowMs=0}={}){
 checkDB(db);await validateLease(db,lease,nowMs);requireOk(lease.kind==='seal','Expected a seal claim');
 const scan=await one(db,'SELECT phase FROM b924_scans WHERE scan_id=?',lease.scanId);
 requireOk(scan&&['UNCHANGED','NEEDS_FULL_STAGE'].includes(scan.phase),'Cannot acknowledge unfinalized scan');
 const changed=await run(db,`UPDATE b925_schedule SET status='DONE',lease_token='',lease_until_ms=0,next_due_ms=0,updated_at_ms=?
 WHERE scan_id=? AND status='RUNNING' AND lease_token=? AND lease_epoch=? AND lease_until_ms>?`,nowMs,lease.scanId,lease.leaseToken,lease.leaseEpoch,nowMs);
 requireOk(Number(changed?.meta?.changes)===1,'Lost lease during final acknowledgment');
 return inspectLocalSchedule(db,lease.scanId);
}
export async function rejectLocalStep(db,lease,error,{nowMs=0,maxAttempts=15}={}){
 checkDB(db);await validateLease(db,lease,nowMs);
 requireOk(Number.isInteger(maxAttempts)&&maxAttempts===15,'This version requires exactly 15 maximum attempts');
 const old=await one(db,'SELECT attempts FROM b925_schedule WHERE scan_id=?',lease.scanId);
 const count=old.attempts+1,exhausted=count>=maxAttempts;
 const delayMs=exhausted?0:Math.min(3600000,Math.round(10000*1.7**(count-1)));
 const text=privateError(error);
 const rsp=await run(db,`UPDATE b925_schedule SET attempts=?,status=?,lease_token='',lease_until_ms=0,next_due_ms=?,last_error=?,updated_at_ms=?
 WHERE scan_id=? AND status='RUNNING' AND lease_token=? AND lease_epoch=? AND lease_until_ms>?`,count,exhausted?'FAILED':'WAITING',nowMs+delayMs,text,nowMs,lease.scanId,lease.leaseToken,lease.leaseEpoch,nowMs);
 requireOk(Number(rsp?.meta?.changes)===1,'Lost lease during retry transition');
 if(exhausted)await run(db,"UPDATE b924_scans SET phase='FAILED' WHERE scan_id=? AND phase='SCANNING'",lease.scanId);
 return Object.freeze({status:exhausted?'FAILED':'WAITING',attempts:count,retryAtMs:exhausted?null:nowMs+delayMs,previousCatalogRetained:true});
}
/** Offline orchestration with at most one Drive page and one compact commit per call.
 * Injected resolver is an independent mock. Its begin/end claims are not trusted
 * as real snapshot proof until Apps Script source is implemented and audited.
 */
/** B9.2.6 fencing timestamp must be obtained immediately before each DB write
 * in any future cloud adapter. Inject clock only for deterministic offline tests.
 * The default retains B9.2.5 synthetic timestamps; NOT safe for live Workers.
 */
const fenceFor=(lease,checkedAtMs)=>({leaseToken:lease.leaseToken,leaseEpoch:lease.leaseEpoch,checkedAtMs});
export async function runOneLocalStep(db,scanArgs,resolver,session,{nowMs=0,leaseMs=30000,baseline=null,commitClock=null}={}){
 checkDB(db);nowCheck(nowMs);scanID(scanArgs?.scanId);
 requireOk(session?.snapshotRevision===scanArgs.snapshotRevision,'Snapshot session / scan revision mismatch');
 const lease=await claimLocalStep(db,scanArgs.scanId,{nowMs,leaseMs});
 if(lease.kind==='busy'||lease.kind==='done'||lease.kind==='failed')return {status:lease.kind};
 let failureNow=nowMs;
 try{
  await validateLease(db,lease,nowMs);
  if(lease.kind==='page'){
   const raw=await resolver.page({folderId:lease.page.folderId,pageNo:lease.page.pageNo,snapshotRevision:session.snapshotRevision});
   const normalized=validatePageEnvelope(raw,session,{folderId:lease.page.folderId,pageNo:lease.page.pageNo,nowMs});
   const writeNow=commitClock?commitClock():nowMs;nowCheck(writeNow);failureNow=writeNow;
   await validateLease(db,lease,writeNow);
   await commitCompactPage(db,scanArgs.scanId,lease.page.folderId,normalized.page,{snapshotRevision:normalized.snapshotRevision,fence:fenceFor(lease,writeNow)});
   const state=await acknowledgeLocalPage(db,lease,{nowMs:writeNow});
   return {status:'page',stepsCompleted:state.stepsCompleted};
  }
  const evidence=validateEndEnvelope(await resolver.end(scanArgs.rootFolderId),session,{nowMs});
  const writeNow=commitClock?commitClock():nowMs;nowCheck(writeNow);failureNow=writeNow;
  await validateLease(db,lease,writeNow);
  const result=await finalizeCompactScan(db,scanArgs.scanId,{baseline,...evidence,fence:fenceFor(lease,writeNow)});
  await acknowledgeLocalSeal(db,lease,{nowMs:writeNow});
  return {status:result.status,needsFullStage:result.needsFullStage,productionActivation:false};
 }catch(error){
  try{
   const retry=await rejectLocalStep(db,lease,error,{nowMs:failureNow});
   return {status:retry.status,attempts:retry.attempts,retryAtMs:retry.retryAtMs,previousCatalogRetained:true};
  }catch(fenced){return {status:'lease-lost',previousCatalogRetained:true};}
 }
}
/** Estimates only, not authorizing cloud work. 1 job/story still needs thousands
 * of Worker invocations, durable dispatch, D1 accounting and CPU verification.
 */
export function estimateLocalScheduler({stories=242,pages=4978,queueOpsUsed=null,workerRequestsUsed=null,d1RowsWritten=null,
 reserveQueue=1500,reserveWorker=15000,reserveD1Writes=25000}={}){
 for(const [key,n] of Object.entries({stories,pages,reserveQueue,reserveWorker,reserveD1Writes}))requireOk(Number.isSafeInteger(n)&&n>=0,`Invalid ${key}`);
 const known=[queueOpsUsed,workerRequestsUsed,d1RowsWritten].every(n=>Number.isSafeInteger(n)&&n>=0);
 const queuedOps=stories*3; // a single queue message per story; not one per page
 const workerSteps=pages+stories; // one per page plus seal; excludes app and retry traffic
 const minimumD1Writes=3*(pages+stories); // one minimum metadata/phase write + insertion/deletion of a transient atomic fence row per step; actual costs are higher
 const headroom=known&&queuedOps+queueOpsUsed<=10000-reserveQueue&&workerSteps+workerRequestsUsed<=100000-reserveWorker&&minimumD1Writes+d1RowsWritten<=100000-reserveD1Writes;
 return {queueOperationsEstimate:queuedOps,workerRequestsMinimum:workerSteps,d1RowWritesLowerBound:minimumD1Writes,accountUsageKnown:known,
  withinLowerBoundBudget:headroom,stagingApproved:false,productionApproved:false,cloudCpuVerified:false,remoteResolverVerified:false,
  warning:'Local-only estimates omit actual D1 writes, retries, concurrent playback and cloud CPU; never approve deployment from these figures.'};
}
export {validateBeginEnvelope};
