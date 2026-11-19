import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {readLiveState,stageVerifiedCatalog,promoteStagedCatalog,getImmutableCatalog,rollbackLiveCatalog} from '../../../local-player-b5/src/b92-live-catalog-store.js';
import {catalogMeta,catalogAsset,playbackGeneration} from '../../../local-player-b5/src/b92-generation-adapter.js';
import {selectGeneration} from '../../../local-player-b5/src/b92-generation-policy.js';
const id='fixture-story', gen1='g_base_0000001', gen2='g_update_000002', src='aaaaaaaaaaaa';
const base={storyId:id,sourceVersion:src,generationId:gen1,folderCount:1,trackCount:1,catalogPath:'/catalogs/fixture-story.json?v='+gen1};
const catalog={version:1,storyId:id,sourceVersion:src,generationId:gen2,folderCount:1,trackCount:1,rootKey:'root',folders:{root:{name:'Foo',folders:[],tracks:[{key:'t1.fake',name:'test'}]}}};
async function hash(x){return Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))).toString('hex');}
function fakes(){
 const pointer=new Map(), staged=new Map(), kv=new Map();
 const db={
   prepare(sql){
     return {bind(...args){
       return {
         async first(){
           if(sql.includes('FROM b92_live_pointers'))return pointer.get(args[0])||null;
           if(sql.includes('FROM b92_live_staged'))return staged.get(args[0]+'|'+args[1])||null;
           throw Error('unexpected SELECT: '+sql);
         },
         async run(){
           if(sql.includes('INSERT OR IGNORE INTO b92_live_staged')){
             const key=args[0]+'|'+args[1];
             if(staged.has(key))return {success:true,meta:{changes:0}};
             staged.set(key,{story_id:args[0],generation_id:args[1],digest:args[2],staged_at_ms:args[3],track_count:args[4],folder_count:args[5],source_version:args[6]});
             return {success:true,meta:{changes:1}};
           }
           if(sql.includes('INSERT OR IGNORE INTO b92_live_pointers')){
             if(pointer.has(args[0]))return {success:true,meta:{changes:0}};
             pointer.set(args[0],{revision:args[1],state_json:args[2]});
             return {success:true,meta:{changes:1}};
           }
           if(sql.includes('UPDATE b92_live_pointers')){
             const rec=pointer.get(args[3]);
             if(rec?.revision!==args[4])return {success:true,meta:{changes:0}};
             pointer.set(args[3],{revision:args[0],state_json:args[1]});
             return {success:true,meta:{changes:1}};
           }
           throw Error('unexpected write: '+sql);
         }
       };
     }};
   }
 };
 return {env:{B92_POINTER_DB:db,B9_CATALOG_KV:{async get(k){return kv.get(k)??null;},async put(k,v){kv.set(k,v);}}},pointer,staged,kv};
}
test('unbound and empty pointer retains existing static catalog',async()=>{
 assert.equal(await catalogMeta({}, {[id]:base},id),base);
 const {env}=fakes();assert.equal(await catalogMeta(env,{[id]:base},id),base);
 assert.equal(await readLiveState(env,id),null);
});
test('current sealed Step E proof cannot stage or publish',async()=>{
 const {env,kv,staged}=fakes();
 const body=JSON.stringify(catalog), digest=await hash(body);
 await assert.rejects(stageVerifiedCatalog(env,{candidate:catalog,verifiedReceipt:{
  publicationAllowed:false,pinnedSnapshotProven:false,stagingOnly:true,
  requiresHumanReview:true,storyId:id,generationId:gen2,catalogDigest:digest
 }}),/PUBLICATION_PROOF_MISSING/);
 assert.equal(kv.size,0);assert.equal(staged.size,0);
});
test('verified candidate stages as ONE immutable KV value, then D1 CAS promotes with bounded grace',async()=>{
 const {env,kv,pointer,staged}=fakes();
 const body=JSON.stringify(catalog), digest=await hash(body);
 const receipt={publicationAllowed:true,pinnedSnapshotProven:true,stagingOnly:false,
  requiresHumanReview:false,storyId:id,generationId:gen2,catalogDigest:digest};
 const prepared=await stageVerifiedCatalog(env,{candidate:catalog,verifiedReceipt:receipt});
 assert.equal(kv.size,1);assert.equal(staged.size,1);assert.equal(prepared.activation,false);
 await assert.rejects(promoteStagedCatalog(env,{[id]:base},{storyId:id,generationId:gen2,expectedRevision:0,verifiedReceipt:receipt,now:prepared.stagedAtMs+1000}),/CANDIDATE_NOT_READY/);
 assert.equal(pointer.size,0);
 const p=await promoteStagedCatalog(env,{[id]:base},{storyId:id,generationId:gen2,expectedRevision:0,verifiedReceipt:receipt,now:prepared.stagedAtMs+120001});
 assert.equal(p.revision,1);assert.equal(pointer.size,1);
 const state=await readLiveState(env,id);assert.equal(state.previous.generationId,gen1);
 assert.equal((await catalogMeta(env,{[id]:base},id)).generationId,gen2);
 assert.equal((await playbackGeneration(env,{[id]:base},id,{generationId:gen1,sourceVersion:src},prepared.stagedAtMs+120002)).role,'previous');
 assert.equal(await playbackGeneration(env,{[id]:base},id,{generationId:gen1,sourceVersion:src},p.previousGraceUntilMs),null);
 const rsp=await catalogAsset(null,env,{[id]:base},id,gen2);
 assert.equal(rsp.status,200);assert.equal(await rsp.text(),body);
 await assert.rejects(promoteStagedCatalog(env,{[id]:base},{storyId:id,generationId:gen2,expectedRevision:0,verifiedReceipt:receipt,now:prepared.stagedAtMs+120005}),/STALE_POINTER_REVISION/);
});
test('corrupt blob fails closed for protected catalog downloads',async()=>{
 const {env,kv}=fakes(); const body=JSON.stringify(catalog),digest=await hash(body);
 const receipt={publicationAllowed:true,pinnedSnapshotProven:true,stagingOnly:false,
  requiresHumanReview:false,storyId:id,generationId:gen2,catalogDigest:digest};
 const staged=await stageVerifiedCatalog(env,{candidate:catalog,verifiedReceipt:receipt});
 const key=[...kv.keys()][0];kv.set(key,'tampered');
 await assert.rejects(getImmutableCatalog(env,key,digest),/CATALOG_BLOB_CORRUPTED/);
 await assert.rejects(promoteStagedCatalog(env,{[id]:base},{storyId:id,generationId:gen2,expectedRevision:0,verifiedReceipt:receipt,now:staged.stagedAtMs+120000}),/CATALOG_BLOB_CORRUPTED/);
});
test('D1 query failure never falls back to static',async()=>{
 const env={B92_POINTER_DB:{prepare(){throw Error('D1 unavailable');}}};
 await assert.rejects(catalogMeta(env,{[id]:base},id),/D1 unavailable/);
 await assert.rejects(playbackGeneration(env,{[id]:base},id,{generationId:gen1}),/D1 unavailable/);
});
test('pointer JSON corruption fails closed',async()=>{
 const {env,pointer}=fakes();pointer.set(id,{revision:9,state_json:'{'});
 await assert.rejects(readLiveState(env,id),/POINTER_CORRUPTED/);
});

