import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {buildProtectedCatalog} from '../../staging/catalog-compat.mjs';
import {initialPointer,OfflineActivationStore,rehearsePromotion,rehearseRollback} from '../../staging/b92-activation-core.mjs';
import {resolveGenerationAwareTrack,resolveFreshStoryCatalog,assertPromotionWindowSafe,rehearseWindowSafePromotion} from '../src/generation-gate.mjs';

const story={id:'step-i-shadow-demo',sourceVersion:'abcdef123456',folderId:'rootfolderid000001'};
const key=crypto.createHash('sha256').update('step-i-synthetic-fixture-only').digest();
const oldFile='oldtrackfile00001',newFile='newtrackfile00002';
const date='2026-10-01T00:00:00.000Z';
const audio=(id,name)=>({id,name,mimeType:'audio/mpeg',size:1000,modifiedAt:date});
const nodes=(includeNew)=>({[story.folderId]:{id:story.folderId,name:'Synthetic root',folders:[],tracks:[audio(oldFile,'Episode 1'),...(includeNew?[audio(newFile,'Episode 2')]:[])]}});
const make=(generationId,changed)=>buildProtectedCatalog({story,root:story.folderId,
  nodes:nodes(changed),key,generationId,builtAt:'2026-10-01T00:00:00.000Z'});
const old=make('g_step_i_old_00001',false);
const next=make('g_step_i_new_00002',true);
const token=(c,id)=>Object.values(c.folders).flatMap(f=>f.tracks).find(t=>{
  return t.name === (id===oldFile?'Episode 1':'Episode 2');
})?.key;
const oldToken=token(old,oldFile),newToken=token(next,newFile);
const session={authenticated:true,storyId:story.id,userId:'synthetic-member'};
const allow=async()=>true;
const deny=async()=>false;
async function setup(){
  const pointer=initialPointer(old),store=new OfflineActivationStore(pointer);
  const p1=await rehearsePromotion(store,{candidate:next,expectedRevision:0,now:1_000,
    graceMs:30*60_000,allowRehearsalOnly:true});
  return {store,pointer:p1,loadStatic:async()=>JSON.stringify(old)};
}
const req=(setupInfo, trackToken,extra={})=>({
  authenticatedSession:session,key,verifyEntitlement:allow,trackToken,
  now:100_000,...setupInfo,...extra
});
async function code(fn,wanted){await assert.rejects(fn,e=>e?.code===wanted);}

