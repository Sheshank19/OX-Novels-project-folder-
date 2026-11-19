import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {traversePass} from '../staging/prepare-one-story-catalog.mjs';
import {inventoryCommitments,identicalCommitments,catalogDigest,sealedBaselineMac,
  buildProtectedCatalog,assertProtectedCatalog,decryptToken,validateInventory,assertPlayerKeyMatchesStatic} from '../staging/catalog-compat.mjs';
const root='testRootFolder_AAAAAAAAAA',child='testChildFolder_BBBBBBBBB',fileA='testAudioFile_CCCCCCCCCC',fileB='testAudioFile_DDDDDDDDDD';
const secret='stage-fake-secret-used-only-by-tests-000000';
const key=crypto.randomBytes(32);
const one={rootFolder:root,story:{id:'fictional-story',sourceVersion:'0123456789ab',folderId:root}};
const date='2026-10-15T10:00:00.000Z';
const pages={
 [root]: [{ok:true,version:'ox-stage-readonly-v1',folderId:root,pageNo:0,readOnly:true,publishAllowed:false,pinnedSnapshot:false,stableSnapshot:false,
   folders:[{id:child,name:'01-100',type:'folder'}],tracks:[],complete:true,hasMore:false,nextCursor:null}],
 [child]: [{ok:true,version:'ox-stage-readonly-v1',folderId:child,pageNo:0,readOnly:true,publishAllowed:false,pinnedSnapshot:false,stableSnapshot:false,
   folders:[],tracks:[{id:fileB,name:'Episode 10.mp3',type:'track',mimeType:'audio/mpeg',size:200,modifiedAt:date},
                      {id:fileA,name:'Episode 2.mp3',type:'track',mimeType:'audio/mpeg',size:100,modifiedAt:date}],
   complete:true,hasMore:false,nextCursor:null}]
};
const read=async ({folderId,pageNo})=> structuredClone(pages[folderId]?.[pageNo]);
const metadata=()=>({story:one.story,root,nodes:structuredClone(nodes),key,generationId:'g_staging_test',builtAt:date});
const nodes={
 [root]:{name:'Fictional Story',folders:[{id:child,name:'01-100'}],tracks:[],truncated:false},
 [child]:{name:'01-100',folders:[],tracks:[...pages[child][0].tracks.map(t=>({id:t.id,name:t.name,mimeType:t.mimeType,size:t.size,modifiedAt:t.modifiedAt}))],truncated:false}
};