test('atomic rollback restores original static catalog and keeps recently promoted track temporarily available',async()=>{
 const {env}=fakes(),body=JSON.stringify(catalog),digest=await hash(body);
 const receipt={publicationAllowed:true,pinnedSnapshotProven:true,stagingOnly:false,
   requiresHumanReview:false,storyId:id,generationId:gen2,catalogDigest:digest};
 const s=await stageVerifiedCatalog(env,{candidate:catalog,verifiedReceipt:receipt});
 const promoted=await promoteStagedCatalog(env,{[id]:base},{storyId:id,generationId:gen2,expectedRevision:0,verifiedReceipt:receipt,now:s.stagedAtMs+120001});
 const rolled=await rollbackLiveCatalog(env,{[id]:base},{storyId:id,expectedRevision:1,now:s.stagedAtMs+120030});
 assert.equal(rolled.revision,2);assert.equal(rolled.restoredGenerationId,gen1);
 assert.equal((await catalogMeta(env,{[id]:base},id)).generationId,gen1);
 assert.equal((await playbackGeneration(env,{[id]:base},id,{generationId:gen2,sourceVersion:src},s.stagedAtMs+120032)).role,'previous');
 await assert.rejects(rollbackLiveCatalog(env,{[id]:base},{storyId:id,expectedRevision:1,now:s.stagedAtMs+120040}),/STALE_POINTER_REVISION/);
});
test('large catalog stays a single KV value, not one write per track',async()=>{
 const {env,kv,staged}=fakes();
 const big=structuredClone(catalog);
 big.trackCount=534;
 big.folders.root.tracks=Array.from({length:534},(_,i)=>({key:'t1.fixture'+i,name:'Chapter '+i+' '+('x'.repeat(1000))}));
 const body=JSON.stringify(big);assert.ok(Buffer.byteLength(body)>500_000);
 const receipt={publicationAllowed:true,pinnedSnapshotProven:true,stagingOnly:false,
  requiresHumanReview:false,storyId:id,generationId:gen2,catalogDigest:await hash(body)};
 const result=await stageVerifiedCatalog(env,{candidate:big,verifiedReceipt:receipt});
 assert.equal(result.activation,false);assert.equal(kv.size,1);assert.equal(staged.size,1);
});
