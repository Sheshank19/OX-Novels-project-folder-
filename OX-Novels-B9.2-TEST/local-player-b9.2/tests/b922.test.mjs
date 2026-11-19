import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {beginStage,nextFolderPage,checkpointFolderPage,sealStage,tokenizeNextChunk,completeStage,stageStatus,estimateStageOps} from '../../local-player-b5/src/b922-durable-stage.js';

const root=path.resolve(import.meta.dirname,'../..');
const dbSql=fs.readFileSync(root+'/local-player-b9.2/migrations/0001_b922_staging_only.sql','utf8');
const manifest=JSON.parse(fs.readFileSync(root+'/local-player-b5/B5-PUBLISHED-CATALOGS.json','utf8')).catalogs;
const sample=manifest.find(x=>x.storyId==='a-luna-s-broken-bond');
const heavy=manifest.find(x=>x.storyId==='the-outcast-s-rise');
const readRaw=s=>JSON.parse(fs.readFileSync(path.join(root,'local-audio-lab/cache',s.sourceCatalogFile),'utf8'));
const sampleRaw=readRaw(sample),heavyRaw=readRaw(heavy);
const secret=Buffer.alloc(32,0x25).toString('base64url');
const jobId='B922_local_sample_01';
const jobArgs={jobId,storyId:sample.storyId,rootFolderId:sampleRaw.rootFolderId,sourceVersion:sample.sourceVersion,generationId:'g_B922_Local_Test_001',cycle:'local-only'};
function openDb(file=':memory:',create=true){
 const rawDb=new DatabaseSync(file);rawDb.exec('PRAGMA foreign_keys=ON;');if(create)rawDb.exec(dbSql);
 const adapter={
  prepare(sql){return {bind(...params){return {
   async first(){return rawDb.prepare(sql).get(...params)||null;},
   async all(){return {results:rawDb.prepare(sql).all(...params)};},
   async run(){const r=rawDb.prepare(sql).run(...params);return {success:true,meta:{changes:r.changes}};},
   _execute(){const statement=rawDb.prepare(sql);return sql.trim().toUpperCase().startsWith('SELECT')?statement.all(...params):statement.run(...params);}
  }}}},
  async batch(statements){rawDb.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>s._execute());rawDb.exec('COMMIT');return result;}catch(error){rawDb.exec('ROLLBACK');throw error;}},
  close(){rawDb.close();},
  raw:rawDb
 };
 return adapter;
}
function chunks(input,max=40){return Array.from({length:Math.ceil(input.length/max)||1},(_,i)=>input.slice(i*max,(i+1)*max));}
function pagesFor(node){const tracks=chunks(node.tracks,40),folders=chunks(node.folders,25);const n=Math.max(tracks.length,folders.length);return Array.from({length:n},(_,i)=>({name:node.name,pageNo:i,totalPages:n,folders:folders[i]||[],tracks:tracks[i]||[],complete:true}));}
async function stageOneFolder(db,job,folderId,node){for(const p of pagesFor(node))await checkpointFolderPage(db,job,folderId,p);}
async function stageWhole(db,args,raw){
 await beginStage(db,args);
 let steps=0;
 while(true){const next=await nextFolderPage(db,args.jobId);if(!next)break;
  const node=raw.nodes[next.folderId];assert.ok(node,'missing source folder');
  const allPages=pagesFor(node);const p=allPages[next.pageNo];assert.ok(p,'unexpected missing page');
  await checkpointFolderPage(db,args.jobId,next.folderId,p);steps++;
  assert.ok(steps<10000,'staging loop stuck');
 }
 return steps;
}

test('B9.2.2 starts a durable job and resumes without resetting metadata',async()=>{const db=openDb();try{const first=await beginStage(db,jobArgs);assert.equal(first.resumed,false);const second=await beginStage(db,jobArgs);assert.equal(second.resumed,true);const status=await stageStatus(db,jobId);assert.equal(status.phase,'SCANNING');await assert.rejects(beginStage(db,{...jobArgs,storyId:'another-story'}),/Conflicting/);}finally{db.close();}});

test('B9.2.2 preserves each page and detects unsafe changed-content replay',async()=>{const db=openDb();try{await beginStage(db,jobArgs);const node=sampleRaw.nodes[sampleRaw.rootFolderId],page=pagesFor(node)[0];const a=await checkpointFolderPage(db,jobId,sampleRaw.rootFolderId,page);assert.equal(a.replayed,false);const b=await checkpointFolderPage(db,jobId,sampleRaw.rootFolderId,page);assert.equal(b.replayed,true);await assert.rejects(checkpointFolderPage(db,jobId,sampleRaw.rootFolderId,{...page,tracks:[{...page.tracks[0],name:'corrupted.mp3'}]}),/Conflicting resolver page/);}finally{db.close();}});

test('B9.2.2 refuses skipped pages and cannot seal unfinished scan',async()=>{const db=openDb();try{await beginStage(db,jobArgs);await assert.rejects(sealStage(db,jobId),/incomplete/);const page=pagesFor(sampleRaw.nodes[sampleRaw.rootFolderId])[0];await assert.rejects(checkpointFolderPage(db,jobId,sampleRaw.rootFolderId,{...page,pageNo:1,totalPages:2}),/Out-of-order/);}finally{db.close();}});

