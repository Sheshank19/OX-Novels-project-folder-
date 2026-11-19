import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {BASELINE_FINGERPRINTS} from '../../local-player-b5/src/b9-baseline-fingerprints.js';
import {createMetadataPreflight,nextMetadataPage,acceptMetadataPage,finalizeMetadataPreflight,planChangedOnlyStages,estimateMetadataQueuePlan} from '../../local-player-b5/src/b923-metadata-preflight.js';

const root=path.resolve(import.meta.dirname,'../..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'local-player-b5/B5-PUBLISHED-CATALOGS.json'),'utf8')).catalogs;
const entry=id=>{const e=manifest.find(e=>e.storyId===id);assert.ok(e);return e;};
const cache=e=>JSON.parse(fs.readFileSync(path.join(root,'local-audio-lab/cache',e.sourceCatalogFile),'utf8'));
const simple=entry('a-luna-s-broken-bond');
const big=entry('the-outcast-s-rise');
const sample=cache(simple);
const chunk=(list,n)=>Array.from({length:Math.max(1,Math.ceil(list.length/n))},(_,i)=>list.slice(i*n,(i+1)*n));
const folderPages=node=>{
 const folders=chunk(node.folders,25),tracks=chunk(node.tracks,40);
 const total=Math.max(folders.length,tracks.length);
 return Array.from({length:total},(_,i)=>({name:node.name,pageNo:i,totalPages:total,complete:true,truncated:false,folders:folders[i]||[],tracks:tracks[i]||[]}));
};
function session(e,raw,baseline=true){return createMetadataPreflight({storyId:e.storyId,rootFolderId:raw.rootFolderId,sourceVersion:e.sourceVersion,
 baselineFingerprint:baseline?BASELINE_FINGERPRINTS[e.storyId]:null,baselineSourceVersion:baseline?e.sourceVersion:null,
 baselineRootFolderId:baseline?raw.rootFolderId:null});}
async function scan(e,raw,{baseline=true,sessionObject=null}={}){
 const s=sessionObject||session(e,raw,baseline);
 let operations=0;
 while(true){const pending=nextMetadataPage(s);if(!pending)break;
  assert.ok(raw.nodes[pending.folderId],`Source folder unavailable for ${e.storyId}`);
  const page=folderPages(raw.nodes[pending.folderId])[pending.pageNo];
  assert.ok(page,'Missing source page');
  await acceptMetadataPage(s,pending.folderId,page);
  assert.ok(++operations<10000,'Unexpected unbounded scan');
 }
 return finalizeMetadataPreflight(s);
}

test('B9.2.3 all 242 original catalog fingerprints match exactly and all bypass staging',async()=>{
 const decisions=[];
 for(const e of manifest){const out=await scan(e,cache(e));assert.equal(out.status,'unchanged',e.storyId);assert.equal(out.fingerprint,BASELINE_FINGERPRINTS[e.storyId]);
  assert.equal(out.trackCount,e.trackCount);assert.equal(out.folderCount,e.folderCount);decisions.push(out);}
 assert.equal(decisions.length,242);assert.equal(decisions.reduce((n,x)=>n+x.trackCount,0),154699);
 const estimate=estimateMetadataQueuePlan(decisions);
 assert.equal(estimate.pages,4978);assert.equal(estimate.perPageOperations,14934);
 assert.equal(estimate.perPageFitsFreeBudget,false);assert.equal(estimate.perStoryCpuValidated,false);
 const plan=planChangedOnlyStages({decisions,expectedStoryIds:manifest.map(e=>e.storyId),queueOpsAlreadyUsed:0,d1RowsAlreadyWritten:0});
 assert.equal(plan.unchanged,242);assert.equal(plan.changed,0);assert.equal(plan.estimatedD1Rows,0);assert.equal(plan.estimatedQueueOps,0);assert.equal(plan.readyForOfflineStaging,true);assert.equal(plan.remoteDeploymentApproved,false);
});

test('B9.2.3 published empty baselines remain unchanged, but empty replacements fail closed',async()=>{
 const e=entry('strongest-replication'),raw=cache(e);const baseline=await scan(e,raw);
 assert.equal(baseline.status,'unchanged');assert.equal(baseline.trackCount,0);assert.equal(baseline.emptyPublishedBaseline,true);
 await assert.rejects(scan(e,raw,{baseline:false}),/Empty changed\/new catalog/);
});

test('B9.2.3 addition inside an existing folder is changed, not unchanged',async()=>{
 const raw=structuredClone(sample);raw.nodes[raw.rootFolderId].tracks.push({...raw.nodes[raw.rootFolderId].tracks[0],id:'B923_added_012345',name:'205.mp3'});
 const out=await scan(simple,raw);assert.equal(out.status,'changed');assert.equal(out.trackCount,simple.trackCount+1);assert.equal(out.needsStage,true);
});

test('B9.2.3 new episode-range folder and episodes are detected',async()=>{
 const raw=structuredClone(sample),child='B923_newfolder_2345';
 raw.nodes[raw.rootFolderId].folders.push({id:child,name:'201-300'});
 raw.nodes[child]={name:'201-300',folders:[],tracks:[{id:'B923_new_audio_1234',name:'201.mp3',mimeType:'audio/mpeg',size:4321,modifiedAt:'2026-10-10T00:00:00Z'}]};
 const out=await scan(simple,raw);assert.equal(out.status,'changed');assert.equal(out.trackCount,simple.trackCount+1);assert.equal(out.folderCount,simple.folderCount+1);
});

test('B9.2.3 renamed / removed episodes detect change',async()=>{
 const renamed=structuredClone(sample);renamed.nodes[renamed.rootFolderId].tracks[0].name='RENAME.mp3';assert.equal((await scan(simple,renamed)).status,'changed');
 const removed=structuredClone(sample);removed.nodes[removed.rootFolderId].tracks.pop();assert.equal((await scan(simple,removed)).status,'changed');
});

test('B9.2.3 baseline binding source-version mismatch forces refresh even when bytes match',async()=>{
 const s=session(simple,sample);s.sourceVersion='different_source_version';const out=await scan(simple,sample,{sessionObject:s});assert.equal(out.status,'changed');
});

test('B9.2.3 never assumes a missing page or missing folder is unchanged',async()=>{
 const s=session(simple,sample);await assert.rejects(finalizeMetadataPreflight(s),/Incomplete Drive listing/);
 const p=folderPages(sample.nodes[sample.rootFolderId])[0];
 for(const bad of [{...p,complete:false},{...p,truncated:true},{...p,complete:undefined},{...p,truncated:undefined}])await assert.rejects(acceptMetadataPage(s,sample.rootFolderId,bad),/not explicitly complete/);
 assert.equal(nextMetadataPage(s).pageNo,0);
});

test('B9.2.3 page replay is idempotent; altered replay and out-of-order pages fail closed',async()=>{
 const s=session(simple,sample);const p=folderPages(sample.nodes[sample.rootFolderId])[0];
 assert.equal((await acceptMetadataPage(s,sample.rootFolderId,p)).replayed,false);
 assert.equal((await acceptMetadataPage(s,sample.rootFolderId,p)).replayed,true);
 await assert.rejects(acceptMetadataPage(s,sample.rootFolderId,{...p,name:'DIFFERENT'}),/Conflicting page replay/);
 await assert.rejects(acceptMetadataPage(s,sample.rootFolderId,{...p,pageNo:1,totalPages:2}),/Already completed|out-of-order/);
});

test('B9.2.3 duplicate audio IDs and invalid metadata do not corrupt scan state',async()=>{
 const s=session(simple,sample),p=folderPages(sample.nodes[sample.rootFolderId])[0];
 const bad={...p,tracks:[p.tracks[0],p.tracks[0]]};
 await assert.rejects(acceptMetadataPage(s,sample.rootFolderId,bad),/Duplicate track ID/);
 assert.equal(nextMetadataPage(s).pageNo,0);
 await assert.rejects(acceptMetadataPage(s,sample.rootFolderId,{...p,tracks:[{...p.tracks[0],size:-2}]}),/Invalid track size/);
 assert.equal(nextMetadataPage(s).pageNo,0);
});

test('B9.2.3 rejects folder cycle or reparenting',async()=>{
 const raw=structuredClone(sample);raw.nodes[raw.rootFolderId].folders.push({id:raw.rootFolderId,name:'cycle'});
 await assert.rejects(scan(simple,raw),/Self-referencing folder/);
});

test('B9.2.3 brand new OX story is marked new, not silently assumed unchanged',async()=>{
 const out=await scan(simple,sample,{baseline:false});assert.equal(out.status,'new');assert.equal(out.needsStage,true);
});

test('B9.2.3 estimated D1 staging is restricted to changed stories',async()=>{
 const original=await scan(simple,sample);const updated=structuredClone(sample);
 updated.nodes[updated.rootFolderId].tracks.push({...updated.nodes[updated.rootFolderId].tracks[0],id:'B923_new_audio_0041'});
 const changed=await scan(simple,updated);
 const other={...original,storyId:'second-story'};
 const plan=planChangedOnlyStages({decisions:[changed,other],expectedStoryIds:[simple.storyId,'second-story'],queueOpsAlreadyUsed:100,d1RowsAlreadyWritten:200});
 assert.equal(plan.changed,1);assert.equal(plan.unchanged,1);assert.deepEqual(plan.changedStoryIds,[simple.storyId]);
 assert.equal(plan.stageTracks,simple.trackCount+1);assert.ok(plan.estimatedD1Rows<300);assert.equal(plan.remoteDeploymentApproved,false);
});

test('B9.2.3 incomplete library scan cannot authorize even local staging',()=>{
 const result=planChangedOnlyStages({decisions:[],expectedStoryIds:manifest.map(e=>e.storyId),queueOpsAlreadyUsed:0,d1RowsAlreadyWritten:0});
 assert.equal(result.readyForOfflineStaging,false);assert.equal(result.missingStories.length,242);
 assert.match(result.reason,/Incomplete/);
});

test('B9.2.3 unknown account-wide quotas block offline staging plan',async()=>{
 const result=planChangedOnlyStages({decisions:[await scan(simple,sample)],expectedStoryIds:[simple.storyId]});
 assert.equal(result.readyForOfflineStaging,false);assert.match(result.reason,/quota consumption is unknown/);
});

test('B9.2.3 changed-heavy workload is blocked before exceeding conservative free quotas',()=>{
 const large=Array.from({length:20},(_,i)=>({storyId:`heavy-${i}`,status:'changed',verifiedComplete:true,folderCount:40,trackCount:2500,resolverPages:80}));
 const result=planChangedOnlyStages({decisions:large,expectedStoryIds:large.map(d=>d.storyId),queueOpsAlreadyUsed:2400,d1RowsAlreadyWritten:1000});
 assert.equal(result.readyForOfflineStaging,false);assert.match(result.reason,/reserve exceeded/);assert.ok(result.estimatedD1Rows>85000);
});

test('B9.2.3 rejects forged duplicate decision records and invalid input',()=>{
 const record={storyId:'abc-story',status:'unchanged',verifiedComplete:true,trackCount:1,folderCount:1,resolverPages:1};
 assert.throws(()=>planChangedOnlyStages({decisions:[record,record],expectedStoryIds:['abc-story']}),/Unknown\/duplicate/);
});

test('B9.2.3 large 2,848-track catalog can be verified without storing audio or publishing',async()=>{
 const out=await scan(big,cache(big));assert.equal(out.status,'unchanged');assert.equal(out.trackCount,2848);
 assert.equal(out.productionActivation,false);assert.equal('folders' in out,false);assert.equal('rootFolderId' in out,false);
});
