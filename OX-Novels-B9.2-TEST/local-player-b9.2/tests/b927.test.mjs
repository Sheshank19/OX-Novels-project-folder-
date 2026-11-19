import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHmac} from 'node:crypto';
import {validateBeginEnvelope} from '../../local-player-b5/src/b925-resolver-protocol.js';

const src = readFileSync(path.resolve(import.meta.dirname,'../../local-audio-lab/apps-script/OX-Audio-Resolver-B927-TEST-ONLY.gs'),'utf8');
const ROOT='folder_fake_ID_1234567890';
const OTHER='folder_other_ID_12345678';
const SECRET='offline-simulation-only-secret';
function makeNode(name,id,mime='audio/mpeg'){
 return {getId:()=>id,getName:()=>name,getMimeType:()=>mime,getSize:()=>1234,
   getLastUpdated:()=>new Date('2026-08-05T00:00:00.000Z')};
}
function createLab({files=[],folders=[],now=1000000,tokenFailure=false}={}){
 const nodes={
 [ROOT]:{name:'Original',files,folders},
 [OTHER]:{name:'Other',files:[],folders:[]}
 };
 const newIter=(items,type,folderId,start=0)=>{
  let pos=start;
  return {hasNext:()=>pos<items.length,next(){if(pos>=items.length)throw Error('exhausted');return items[pos++]},
    getContinuationToken(){return tokenFailure?'':`${type}:${folderId}:${pos}`}}
 };
 const fromToken=(token,type)=>{
  const parts=String(token).split(':');
  if(parts.length!==3||parts[0]!==type||!nodes[parts[1]])throw Error('Mock invalid iterator token');
  const p=Number(parts[2]);if(!Number.isSafeInteger(p)||p<0)throw Error('Mock invalid iterator position');
  return newIter(nodes[parts[1]][type==='f'?'files':'folders'],type,parts[1],p);
 };
 const mockDrive={getFolderById(folderId){const node=nodes[folderId];if(!node)throw Error('No folder');return {
   getId:()=>folderId,getName:()=>node.name,
   getFiles:()=>newIter(node.files,'f',folderId),
   getFolders:()=>newIter(node.folders,'d',folderId)
 }},continueFileIterator:token=>fromToken(token,'f'),continueFolderIterator:token=>fromToken(token,'d')};
 const mockUtils={Charset:{UTF_8:'UTF-8'},base64EncodeWebSafe:x=>Buffer.from(x).toString('base64url'),
 base64DecodeWebSafe:x=>Buffer.from(x,'base64url'),
 computeHmacSha256Signature:(input,key)=>createHmac('sha256',key).update(input).digest(),
 newBlob:x=>({getDataAsString:()=>Buffer.from(x).toString('utf8')})};
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const mockContext={DriveApp:mockDrive,Utilities:mockUtils,Date:FixedDate,
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>SECRET})},
  ContentService:{MimeType:{JSON:'application/json'},createTextOutput:s=>({raw:s,setMimeType(){return this}})},
  console:{log(){throw Error('No logging in resolver')}},
  Error,JSON,String,Number,Boolean,Object,Array,RegExp,Math,Intl};
 vm.createContext(mockContext);vm.runInContext(src,mockContext,{filename:'OX-Audio-Resolver-B927-TEST-ONLY.gs'});
 const send=(body)=>JSON.parse(mockContext.doPost({postData:{contents:JSON.stringify(body)}}).raw);
 const page=(cursor=null,pageNo=0,folderId=ROOT,secret=SECRET)=>send({mode:'list_children_page_b927',folderId,secret,pageNo,...(cursor?{cursor}:{})});
 return {page,send,setNow:time=>{now=time;},nodes};
}
async function collectPages(lab,{folderId=ROOT,max=500}={}){
 let cursor=null,pageNo=0;const results=[];
 do{
  assert.ok(pageNo<max,'page upper bound exceeded');const data=lab.page(cursor,pageNo,folderId);
  assert.equal(data.ok,true,JSON.stringify(data));results.push(data);
  cursor=data.nextCursor;pageNo++;
  if(data.complete){assert.equal(cursor,null);return results;}
  assert.equal(data.hasMore,true);assert.equal(typeof cursor,'string');
 }while(cursor);
 throw Error('Incomplete scan');
}

