/** One local source merge; NO cloud, Drive calls, secret reads, or deployment. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const project=path.resolve(here,'..','..','..');
const source=path.join(project,'local-player-b5','src');
const pkg=path.resolve(here,'..','src');
const adapter=path.join(source,'b92-generation-adapter.js');
const manager=path.join(source,'b9-catalog-manager.js');
const old=`export async function runPacificCron(){\n  console.warn('B9.2 legacy auto-publish disabled pending sealed paginated sync');\n}`;
const replaced=`export async function runPacificCron(controller,env){\n  // B9.2 paginated inventory only. No automatic publication is possible here.\n  return runAuditCron(controller,env);\n}`;
const imported="import {runAuditCron,auditStatus} from './b92-audit-scheduler.js';\n";
const fail=m=>{throw Error('SAFE_MERGE_BLOCKED: '+m);};
function checked(file){
  const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink())fail('Unsafe target type');
  return fs.readFileSync(file);
}
if(!fs.existsSync(adapter)||!fs.existsSync(manager)||!fs.existsSync(pkg))fail('Player source missing');
const managerBefore=checked(manager);
const before=checked(adapter).toString('utf8');
const installed=before.includes(replaced)&&before.includes(imported);
if(!installed && (!before.includes(old)||before.includes('runAuditCron')))fail('Unfamiliar Player adapter: original preserved');
const statusAnchor="  if(obj?.action==='status')return legacyAdminAction(request,env,index);";
if(!installed&&!before.includes(statusAnchor))fail('Unfamiliar admin handler');
const statusCode="  if(obj?.action==='audit-status'){\n    try {return json({ok:true,audit:await auditStatus(env)});}\n    catch{return json({error:'Audit status temporarily unavailable'},503);}\n  }\n";
const next=installed?before:imported+before.replace(old,replaced).replace(statusAnchor,statusCode+statusAnchor);
const backupDir=path.join(project,'local-player-b9.2','_B92_PLAYER_INTEGRATION_BACKUPS',
  'audit-'+new Date().toISOString().replace(/[:.]/g,'-'));
let made=false;
const files=['b92-audit-reader.js','b92-audit-scheduler.js'];
try{
  // All checks complete BEFORE writing: preserve current Player and manager.
  for(const name of files){checked(path.join(pkg,name));const dest=path.join(source,name);
    if(fs.existsSync(dest)){const st=fs.lstatSync(dest);if(!st.isFile()||st.isSymbolicLink())fail('Unsafe destination');}
  }
  if(!installed||files.some(name=>!fs.existsSync(path.join(source,name))||
    !checked(path.join(source,name)).equals(checked(path.join(pkg,name))))){
    fs.mkdirSync(backupDir,{recursive:true});made=true;
    fs.writeFileSync(path.join(backupDir,'b92-generation-adapter.js'),before,{flag:'wx'});
    for(const name of files){const dest=path.join(source,name);
      if(fs.existsSync(dest))fs.writeFileSync(path.join(backupDir,name),checked(dest),{flag:'wx'});
    }
    // Copy only these two new modules and one import/callback in the adapter.
    for(const name of files){const tmp=path.join(source,'.'+name+'.audit-merge-tmp');
      fs.writeFileSync(tmp,checked(path.join(pkg,name)));fs.renameSync(tmp,path.join(source,name));}
    const temp=adapter+'.audit-merge-tmp';fs.writeFileSync(temp,next);fs.renameSync(temp,adapter);
  }
  const actual=crypto.createHash('sha256').update(checked(manager)).digest('hex');
  const expected=crypto.createHash('sha256').update(managerBefore).digest('hex');
  if(actual!==expected)fail('Manager changed unexpectedly');
  console.log('B9.2 MULTI-STORY READ-ONLY AUDIT: LOCAL SOURCE PREPARED');
  console.log('Existing Player manager: PRESERVED (SHA-256 '+actual.slice(0,12)+'...)');
  console.log('Automatic publication: DISABLED');
  console.log('Cloudflare / Google Drive requests: NONE');
  console.log('Production deployment: NONE');
  console.log('Status: '+(made?'INSTALLED':'ALREADY INSTALLED'));
  if(made)console.log('Local backup: '+backupDir);
}catch(err){
  console.error(String(err?.message||'Local source merge failed'));process.exitCode=1;
}
