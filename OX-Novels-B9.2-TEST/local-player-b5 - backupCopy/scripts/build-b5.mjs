import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { b5Root, oxRoot, cacheDir, keyFile, safeStoryId } from './common.mjs';
const templatePath=path.join(b5Root,'src','worker-B5-template.js');
const outWorker=path.join(b5Root,'src','index.js');
const publicDir=path.join(b5Root,'public'); const catalogDir=path.join(publicDir,'catalogs');
const manifestPath=path.join(b5Root,'B5-PUBLISHED-CATALOGS.json');
function fail(m){console.error(`\nERROR: ${m}\n`);process.exit(1)}
if(!fs.existsSync(keyFile))fail('local-player-handoff/.env.player-handoff missing. Keep the existing B2/B3/B4 handoff key.');
if(!fs.existsSync(cacheDir))fail('local-audio-lab/cache missing.');
let key; try{key=Buffer.from(fs.readFileSync(keyFile,'utf8').trim().replace(/-/g,'+').replace(/_/g,'/'),'base64')}catch{}
if(!key||key.length!==32)fail('Player handoff key must decode to 32 bytes.');
fs.mkdirSync(catalogDir,{recursive:true});
let previous={catalogs:[]};
if(fs.existsSync(manifestPath)){try{previous=JSON.parse(fs.readFileSync(manifestPath,'utf8'))}catch{}}
else {
  const b4Manifest=path.join(oxRoot,'local-player-b4','B4-PUBLISHED-CATALOGS.json');
  const b4CatalogDir=path.join(oxRoot,'local-player-b4','public','catalogs');
  if(fs.existsSync(b4Manifest)){
    try{ previous=JSON.parse(fs.readFileSync(b4Manifest,'utf8')); for(const item of previous.catalogs||[]){const src=path.join(b4CatalogDir,`${item.storyId}.json`);if(fs.existsSync(src))fs.copyFileSync(src,path.join(catalogDir,`${item.storyId}.json`));} console.log('Imported current B4 published catalog state into B5.'); }catch{}
  }
}
const published=new Map((previous.catalogs||[]).map(x=>[String(x.storyId),x]));
function isRaw(c){return c&&typeof c==='object'&&typeof c.storyId==='string'&&typeof c.sourceVersion==='string'&&typeof c.rootFolderId==='string'&&c.nodes?.[c.rootFolderId]}
const latest=new Map();
for(const name of fs.readdirSync(cacheDir).filter(n=>n.endsWith('.json'))){const full=path.join(cacheDir,name);let c;try{c=JSON.parse(fs.readFileSync(full,'utf8'))}catch{continue}if(!isRaw(c))continue;const st=fs.statSync(full);const cur=latest.get(c.storyId);if(!cur||st.mtimeMs>cur.mtimeMs)latest.set(c.storyId,{catalog:c,file:full,mtimeMs:st.mtimeMs});}
const TRACK_AAD=Buffer.from('OX_PLAYER_TRACK_V1','utf8');
const b64=v=>Buffer.from(v).toString('base64url');
function encryptTrackDet(payload){
  const nonceMaterial=`${payload.storyId}\0${payload.sourceVersion}\0${payload.generationId}\0${payload.fileId}`;
  const iv=crypto.createHmac('sha256',key).update('OX_TRACK_NONCE_V1\0'+nonceMaterial).digest().subarray(0,12);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(TRACK_AAD);const plain=Buffer.from(JSON.stringify(payload),'utf8');const enc=Buffer.concat([cipher.update(plain),cipher.final()]);const tag=cipher.getAuthTag();return `t1.${b64(iv)}.${b64(Buffer.concat([enc,tag]))}`;
}
function folderKey(storyId,sourceVersion,folderId){return crypto.createHash('sha256').update(`folder\0${storyId}\0${sourceVersion}\0${folderId}`).digest('base64url').slice(0,22)}
function safeCatalog(c){
  const storyId=String(c.storyId),sourceVersion=String(c.sourceVersion),generationId=String(c.generationId||''); if(!generationId)throw new Error(`Catalog ${storyId} has no generationId.`);
  const folderKeys=new Map(Object.keys(c.nodes||{}).map(id=>[id,folderKey(storyId,sourceVersion,id)])); const ordered=[],seen=new Set();
  function walk(id){if(!id||seen.has(id))return;seen.add(id);const n=c.nodes?.[id];if(!n)return;for(const t of n.tracks||[])if(t?.id)ordered.push(t);for(const f of n.folders||[])walk(String(f.id||''));} walk(c.rootFolderId);
  const tokens=new Map(); for(const t of ordered){const fileId=String(t.id||'');tokens.set(fileId,encryptTrackDet({kind:'track',storyId,sourceVersion,generationId,fileId,mimeType:String(t.mimeType||'')}));}
  const neighbor=new Map(); for(let i=0;i<ordered.length;i++){const t=ordered[i],p=ordered[i-1],n=ordered[i+1];neighbor.set(String(t.id),{previousKey:p?.id?tokens.get(String(p.id))||'':'',nextKey:n?.id?tokens.get(String(n.id))||'':''});}
  const folders={}; for(const [rawId,n] of Object.entries(c.nodes||{})){const fk=folderKeys.get(rawId);folders[fk]={name:String(n?.name||'Folder'),folders:(n?.folders||[]).map(f=>({key:folderKeys.get(String(f.id||''))||'',name:String(f.name||'Folder')})).filter(f=>f.key),tracks:(n?.tracks||[]).map(t=>{const id=String(t.id||''),nb=neighbor.get(id)||{};return{key:tokens.get(id)||'',name:String(t.name||'Audio'),mimeType:String(t.mimeType||''),size:Number(t.size||0),modifiedAt:String(t.modifiedAt||''),previousKey:nb.previousKey||'',nextKey:nb.nextKey||''}}).filter(t=>t.key)};}
  return{version:1,storyId,sourceVersion,generationId,builtAt:String(c.builtAt||''),rootKey:folderKeys.get(String(c.rootFolderId))||'',folderCount:Object.keys(folders).length,trackCount:ordered.length,folders};
}
let changed=0,reused=0;
for(const {catalog,file} of [...latest.values()].sort((a,b)=>String(a.catalog.storyId).localeCompare(String(b.catalog.storyId)))){
  const id=String(catalog.storyId); const old=published.get(id); const target=path.join(catalogDir,`${safeStoryId(id)}.json`);
  if(old&&String(old.sourceVersion)===String(catalog.sourceVersion)&&String(old.generationId)===String(catalog.generationId)&&fs.existsSync(target)){reused++;continue;}
  const safe=safeCatalog(catalog); fs.writeFileSync(target,JSON.stringify(safe),'utf8'); const bytes=fs.statSync(target).size;
  published.set(id,{storyId:id,sourceVersion:safe.sourceVersion,generationId:safe.generationId,folderCount:safe.folderCount,trackCount:safe.trackCount,catalogPath:`/catalogs/${safeStoryId(id)}.json?v=${encodeURIComponent(safe.generationId)}`,sourceCatalogFile:path.basename(file),staticCatalogBytes:bytes}); changed++;
}
// Preserve previously published catalogs that are not currently present in local cache. Removal is explicit only.
for(const [id,item] of [...published]){const f=path.join(catalogDir,`${safeStoryId(id)}.json`);if(!fs.existsSync(f)){console.warn(`WARNING: published catalog asset missing locally for ${id}; removing it from this B5 build to avoid a broken index.`);published.delete(id);}}
const index={}; const manifest=[...published.values()].sort((a,b)=>a.storyId.localeCompare(b.storyId)); for(const x of manifest)index[x.storyId]={storyId:x.storyId,sourceVersion:x.sourceVersion,generationId:x.generationId,folderCount:x.folderCount,trackCount:x.trackCount,catalogPath:x.catalogPath};
const template=fs.readFileSync(templatePath,'utf8'), marker='/*__OX_B5_CATALOG_INDEX__*/'; if(!template.includes(marker))fail('B5 template marker missing.');
const generated=template.replace(marker,`const CATALOG_INDEX = ${JSON.stringify(index)};`); fs.writeFileSync(outWorker,generated,'utf8'); fs.writeFileSync(manifestPath,JSON.stringify({generatedAt:new Date().toISOString(),catalogs:manifest},null,2));
const publicText=manifest.map(x=>fs.readFileSync(path.join(catalogDir,`${safeStoryId(x.storyId)}.json`),'utf8')).join('\n');
if(/drive\.google\.com|drive\.usercontent\.google\.com|"fileId"\s*:|"rootFolderId"\s*:/.test(publicText))fail('Safety check failed: public catalog contains raw Drive identifier/URL.');
console.log(`\nB5 incremental build ready. Published catalogs: ${manifest.length}. Changed/new this build: ${changed}. Reused unchanged: ${reused}.`);
for(const x of manifest)console.log(`- ${x.storyId}: ${x.folderCount} folders, ${x.trackCount} tracks, generation ${x.generationId}`);
console.log('Unchanged catalog JSON is preserved byte-for-byte, so Wrangler can avoid re-uploading it.');