test('B9.2.7 script copied from real uploaded LAB and legacy list_children mode still works',()=>{
 const lab=createLab({files:[makeNode('1.mp3','audio_1_abcdefghi'),makeNode('readme.txt','txt_1_abcdefghi','text/plain')]});
 const data=lab.send({mode:'list_children',secret:SECRET,folderId:ROOT});
 assert.equal(data.ok,true);assert.equal(data.tracks.length,1);assert.equal(data.truncated,false);
});
test('B9.2.7 rejects requests without valid Apps Script secret',()=>{
 const lab=createLab();for(const secret of ['', 'wrong'])assert.equal(lab.page(null,0,ROOT,secret).ok,false);
 assert.equal(lab.send({mode:'unused',secret:SECRET,folderId:ROOT}).ok,false);
});
test('B9.2.7 90 MP3 tracks are paginated 40,40,10 with no loss or duplication',async()=>{
 const files=Array.from({length:90},(_,i)=>makeNode(`${String(i).padStart(3,'0')}.mp3`,`audio_id_${String(i).padStart(8,'0')}`));
 const pages=await collectPages(createLab({files}));
 assert.deepEqual(pages.map(p=>p.tracks.length),[40,40,10]);
 assert.deepEqual(pages.map(p=>p.pageNo),[0,1,2]);
 assert.equal(new Set(pages.flatMap(p=>p.tracks.map(t=>t.id))).size,90);
 assert.ok(pages.every(p=>p.snapshotPinned===false&&p.productionCompatible===false));
});
test('B9.2.7 63 folders are paginated with no folder loss',async()=>{
 const folders=Array.from({length:63},(_,i)=>makeNode(`Folder ${i}`,`folder_abcdef_${String(i).padStart(5,'0')}`));
 const pages=await collectPages(createLab({folders}));
 assert.deepEqual(pages.map(p=>p.folders.length),[25,25,13]);
 assert.equal(pages.flatMap(p=>p.folders).length,63);
});
test('B9.2.7 800 tracks do not hit old resolver 700-audio cap',async()=>{
 const files=Array.from({length:800},(_,i)=>makeNode(`${i}.m4b`,`audio_xyz_${String(i).padStart(8,'0')}`));
 const pages=await collectPages(createLab({files}));
 assert.equal(pages.length,20);assert.equal(pages.reduce((n,p)=>n+p.tracks.length,0),800);
});
test('B9.2.7 nonaudio files consume bounded inspection allowance without truncating scan',async()=>{
 const files=[...Array.from({length:350},(_,i)=>makeNode(`${i}.txt`,`textfile_abc_${String(i).padStart(6,'0')}`,'text/plain')),
 makeNode('final-episode.mp3','last_audio_abcdefg')];
 const pages=await collectPages(createLab({files}));
 assert.ok(pages.length>=3);assert.equal(pages.flatMap(p=>p.tracks).length,1);
 assert.ok(pages.some(p=>p.hasMore&&p.tracks.length===0));
});
test('B9.2.7 cursor HMAC modification is detected; no scan data accepted',()=>{
 const lab=createLab({files:Array.from({length:70},(_,i)=>makeNode(`${i}.mp3`,`audio_abcdef_${i}`))});
 const p0=lab.page();const token=p0.nextCursor;
 const parts=token.split('.');const tampered=parts[0].slice(0,-1)+(parts[0].at(-1)==='a'?'b':'a')+'.'+parts[1];
 assert.equal(lab.page(tampered,1).ok,false);
});
test('B9.2.7 signed cursor is bound to folder and page number',()=>{
 const lab=createLab({files:Array.from({length:70},(_,i)=>makeNode(`${i}.mp3`,`audio_abcdef_${i}`))});
 const p0=lab.page();assert.equal(lab.page(p0.nextCursor,1,OTHER).ok,false);
 assert.equal(lab.page(p0.nextCursor,2).ok,false);
 assert.equal(lab.page(null,1).ok,false);
 assert.equal(lab.page(p0.nextCursor,0).ok,false);
});
test('B9.2.7 rejects expired cursor instead of restarting from page zero',()=>{
 const lab=createLab({files:Array.from({length:70},(_,i)=>makeNode(`${i}.mp3`,`audio_abcdef_${i}`))});
 const p0=lab.page();lab.setNow(1000000+20*60*1000);
 assert.equal(lab.page(p0.nextCursor,1).ok,false);
});
test('B9.2.7 exhausted empty folder completes with empty metadata and no extra page',async()=>{
 const pages=await collectPages(createLab());assert.equal(pages.length,1);
 assert.equal(pages[0].folders.length,0);assert.equal(pages[0].tracks.length,0);
});
test('B9.2.7 continuation token failure fails closed',()=>{
 const lab=createLab({tokenFailure:true,files:Array.from({length:70},(_,i)=>makeNode(`${i}.mp3`,`audio_abcdef_${i}`))});
 assert.equal(lab.page().ok,false);
});
test('B9.2.7 prototype response explicitly fails existing pinned-snapshot contract',()=>{
 const lab=createLab();const p=lab.page();assert.equal(p.stableSnapshot,false);
 assert.throws(()=>validateBeginEnvelope(p,{rootFolderId:ROOT}),/complete|snapshot|root/i);
});
test('B9.2.7 no secrets, raw URLs, or payment functions are included in new GAS source',()=>{
 assert.match(src,/NOT FOR APPS SCRIPT DEPLOYMENT/);
 assert.doesNotMatch(src,/https:\/\/script\.google\.com\/macros\/s\//);
 assert.doesNotMatch(src,/OX_PLAYER_SYNC_KEY\s*=/);
 assert.doesNotMatch(src,/DODO_(?:API|SECRET)_KEY\s*=/);
});
