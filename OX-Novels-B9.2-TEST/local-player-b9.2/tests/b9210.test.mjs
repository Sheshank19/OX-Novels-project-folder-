import test from 'node:test';
import assert from 'node:assert/strict';
import {auditChangeWindowOffline, summarizeAllStoryWindows} from '../../local-player-b5/src/b9210-window-audit.js';
const ROOT='test_root_ID_1234567890';
const PRINCIPAL='resolver-account-000001';
const DRIVE='shared_drive_12345678';
const TIME='2026-10-15T05:30:00.000Z';
const change=(id='file_changed_123456')=>({kind:'drive#change',type:'file',fileId:id,removed:false,file:{id}});
const emptyPage={kind:'drive#changeList',changes:[],newStartPageToken:'token-end-user'};
const page=({folderId,pageNo,pass})=>({ok:true,protocol:'ox-drive-page-b927-experimental',folderId,pageNo,
  folders:[],tracks:[{id:'file_track_12345678',name:'001.mp3',type:'track',mimeType:'audio/mpeg',size:1000,modifiedAt:TIME}],
  complete:true,hasMore:false,nextCursor:null,snapshotPinned:false,stableSnapshot:false,productionCompatible:false});
function setup(overrides={}){
  const order=[];
  const options={rootFolderId:ROOT,principalId:PRINCIPAL,scope:'user',
    getUserStartToken:async()=>{order.push('user-start');return 'user-start-token';},
    getSharedStartToken:async()=>{order.push('drive-start');return 'drive-start-token';},
    fetchResolverPage:async q=>{order.push('resolver-'+q.pass);return page(q);},
    readUserChanges:async()=>{order.push('user-changes');return emptyPage;},
    readSharedChanges:async()=>{order.push('drive-changes');return {...emptyPage,newStartPageToken:'token-end-drive'};},
    ...overrides};
  return {order, options, run:()=>auditChangeWindowOffline(options)};
}
test('B9.2.10 no changes: tokens BEFORE both passes; feed AFTER; remains unpinned',async()=>{
  const {order,run}=setup();const result=await run();
  assert.deepEqual(order,['user-start','resolver-1','resolver-2','user-changes']);
  assert.equal(result.status,'QUIET_WINDOW_OBSERVED_UNPINNED');
  assert.equal(result.metadataPagesRead,2);
  for(const k of ['canStage','canPublish','immutableSnapshot','deploymentApproved','realAccountIdentityVerified'])assert.equal(result[k],false);
  assert.equal(JSON.stringify(result).includes('token'),false);
});
test('B9.2.10 shared drive requires BOTH start tokens before any resolver read',async()=>{
  const c=setup({scope:'shared-drive-member',sharedDriveId:DRIVE});const result=await c.run();
  assert.deepEqual(c.order,['user-start','drive-start','resolver-1','resolver-2','user-changes','drive-changes']);
  assert.equal(result.sharedChangePagesRead,1);assert.equal(result.sharedDriveMembershipVerified,false);
});
test('B9.2.10 rejects shared-drive-member without shared change feed',async()=>{
  const c=setup({scope:'shared-drive-member',sharedDriveId:DRIVE,readSharedChanges:undefined});
  await assert.rejects(c.run(),/Shared-drive change log required/);
  assert.equal(c.order.length,0);
});
test('B9.2.10 rejects missing shared drive identifier and unsupported scope',async()=>{
  await assert.rejects(setup({scope:'shared-drive-member'}).run(),/shared-drive scope/);
  await assert.rejects(setup({scope:'drive_unknown'}).run(),/Unknown Drive scope/);
  await assert.rejects(setup({scope:'user',sharedDriveId:DRIVE}).run(),/shared-drive scope/);
});
test('B9.2.10 missing user start token fails before reading data',async()=>{
  const c=setup({getUserStartToken:async()=>{c.order.push('user-start');return '';}});
  await assert.rejects(c.run(),/start token/);
  assert.deepEqual(c.order,['user-start']);
});
test('B9.2.10 missing shared drive start token fails before resolver reads',async()=>{
  const c=setup({scope:'shared-drive-member',sharedDriveId:DRIVE,getSharedStartToken:async()=>{c.order.push('drive-start');return undefined;}});
  await assert.rejects(c.run(),/shared-drive change start/);
  assert.deepEqual(c.order,['user-start','drive-start']);
});
test('B9.2.10 reports a changed track in the user change window',async()=>{
  const {run}=setup({readUserChanges:async()=>({...emptyPage,changes:[change()]})});
  const r=await run();assert.equal(r.status,'CHANGE_LOG_EVENTS_OBSERVED');assert.equal(r.observedChangeCount,1);
  assert.equal(r.canPublish,false);
});
test('B9.2.10 reports a shared-drive event even if user feed empty',async()=>{
  const {run}=setup({scope:'shared-drive-member',sharedDriveId:DRIVE,
    readSharedChanges:async()=>({...emptyPage,changes:[change()]})});
  const r=await run();assert.equal(r.observedChangeCount,1);assert.equal(r.status,'CHANGE_LOG_EVENTS_OBSERVED');
});
test('B9.2.10 catches metadata differences even with empty change feed',async()=>{
  const {run}=setup({fetchResolverPage:async q=>({...page(q),tracks:[{...page(q).tracks[0],name:q.pass===2?'updated.mp3':'001.mp3'}]})});
  const r=await run();assert.equal(r.status,'MUTATION_DETECTED');assert.equal(r.canStage,false);
});
test('B9.2.10 rejects incomplete user feed rather than counting it quiet',async()=>{
  const {run}=setup({readUserChanges:async()=>({kind:'drive#changeList',changes:[],nextPageToken:'next-token'})});
  await assert.rejects(run(),/Repeated change token|budget exceeded/);
});
test('B9.2.10 rejects incomplete shared drive feed even if user feed complete',async()=>{
  const {run}=setup({scope:'shared-drive-member',sharedDriveId:DRIVE,
    readSharedChanges:async()=>({kind:'drive#changeList',changes:[]})});
  await assert.rejects(run(),/Missing terminal newStartPageToken/);
});
test('B9.2.10 rejects malformed and invalid Drive change events',async()=>{
  const {run}=setup({readUserChanges:async()=>({...emptyPage,changes:[{fileId:'missing-fields'}]})});
  await assert.rejects(run(),/Unknown Drive change kind/);
});
test('B9.2.10 fails closed when resolver crashes between start and feed',async()=>{
  const c=setup({fetchResolverPage:async()=>{throw Error('Drive iterator expired');}});
  await assert.rejects(c.run(),/Drive iterator expired/);
  assert.deepEqual(c.order,['user-start']);
});
test('B9.2.10 account change scope cannot be inferred from a clean user feed',async()=>{
  const r=await setup().run();assert.equal(r.allRelatedDriveChangesProven,false);
  assert.equal(r.canSkipFullNightlyScan,false);assert.equal(r.liveAccountIdentityVerified,undefined);
});
test('B9.2.10 does not return raw Drive IDs, tokens or file names',async()=>{
  const r=await setup().run();const serialized=JSON.stringify(r);
  assert.equal(serialized.includes(ROOT),false);assert.equal(serialized.includes(PRINCIPAL),false);
  assert.equal(serialized.includes('001.mp3'),false);assert.equal(serialized.includes('user-start-token'),false);
});
test('B9.2.10 full 242-story roster report is advisory only',async()=>{
  const roster=Array.from({length:242},(_,i)=>`story-${String(i+1).padStart(3,'0')}`);
  const r=await setup().run();const summary=summarizeAllStoryWindows(roster,roster.map(storyId=>({storyId,result:r})));
  assert.equal(summary.auditedStories,242);assert.equal(summary.quiet,242);
  assert.equal(summary.allStoriesStillRequireDailyScan,true);assert.equal(summary.canPublish,false);
});
test('B9.2.10 summary rejects missing and duplicate story reports',async()=>{
  const r=await setup().run();const roster=['story-a','story-b'];
  assert.throws(()=>summarizeAllStoryWindows(roster,[{storyId:'story-a',result:r}]),/Incomplete daily/);
  assert.throws(()=>summarizeAllStoryWindows(roster,[{storyId:'story-a',result:r},{storyId:'story-a',result:r}]),/duplicate story/);
});
test('B9.2.10 summary refuses forged publication authorization',async()=>{
  const r=await setup().run();assert.throws(()=>summarizeAllStoryWindows(['story-a'],[{storyId:'story-a',result:{...r,canPublish:true}}]),/Unsafe/);
});
test('B9.2.10 no endpoints or production write controls are bundled',async()=>{
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../../local-player-b5/src/b9210-window-audit.js',import.meta.url),'utf8');
  assert.ok(!/https?:\/\//.test(source));
  assert.ok(!/\.put\(|\.batch\(|wrangler deploy|Drive\.Files\.update|Drive\.Files\.delete/.test(source));
});
