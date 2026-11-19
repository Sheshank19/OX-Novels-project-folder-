/**
 * OX B9.2 / Step A — single-story READ-ONLY real Drive -> protected catalog pipeline.
 * This is local-only staging. In particular, it NEVER updates the saved audit
 * baseline, production catalogs, Player Worker, KV, D1 or Apps Script.
 *
 * A first complete fresh read equal to the HMAC-sealed audit baseline means
 * UNCHANGED: no second scan or catalog build necessary. A changed first read
 * requires an identical SECOND fresh pass before a PREPARED-ONLY candidate.
 * Matching two passes is an observation, NOT a pinned Drive snapshot, so
 * automatic publication remains disabled regardless of the outcome.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { traversePass, requestClient } from './prepare-one-story-catalog.mjs';
import { inventoryCommitments, identicalCommitments, sealedBaselineMac,
  validateInventory, buildProtectedCatalog, assertProtectedCatalog,
  assertPlayerKeyMatchesStatic } from './catalog-compat.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const CONFIG = path.join(HERE, 'resolver-stage.local.json');
const BASELINE = path.join(HERE, 'stage-story-baseline.local.json');
const KEY = path.join(ROOT, 'local-player-handoff', '.env.player-handoff');
const CANDIDATE_DIR = path.join(HERE, '_PRIVATE_PREPARED_DO_NOT_DEPLOY');
const FOLDER_ID = /^[A-Za-z0-9_-]{10,}$/;
const CODE = new Set(['STAGE_CONFIG_MISSING','STAGE_CONFIG_INVALID','SAVED_BASELINE_MISSING',
  'SAVED_BASELINE_INVALID','LOCAL_D1_STORY_NOT_FOUND','AMBIGUOUS_STORY_ROOT',
  'PLAYER_KEY_NOT_FOUND','PLAYER_KEY_INVALID','STATIC_CATALOG_INVALID',
  'STAGING_SERVICE_NOT_UPGRADED','DRIVE_READ_INCOMPLETE','SCAN_PASSES_DISAGREE',
  'CATALOG_VALIDATION_FAILED','PRIVATE_CANDIDATE_WRITE_FAILED']);
const label = (k,v) => console.log(String(k).padEnd(31)+': '+v);
function fail(code){ throw Object.assign(new Error(code), {code}); }
function safeRoot(text){
  const s=String(text || '').trim();
  const m=s.match(/(?:drive\/folders|folders)\/([A-Za-z0-9_-]{10,})/) ||
    s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  const id=m?.[1] || (FOLDER_ID.test(s) ? s : '');
  if(!FOLDER_ID.test(id)) fail('STAGE_CONFIG_INVALID');
  return id;
}
export function loadStageSettings(file=CONFIG){
  if(!fs.existsSync(file)) fail('STAGE_CONFIG_MISSING');
  let cfg; try { cfg=JSON.parse(fs.readFileSync(file,'utf8')); } catch { fail('STAGE_CONFIG_INVALID'); }
  let u; try { u=new URL(String(cfg.resolverUrl || '')); } catch { fail('STAGE_CONFIG_INVALID'); }
  if(u.protocol!=='https:' || u.hostname!=='script.google.com' ||
     !/^\/macros\/s\/[^/]+\/exec\/?$/.test(u.pathname) || u.search || u.hash ||
     typeof cfg.resolverSecret!=='string' || cfg.resolverSecret.length<32)
    fail('STAGE_CONFIG_INVALID');
  return {endpoint:u.toString(), secret:cfg.resolverSecret, root:safeRoot(cfg.testStoryDriveUrl)};
}
export function trustedBaseline(secret,root,file=BASELINE){
  if(!fs.existsSync(file)) fail('SAVED_BASELINE_MISSING');
  let b; try { b=JSON.parse(fs.readFileSync(file,'utf8')); } catch { fail('SAVED_BASELINE_INVALID'); }
  const expectedRoot=inventoryCommitments(secret,root,{[root]:{folders:[],tracks:[]}}).rootMac;
  if(!b || b.schema!==1 || b.stageVersion!=='ox-stage-readonly-v1' ||
     b.rootMac!==expectedRoot || !b.folders || !b.tracks ||
     Array.isArray(b.folders) || Array.isArray(b.tracks) ||
     typeof b.folders!=='object' || typeof b.tracks!=='object' ||
     b.folderCount!==Object.keys(b.folders).length ||
     b.trackCount!==Object.keys(b.tracks).length ||
     b.mac!==sealedBaselineMac(secret,b)) fail('SAVED_BASELINE_INVALID');
  return b;
}
function diff(before,after){
  let added=0,removed=0,modified=0;
  for(const [k,v] of Object.entries(after)){
    if(!Object.hasOwn(before,k)) added++;
    else if(before[k]!==v) modified++;
  }
  for(const k of Object.keys(before)) if(!Object.hasOwn(after,k)) removed++;
  return {added,removed,modified};
}
export async function assessSingleStory({root,secret,baseline,readPass}){
  const first=await readPass();
  validateInventory(root,first.nodes);
  const a=inventoryCommitments(secret,root,first.nodes);
  if(a.rootMac!==baseline.rootMac) fail('SAVED_BASELINE_INVALID');
  if(identicalCommitments(a,baseline) &&
     Object.keys(a.folders).length===baseline.folderCount &&
     Object.keys(a.tracks).length===baseline.trackCount){
    return {status:'UNCHANGED',passes:1,pages:first.pages,
      folders:Object.keys(first.nodes).length,tracks:Object.keys(a.tracks).length,
      diffFolders:{added:0,removed:0,modified:0},
      diffTracks:{added:0,removed:0,modified:0}};
  }
  const second=await readPass();
  validateInventory(root,second.nodes);
  const b=inventoryCommitments(secret,root,second.nodes);
  if(!identicalCommitments(a,b) ||
     Object.keys(a.folders).length!==Object.keys(b.folders).length ||
     Object.keys(a.tracks).length!==Object.keys(b.tracks).length)
    fail('SCAN_PASSES_DISAGREE');
  return {status:'CHANGED_PREPARE_ONLY',passes:2,pages:first.pages+second.pages,
    folders:Object.keys(second.nodes).length,tracks:Object.keys(b.tracks).length,
    diffFolders:diff(baseline.folders,b.folders),
    diffTracks:diff(baseline.tracks,b.tracks),
    nodes:second.nodes};
}
function loadKey(file=KEY){
  if(!fs.existsSync(file)) fail('PLAYER_KEY_NOT_FOUND');
  let k;
  try { k=Buffer.from(fs.readFileSync(file,'utf8').trim().replace(/-/g,'+').replace(/_/g,'/'),'base64'); }
  catch { fail('PLAYER_KEY_INVALID'); }
  if(k.length!==32) fail('PLAYER_KEY_INVALID');
  return k;
}
async function localStoryFor(root){
  let listStories,stories;
  try { ({listStories}=await import('../../local-player-b5/scripts/common.mjs')); stories=listStories(); }
  catch { fail('LOCAL_D1_STORY_NOT_FOUND'); }
  const matches=stories.filter(s=>s.folderId===root);
  if(!matches.length) fail('LOCAL_D1_STORY_NOT_FOUND');
  if(matches.length!==1) fail('AMBIGUOUS_STORY_ROOT');
  const story=matches[0];
  if(!story.id || !/^[a-z0-9][a-z0-9._-]{0,159}$/.test(story.id) ||
    story.sourceVersion!==crypto.createHash('sha256').update(root).digest('hex').slice(0,12))
    fail('LOCAL_D1_STORY_NOT_FOUND');
  return story;
}
export function preparePrivateCandidate({story,root,nodes,key,previousCatalog,
  outputDir=CANDIDATE_DIR, now=new Date()}){
  // Verify old/static Player token with the same local key BEFORE writing.
  try { assertPlayerKeyMatchesStatic(previousCatalog,key,story); }
  catch { fail('STATIC_CATALOG_INVALID'); }
  let safe;
  try {
    safe=buildProtectedCatalog({story,root,nodes,key,
      generationId:`g_stage_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`,
      builtAt:now.toISOString()});
    assertProtectedCatalog(safe,key,{id:story.id,sourceVersion:story.sourceVersion});
  } catch { fail('CATALOG_VALIDATION_FAILED'); }
  const body=JSON.stringify(safe);
  if(body.length>20_000_000) fail('CATALOG_VALIDATION_FAILED');
  const filename=`sync-${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}.PREPARED-DO-NOT-DEPLOY.json`;
  const dest=path.join(outputDir,filename), temp=dest+'.tmp';
  try {
    fs.mkdirSync(outputDir,{recursive:true,mode:0o700});
    fs.writeFileSync(temp,body,{encoding:'utf8',mode:0o600,flag:'wx'});
    fs.renameSync(temp,dest);
  } catch {
    try { fs.rmSync(temp,{force:true}); } catch {}
    fail('PRIVATE_CANDIDATE_WRITE_FAILED');
  }
  return {trackCount:safe.trackCount,folderCount:safe.folderCount};
}
export async function runLocalSync(){
  label('Mode','ONE STORY / READ-ONLY / NO DEPLOYMENT');
  const cfg=loadStageSettings();
  const baseline=trustedBaseline(cfg.secret,cfg.root);
  // Validate local story and static Player key BEFORE any Google requests.
  const story=await localStoryFor(cfg.root);
  const key=loadKey();
  let previous;
  try {
    const file=path.join(ROOT,'local-player-b5','public','catalogs',story.id+'.json');
    previous=JSON.parse(fs.readFileSync(file,'utf8'));
    assertPlayerKeyMatchesStatic(previous,key,story);
  } catch { fail('STATIC_CATALOG_INVALID'); }
  const client=requestClient(cfg.endpoint,cfg.secret);
  const ping=await client.call();
  if(!ping || ping.ok!==true || ping.version!=='ox-stage-readonly-v1' ||
     ping.configured!==true || ping.writesEnabled!==false ||
     ping.pinnedSnapshot!==false || ping.requestBinding!=='nonce-echo-v1')
    fail('STAGING_SERVICE_NOT_UPGRADED');
  const result=await assessSingleStory({root:cfg.root,secret:cfg.secret,baseline,
    readPass:()=>traversePass(cfg.root,payload=>client.call(payload))});
  const metrics=client.metrics();
  label('First fresh Drive read','COMPLETE');
  label('Second Drive read',result.passes===2?'MATCHED':'SKIPPED — UNCHANGED');
  label('Folders including root',result.folders);
  label('Audio tracks',result.tracks);
  label('Metadata pages total',result.pages);
  label('Resolver GET + POST requests',metrics.count);
  label('Temporary retries',metrics.retries);
  label('Google redirected 404s',metrics.content404s);
  label('Folders + / - / modified',Object.values(result.diffFolders).join(' / '));
  label('Tracks + / - / modified',Object.values(result.diffTracks).join(' / '));
  if(result.status==='UNCHANGED'){
    label('Catalog generation','SKIPPED — NO OBSERVED CHANGES');
    label('Saved audit baseline','UNCHANGED');
    label('CHECK STATUS','UNCHANGED — NO CATALOG BUILT');
    return result;
  }
  const made=preparePrivateCandidate({story,root:cfg.root,nodes:result.nodes,key,previousCatalog:previous});
  label('Protected catalog',`${made.folderCount} folders / ${made.trackCount} encrypted tracks`);
  label('Catalog destination','PRIVATE LOCAL FOLDER ONLY');
  label('Saved audit baseline','UNCHANGED');
  label('Pinned snapshot proof','NOT VERIFIED');
  label('Cloudflare catalog activation','DISABLED');
  label('CHECK STATUS','CHANGES DETECTED — PRIVATE CANDIDATE PREPARED');
  return result;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log('\nOX B9.2 — REAL DRIVE TO CATALOG / STEP A — READ ONLY\n');
  runLocalSync().catch(e=>{
    label('CHECK STATUS','INCOMPLETE — NO PUBLICATION');
    label('Reason',CODE.has(e?.code)?e.code:'READ_ONLY_STAGE_VALIDATION_FAILED');
    label('Saved audit baseline','UNCHANGED');
    process.exitCode=1;
  });
}
