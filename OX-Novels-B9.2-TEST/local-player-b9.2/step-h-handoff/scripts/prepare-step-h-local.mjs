/** B9.2 Step H — local disk handoff only, no networking, no uploads. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadStageSettings,trustedBaseline} from '../../staging/sync-one-story-local.mjs';
import {prepareHandoff,selectQuarantinedPair} from '../src/step-h-bundle.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..','..','..');
const STAGE=path.join(ROOT,'local-player-b9.2','staging');
const QUARANTINE=path.join(STAGE,'_PRIVATE_STEP_E_QUARANTINE_NO_UPLOAD');
const OUTPUT=path.join(STAGE,'_PRIVATE_STEP_H_BUNDLE_NO_UPLOAD');
const report=(key,value)=>console.log(String(key).padEnd(34)+': '+value);
const fail=code=>{throw Object.assign(new Error(code),{code});};
console.log('\nOX B9.2 — STEP H / PRIVATE CHANGED-CATALOG CHUNK HANDOFF\n');
report('Network / Drive / Cloudflare','NONE');
report('Catalog publication / activation','DISABLED');
report('Deployed Worker changes','NONE');
try{
  // No stage secret, Player key, story ID, or candidate data is ever printed.
  const pair=selectQuarantinedPair(QUARANTINE);
  if(!pair){
    report('Step E changed catalog receipt','ABSENT');
    report('Local bundle written','NO');
    report('CHECK STATUS','NO SEALED CHANGE — NO HANDOFF');
  }else{
    const cfg=loadStageSettings();
    const baseline=trustedBaseline(cfg.secret,cfg.root);
    const {listStories}=await import('../../../local-player-b5/scripts/common.mjs');
    const matched=listStories().filter(s=>s.folderId===cfg.root);
    if(matched.length!==1)fail('STORY_NOT_UNIQUE');
    const story=matched[0];
    if(story.sourceVersion!==crypto.createHash('sha256').update(cfg.root).digest('hex').slice(0,12))
      fail('STORY_SOURCE_MISMATCH');
    const key=Buffer.from(fs.readFileSync(path.join(ROOT,'local-player-handoff','.env.player-handoff'),'utf8').trim(),'base64url');
    const staticCatalog=JSON.parse(fs.readFileSync(path.join(ROOT,'local-player-b5','public','catalogs',story.id+'.json'),'utf8'));
    const result=await prepareHandoff({catalogBytes:fs.readFileSync(pair.catalogPath),
      receiptBytes:fs.readFileSync(pair.receiptPath),staticCatalog,key,secret:cfg.secret,
      baseline,story,persistDir:OUTPUT});
    report('Protected catalog',`${result.folderCount} folders / ${result.trackCount} tracks`);
    report('Private chunk count',result.chunkCount);
    report('Private catalog bytes',result.candidateBytes);
    report('Receipt / token integrity','PASSED');
    report('Reconstruction validation','PASSED');
    report('Local bundle',result.created?'CREATED PRIVATELY':'EXISTING VERIFIED — NO REWRITE');
    report('Remote upload','NOT PERMITTED BY THIS SCRIPT');
    report('Atomic Drive snapshot','NOT PROVEN');
    report('CHECK STATUS','PRIVATE STEP H HANDOFF READY — NOT PUBLISHABLE');
  }
}catch(e){
  const known=new Set(['QUARANTINE_PAIR_MISSING','QUARANTINE_PAIR_INCOMPLETE',
    'QUARANTINE_PAIR_AMBIGUOUS','QUARANTINE_FILE_UNSAFE','STEP_H_PREFLIGHT_FAILED',
    'PRIVATE_CANDIDATE_INVALID','PRIVATE_RECEIPT_INVALID','UNSAFE_PUBLICATION_FLAGS',
    'STEP_E_RECEIPT_INVALID','PLAYER_TOKEN_VALIDATION_FAILED',
    'QUARANTINE_COUNT_MISMATCH','STATIC_CATALOG_STALE','NO_SEMANTIC_CONTENT_CHANGE',
    'HANDOFF_INTEGRITY_FAILED','PRIVATE_BUNDLE_WRITE_FAILED','PRIVATE_OUTPUT_UNSAFE',
    'PRIVATE_BUNDLE_TAMPERED','PRIVATE_BUNDLE_INCOMPLETE','STORY_NOT_UNIQUE','STORY_SOURCE_MISMATCH']);
  report('CHECK STATUS','BLOCKED — NO UPLOAD OR PUBLICATION');
  report('Reason',known.has(e?.code)?e.code:'LOCAL_PRIVATE_VALIDATION_FAILED');
  process.exitCode=1;
}