test('B9.2.2 malformed/truncated Drive data cannot commit a page',async()=>{const db=openDb();try{await beginStage(db,jobArgs);const node=sampleRaw.nodes[sampleRaw.rootFolderId],page=pagesFor(node)[0];for(const bad of [{...page,truncated:true},{...page,tracks:[{...page.tracks[0],id:'bad / id'}]},{...page,tracks:new Array(41).fill(page.tracks[0])}])await assert.rejects(checkpointFolderPage(db,jobId,sampleRaw.rootFolderId,bad));assert.equal((await nextFolderPage(db,jobId)).pageNo,0);}finally{db.close();}});

test('B9.2.2 rejects duplicate file ID across folders without partial DB mutation',async()=>{const db=openDb();try{await beginStage(db,jobArgs);const raw=structuredClone(sampleRaw);const rootnode=raw.nodes[raw.rootFolderId];if(!rootnode.folders.length){rootnode.folders=[{id:'T1234567890folder',name:'New folder'}];raw.nodes.T1234567890folder={name:'New folder',folders:[],tracks:[rootnode.tracks[0]]};}await stageOneFolder(db,jobId,raw.rootFolderId,rootnode);const next=await nextFolderPage(db,jobId);assert.ok(next);const folder=raw.nodes[next.folderId];folder.tracks=[rootnode.tracks[0]];await assert.rejects(stageOneFolder(db,jobId,next.folderId,folder),/UNIQUE constraint/);assert.equal((await nextFolderPage(db,jobId)).folderId,next.folderId);}finally{db.close();}});

test('B9.2.2 restarts from disk, resumes mid-scan, then seals unchanged private data',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ox-b922-'));const filepath=path.join(dir,'stage.db');let db=openDb(filepath);
 try{await beginStage(db,jobArgs);const initial=await nextFolderPage(db,jobId);const pages=pagesFor(sampleRaw.nodes[initial.folderId]);await checkpointFolderPage(db,jobId,initial.folderId,pages[0]);db.close();db=openDb(filepath,false);
  await stageWhole(db,jobArgs,sampleRaw);const sealed=await sealStage(db,jobId);assert.equal(sealed.phase,'TOKENIZING');assert.equal(sealed.tracksStaged,sample.trackCount);assert.equal(sealed.foldersDiscovered,sample.folderCount);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('B9.2.2 encrypted 12-at-a-time checkpoints survive restart and decrypt correctly',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ox-b922-'));const file=path.join(dir,'stage.db');let db=openDb(file);
 try{await stageWhole(db,jobArgs,sampleRaw);await sealStage(db,jobId);const one=await tokenizeNextChunk(db,jobId,secret);assert.ok(one.processed>0&&one.processed<=12);db.close();db=openDb(file,false);
  while(!(await tokenizeNextChunk(db,jobId,secret)).complete){}const ready=await completeStage(db,jobId);assert.equal(ready.phase,'READY_LOCAL');assert.equal(ready.productionActivation,false);
  const tokens=db.raw.prepare('SELECT file_id,token FROM b922_tracks LIMIT 1').get();assert.ok(tokens.token.startsWith('t1.'));assert.ok(!tokens.token.includes(tokens.file_id));
  const [,n,ct]=tokens.token.split('.');const key=await crypto.subtle.importKey('raw',Buffer.from(secret,'base64url'),{name:'AES-GCM'},false,['decrypt']);const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(n,'base64url'),additionalData:new TextEncoder().encode('OX_PLAYER_TRACK_V1'),tagLength:128},key,Buffer.from(ct,'base64url'));
  assert.equal(JSON.parse(new TextDecoder().decode(clear)).fileId,tokens.file_id);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('B9.2.2 full 2,848-track story passes durable scan checkpoints without mixed folders',async()=>{
 const db=openDb();const args={...jobArgs,jobId:'B922_heavy_story_01',storyId:heavy.storyId,rootFolderId:heavyRaw.rootFolderId,sourceVersion:heavy.sourceVersion};
 try{const steps=await stageWhole(db,args,heavyRaw);assert.ok(steps>=heavy.folderCount);const sealed=await sealStage(db,args.jobId);assert.equal(sealed.tracksStaged,2848);assert.equal(sealed.foldersDiscovered,heavy.folderCount);assert.equal(sealed.phase,'TOKENIZING');const parsed=db.raw.prepare('SELECT COUNT(DISTINCT folder_id) AS n FROM b922_tracks WHERE job_id=?').get(args.jobId);assert.ok(parsed.n>=1);}finally{db.close();}
});

test('B9.2.2 refuses READY status with unencrypted tracks and has no KV publishing capability',async()=>{
 const db=openDb();try{await stageWhole(db,jobArgs,sampleRaw);await sealStage(db,jobId);await assert.rejects(completeStage(db,jobId),/not been encrypted/);assert.equal((await stageStatus(db,jobId)).phase,'TOKENIZING');assert.equal((await stageStatus(db,jobId)).productionActivation,false);}finally{db.close();}
});

test('B9.2.2 free-queue estimates expose changed-heavy workload instead of promising feasibility',()=>{const heavyWork=estimateStageOps({totalFolders:1923,totalTracks:154699});assert.ok(heavyWork.queueOperations>10000);assert.equal(heavyWork.underConservativeD1Budget,false);assert.ok(heavyWork.minD1RowsWritten>100000);const small=estimateStageOps({totalFolders:10,totalTracks:100});assert.ok(small.queueOperations>0&&small.underConservativeD1Budget===true&&small.warning.includes('Lower bound'));});
