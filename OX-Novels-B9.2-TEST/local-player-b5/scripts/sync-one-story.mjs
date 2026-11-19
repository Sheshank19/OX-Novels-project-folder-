import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { cacheDir, getStory, loadResolverConfig, nodeFromPayload, catalogFingerprint, catalogPathFor, safeStoryId, verifyCatalog } from './common.mjs';

const rl=readline.createInterface({input,output});
let storyId=String(process.argv[2]||'').trim();
if (!storyId) storyId=String(await rl.question('Story ID to sync from Drive: ')).trim();
rl.close();
if (!storyId) throw new Error('Story ID is required.');
const story=getStory(storyId);
if (!story.folderId) throw new Error('This story has no valid Drive folder source in the local D1 copy.');
const cfg=loadResolverConfig();
fs.mkdirSync(cacheDir,{recursive:true});
let metadataCalls=0;
async function resolver(folderId){
  metadataCalls++;
  const r=await fetch(cfg.resolverUrl,{method:'POST',redirect:'follow',headers:{'content-type':'application/json'},body:JSON.stringify({secret:cfg.resolverSecret,mode:'list_children',folderId})});
  const text=await r.text(); let p; try{p=JSON.parse(text)}catch{throw new Error('Resolver returned non-JSON response.');}
  if(!r.ok||p?.ok!==true) throw new Error(String(p?.error||`Resolver failed (${r.status})`)); return p;
}
const nodes={}, seen=new Set(); const MAX_DEPTH=12, MAX_FOLDERS=500, CONCURRENCY=3;
let active=0; const queue=[];
const limit=fn=>new Promise((resolve,reject)=>{queue.push({fn,resolve,reject}); pump();});
function pump(){ while(active<CONCURRENCY&&queue.length){const q=queue.shift();active++;Promise.resolve().then(q.fn).then(q.resolve,q.reject).finally(()=>{active--;pump();});}}
async function walk(folderId,name,depth){
  if(!folderId||seen.has(folderId)||depth>MAX_DEPTH||seen.size>=MAX_FOLDERS)return;
  seen.add(folderId); const payload=await limit(()=>resolver(folderId)); const node=nodeFromPayload(payload,name); nodes[folderId]=node;
  await Promise.all(node.folders.map(c=>walk(c.id,c.name,depth+1)));
}
console.log(`\nScanning Drive for: ${story.title} (${story.id})`);
console.log('The current active catalog remains untouched until the new scan is complete and verified.');
await walk(story.folderId,story.title,0);
const candidate={version:1,storyId:story.id,sourceVersion:story.sourceVersion,rootFolderId:story.folderId,builtAt:new Date().toISOString(),generationId:'',nodes};
const newFingerprint=catalogFingerprint(candidate);
const finalPath=catalogPathFor(story);
let previous=null;
if(fs.existsSync(finalPath)){ try{previous=JSON.parse(fs.readFileSync(finalPath,'utf8'))}catch{} }
if(previous&&verifyCatalog(story,previous)&&catalogFingerprint(previous)===newFingerprint){
  console.log(`\nUNCHANGED: ${story.id}`); console.log(`Folders: ${Object.keys(nodes).length}; tracks: ${Object.values(nodes).reduce((n,x)=>n+(x.tracks?.length||0),0)}; Drive metadata calls: ${metadataCalls}`);
  console.log('The active catalog was kept exactly as-is. No Player publish is required for this story.'); process.exit(0);
}
candidate.generationId=`g_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const temp=`${finalPath}.next-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
fs.writeFileSync(temp,JSON.stringify(candidate),'utf8');
const verified=JSON.parse(fs.readFileSync(temp,'utf8'));
if(!verifyCatalog(story,verified)){fs.rmSync(temp,{force:true});throw new Error('New catalog verification failed. Previous active catalog was kept.');}
fs.writeFileSync(finalPath,JSON.stringify(verified),'utf8'); fs.rmSync(temp,{force:true});
const prefix=`${safeStoryId(story.id)}-`;
for(const name of fs.readdirSync(cacheDir)){
  if(!name.startsWith(prefix)||name===path.basename(finalPath))continue;
  if(name.endsWith('.json')||name.includes('.next-')||name.endsWith('.tmp')) fs.rmSync(path.join(cacheDir,name),{force:true});
}
console.log(`\nUPDATED: ${story.id}`); console.log(`Generation: ${candidate.generationId}`); console.log(`Folders: ${Object.keys(nodes).length}; tracks: ${Object.values(nodes).reduce((n,x)=>n+(x.tracks?.length||0),0)}; Drive metadata calls: ${metadataCalls}`);
console.log('The new catalog is active locally and older/temp generations for this story were removed.');
