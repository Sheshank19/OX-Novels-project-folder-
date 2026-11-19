import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHmac } from 'node:crypto';
import { auditDriveAppTwice, scanDriveAppPass, compareDriveAppPasses, offlineAuditBudget } from '../../local-player-b5/src/b928-mutation-audit.js';

const ROOT='test_root_ID_1234567890';
const CHILD='test_child_ID_123456789';
const ISO='2026-10-10T05:30:00.000Z';
const id=i=>`track_test_${String(i).padStart(10,'0')}`;
const track=(i,extras={})=>({id:id(i),name:`${i}.mp3`,type:'track',mimeType:'audio/mpeg',size:1024+i,modifiedAt:ISO,...extras});
const folder=(i,extras={})=>({id:`folder_test_${String(i).padStart(10,'0')}`,name:`Range ${i}`,type:'folder',...extras});
const initial=()=>({[ROOT]:{folders:[],tracks:[track(1),track(2)]}});
function scripted(graphs,transform=()=>{}) {
 return async ({folderId,pageNo,cursor,pass})=>{
  const graph=graphs[pass];if(!graph?.[folderId])throw Error('Missing Drive folder');
  const {folders,tracks}=graph[folderId];
  const total=Math.max(1,Math.ceil(folders.length/25),Math.ceil(tracks.length/40));
  if(pageNo>=total)throw Error('Page beyond final');
  if(pageNo>0&&cursor!==`continuation-${pass}-${folderId}-${pageNo}`)throw Error('Wrong iterator cursor');
  let p={ok:true,protocol:'ox-drive-page-b927-experimental',folderId,pageNo,
   folders:folders.slice(pageNo*25,(pageNo+1)*25),tracks:tracks.slice(pageNo*40,(pageNo+1)*40),
   complete:pageNo===total-1,hasMore:pageNo<total-1,
   nextCursor:pageNo===total-1?null:`continuation-${pass}-${folderId}-${pageNo+1}`,
   snapshotPinned:false,stableSnapshot:false,productionCompatible:false};
  const changed=transform(p,{folderId,pageNo,pass,graph});if(changed)p=changed;
  return p;
 };
}
const copies=()=>[null,structuredClone(initial()),structuredClone(initial())];

