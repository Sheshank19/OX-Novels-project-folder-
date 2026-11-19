/**
 * OX B9.2 Step E — verify a real *changed* story and quarantine an encrypted
 * Player candidate locally. No upload, activation, KV/D1 writes or scheduling.
 * A matching two-pass Drive observation is NOT an atomic snapshot and cannot
 * authorize publication. Synthetic Step C remains unchanged and isolated.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {assessSingleStory} from '../../staging/sync-one-story-local.mjs';
import {catalogDigest,inventoryCommitments,identicalCommitments,
  buildProtectedCatalog,assertProtectedCatalog,assertPlayerKeyMatchesStatic,
  decryptToken} from '../../staging/catalog-compat.mjs';
import {initialPointer,OfflineActivationStore,rehearsePromotion,rehearseRollback,
  playableGeneration,loadReference} from '../../staging/b92-activation-core.mjs';

const err=code=>{throw Object.assign(new Error(code),{code});};
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const iso=()=>new Date().toISOString();
const safeArr=obj=>Object.entries(obj).sort(([a],[b])=>a.localeCompare(b));
const HMAC_VERSION='ox-b92-step-e-quarantine-v1';
function exactKeyedSeal(secret,tag,text){return catalogDigest(secret,tag,text);}

// Semantic comparison ignores generation IDs, nonces and neighboring track
// links. It still binds every folder's parent/child structure, track identity,
// name, size, modified time and mime type. This blocks generation-only churn.
export function catalogSemantics(catalog,key){
  if(!catalog||!catalog.folders||!Buffer.isBuffer(key)||key.length!==32)err('INVALID_CATALOG');
  const rows=[];
  for(const [folderKey,node] of safeArr(catalog.folders)){
    const children=(node.folders||[]).map(v=>[v.key,v.name]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    rows.push(['folder',folderKey,node.name,children]);
    for(const t of node.tracks||[]){
      const p=decryptToken(t.key,key);
      rows.push(['track',folderKey,p.fileId,t.name,t.mimeType,t.size,t.modifiedAt]);
    }
  }
  rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return sha(JSON.stringify([catalog.storyId,catalog.sourceVersion,catalog.rootKey,rows]));
}

export function receiptSeal(secret,withoutSeal){
  const all={...withoutSeal};delete all.seal;
  return exactKeyedSeal(secret,'step-e-receipt',JSON.stringify(all));
}
export function assertQuarantineReceipt({secret,receipt,candidate,baseline}){
  if(!receipt||receipt.schema!==1||receipt.kind!==HMAC_VERSION||
      receipt.publicationAllowed!==false||receipt.pinnedSnapshotProven!==false||
      receipt.twoPassObserved!==true||receipt.stagingOnly!==true||
      receipt.baselineSeal!==baseline?.mac||
      receipt.catalogDigest!==sha(JSON.stringify(candidate))||
      !/^[a-f0-9]{64}$/.test(receipt.observedCommitment||'')||
      !/^[a-f0-9]{64}$/.test(receipt.catalogDigest||'')||
      !/^[a-f0-9]{64}$/.test(receipt.seal||'')||
      receipt.seal!==receiptSeal(secret,receipt))err('RECEIPT_INTEGRITY_FAILED');
  return true;
}

export async function rehearseCandidate({candidate,staticCatalog,key,now=Date.now()}){
  assertProtectedCatalog(candidate,key,{id:staticCatalog.storyId,sourceVersion:staticCatalog.sourceVersion});
  const initial=initialPointer(staticCatalog);
  const store=new OfflineActivationStore(initial);
  const promoted=await rehearsePromotion(store,{candidate,expectedRevision:0,now,
    allowRehearsalOnly:true,graceMs:30*60_000});
  const read=await loadReference(store,promoted.current);
  assertProtectedCatalog(read,key,{id:candidate.storyId,sourceVersion:candidate.sourceVersion});
  if(!playableGeneration(promoted,staticCatalog.generationId,now+1000)||
      playableGeneration(promoted,staticCatalog.generationId,now+31*60_000))
    err('GENERATION_GRACE_FAILED');
  const rollback=await rehearseRollback(store,{storyId:candidate.storyId,
    expectedRevision:1,now:now+2000,allowRehearsalOnly:true,
    loadStatic:async()=>JSON.stringify(staticCatalog)});
  if(rollback.current.generationId!==staticCatalog.generationId||
      rollback.previous.generationId!==candidate.generationId||rollback.revision!==2)
    err('ROLLBACK_REHEARSAL_FAILED');
  return true;
}

function atomicPair(dir,candidate,receipt){
  const rand=crypto.randomBytes(12).toString('hex');
  const base='quarantine-'+rand;
  const catalogPath=path.join(dir,base+'.PRIVATE-CATALOG.json');
  const receiptPath=path.join(dir,base+'.PRIVATE-RECEIPT.json');
  const tempCatalog=catalogPath+'.tmp';
  const tempReceipt=receiptPath+'.tmp';
  let publishedCatalog=false, publishedReceipt=false;
  try{
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    fs.writeFileSync(tempCatalog,JSON.stringify(candidate),{flag:'wx',mode:0o600});
    fs.writeFileSync(tempReceipt,JSON.stringify(receipt),{flag:'wx',mode:0o600});
    fs.renameSync(tempCatalog,catalogPath);publishedCatalog=true;
    fs.renameSync(tempReceipt,receiptPath);publishedReceipt=true;
    return {catalogPath,receiptPath};
  }catch{
    for(const name of [tempCatalog,tempReceipt,...(publishedCatalog?[catalogPath]:[]),...(publishedReceipt?[receiptPath]:[])]){
      try{fs.rmSync(name,{force:true});}catch{}
    }
    err('QUARANTINE_WRITE_FAILED');
  }
}

/** Caller supplies verified audit baseline, staging resolver readPass and the
 * actual local B5 Player key/static catalog; no network or writes are inside
 * this function except the explicit PRIVATE local candidate/receipt pair. */
