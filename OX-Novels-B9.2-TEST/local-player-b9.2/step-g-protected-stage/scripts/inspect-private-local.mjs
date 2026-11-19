/** Local-only candidate audit. NEVER uploads or exports tokens, keys or names. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadStageSettings,trustedBaseline} from '../../staging/sync-one-story-local.mjs';
import {assertPlayerKeyMatchesStatic,assertProtectedCatalog} from '../../staging/catalog-compat.mjs';
import {catalogSemantics,assertQuarantineReceipt} from '../../step-e-quarantine/src/candidate-gate.mjs';
import {createManifest,assembleAndVerify} from '../src/vault-core.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..','..','..');
const PRIVATE=path.join(ROOT,'local-player-b9.2','staging');
const QUARANTINE=path.join(PRIVATE,'_PRIVATE_STEP_E_QUARANTINE_NO_UPLOAD');
const PREPARED=path.join(PRIVATE,'_PRIVATE_PREPARED_DO_NOT_DEPLOY');
const log=(k,v)=>console.log(String(k).padEnd(35)+': '+v);
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function abort(code){throw Object.assign(new Error(code),{code});}
const fileList=(dir)=>fs.existsSync(dir)?fs.readdirSync(dir).sort():[];
async function main(){
  console.log('\nOX B9.2 — STEP G / REAL PRIVATE CATALOG LOCAL INSPECTION\n');
  log('Network / Cloudflare requests','NONE');
  log('Private catalog upload','DISABLED');
  log('Production and stage Worker changes','NONE');
  const cfg=loadStageSettings();
  const baseline=trustedBaseline(cfg.secret,cfg.root);
  const {listStories}=await import('../../../local-player-b5/scripts/common.mjs');
  const found=listStories().filter(s=>s.folderId===cfg.root);
  if(found.length!==1)abort('STORY_NOT_UNIQUE');
  const story=found[0];
  const source=hash(cfg.root).slice(0,12);
  if(story.sourceVersion!==source)abort('STORY_SOURCE_MISMATCH');
  const key=Buffer.from(fs.readFileSync(path.join(ROOT,'local-player-handoff','.env.player-handoff'),'utf8').trim(),'base64url');
  if(key.length!==32)abort('PLAYER_KEY_INVALID');
  const staticCatalog=JSON.parse(fs.readFileSync(path.join(ROOT,'local-player-b5','public','catalogs',story.id+'.json'),'utf8'));
  assertPlayerKeyMatchesStatic(staticCatalog,key,story);
  assertProtectedCatalog(staticCatalog,key,{id:story.id,sourceVersion:story.sourceVersion});
  const pairs=fileList(QUARANTINE).filter(f=>f.endsWith('.PRIVATE-CATALOG.json'));
  if(pairs.length>1)abort('MULTIPLE_QUARANTINE_PAIRS_REQUIRE_SELECTION');
  let candidate,receipt,receiptBytes;
  if(pairs.length===1){
    const name=pairs[0];const receiptName=name.replace('.PRIVATE-CATALOG.json','.PRIVATE-RECEIPT.json');
    if(!fileList(QUARANTINE).includes(receiptName))abort('QUARANTINE_PAIR_INCOMPLETE');
    const candBytes=fs.readFileSync(path.join(QUARANTINE,name));
    receiptBytes=fs.readFileSync(path.join(QUARANTINE,receiptName));
    candidate=JSON.parse(candBytes);receipt=JSON.parse(receiptBytes);
    assertQuarantineReceipt({secret:cfg.secret,receipt,candidate,baseline});
    if(receipt.previousCatalogDigest!==hash(JSON.stringify(staticCatalog)))abort('PREVIOUS_CATALOG_CHANGED');
    if(receipt.publicationAllowed!==false||receipt.pinnedSnapshotProven!==false||
        receipt.requiresHumanReview!==true)abort('SNAPSHOT_PROOF_REQUIRED');
    if(catalogSemantics(candidate,key)===catalogSemantics(staticCatalog,key))abort('NO_REAL_SEMANTIC_CHANGE');
    const count=assertProtectedCatalog(candidate,key,{id:story.id,sourceVersion:story.sourceVersion});
    if(count!==receipt.trackCount||candidate.folderCount!==receipt.folderCount)abort('RECEIPT_COUNT_MISMATCH');
    const currentBytes=Buffer.from(JSON.stringify(candidate));
    const {manifest,parts}=await createManifest({candidateBytes:currentBytes,receiptBytes,
      previousBytes:Buffer.from(JSON.stringify(staticCatalog)),folderCount:candidate.folderCount,trackCount:count});
    const reassembled=await assembleAndVerify(manifest,parts);
    if(!Buffer.from(reassembled).equals(currentBytes))abort('LOCAL_REASSEMBLY_MISMATCH');
    log('Source','SEALED STEP E CHANGED STORY QUARANTINE');
    log('Folder count / protected tracks',`${candidate.folderCount} / ${count}`);
    log('Quarantine byte size / chunks',`${manifest.totalBytes} / ${parts.length}`);
    log('Receipt integrity','HMAC + SHA-256 PASSED');
    log('Protected tokens','VERIFIED AGAINST EXISTING PLAYER KEY');
    log('Remote upload eligibility','REQUIRES SEPARATE HUMAN APPROVAL');
    log('Snapshot proof','NOT ESTABLISHED');
    log('CHECK STATUS','SEALED PRIVATE CATALOG VERIFIED — NO UPLOAD');
    return;
  }
  const ready=fileList(PREPARED).filter(f=>f.endsWith('.PREPARED-DO-NOT-DEPLOY.json'));
  if(ready.length>1)abort('MULTIPLE_PREPARED_FILES_REQUIRE_SELECTION');
  if(ready.length===0){
    log('Step E sealed changed candidate','NOT AVAILABLE');
    log('Action','WAIT FOR A LEGITIMATE DRIVE CONTENT CHANGE');
    log('CHECK STATUS','NO QUARANTINE PAIR — NOTHING UPLOADED');
    return;
  }
  candidate=JSON.parse(fs.readFileSync(path.join(PREPARED,ready[0]),'utf8'));
  const count=assertProtectedCatalog(candidate,key,{id:story.id,sourceVersion:story.sourceVersion});
  const size=Buffer.byteLength(JSON.stringify(candidate),'utf8');
  log('Source','PREPARED CATALOG ONLY — NO SEALED CHANGE RECEIPT');
  log('Folders / protected tracks',`${candidate.folderCount} / ${count}`);
  log('Protected catalog bytes',size);
  log('Step E changed-catalog proof','MISSING — DO NOT UPLOAD');
  log('Remote upload eligibility','BLOCKED');
  log('CHECK STATUS','LOCAL FORMAT VERIFIED — NOT QUARANTINED');
}
try{await main();}catch(e){
  log('CHECK STATUS','INCOMPLETE — NO UPLOAD');
  const known=new Set(['STORY_NOT_UNIQUE','STORY_SOURCE_MISMATCH','PLAYER_KEY_INVALID',
    'MULTIPLE_QUARANTINE_PAIRS_REQUIRE_SELECTION','QUARANTINE_PAIR_INCOMPLETE',
    'MULTIPLE_PREPARED_FILES_REQUIRE_SELECTION',
    'PREVIOUS_CATALOG_CHANGED','SNAPSHOT_PROOF_REQUIRED','NO_REAL_SEMANTIC_CHANGE',
    'RECEIPT_COUNT_MISMATCH','LOCAL_REASSEMBLY_MISMATCH']);
  log('Reason',known.has(e?.code)?e.code:'PRIVATE_FILE_VALIDATION_FAILED');
  process.exitCode=1;
}
