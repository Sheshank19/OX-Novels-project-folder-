import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {collectDriveChanges,classifyDriveChanges,planNightlyStoryOrder} from '../../local-player-b5/src/b929-drive-change-triage.js';

const PRINCIPAL='resolver-account-000001', START='token-start-0';
const FILE='drivefile_1234567890123', FOLDER='folderid_1234567890123', UNKNOWN='unknownid_12345678901';
const stories=Array.from({length:242},(_,i)=>`story-${String(i+1).padStart(3,'0')}`);
const owner=new Map([[FILE,[stories[1]]],[FOLDER,[stories[1]]]]);
const change=(id=FILE,extra={})=>({kind:'drive#change',type:'file',fileId:id,removed:false,file:{id},...extra});
const page=(changes=[],more=null,last='token-new-start')=>({kind:'drive#changeList',changes,
  ...(more?{nextPageToken:more}:{newStartPageToken:last})});
const get=async input=>collectDriveChanges(async ({pageToken})=>input[pageToken],{startPageToken:START,principalId:PRINCIPAL});
const classify=feed=>classifyDriveChanges(feed,{storyIds:stories,idToStories:owner,principalId:PRINCIPAL});
const result=async changes=>classify(await get({[START]:page(changes)}));

test('B9.2.9 reads empty complete change feed and still schedules all 242 stories',async()=>{
 const r=await result([]);assert.equal(r.status,'NO_CHANGES_OBSERVED_IN_FEED');
 const schedule=planNightlyStoryOrder(stories,r);assert.equal(schedule.scheduledStories,242);
 assert.equal(schedule.canPublish,false);assert.equal(schedule.snapshotPinned,false);
 assert.equal(schedule.potentialSinglePassPlusFeed,4979);
});
test('B9.2.9 known updated track prioritizes its story but cannot skip 241 others',async()=>{
 const r=await result([change()]);assert.deepEqual(r.changedStoryIds,[stories[1]]);
 const schedule=planNightlyStoryOrder(stories,r);assert.equal(schedule.priorityOrder[0],stories[1]);
 assert.equal(schedule.scheduledStories,242);assert.equal(schedule.canStage,false);
});
test('B9.2.9 new file in known folder is associated with that story',async()=>{
 const r=await result([change(UNKNOWN,{file:{id:UNKNOWN,parents:[FOLDER]}})]);
 assert.deepEqual(r.changedStoryIds,[stories[1]]);assert.equal(r.unknownCount,0);
});
test('B9.2.9 unrecognized newly added file forces conservative fallback',async()=>{
 const r=await result([change(UNKNOWN,{file:{id:UNKNOWN,parents:['foreignfolder_999999']}})]);
 assert.equal(r.unknownCount,1);assert.equal(r.allStoriesMustScan,true);
 assert.equal(planNightlyStoryOrder(stories,r).unknownChangeFallback,true);
});
test('B9.2.9 deletion without file metadata maps known deleted file',async()=>{
 const r=await result([change(FILE,{removed:true,file:undefined})]);
 assert.deepEqual(r.changedStoryIds,[stories[1]]);
});
test('B9.2.9 unknown removal never silently ignored',async()=>{
 const r=await result([change(UNKNOWN,{removed:true,file:undefined})]);
 assert.equal(r.unknownCount,1);
});
test('B9.2.9 folder rename mapped by old known ID affects its story',async()=>{
 const r=await result([change(FOLDER,{file:{id:FOLDER,parents:['foreignparent_123456']}})]);
 assert.deepEqual(r.changedStoryIds,[stories[1]]);
});
test('B9.2.9 recognizes multiple affected stories in one cross-story move',async()=>{
 const owners=new Map(owner);owners.set('movedfile_1234567890',[stories[1]]);
 owners.set('destfolder_1234567890',[stories[2]]);
 const feed=await get({[START]:page([change('movedfile_1234567890',{
   file:{id:'movedfile_1234567890',parents:['destfolder_1234567890']}})])});
 const r=classifyDriveChanges(feed,{storyIds:stories,idToStories:owners,principalId:PRINCIPAL});
 assert.deepEqual(r.changedStoryIds,[stories[1],stories[2]]);
});
test('B9.2.9 completely drains paginated changes before finalizing',async()=>{
 const feed=await get({[START]:page([change()], 'page-two'), 'page-two':page([change(UNKNOWN)])});
 assert.equal(feed.pagesRead,2);assert.equal(feed.changes.length,2);
 assert.equal(feed.nextStartPageToken,'token-new-start');assert.equal(feed.canPublish,false);
});
test('B9.2.9 missing last page/newStartPageToken fails closed',async()=>{
 await assert.rejects(get({[START]:page([change()], 'page-two')}),/Invalid or missing change page/);
 await assert.rejects(get({[START]:page([],null,'')}),/Missing terminal/);
});
test('B9.2.9 cyclic/reused nextPageToken cannot loop',async()=>{
 await assert.rejects(get({[START]:page([],START)}),/Repeated change token/);
});
test('B9.2.9 conflicting terminal and continuation tokens rejected',async()=>{
 await assert.rejects(get({[START]:{...page([], 'page-two'),newStartPageToken:'both'}}),/Conflicting/);
});
test('B9.2.9 pages with missing removal metadata or invalid file IDs fail',async()=>{
 await assert.rejects(get({[START]:page([{kind:'drive#change',type:'file',fileId:FILE}])}),/removal state/);
 await assert.rejects(get({[START]:page([change('bad')])}),/file ID/);
 await assert.rejects(get({[START]:page([change(FILE,{file:{id:UNKNOWN}})])}),/Conflicting/);
});
test('B9.2.9 fails for missing includeRemoved, wrong change kind or incomplete response',async()=>{
 await assert.rejects(get({[START]:page([{...change(),type:'drive'}])}),/kind\/type/);
 await assert.rejects(get({[START]:{changes:[]}}),/Invalid or missing/);
});
test('B9.2.9 rejects oversized output and exhausted budgets',async()=>{
 await assert.rejects(collectDriveChanges(async()=>page([change()]),{startPageToken:START,
  principalId:PRINCIPAL,maxChanges:0}),/event budget/);
 await assert.rejects(collectDriveChanges(async()=>page([], 'page-two'),{startPageToken:START,
  principalId:PRINCIPAL,maxPages:1}),/page budget/);
});
test('B9.2.9 wrong resolver identity cannot reuse a feed',async()=>{
 const feed=await get({[START]:page([])});
 assert.throws(()=>classifyDriveChanges(feed,{storyIds:stories,idToStories:owner,
  principalId:'another-account-000001'}),/principal mismatch/);
});
test('B9.2.9 rejects unknown owners and duplicate story roster',async()=>{
 const feed=await get({[START]:page([change()])});
 assert.throws(()=>classifyDriveChanges(feed,{storyIds:[stories[1],stories[1]],
  idToStories:owner,principalId:PRINCIPAL}),/story roster/);
 assert.throws(()=>classifyDriveChanges(feed,{storyIds:stories,
  idToStories:new Map([[FILE,['unlisted-story']]]),principalId:PRINCIPAL}),/Unknown owner/);
});
test('B9.2.9 an unverified fake feed cannot authorize staging',()=>{
 assert.throws(()=>classifyDriveChanges({feedComplete:false},{storyIds:stories,
   idToStories:owner,principalId:PRINCIPAL}),/complete/);
 assert.throws(()=>planNightlyStoryOrder(stories,{allStoriesMustScan:false,
   canPublish:true,changedStoryIds:[],unknownCount:0}),/Unsafe/);
});
test('B9.2.9 4,978-page budget is only an estimate and cannot approve quota',async()=>{
 const schedule=planNightlyStoryOrder(stories,await result([]),{baselinePages:4978,
 accountUsageKnown:true});
 assert.equal(schedule.previousTwoPassPageEstimate,9956);
 assert.equal(schedule.potentialSinglePassPlusFeed,4979);
 assert.equal(schedule.actualQuotaVerified,false);
 assert.equal(schedule.productionApproved,false);
});
test('B9.2.9 includes no Google endpoint, secrets or publication calls',()=>{
 const source=readFileSync(path.resolve(import.meta.dirname,
  '../../local-player-b5/src/b929-drive-change-triage.js'),'utf8');
 assert.match(source,/TEST ONLY/);
 assert.doesNotMatch(source,/https:\/\/(?:script\.google\.com|www\.googleapis\.com)/);
 assert.doesNotMatch(source,/(?:KV\.put\(|wrangler deploy|DODO_API_KEY\s*=|fetch\()/);
});