test('complete one-story traversal preserves names and pages',async()=>{
 const r=await traversePass(root,read);
 assert.equal(r.pages,2);assert.equal(r.nodes[child].name,'01-100');
 assert.equal(r.nodes[child].tracks.length,2);
});
test('metadata commitments match saved audit key and parent binding',()=>{
 const i=inventoryCommitments(secret,root,nodes);
 assert.equal(i.rootMac,catalogDigest(secret,'story-root',root));
 assert.equal(Object.keys(i.folders).length,1);assert.equal(Object.keys(i.tracks).length,2);
 const b={schema:1,stageVersion:'ox-stage-readonly-v1',rootMac:i.rootMac,folderCount:1,trackCount:2,folders:i.folders,tracks:i.tracks};
 b.mac=sealedBaselineMac(secret,b);
 assert.equal(sealedBaselineMac(secret,b),b.mac);
 assert.ok(identicalCommitments(i,b));
});
test('added or renamed track changes audit commitment',()=>{
 const before=inventoryCommitments(secret,root,nodes);
 const after=structuredClone(nodes);after[child].tracks[0].name='Episode 11.mp3';
 assert.ok(!identicalCommitments(before,inventoryCommitments(secret,root,after)));
});
test('B5 format contains encrypted t1 tokens, natural episode order, and next/previous',()=>{
 const c=buildProtectedCatalog(metadata());
 assert.deepEqual(Object.keys(c),['version','storyId','sourceVersion','generationId','builtAt','rootKey','folderCount','trackCount','folders']);
 assert.equal(c.folderCount,2);assert.equal(c.trackCount,2);
 const childKey=c.folders[c.rootKey].folders[0].key;
 assert.ok(childKey && c.folders[childKey]);
 const tracks=c.folders[childKey].tracks;
 assert.deepEqual(tracks.map(t=>t.name),['Episode 2.mp3','Episode 10.mp3']);
 assert.ok(tracks.every(t=>t.key.startsWith('t1.')));
 assert.equal(tracks[0].nextKey,tracks[1].key);
 assert.equal(tracks[1].previousKey,tracks[0].key);
 assert.equal(assertProtectedCatalog(c,key,{id:one.story.id,sourceVersion:one.story.sourceVersion}),2);
 const payload=decryptToken(tracks[0].key,key);
 assert.equal(payload.fileId,fileA);
 assert.equal(payload.kind,'track');
 const txt=JSON.stringify(c);
 assert.ok(!txt.includes(fileA)&&!txt.includes(fileB)&&!txt.includes(child)&&!txt.includes(root));
 assert.ok(!txt.includes('drive.google.com'));
});
test('same nonce and token format as B5 deterministic AES-GCM',()=>{
 const c=buildProtectedCatalog(metadata());
 const ckey=c.folders[c.rootKey].folders[0].key;
 const token=c.folders[ckey].tracks[0].key;
 const pl=decryptToken(token,key);
 const iv=crypto.createHmac('sha256',key).update('OX_TRACK_NONCE_V1\0'+
   `${pl.storyId}\0${pl.sourceVersion}\0${pl.generationId}\0${pl.fileId}`).digest().subarray(0,12);
 assert.equal(token.split('.')[1],iv.toString('base64url'));
});
test('tampering encrypted bytes or wrong key fails closed',()=>{
 const c=buildProtectedCatalog(metadata());const fk=c.folders[c.rootKey].folders[0].key;
 const token=c.folders[fk].tracks[0].key;
 assert.throws(()=>decryptToken(token,crypto.randomBytes(32)));
 const parts=token.split('.');const buf=Buffer.from(parts[2],'base64url');buf[0]^=2;
 assert.throws(()=>decryptToken(parts[0]+'.'+parts[1]+'.'+buf.toString('base64url'),key));
});
test('empty or nested new story cannot be prepared',()=>{
 const empty=structuredClone(nodes);empty[child].tracks=[];
 assert.throws(()=>validateInventory(root,empty),/EMPTY_CATALOG_NOT_PREPARABLE/);
 const nested=structuredClone(nodes);nested[child].folders=[{id:'testOther_FFFFFFFFFFFF',name:'nested'}];
 assert.throws(()=>validateInventory(root,nested));
});
test('invalid or duplicated track cannot be prepared',()=>{
 const dup=structuredClone(nodes);dup[child].tracks.push(dup[child].tracks[0]);
 assert.throws(()=>validateInventory(root,dup),/INVALID_TRACK/);
 const damaged=structuredClone(nodes);damaged[child].tracks[0].modifiedAt='';
 assert.throws(()=>validateInventory(root,damaged),/INVALID_TRACK/);
});
test('prepared module contains no Worker deployment or remote publication commands',()=>{
 const d=path.dirname(fileURLToPath(import.meta.url));
 const src=fs.readFileSync(path.join(d,'..','staging','prepare-one-story-catalog.mjs'),'utf8');
 assert.ok(!/wrangler\s+deploy|\.put\(|\.exec\(|\.batch\(|fetch\(.+workers\.dev/.test(src));
 assert.ok(src.includes('BASELINE_CONTENT_CHANGED')&&src.includes('SAVED_BASELINE_REQUIRED'));
});

test('existing static catalog proves the existing Player key before any Drive reads',()=>{
 const c=buildProtectedCatalog(metadata());
 assert.equal(assertPlayerKeyMatchesStatic(c,key,one.story),true);
 assert.throws(()=>assertPlayerKeyMatchesStatic(c,crypto.randomBytes(32),one.story),/PLAYER_KEY_DOES_NOT_MATCH_STATIC/);
 assert.throws(()=>assertPlayerKeyMatchesStatic({...c,storyId:'different'},key,one.story));
});
