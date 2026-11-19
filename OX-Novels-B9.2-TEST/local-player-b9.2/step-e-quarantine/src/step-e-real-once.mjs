/** Real Drive Step E entrypoint: one-story read-only scan, local quarantine only. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadStageSettings,trustedBaseline} from '../../staging/sync-one-story-local.mjs';
import {requestClient,traversePass} from '../../staging/prepare-one-story-catalog.mjs';
import {stepECandidateGate} from './candidate-gate.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..','..','..');
const STAGING=path.join(ROOT,'local-player-b9.2','staging');
const QUARANTINE=path.join(STAGING,'_PRIVATE_STEP_E_QUARANTINE_NO_UPLOAD');
const output=(k,v)=>console.log(String(k).padEnd(34)+': '+String(v));
function abort(code){throw Object.assign(new Error(code),{code});}
console.log('\nOX B9.2 — STEP E / REAL DRIVE TO PRIVATE QUARANTINE\n');
output('Network','STAGING GOOGLE APPS SCRIPT READ-ONLY');
output('Cloudflare requests / publication','NONE / DISABLED');
output('Production Player / catalogs','UNTOUCHED');
try{
  const cfg=loadStageSettings();
  const baseline=trustedBaseline(cfg.secret,cfg.root);
  const {listStories}=await import('../../../local-player-b5/scripts/common.mjs');
  const choices=listStories().filter(s=>s.folderId===cfg.root);
  if(choices.length!==1)abort('STORY_NOT_UNIQUE');
  const story=choices[0];
  const source=crypto.createHash('sha256').update(cfg.root).digest('hex').slice(0,12);
  if(story.sourceVersion!==source)abort('STORY_SOURCE_MISMATCH');
  let key,staticCatalog;
  try{
    key=Buffer.from(fs.readFileSync(path.join(ROOT,'local-player-handoff','.env.player-handoff'),'utf8').trim(),'base64url');
    staticCatalog=JSON.parse(fs.readFileSync(path.join(ROOT,'local-player-b5','public','catalogs',story.id+'.json'),'utf8'));
  }catch{abort('STATIC_OR_PLAYER_KEY_INVALID');}
  // Check the staging resolver version before starting expensive Drive reads.
  const client=requestClient(cfg.endpoint,cfg.secret);
  const health=await client.call();
  if(health?.ok!==true||health.version!=='ox-stage-readonly-v1'||
      health.requestBinding!=='nonce-echo-v1'||health.writesEnabled!==false||
      health.pinnedSnapshot!==false||health.configured!==true)abort('STAGING_RESOLVER_UNSAFE');
  const out=await stepECandidateGate({root:cfg.root,secret:cfg.secret,baseline,
    readPass:()=>traversePass(cfg.root,data=>client.call(data)),story,key,staticCatalog,
    quarantineDir:QUARANTINE});
  const m=client.metrics();
  output('First Drive read','COMPLETE');
  output('Second Drive read',out.assessment.passes===2?'MATCHED':'SKIPPED — UNCHANGED');
  output('Folders including root',out.assessment.folders);
  output('Tracks',out.assessment.tracks);
  output('Resolver requests',m.count);
  output('Temporary retries',m.retries);
  output('Google redirected 404s',m.content404s);
  output('Catalog upload','NONE');
  output('Production / staging activation','DISABLED');
  output('Saved audit baseline','UNCHANGED');
  if(out.state==='UNCHANGED'){
    output('CHECK STATUS','STEP E UNCHANGED — NO CANDIDATE GENERATED');
  }else if(out.state==='SAME_AS_STATIC'){
    output('CHECK STATUS','STEP E CONTENT EQUAL TO STATIC — NO NEW GENERATION');
  }else{
    output('Protected local candidate','PRIVATE QUARANTINE PAIR SAVED');
    output('SHA-256 / receipt seal','VERIFIED');
    output('Offline activation / rollback','REHEARSED WITH ACTUAL CANDIDATE');
    output('Atomic Drive snapshot','NOT PROVEN');
    output('CHECK STATUS','STEP E QUARANTINED — NOT PUBLISHABLE');
  }
}catch(e){
  output('CHECK STATUS','INCOMPLETE — NO PUBLICATION');
  // Do not leak raw Drive IDs, tokens, URLs, credentials or private filenames.
  const safe=new Set(['LOCAL_PREFLIGHT_FAILED','STATIC_OR_PLAYER_KEY_INVALID',
    'STORY_NOT_UNIQUE','STORY_SOURCE_MISMATCH','STAGING_RESOLVER_UNSAFE',
    'CHANGE_PROOF_MISSING','CANDIDATE_INVALID','TWO_PASSES_REQUIRED',
    'GENERATION_GRACE_FAILED','ROLLBACK_REHEARSAL_FAILED','QUARANTINE_WRITE_FAILED']);
  output('Reason',safe.has(e?.code)?e.code:'DRIVE_OR_GATE_VERIFICATION_FAILED');
  process.exitCode=1;
}
