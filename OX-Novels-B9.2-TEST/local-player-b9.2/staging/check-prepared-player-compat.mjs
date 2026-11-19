/**
 * OX B9.2 — disposable B5 Player compatibility smoke test.
 * Reads the latest local PRIVATE prepared candidate and the existing Player key.
 * Runs the actual B5 Worker source in a memory-only Node runtime, mocking the
 * Google Drive audio fetch. NO network, Worker, D1, KV, or Apps Script calls.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertProtectedCatalog, assertPlayerKeyMatchesStatic, decryptToken } from './catalog-compat.mjs';

const DIR=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(DIR,'..','..');
const PRIVATE=path.join(DIR,'_PRIVATE_PREPARED_DO_NOT_DEPLOY');
const KEY_FILE=path.join(ROOT,'local-player-handoff','.env.player-handoff');
const B5=path.join(ROOT,'local-player-b5');
const TEMPLATE=path.join(B5,'src','worker-B5-template.js');
const SAFE_ID=/^[A-Za-z0-9._-]+$/;
const say=(key,val)=>console.log(String(key).padEnd(34)+': '+String(val));
let verificationStep='INITIAL_SETUP';
const at=(step)=>{verificationStep=step;};
const die=(reason)=>{throw Object.assign(new Error(reason),{safeCode:reason});};
const assert=(v,reason)=>{if(!v)die(reason);};
const digest=(p)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

async function sessionCookieFor(secret,storyId) {
  const rawKey=Buffer.from(secret,'base64url');
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',rawKey,iv);
  cipher.setAAD(Buffer.from('OX_PLAYER_SESSION_V1','utf8'));
  const body={v:1,kind:'player-session',iss:'ox-player',aud:'ox-player',storyId,
    storyTitle:'OX local staging check',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+180};
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(body)),cipher.final(),cipher.getAuthTag()]);
  return '__Host-ox_player='+encodeURIComponent('v1.'+iv.toString('base64url')+'.'+encrypted.toString('base64url'));
}
function fakeToken(payload,key) {
  const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from('OX_PLAYER_TRACK_V1'));
  const out=Buffer.concat([cipher.update(JSON.stringify(payload)),cipher.final(),cipher.getAuthTag()]);
  return `t1.${iv.toString('base64url')}.${out.toString('base64url')}`;
}
/**
 * Node cannot resolve relative ES imports from data: modules.
 * Copy ONLY the public Worker template dependencies into a disposable,
 * isolated ESM directory and import the generated Worker from disk.
 * No secrets, candidate catalog, or audio bytes are written here.
 */
async function importWorkerIsolated(moduleCode){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ox-b92-compat-worker-'));
  try {
    const deps=['b9-catalog-manager.js','b9-baseline-fingerprints.js'];
    for(const name of deps){
      const source=path.join(B5,'src',name);
      assert(fs.existsSync(source),'WORKER_DEPENDENCY_MISSING');
      fs.copyFileSync(source,path.join(tmp,name));
    }
    fs.writeFileSync(path.join(tmp,'package.json'),'{"type":"module"}',{mode:0o600});
    const entry=path.join(tmp,'worker-compat.mjs');
    fs.writeFileSync(entry,moduleCode,{mode:0o600});
    const mod=await import(pathToFileURL(entry).href);
    assert(mod && typeof mod.default?.fetch==='function','B5_WORKER_EXPORT_MISSING');
    return mod.default;
  } finally {
    fs.rmSync(tmp,{recursive:true,force:true});
  }
}

