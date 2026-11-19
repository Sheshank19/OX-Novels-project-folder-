/** OX B9.2 -- reviewed 3-file audit safety update. Local filesystem only. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const pkg=path.resolve(here,'..','src');
const project=path.resolve(here,'..','..','..');
const target=path.join(project,'local-player-b5','src');
const SHA={
 'b92-audit-reader.js':'7397dec5fc18dba3436c4475b719ee9191212c8468304252faf14ed2d0a50ceb',
 'b92-audit-scheduler.js':'5511b0a0ce7592b6bf62371f26c5fe363807deb52ba0c89a98f1614710ac399d'
};
const updates=Object.keys(SHA).concat('b92-audit-integrity.js');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const unsafe=m=>{throw Error('SAFE_MERGE_BLOCKED: '+m);};
const read=f=>{const s=fs.lstatSync(f);if(!s.isFile()||s.isSymbolicLink())unsafe('Unsafe input or output file type');return fs.readFileSync(f);};
const manager=path.join(target,'b9-catalog-manager.js');
const adapter=path.join(target,'b92-generation-adapter.js');
let backup=null;
try{
 const managerBefore=hash(read(manager));
 const adapterText=read(adapter).toString('utf8');
 if(!adapterText.includes("import {runAuditCron,auditStatus} from './b92-audit-scheduler.js'"))unsafe('Multi-story audit integration missing');
 const replacements=[];
 for(const name of updates){
   const original=path.join(target,name),revised=path.join(pkg,name);
   const bytes=read(revised),newHash=hash(bytes);
   let old=null;
   if(fs.existsSync(original)){
     old=read(original);
     const oldHash=hash(old);
     if(oldHash!==newHash && oldHash!==SHA[name])unsafe(`Existing ${name} has unreviewed local edits`);
   }else if(name!=='b92-audit-integrity.js')unsafe(`Required ${name} is missing`);
   if(!old || hash(old)!==newHash)replacements.push({name,original,bytes,old});
 }
 if(!replacements.length){console.log('B9.2 AUDIT SAFETY MERGE: ALREADY INSTALLED');process.exit(0);}
 backup=path.join(project,'local-player-b9.2','_B92_PLAYER_INTEGRATION_BACKUPS','audit-reliability-'+new Date().toISOString().replace(/[:.]/g,'-'));
 fs.mkdirSync(backup,{recursive:true});
 for(const r of replacements){if(r.old)fs.writeFileSync(path.join(backup,r.name),r.old,{flag:'wx',mode:0o600});}
 const committed=[];
 try{
  for(const r of replacements){
    const tmp=r.original+'.b92-audit-safe-tmp';
    fs.writeFileSync(tmp,r.bytes,{flag:'wx'});
    try{fs.renameSync(tmp,r.original);}catch(err){try{fs.unlinkSync(tmp);}catch{}throw err;}
    committed.push(r);
  }
  if(hash(read(manager))!==managerBefore)unsafe('Player manager changed unexpectedly');
 }catch(err){
  for(const r of committed.reverse()){
   if(r.old)fs.writeFileSync(r.original,r.old);else fs.rmSync(r.original,{force:true});
  }
  throw err;
 }
 console.log('B9.2 AUDIT RELIABILITY + INTEGRITY: INSTALLED');
 console.log('Source files updated: '+replacements.map(r=>r.name).join(', '));
 console.log('Existing Player manager: PRESERVED (SHA-256 '+managerBefore.slice(0,12)+'...)');
 console.log('Cursor restart: RECOVERABLE');
 console.log('Stored audit validation: AVAILABLE (read-only)');
 console.log('Automatic publishing: DISABLED');
 console.log('Cloudflare / Drive requests: NONE');
 console.log('Production deployment: NONE');
 console.log('Backup: '+backup);
 console.log('INTEGRATION PREPARED - NOTHING DEPLOYED');
}catch(err){console.error(String(err?.message||'Local merge failed'));process.exitCode=1;}