test('unmodified static reference works before a promotion',async()=>{
  const store=new OfflineActivationStore(initialPointer(old));
  const result=await resolveGenerationAwareTrack(req({store,pointer:initialPointer(old),loadStatic:async()=>JSON.stringify(old)},oldToken));
  assert.equal(result.role,'current');assert.equal(result.fileId,oldFile);
});
test('promotion presents new generation to newly opened views',async()=>{
  const v=await setup();
  const view=await resolveFreshStoryCatalog({...v,authenticatedSession:session,key,verifyEntitlement:allow});
  assert.equal(view.trackCount,2);assert.equal(view.generationId,next.generationId);
  assert.equal(view.cacheControl,'private, no-store');
});
test('new catalog token resolves to current generation',async()=>{
  const v=await setup();const r=await resolveGenerationAwareTrack(req(v,newToken));
  assert.equal(r.role,'current');assert.equal(r.fileId,newFile);
});
test('existing tab old token resolves previous within grace without changing its token',async()=>{
  const v=await setup();const r=await resolveGenerationAwareTrack(req(v,oldToken));
  assert.equal(r.role,'previous');assert.equal(r.fileId,oldFile);assert.equal(r.expiresAt,1_801_000);
});
test('expired previous generation is rejected, with no unconditional grandfathering',async()=>{
  const v=await setup();await code(()=>resolveGenerationAwareTrack(req(v,oldToken,{now:1_801_000})),'GENERATION_NOT_ACCEPTED');
});
test('every stream attempt still requires signed session and entitlement',async()=>{
  const v=await setup();
  await code(()=>resolveGenerationAwareTrack(req(v,newToken,{authenticatedSession:null})),'PLAYER_SESSION_REQUIRED');
  await code(()=>resolveGenerationAwareTrack(req(v,newToken,{verifyEntitlement:deny})),'PLAYER_ENTITLEMENT_REQUIRED');
});
test('cross-story session and tampered track are rejected',async()=>{
  const v=await setup();
  await code(()=>resolveGenerationAwareTrack(req(v,newToken,{authenticatedSession:{...session,storyId:'other-story'}})),'STORY_POINTER_MISMATCH');
  await code(()=>resolveGenerationAwareTrack(req(v,newToken+'bad')),'TRACK_TOKEN_AUTH_FAILED');
});
test('valid encrypted token not present in selected generation is rejected',async()=>{
  const v=await setup();
  // Mock a valid protected but unindexed token: same generation, new File ID.
  const impostor=make(next.generationId,true);
  // Replace file ID in synthetic catalog via a separate valid catalog fixture.
  const isolated=buildProtectedCatalog({story,root:story.folderId,
    nodes:{[story.folderId]:{id:story.folderId,name:'synthetic',folders:[],tracks:[audio('anothertrack00003','Other')] }},
    key,generationId:next.generationId,builtAt:'2026-10-01T00:00:00.000Z'});
  const impostorToken=Object.values(isolated.folders)[0].tracks[0].key;
  await code(()=>resolveGenerationAwareTrack(req(v,impostorToken)),'TRACK_NOT_IN_SELECTED_CATALOG');
  assert.equal(impostor.trackCount,2);
});
test('missing/corrupt candidate blob fails closed instead of silent static fallback',async()=>{
  const v=await setup();v.store.simulateLossOfBlob(v.pointer.current.blobKey);
  await code(()=>resolveGenerationAwareTrack(req(v,newToken)),'CATALOG_INTEGRITY_OR_AVAILABILITY_FAILED');
  await code(()=>resolveFreshStoryCatalog({...v,authenticatedSession:session,key,verifyEntitlement:allow}),'CATALOG_INTEGRITY_OR_AVAILABILITY_FAILED');
});
test('rollback restores old catalog as current and keeps new token briefly previous',async()=>{
  const v=await setup();const rolled=await rehearseRollback(v.store,{storyId:story.id,
    expectedRevision:1,now:200_000,graceMs:30*60_000,loadStatic:v.loadStatic,
    allowRehearsalOnly:true});
  const r1=await resolveGenerationAwareTrack(req({...v,pointer:rolled},oldToken));
  const r2=await resolveGenerationAwareTrack(req({...v,pointer:rolled},newToken));
  assert.equal(r1.role,'current');assert.equal(r2.role,'previous');
});
test('sourceVersion mismatch and foreign story references fail closed',async()=>{
  const v=await setup();
  const altered={...v.pointer,previous:{...v.pointer.previous,sourceVersion:'111111111111'}};
  await code(()=>resolveGenerationAwareTrack(req({...v,pointer:altered},oldToken)),'TRACK_SOURCE_MISMATCH');
});
test('underlying Worker is not modified and no network calls or publishing are available',async()=>{
  const src=await import('node:fs/promises');
  const body=await src.readFile(new URL('../src/generation-gate.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(body,/\bfetch\s*\(|\bwrangler\b|\.put\s*\(|\bdeploy\s*\(/);
  assert.match(body,/streamNotImplemented:true/);
});

test('overlapping new promotion blocked until previous grace ends',async()=>{
  const v=await setup();
  await code(()=>Promise.resolve().then(()=>assertPromotionWindowSafe(v.pointer,100_000)),
    'PRIOR_GENERATION_GRACE_ACTIVE');
  assert.equal(assertPromotionWindowSafe(v.pointer,1_801_000),true);
  const third=make('g_step_i_third_00003',true);
  await code(()=>rehearseWindowSafePromotion(v.store,{candidate:third,expectedRevision:1,
    now:100_000,allowRehearsalOnly:true}), 'PRIOR_GENERATION_GRACE_ACTIVE');
  assert.equal((await v.store.getPointer(story.id)).revision,1);
});