test('B9.2.8 agrees on twice-observed unchanged metadata but explicitly prohibits activation', async()=>{
 const result=await auditDriveAppTwice(scripted(copies()),ROOT);
 assert.equal(result.status,'STABLE_OBSERVED_TWICE_UNPINNED');
 assert.equal(result.mutationDetected,false);
 for (const flag of ['stableSnapshot','verifiedPinnedSnapshot','canStage','canPublish','productionApproved']) assert.equal(result[flag],false);
 assert.match(result.reason,/ABA/);
});
test('B9.2.8 detects added same-folder audio between complete passes',async()=>{
 const g=copies();g[2][ROOT].tracks.push(track(3));
 const a=await auditDriveAppTwice(scripted(g),ROOT);
 assert.equal(a.status,'MUTATION_DETECTED');assert.equal(a.canPublish,false);
});
test('B9.2.8 detects renamed, resized and modified-date updates',async()=>{
 for(const mutation of [{name:'renamed.mp3'},{size:99999},{modifiedAt:'2026-10-11T05:30:00.000Z'}]){
  const g=copies();Object.assign(g[2][ROOT].tracks[0],mutation);
  assert.equal((await auditDriveAppTwice(scripted(g),ROOT)).mutationDetected,true);
 }
});
test('B9.2.8 detects removal between passes',async()=>{
 const g=copies();g[2][ROOT].tracks.pop();
 assert.equal((await auditDriveAppTwice(scripted(g),ROOT)).mutationDetected,true);
});
test('B9.2.8 detects newly added folder and its episode',async()=>{
 const g=copies();g[2][ROOT].folders.push({id:CHILD,name:'201-300',type:'folder'});
 g[2][CHILD]={folders:[],tracks:[track(201)]};
 const r=await auditDriveAppTwice(scripted(g),ROOT);
 assert.equal(r.mutationDetected,true);assert.equal(r.folderCount,2);assert.equal(r.trackCount,3);
});
test('B9.2.8 canonicalizes items independently of page/order changes',async()=>{
 const g=copies();g[2][ROOT].tracks.reverse();
 const r=await auditDriveAppTwice(scripted(g),ROOT);
 assert.equal(r.mutationDetected,false);
});
test('B9.2.8 handles 2,848 audio files and 63 folders across bounded pages',async()=>{
 const g=copies();for(const p of [1,2]){
  g[p][ROOT].tracks=Array.from({length:2848},(_,i)=>track(i));
  g[p][ROOT].folders=Array.from({length:63},(_,i)=>folder(i));
  for(const f of g[p][ROOT].folders)g[p][f.id]={folders:[],tracks:[]};
 }
 const result=await auditDriveAppTwice(scripted(g),ROOT);
 assert.equal(result.mutationDetected,false);assert.equal(result.trackCount,2848);assert.equal(result.folderCount,64);
 assert.ok(result.metadataPagesRead>140);
});
test('B9.2.8 refuses a truncated/missing second page rather than treating it as unchanged',async()=>{
 const g=copies();for(const p of [1,2])g[p][ROOT].tracks=Array.from({length:90},(_,i)=>track(i));
 await assert.rejects(auditDriveAppTwice(scripted(g,(r,{pass,pageNo})=>pass===2&&pageNo===1?{...r,ok:false}:null),ROOT),/failed page/);
});
test('B9.2.8 detects incorrect page / wrong root / expired cursor errors',async()=>{
 const g=copies();await assert.rejects(auditDriveAppTwice(scripted(g,(r,{pass})=>pass===2?{...r,folderId:CHILD}:null),ROOT),/Wrong folder/);
 const graph=copies();for(const p of [1,2])graph[p][ROOT].tracks=Array.from({length:90},(_,i)=>track(i));
 await assert.rejects(auditDriveAppTwice(async q=>{if(q.pass===2&&q.pageNo===1)throw Error('Expired iterator token');return scripted(graph)(q);},ROOT),/Expired iterator/);
});
test('B9.2.8 refuses duplicate audio IDs across different pages',async()=>{
 const g=copies();for(const p of [1,2]){
  g[p][ROOT].tracks=Array.from({length:45},(_,i)=>track(i));
  g[p][ROOT].tracks[42]={...g[p][ROOT].tracks[1]};
 }
 await assert.rejects(auditDriveAppTwice(scripted(g),ROOT),/Duplicate audio/);
});
test('B9.2.8 rejects folder cycles and duplicate folder IDs',async()=>{
 const g=copies();for(const p of [1,2]){
  g[p][ROOT].folders=[{id:CHILD,name:'sub',type:'folder'}];
  g[p][CHILD]={folders:[{id:ROOT,name:'cycle',type:'folder'}],tracks:[]};
 }
 await assert.rejects(auditDriveAppTwice(scripted(g),ROOT),/Repeated\/cyclic/);
});
test('B9.2.8 refuses missing modified metadata or invalid file size',async()=>{
 const g=copies();g[2][ROOT].tracks[0].modifiedAt='';
 await assert.rejects(auditDriveAppTwice(scripted(g),ROOT),/timestamp/);
 const h=copies();h[1][ROOT].tracks[1].size=-1;
 await assert.rejects(auditDriveAppTwice(scripted(h),ROOT),/size/);
});
test('B9.2.8 rejects inconsistent complete/more/cursor flags',async()=>{
 const g=copies();await assert.rejects(auditDriveAppTwice(scripted(g, r=>({...r,hasMore:true})),ROOT),/completion/);
});
test('B9.2.8 cannot trust a resolver self-declared production/snapshot flag',async()=>{
 const g=copies();await assert.rejects(auditDriveAppTwice(scripted(g, r=>({...r,stableSnapshot:true,productionCompatible:true})),ROOT),/refuses/);
});
test('B9.2.8 page, folder and track budget exhaustion are fatal',async()=>{
 const g=copies();g[1][ROOT].tracks=Array.from({length:80},(_,i)=>track(i));
 await assert.rejects(auditDriveAppTwice(scripted(g),ROOT,{maxPages:1}),/page budget/);
 await assert.rejects(auditDriveAppTwice(scripted(g),ROOT,{maxTracks:1}),/Track budget/);
 const h=copies();h[1][ROOT].folders=[{id:CHILD,name:'new',type:'folder'}];h[1][CHILD]={folders:[],tracks:[]};
 await assert.rejects(auditDriveAppTwice(scripted(h),ROOT,{maxFolders:1}),/Folder budget/);
});
test('B9.2.8 refuses missing second pass and mismatched roots',async()=>{
 const g=copies(),first=await scanDriveAppPass(scripted(g),ROOT,{pass:1});
 assert.throws(()=>compareDriveAppPasses(first,first),/Both independent/);
 const second={...first,pass:2,rootFolderId:CHILD};
 assert.throws(()=>compareDriveAppPasses(first,second),/Root binding/);
});
test('B9.2.8 offline workload planner counts two read passes and blocks unknown usage',()=>{
 const r=offlineAuditBudget({existingPageCount:4978});
 assert.equal(r.estimatedPages,9956);assert.equal(r.accountUsageKnown,false);assert.equal(r.withinLocalReadBudget,false);
 const known=offlineAuditBudget({existingPageCount:4978,pageReadsAlreadyUsed:1000});
 assert.equal(known.withinLocalReadBudget,true);assert.equal(known.automaticPublishingAllowed,false);
 const over=offlineAuditBudget({existingPageCount:4978,pageReadsAlreadyUsed:2500});
 assert.equal(over.withinLocalReadBudget,false);
});

