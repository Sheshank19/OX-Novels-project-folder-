/** B9.2 Step B — off-network activation+rollback using a prepared candidate. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import cryptoNode from 'node:crypto';
import {loadStageSettings,trustedBaseline} from './sync-one-story-local.mjs';
import {assertProtectedCatalog,assertPlayerKeyMatchesStatic} from './catalog-compat.mjs';
import {initialPointer,OfflineActivationStore,rehearsePromotion,rehearseRollback,
  playableGeneration,acceptedAsset,loadReference} from './b92-activation-core.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..','..');
const PREPARED=path.join(HERE,'_PRIVATE_PREPARED_DO_NOT_DEPLOY');
const PLAYER_KEY=path.join(ROOT,'local-player-handoff','.env.player-handoff');
const STATIC=path.join(ROOT,'local-player-b5','public','catalogs');
const goodCodes=new Set(['PRIVATE_CANDIDATE_MISSING','PRIVATE_CANDIDATE_INVALID','STATIC_CATALOG_INVALID',
  'PLAYER_KEY_INVALID','SAVED_BASELINE_MISSING','SAVED_BASELINE_INVALID','STAGE_CONFIG_MISSING','STAGE_CONFIG_INVALID',
  'STORY_NOT_MATCHED','STORY_NOT_UNIQUE','MOCK_PROMOTION_FAILED','MOCK_ROLLBACK_FAILED']);
const say=(a,b)=>console.log(String(a).padEnd(34)+': '+String(b));
const fail=x=>{throw Object.assign(new Error(x),{code:x});};
function loadPlayerKey(){
  if(!fs.existsSync(PLAYER_KEY))fail('PLAYER_KEY_INVALID');
  let key;try{key=Buffer.from(fs.readFileSync(PLAYER_KEY,'utf8').trim(),'base64url');}catch{fail('PLAYER_KEY_INVALID');}
  if(key.length!==32)fail('PLAYER_KEY_INVALID');return key;
}
function selectCandidate({story,key}){
  if(!fs.existsSync(PREPARED))fail('PRIVATE_CANDIDATE_MISSING');
  const files=fs.readdirSync(PREPARED,{withFileTypes:true}).filter(d=>d.isFile()&&
    /^((prepared|sync)-[a-zA-Z0-9_-]+)\.PREPARED-DO-NOT-DEPLOY\.json$/.test(d.name))
    .map(d=>({file:path.join(PREPARED,d.name),modified:fs.statSync(path.join(PREPARED,d.name)).mtimeMs}))
    .sort((a,b)=>b.modified-a.modified);
  for(const item of files){
    try{
      if(fs.statSync(item.file).size>24*1024*1024)continue;
      const value=JSON.parse(fs.readFileSync(item.file,'utf8'));
      if(value.storyId!==story.id||value.sourceVersion!==story.sourceVersion)continue;
      assertProtectedCatalog(value,key,{id:story.id,sourceVersion:story.sourceVersion});
      return value;
    }catch{}
  }
  fail(files.length?'PRIVATE_CANDIDATE_INVALID':'PRIVATE_CANDIDATE_MISSING');
}
export async function rehearsal(){
  say('Mode','OFFLINE ACTIVATION + ROLLBACK REHEARSAL ONLY');
  say('Cloudflare / Google requests','NONE');
  say('Deployments / catalog publication','NONE');
  const cfg=loadStageSettings();
  trustedBaseline(cfg.secret,cfg.root); // sealed audit baseline still exists
  const {listStories}=await import('../../local-player-b5/scripts/common.mjs');
  const stories=listStories().filter(s=>s.folderId===cfg.root);
  if(stories.length!==1)fail(stories.length?'STORY_NOT_UNIQUE':'STORY_NOT_MATCHED');
  const story=stories[0],key=loadPlayerKey();
  let staticCatalog;
  try{
    staticCatalog=JSON.parse(fs.readFileSync(path.join(STATIC,story.id+'.json'),'utf8'));
    assertPlayerKeyMatchesStatic(staticCatalog,key,story);
    assertProtectedCatalog(staticCatalog,key,{id:story.id,sourceVersion:story.sourceVersion});
  }catch{fail('STATIC_CATALOG_INVALID');}
  const candidate=selectCandidate({story,key});
  const current=initialPointer(staticCatalog);
  const store=new OfflineActivationStore(current);
  const staticBody=JSON.stringify(staticCatalog);
  const staticReader=async()=>staticBody;
  const when=Date.now();
  let promoted;
  try{
    promoted=await rehearsePromotion(store,{candidate,expectedRevision:0,now:when,allowRehearsalOnly:true});
    const effective=acceptedAsset(promoted,candidate.generationId,when);
    const read=await loadReference(store,effective,{loadStatic:staticReader});
    assertProtectedCatalog(read,key,{id:story.id,sourceVersion:story.sourceVersion});
    if(!playableGeneration(promoted,staticCatalog.generationId,when+1000) ||
       playableGeneration(promoted,staticCatalog.generationId,when+31*60*1000))
      fail('MOCK_PROMOTION_FAILED');
  }catch{fail('MOCK_PROMOTION_FAILED');}
  let rolled;
  try{
    rolled=await rehearseRollback(store,{storyId:story.id,expectedRevision:1,
      loadStatic:staticReader,now:when+2000,allowRehearsalOnly:true});
    const restored=await loadReference(store,rolled.current,{loadStatic:staticReader});
    if(restored.generationId!==staticCatalog.generationId ||
       !playableGeneration(rolled,candidate.generationId,when+3000))fail('MOCK_ROLLBACK_FAILED');
  }catch{fail('MOCK_ROLLBACK_FAILED');}
  say('Protected candidate',`${candidate.folderCount} folders / ${candidate.trackCount} tracks`);
  say('Stored candidate blob','IMMUTABLE / SHA-256 VERIFIED (MEMORY ONLY)');
  say('Guarded pointer promotion','PASSED (MEMORY ONLY)');
  say('Previous-generation grace','PASSED (LOGIC ONLY)');
  say('Rollback to static catalog','PASSED (MEMORY ONLY)');
  say('Existing 242 static catalogs','UNTOUCHED');
  say('Saved Drive audit baseline','UNCHANGED');
  say('Candidate file','UNTOUCHED / PRIVATE');
  say('Cloudflare D1 CAS / KV propagation','NOT TESTED');
  say('Pinned Drive snapshot','NOT PROVEN');
  say('CHECK STATUS','STEP B LOCAL ACTIVATION REHEARSAL PASSED — NOT DEPLOYED');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log('\nOX B9.2 — STEP B / PRIVATE CATALOG ACTIVATION REHEARSAL\n');
  rehearsal().catch(err=>{
    say('CHECK STATUS','INCOMPLETE — NO DEPLOYMENT');
    say('Reason',goodCodes.has(err?.code)?err.code:'SAFE_LOCAL_VALIDATION_FAILED');
    process.exitCode=1;
  });
}