export async function stepECandidateGate({root,secret,baseline,readPass,story,key,
  staticCatalog,quarantineDir,now=Date.now()}){
  if(typeof secret!=='string'||secret.length<32||!story||story.folderId!==root||
      !quarantineDir||!Buffer.isBuffer(key)||key.length!==32)err('LOCAL_PREFLIGHT_FAILED');
  try{
    assertPlayerKeyMatchesStatic(staticCatalog,key,story);
    assertProtectedCatalog(staticCatalog,key,{id:story.id,sourceVersion:story.sourceVersion});
  }catch{err('STATIC_OR_PLAYER_KEY_INVALID');}
  const assessment=await assessSingleStory({root,secret,baseline,readPass});
  if(assessment.status==='UNCHANGED')return {state:'UNCHANGED',assessment,prepared:false};
  if(assessment.status!=='CHANGED_PREPARE_ONLY'||assessment.passes!==2||!assessment.nodes)
    err('TWO_PASSES_REQUIRED');
  const observed=inventoryCommitments(secret,root,assessment.nodes);
  if(identicalCommitments(observed,baseline))err('CHANGE_PROOF_MISSING');
  const gen='g_stage_e_'+crypto.randomBytes(12).toString('hex');
  const builtAt=iso();
  let candidate;
  try{
    candidate=buildProtectedCatalog({story,root,nodes:assessment.nodes,key,
      generationId:gen,builtAt});
    assertProtectedCatalog(candidate,key,{id:story.id,sourceVersion:story.sourceVersion});
  }catch{err('CANDIDATE_INVALID');}
  // Do not build a generation-only update, even if the previous audit was old.
  if(catalogSemantics(candidate,key)===catalogSemantics(staticCatalog,key))
    return {state:'SAME_AS_STATIC',assessment,prepared:false};
  await rehearseCandidate({candidate,staticCatalog,key,now});
  const proof=exactKeyedSeal(secret,'observed-inventory',JSON.stringify([
    observed.rootMac,safeArr(observed.folders),safeArr(observed.tracks)]));
  const receipt={schema:1,kind:HMAC_VERSION,stagingOnly:true,
    twoPassObserved:true,pinnedSnapshotProven:false,publicationAllowed:false,
    hasAutomaticApproval:false,requiresHumanReview:true,
    baselineSeal:baseline.mac,observedCommitment:proof,
    catalogDigest:sha(JSON.stringify(candidate)),
    previousCatalogDigest:sha(JSON.stringify(staticCatalog)),
    folderChanges:assessment.diffFolders,trackChanges:assessment.diffTracks,
    trackCount:candidate.trackCount,folderCount:candidate.folderCount};
  receipt.seal=receiptSeal(secret,receipt);
  assertQuarantineReceipt({secret,receipt,candidate,baseline});
  const saved=atomicPair(quarantineDir,candidate,receipt);
  return {state:'QUARANTINED',assessment,prepared:true,
    ...saved,receipt,candidate};
}