function liveB927Mock(){
 const source=readFileSync(path.resolve(import.meta.dirname,'../../local-audio-lab/apps-script/OX-Audio-Resolver-B927-TEST-ONLY.gs'),'utf8');
 const nodes={[ROOT]:{files:Array.from({length:90},(_,i)=>({name:`${i}.mp3`,id:id(i)})),folders:[]}};
 let currentMs=1000000;
 const makeNode=o=>({getId:()=>o.id,getName:()=>o.name,getMimeType:()=> 'audio/mpeg',getSize:()=>1234,
   getLastUpdated:()=>new Date(ISO)});
 const iterator=(type,folderId,start=0)=>{
  const list=nodes[folderId][type];let offset=start;
  return {hasNext:()=>offset<list.length,next:()=>makeNode(list[offset++]),
   getContinuationToken:()=>`${type}_${folderId}_${offset}`};
 };
 const fromToken=(token,type)=>{
  const match=String(token).match(/^(files|folders)_(.+)_(\d+)$/);
  if(!match||match[1]!==type||!nodes[match[2]])throw Error('Invalid token');
  return iterator(type,match[2],Number(match[3]));
 };
 const utils={Charset:{UTF_8:'UTF-8'},base64EncodeWebSafe:x=>Buffer.from(x).toString('base64url'),
  base64DecodeWebSafe:x=>Buffer.from(x,'base64url'),
  computeHmacSha256Signature:(value,key)=>createHmac('sha256',key).update(value).digest(),
  newBlob:x=>({getDataAsString:()=>Buffer.from(x).toString('utf8')})};
 const FixedDate=class extends Date{constructor(...args){super(...(args.length?args:[currentMs]))}static now(){return currentMs}};
 const context={DriveApp:{getFolderById:folderId=>({getId:()=>folderId,getName:()=> 'Root',
    getFiles:()=>iterator('files',folderId),getFolders:()=>iterator('folders',folderId)}),
    continueFileIterator:token=>fromToken(token,'files'),continueFolderIterator:token=>fromToken(token,'folders')},
  Utilities:utils,Date:FixedDate,
  PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'offline-test-secret'})},
  ContentService:{MimeType:{JSON:'application/json'},createTextOutput:s=>({raw:s,setMimeType(){return this}})},
  Error,JSON,String,Number,Boolean,Object,Array,RegExp,Math,Intl};
 vm.createContext(context);vm.runInContext(source,context);
 return {nodes,fetch:async ({folderId,pageNo,cursor})=>{
  const body={mode:'list_children_page_b927',folderId,secret:'offline-test-secret',pageNo,...(cursor?{cursor}:{})};
  return JSON.parse(context.doPost({postData:{contents:JSON.stringify(body)}}).raw);
 }};
}

test('B9.2.8 integration consumes the actual B9.2.7 Apps Script test mode twice',async()=>{
 const lab=liveB927Mock();const r=await auditDriveAppTwice(lab.fetch,ROOT);
 assert.equal(r.status,'STABLE_OBSERVED_TWICE_UNPINNED');assert.equal(r.trackCount,90);
 assert.equal(r.metadataPagesRead,6);assert.equal(r.canPublish,false);
});
test('B9.2.8 actual B9.2.7 emulator detects an episode added before verification pass',async()=>{
 const lab=liveB927Mock();
 const fetch=async args=>{
  if(args.pass===2&&args.pageNo===0)lab.nodes[ROOT].files.push({name:'new-episode.mp3',id:'track_new_123456789'});
  return lab.fetch(args);
 };
 const r=await auditDriveAppTwice(fetch,ROOT);
 assert.equal(r.status,'MUTATION_DETECTED');assert.equal(r.trackCount,91);
});
test('B9.2.8 contains no endpoints, secrets, or catalog publication code',()=>{
 const src=readFileSync(path.resolve(import.meta.dirname,'../../local-player-b5/src/b928-mutation-audit.js'),'utf8');
 assert.match(src,/LOCAL ONLY/);assert.match(src,/canPublish: false/);
 assert.doesNotMatch(src,/https:\/\/script\.google\.com\/macros\/s\//);
 assert.doesNotMatch(src,/wrangler deploy|KV\.put\(|DODO_API_KEY\s*=/);
});
