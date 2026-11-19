import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {buildProtectedCatalog,assertProtectedCatalog} from '../staging/catalog-compat.mjs';
import {OfflineActivationStore,initialPointer,rehearsePromotion,rehearseRollback,
  playableGeneration,acceptedAsset,loadReference,sha256} from '../staging/b92-activation-core.mjs';

const story={id:'fake-story',folderId:'mockStoryRootAAAAAA',sourceVersion:crypto.createHash('sha256').update('mockStoryRootAAAAAA').digest('hex').slice(0,12)};
const key=crypto.randomBytes(32);
const at='2026-10-15T00:00:00.000Z';
const track=(id,name)=>({id,name,mimeType:'audio/mpeg',size:1024,modifiedAt:at});
const nodes=(added=false)=>({[story.folderId]:{name:'Fake Story',folders:[],tracks:[track('mockAudioTrackAAAAA','Episode 1.mp3'),...(added?[track('mockAudioTrackBBBBB','Episode 2.mp3')]:[])],truncated:false}});
const old=buildProtectedCatalog({story,root:story.folderId,nodes:nodes(),key,generationId:'g_old_test_12345',builtAt:at});
const next=buildProtectedCatalog({story,root:story.folderId,nodes:nodes(true),key,generationId:'g_new_test_12345',builtAt:at});
const init=()=>new OfflineActivationStore(initialPointer(old));
const opts={candidate:next,expectedRevision:0,now:1000,graceMs:30000,allowRehearsalOnly:true};
const staticReader=async()=>JSON.stringify(old);
const throws=(p,code)=>assert.rejects(p,e=>e.code===code);

test('content hash and valid protected candidate',async()=>{
  assert.equal(await sha256(JSON.stringify(next)),crypto.createHash('sha256').update(JSON.stringify(next)).digest('hex'));
  assert.equal(assertProtectedCatalog(next,key,{id:story.id,sourceVersion:story.sourceVersion}),2);
});
test('promotion writes verified immutable candidate then revision-guarded pointer',async()=>{
  const store=init(); const p=await rehearsePromotion(store,opts);
  assert.equal(p.revision,1);assert.equal(p.current.generationId,next.generationId);
  assert.equal(p.previous.generationId,old.generationId);
  const read=await loadReference(store,p.current);assert.equal(read.trackCount,2);
  assert.equal(playableGeneration(p,old.generationId,2000),true);
  assert.equal(playableGeneration(p,old.generationId,31000),false);
});
test('rollback checks old immutable/static asset and restores generation',async()=>{
  const store=init();await rehearsePromotion(store,opts);
  const back=await rehearseRollback(store,{storyId:story.id,expectedRevision:1,
    now:1500,graceMs:30000,loadStatic:staticReader,allowRehearsalOnly:true});
  assert.equal(back.revision,2);assert.equal(back.current.generationId,old.generationId);
  assert.equal(back.previous.generationId,next.generationId);
  assert.equal((await loadReference(store,back.current,{loadStatic:staticReader})).trackCount,1);
  assert.equal(playableGeneration(back,next.generationId,2000),true);
});
test('promotion cannot happen without explicit rehearsal gate',async()=>{
  const store=init();await throws(rehearsePromotion(store,{...opts,allowRehearsalOnly:false}),'REHEARSAL_ONLY');
  assert.equal((await store.getPointer(story.id)).revision,0);
});
test('stale revisions reject concurrent promotions',async()=>{
  const store=init();await rehearsePromotion(store,opts);
  await throws(rehearsePromotion(store,opts),'STALE_POINTER_REVISION');
  assert.equal((await store.getPointer(story.id)).revision,1);
});
test('storage-level conditional write conflict does not change pointer',async()=>{
  const store=init(); store.compareAndSwapPointer=async()=>false;
  await throws(rehearsePromotion(store,opts),'POINTER_CONFLICT');
  assert.equal((await store.getPointer(story.id)).revision,0);
});
test('missing/corrupt candidate readback prevents activation',async()=>{
  const store=init();store.getBlob=async()=>null;
  await throws(rehearsePromotion(store,opts),'BLOB_READBACK_FAILED');
  assert.equal((await store.getPointer(story.id)).revision,0);
});
test('asset digest corruption is rejected',async()=>{
  const store=init();const p=await rehearsePromotion(store,opts);
  store.getBlob=async()=>JSON.stringify(old);
  await throws(loadReference(store,p.current),'IMMUTABLE_ASSET_CHANGED');
});
test('bad rollback target leaves new generation active',async()=>{
  const store=init();await rehearsePromotion(store,opts);
  await throws(rehearseRollback(store,{storyId:story.id,expectedRevision:1,
    loadStatic:async()=>'{"bad":"catalog"}',allowRehearsalOnly:true}),'CATALOG_SHAPE_INVALID');
  assert.equal((await store.getPointer(story.id)).revision,1);
});
test('rollback refuses absent previous pointer',async()=>{
  const store=init();await throws(rehearseRollback(store,{storyId:story.id,expectedRevision:0,
    loadStatic:staticReader,allowRehearsalOnly:true}),'NO_ROLLBACK_TARGET');
});
test('different story or source never accepted for promotion',async()=>{
  const store=init();await throws(rehearsePromotion(store,{...opts,candidate:{...next,storyId:'someone-else'}}),'INVALID_POINTER');
  await throws(rehearsePromotion(store,{...opts,candidate:{...next,sourceVersion:'aaaaaaaaaaaa'}}),'SOURCE_VERSION_CHANGED_REQUIRES_REVIEW');
});
test('generation lookups only current plus valid prior grace',async()=>{
  const store=init();const p=await rehearsePromotion(store,opts);
  assert.equal(acceptedAsset(p,old.generationId,2000).kind,'static');
  await throws(Promise.resolve().then(()=>acceptedAsset(p,'g_arbitrary_unknown',2000)),'GENERATION_NOT_ACCEPTED');
  await throws(Promise.resolve().then(()=>acceptedAsset(p,old.generationId,31000)),'GENERATION_NOT_ACCEPTED');
});
test('hash key immutable collision fails closed',async()=>{
  const store=init();await store.putImmutable('stable-key','original');
  await throws(store.putImmutable('stable-key','changed'),'IMMUTABLE_ASSET_COLLISION');
});
