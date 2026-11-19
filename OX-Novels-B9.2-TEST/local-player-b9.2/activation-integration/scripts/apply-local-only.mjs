import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../../');
const src=path.join(root,'local-player-b5','src');
const pkg=path.resolve(here,'../patch');
const required=['index.js','worker-B5-template.js','b9-catalog-manager.js'];
for(const name of required){
  if(!fs.existsSync(path.join(src,name)))throw Error(`Missing existing Player source ${name}. Nothing modified.`);
}
const managerText=fs.readFileSync(path.join(src,'b9-catalog-manager.js'),'utf8');
for(const name of ['catalogMeta','authSync','handleAdminAction']){
  if(!new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\s*\\(`).test(managerText))
    throw Error(`Existing manager missing required export ${name}. Nothing modified.`);
}
const targetImport="from './b9-catalog-manager.js';";
const replacementImport="from './b92-generation-adapter.js';";
const oldImport='catalogMeta as b9LookupCatalogMeta, catalogAsset, authSync';
const newImport='catalogMeta as b9LookupCatalogMeta, playbackGeneration as b92PlaybackGeneration, catalogAsset, authSync';
const oldGuard=`  const catalog = await b9LookupCatalogMeta(env,CATALOG_INDEX,storyId);
  if (!catalog) return { error: textResponse("This story catalog is not published on the Player yet.", 503) };
  if (track?.kind !== "track" || String(track.storyId || "") !== storyId) return { error: textResponse("This track does not belong to this story.", 403) };
  if (String(track.sourceVersion || "") !== String(catalog.sourceVersion || "") || String(track.generationId || "") !== String(catalog.generationId || "")) {
    return { error: textResponse("This track belongs to an older catalog generation. Reopen the story from OX Novels.", 409) };
  }
`;
const newGuard=`  if (track?.kind !== "track" || String(track.storyId || "") !== storyId) return { error: textResponse("This track does not belong to this story.", 403) };
  // Honor only current or bounded previous generations after verifying session & track.
  let selected;
  try { selected = await b92PlaybackGeneration(env,CATALOG_INDEX,storyId,track); }
  catch { return { error: textResponse("Catalog verification temporarily unavailable.", 503) }; }
  if (!selected) return { error: textResponse("This track is no longer in an active catalog generation. Reopen the story from OX Novels.", 409) };
  const catalog = selected.meta;
`;
function matchOnce(text,needle,description){
  const count=text.split(needle).length-1;
  if(count!==1)throw Error(`${description} expected exactly once; found ${count}. Nothing modified.`);
}
function editWorker(file){
  const original=fs.readFileSync(file,'utf8');
  const newline=original.includes('\r\n')?'\r\n':'\n';
  let text=original.replace(/\r\n/g,'\n');
  if(text.includes(replacementImport)){
    // Previously patched version; continue validating without reapplying.
  }else{
    matchOnce(text,targetImport,'Legacy B9 import');
    text=text.replace(targetImport,replacementImport);
  }
  if(text.includes(newImport)){
    // Already updated import.
  }else{
    matchOnce(text,oldImport,'Legacy B9 symbols');
    text=text.replace(oldImport,newImport);
  }
  if(text.includes(newGuard)){
    // Already updated stream guard.
  }else{
    matchOnce(text,oldGuard,'Stream generation guard');
    text=text.replace(oldGuard,newGuard);
  }
  return [file,newline==='\r\n'?text.replace(/\n/g,'\r\n'):text];
}
// Preflight all edits before writing anything. Do not replace manager or touch .dev.vars.
const changes=[...['index.js','worker-B5-template.js'].map(n=>editWorker(path.join(src,n)))];
for(const name of ['b92-generation-policy.js','b92-generation-adapter.js']){
  const proposed=fs.readFileSync(path.join(pkg,name),'utf8');
  const dest=path.join(src,name);
  if(fs.existsSync(dest) && fs.readFileSync(dest,'utf8')!==proposed)
    throw Error(`Existing ${name} differs from patch. Refusing to overwrite. Nothing modified.`);
  changes.push([dest,proposed]);
}
const toWrite=changes.filter(([file,contents])=>!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==contents);
if(!toWrite.length){console.log('ALREADY INTEGRATED - NO CHANGES NEEDED');process.exit(0);}
const backup=path.join(root,'local-player-b9.2','_B92_PLAYER_INTEGRATION_BACKUPS',new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
for(const [file] of toWrite)if(fs.existsSync(file))fs.copyFileSync(file,path.join(backup,path.basename(file)));
const originals=toWrite.map(([file])=>[file,fs.existsSync(file)?fs.readFileSync(file):null]);
try{
  for(const [file,contents] of toWrite)fs.writeFileSync(file,contents,'utf8');
}catch(error){
  for(const [file,bytes] of originals){try{if(bytes===null)fs.rmSync(file,{force:true});else fs.writeFileSync(file,bytes);}catch{}}
  throw Error(`Local write failed. Attempted restoration from originals. ${error.message}`);
}
const hash=createHash('sha256').update(managerText).digest('hex');
console.log('B9.2 generation compatibility: INSTALLED IN EXISTING PLAYER');
console.log('Existing manager: PRESERVED (SHA-256 '+hash.slice(0,12)+'...)');
console.log('Legacy one-pass scan: DISABLED (no unsafe catalog publication)');
console.log('Backups:',backup);
console.log('Cloudflare/Drive activity: NONE');
console.log('Production deployment: NONE');