function getCandidate(){
  assert(fs.existsSync(PRIVATE),'PRIVATE_CANDIDATE_MISSING');
  const files=fs.readdirSync(PRIVATE).filter(f=>/^prepared-[a-z0-9-]+\.PREPARED-DO-NOT-DEPLOY\.json$/i.test(f))
    .map(name=>({name,full:path.join(PRIVATE,name)}))
    .sort((a,b)=>fs.statSync(b.full).mtimeMs-fs.statSync(a.full).mtimeMs);
  assert(files.length,'PRIVATE_CANDIDATE_MISSING');
  const newest=files[0];
  const candidate=JSON.parse(fs.readFileSync(newest.full,'utf8'));
  assert(candidate?.version===1&&SAFE_ID.test(candidate.storyId||'')&&candidate.folders&&
    Number.isSafeInteger(candidate.trackCount),'INVALID_PRIVATE_CANDIDATE');
  return {candidate,full:newest.full};
}
async function main(){
  say('Mode','LOCAL B5 WORKER / MOCK AUDIO ONLY');
  say('Network access','BLOCKED / MOCKED');
  say('Cloudflare, Drive, Apps Script calls','NONE');
  say('Catalog publication','DISABLED');
  at('PLAYER_KEY_LOADING');
  assert(fs.existsSync(KEY_FILE),'PLAYER_KEY_MISSING');
  const secret=fs.readFileSync(KEY_FILE,'utf8').trim();
  const key=Buffer.from(secret,'base64url');
  assert(key.length===32,'PLAYER_KEY_INVALID');
  at('PRIVATE_CANDIDATE_LOADING');
  const {candidate,full}=getCandidate();
  at('STATIC_CATALOG_LOADING');
  const publishedPath=path.join(B5,'public','catalogs',candidate.storyId+'.json');
  assert(fs.existsSync(publishedPath),'STATIC_CATALOG_NOT_FOUND');
  const hashBefore=digest(publishedPath);
  const published=JSON.parse(fs.readFileSync(publishedPath,'utf8'));
  at('STATIC_KEY_COMPATIBILITY');
  assertPlayerKeyMatchesStatic(published,key,{id:candidate.storyId,sourceVersion:candidate.sourceVersion});
  at('CANDIDATE_TOKEN_COMPATIBILITY');
  const validated=assertProtectedCatalog(candidate,key,{id:candidate.storyId,sourceVersion:candidate.sourceVersion});
  assert(validated===candidate.trackCount&&validated>0,'TRACK_COUNT_MISMATCH');
  assert(published.storyId===candidate.storyId&&published.sourceVersion===candidate.sourceVersion,'SOURCE_VERSION_MISMATCH');

  at('FOLDER_EPISODE_LINKS');
  const trackList=Object.values(candidate.folders).flatMap(f=>f.tracks||[]);
  const keys=new Set(trackList.map(t=>t.key));
  assert(keys.size===candidate.trackCount,'TRACK_KEY_DUPLICATE');
  const lookup=new Map(Object.entries(candidate.folders));
  for(const node of lookup.values()){
    for(const child of node.folders||[]) assert(lookup.has(child.key),'BROKEN_FOLDER_LINK');
    for(const t of node.tracks||[]){
      assert(!t.previousKey||keys.has(t.previousKey),'BROKEN_PREVIOUS_LINK');
      assert(!t.nextKey||keys.has(t.nextKey),'BROKEN_NEXT_LINK');
    }
  }
  at('TRACK_PAYLOAD_VALIDATION');
  const ref=trackList[0];
  const payload=decryptToken(ref.key,key);
  assert(payload.fileId&&payload.sourceVersion===candidate.sourceVersion&&payload.generationId===candidate.generationId,'BAD_TRACK_TOKEN');
  at('B5_WORKER_TEMPLATE_LOADING');
  assert(fs.existsSync(TEMPLATE),'B5_TEMPLATE_MISSING');
  const code=fs.readFileSync(TEMPLATE,'utf8');
  const marker='/*__OX_B5_CATALOG_INDEX__*/';
  assert(code.includes(marker),'B5_MARKER_MISSING');
  const entry={storyId:candidate.storyId,sourceVersion:candidate.sourceVersion,
    generationId:candidate.generationId,folderCount:candidate.folderCount,trackCount:candidate.trackCount,
    catalogPath:'/catalogs/'+candidate.storyId+'.json?v='+encodeURIComponent(candidate.generationId)};
  const moduleCode=code.replace(marker,'const CATALOG_INDEX = '+JSON.stringify({[candidate.storyId]:entry})+';');
  const nativeFetch=globalThis.fetch;
  let mockCalls=0;
  globalThis.fetch=async(url,opts={})=>{
    const u=new URL(url);
    assert(['drive.usercontent.google.com','drive.google.com'].includes(u.hostname),'NON_DRIVE_REQUEST_BLOCKED');
    assert(u.searchParams.get('id')===payload.fileId,'MOCK_DRIVE_ID_MISMATCH');
    assert(new Headers(opts.headers).get('range')==='bytes=0-1','MOCK_RANGE_NOT_FORWARDED');
    mockCalls++;
    return new Response(new Uint8Array([0x49,0x44]),{status:206,headers:{
      'content-type':'audio/mpeg','content-range':'bytes 0-1/1000','content-length':'2'
    }});
  };
  try{
    at('B5_WORKER_MODULE_IMPORT');
    const worker=await importWorkerIsolated(moduleCode);
    const origin='https://isolated-player.invalid';
    const env={OX_HANDOFF_KEY:secret};
    at('UNAUTHENTICATED_LISTEN_CHECK');
    const denied=await worker.fetch(new Request(origin+'/listen/'+encodeURIComponent(candidate.storyId)),env);
    assert(denied.status===401,'UNAUTHORIZED_SESSION_NOT_BLOCKED');
    at('TEST_SESSION_CREATION');
    const cookie=await sessionCookieFor(secret,candidate.storyId);
    at('AUTHENTICATED_LISTEN_CHECK');
    const page=await worker.fetch(new Request(origin+'/listen/'+encodeURIComponent(candidate.storyId),{headers:{cookie}}),env);
    assert(page.status===200,'AUTHORIZED_LISTEN_FAILED');
    const html=await page.text();
    const match=html.match(/<script\s+type="application\/json"\s+id="oxBoot"[^>]*>([\s\S]*?)<\/script>/i) ||
      html.match(/<script\s+id="oxBoot"\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/i);
    assert(match,'BOOT_PAYLOAD_MISSING');
    at('PLAYER_BOOT_DATA_VALIDATION');
    const boot=JSON.parse(match[1]);
    assert(boot.storyId===candidate.storyId&&boot.sourceVersion===candidate.sourceVersion&&
      boot.generationId===candidate.generationId&&boot.catalogPath===entry.catalogPath,'BOOT_CATALOG_MISMATCH');
    assert(!html.includes(payload.fileId),'DRIVE_ID_IN_LISTEN_HTML');
    const streamPath=origin+'/api/audio/stream?track='+encodeURIComponent(ref.key);
    at('UNAUTHENTICATED_AUDIO_CHECK');
    const unauth=await worker.fetch(new Request(streamPath,{headers:{range:'bytes=0-1'}}),env);
    assert(unauth.status===401,'UNAUTHORIZED_STREAM_NOT_BLOCKED');
    at('MOCK_AUDIO_RANGE_STREAM_CHECK');
    const streamed=await worker.fetch(new Request(streamPath,{headers:{cookie,range:'bytes=0-1'}}),env);
    assert(streamed.status===206,'MOCK_STREAM_RANGE_NOT_206');
    assert(streamed.headers.get('content-range')==='bytes 0-1/1000','MOCK_CONTENT_RANGE_MISSING');
    assert(streamed.headers.get('x-ox-player-stream')==='b6.5-range-confirmation-stream','B65_STREAM_PATH_NOT_USED');
    assert(Buffer.from(await streamed.arrayBuffer()).equals(Buffer.from([0x49,0x44])),'MOCK_BYTES_INCORRECT');
    at('STALE_GENERATION_REJECTION_CHECK');
    const old= {...payload,generationId:'not-current-generation'};
    const oldToken=fakeToken(old,key);
    const rejected=await worker.fetch(new Request(origin+'/api/audio/stream?track='+encodeURIComponent(oldToken),{headers:{cookie,range:'bytes=0-1'}}),env);
    assert(rejected.status===409,'OLD_GENERATION_NOT_REJECTED');
    at('INVALID_TOKEN_REJECTION_CHECK');
    const invalid=await worker.fetch(new Request(origin+'/api/audio/stream?track=invalid', {headers:{cookie,range:'bytes=0-1'}}),env);
    assert(invalid.status===401,'BAD_TOKEN_NOT_REJECTED');
    assert(mockCalls===1,'UNEXPECTED_AUDIO_FETCH_COUNT');
  } finally {
    globalThis.fetch=nativeFetch;
  }
  at('FINAL_STATIC_CATALOG_INTEGRITY');
  assert(digest(publishedPath)===hashBefore,'STATIC_CATALOG_CHANGED');
  assert(fs.existsSync(full),'CANDIDATE_WAS_REMOVED');
  say('Private candidate','FOUND / NOT MOVED');
  say('Folders / protected tracks',`${candidate.folderCount} / ${candidate.trackCount}`);
  say('Encrypted track verification','PASSED');
  say('Folder / episode navigation links','PASSED');
  say('Player session protection','PASSED');
  say('Player catalog boot fields','MATCHED');
  say('B6.5 range streaming','MOCK 206 PASSED');
  say('Rejected stale generation','PASSED');
  say('Actual Drive audio fetched','NO');
  say('Existing static Player catalog','UNCHANGED');
  say('Cloudflare runtime limits','NOT TESTED');
  say('Snapshot / publication safety','NOT VERIFIED');
  say('CHECK STATUS','LOCAL PLAYER COMPATIBILITY PASSED — NOT DEPLOYED');
}
console.log('\nOX B9.2 — DISPOSABLE PLAYER COMPATIBILITY CHECK\n');
main().catch(error=>{
  say('CHECK STATUS','INCOMPLETE / NO DEPLOYMENT');
  const safeCodes=new Set(['PRIVATE_CANDIDATE_MISSING','INVALID_PRIVATE_CANDIDATE','PLAYER_KEY_MISSING','PLAYER_KEY_INVALID',
    'STATIC_CATALOG_NOT_FOUND','SOURCE_VERSION_MISMATCH','TRACK_COUNT_MISMATCH','TRACK_KEY_DUPLICATE',
    'BROKEN_FOLDER_LINK','BROKEN_PREVIOUS_LINK','BROKEN_NEXT_LINK','BAD_TRACK_TOKEN',
    'B5_TEMPLATE_MISSING','B5_MARKER_MISSING','WORKER_DEPENDENCY_MISSING','B5_WORKER_EXPORT_MISSING','UNAUTHORIZED_SESSION_NOT_BLOCKED','AUTHORIZED_LISTEN_FAILED',
    'BOOT_PAYLOAD_MISSING','BOOT_CATALOG_MISMATCH','DRIVE_ID_IN_LISTEN_HTML','UNAUTHORIZED_STREAM_NOT_BLOCKED',
    'MOCK_STREAM_RANGE_NOT_206','MOCK_CONTENT_RANGE_MISSING','B65_STREAM_PATH_NOT_USED','MOCK_BYTES_INCORRECT',
    'OLD_GENERATION_NOT_REJECTED','BAD_TOKEN_NOT_REJECTED','UNEXPECTED_AUDIO_FETCH_COUNT',
    'STATIC_CATALOG_CHANGED','CANDIDATE_WAS_REMOVED','NON_DRIVE_REQUEST_BLOCKED','MOCK_DRIVE_ID_MISMATCH',
    'MOCK_RANGE_NOT_FORWARDED','BAD_TOKEN','INVALID_PROTECTED_CATALOG','INVALID_PROTECTED_NODE','DUPLICATE_PROTECTED_TRACK',
    'INVALID_ENCRYPTED_TRACK','PROTECTED_COUNT_MISMATCH','PLAYER_KEY_DOES_NOT_MATCH_STATIC','STATIC_CATALOG_NOT_VERIFIED']);
  const rawCode=error?.safeCode||error?.message;
  say('Failed verification stage',verificationStep);
  say('Reason',safeCodes.has(rawCode)?rawCode:'LOCAL_COMPATIBILITY_FAILED');
  const type=error?.name;
  say('Error category', ['TypeError','ReferenceError','SyntaxError','RangeError','Error','DOMException','AssertionError'].includes(type)?type.toUpperCase():'OTHER_RUNTIME_ERROR');
  say('Sensitive details','REDACTED — no IDs, URLs, secrets or paths printed');
  process.exitCode=1;
});
