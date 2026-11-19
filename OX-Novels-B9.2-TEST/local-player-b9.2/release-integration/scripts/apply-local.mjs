import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const from=path.dirname(fileURLToPath(import.meta.url));
const release=path.resolve(from,'..');
const root=path.resolve(release,'..','..');
const target=path.join(root,'local-player-b5','src');
const patch=path.resolve(release,'patch');
const files=['b92-generation-adapter.js','b92-generation-policy.js','b92-live-catalog-store.js'];
function sha(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
const expected=JSON.parse(fs.readFileSync(path.join(patch,'original-fingerprints.json'),'utf8'));
let mods=[];
for(const name of files){
 const src=path.join(patch,name),dest=path.join(target,name);
 if(!fs.existsSync(src))throw Error('MISSING_PATCH_FILE: '+name);
 if(fs.existsSync(dest)&&sha(src)===sha(dest))continue;
 if(name!=='b92-live-catalog-store.js'&&sha(dest)!==expected[name])
   throw Error('LOCAL_SOURCE_CHANGED: '+name+'; refusing to replace unrelated edits');
 if(name==='b92-live-catalog-store.js'&&fs.existsSync(dest))
   throw Error('EXISTING_LIVE_STORE_DIFFERS: preserving local changes');
 mods.push({src,dest,name});
}
if(!mods.length){console.log('B9.2 LIVE STORE: ALREADY PREPARED. NOTHING DEPLOYED.');process.exit(0);}
const backup=path.join(root,'local-player-b9.2','_B92_PLAYER_INTEGRATION_BACKUPS',
 'live-store-'+new Date().toISOString().replace(/[.:]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
for(const m of mods)if(fs.existsSync(m.dest))fs.copyFileSync(m.dest,path.join(backup,m.name));
const originals=mods.map(m=>fs.existsSync(m.dest)?fs.readFileSync(m.dest):null);
try{for(const m of mods)fs.copyFileSync(m.src,m.dest);}catch(e){
 for(let i=0;i<mods.length;i++)try{
  if(originals[i])fs.writeFileSync(mods[i].dest,originals[i]);
  else fs.rmSync(mods[i].dest,{force:true});
 }catch{}
 throw Error('COPY_FAILED_ROLLED_BACK');
}
console.log('B9.2 DURABLE CATALOG READER: PREPARED IN EXISTING PLAYER SOURCE');
console.log('Files changed:',mods.map(m=>m.name).join(', '));
console.log('Existing b9-catalog-manager.js: PRESERVED');
console.log('Live publishing / cron: DISABLED');
console.log('Cloudflare / Drive / production: UNTOUCHED');
console.log('Backup:',backup);
