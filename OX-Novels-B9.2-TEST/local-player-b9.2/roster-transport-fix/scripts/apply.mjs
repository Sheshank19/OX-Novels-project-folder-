/** OX B9.2: local-only, exact-anchor repair. Does not contact Cloudflare or Drive. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const player=path.join(root,'local-player-b5');
const scheduler=path.join(player,'src','b92-audit-scheduler.js');
const configPath=path.join(player,'wrangler.jsonc');
const fail=message=>{throw Error('REPAIR BLOCKED: '+message+'; no deployment');};
const safeRead=file=>{
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink())fail('unsafe file '+path.basename(file));
  return fs.readFileSync(file,'utf8');
};
const before=safeRead(scheduler);
const configBefore=safeRead(configPath);
let cfg;
try{cfg=JSON.parse(configBefore);}catch{fail('Wrangler JSON differs from reviewed config');}
if(cfg.name!=='listen'||cfg.main!=='src/index.js')fail('unexpected Worker name/entrypoint');
if(cfg.vars?.B92_AUDIT_MODE!=='readonly'||cfg.vars?.B92_AUDIT_CANARY_STORY!=='a-dragon-s-revenge')fail('canary mode differs');
if(!cfg.d1_databases?.some(x=>x.binding==='B92_AUDIT_DB'&&x.database_name==='ox-b92-catalog-control'))fail('isolated D1 binding missing');
if(!cfg.triggers?.crons?.includes('*/5 * * * *'))fail('5-minute canary cron missing');
if(!/export async function fetchTrustedRoster\(/.test(before))fail('expected roster function missing');
const original = `  let r;try{r=await http(url,{headers:{Authorization:\`Bearer \${key}\`,Accept:'application/json'},
    redirect:'error',signal:AbortSignal.timeout(20000)});}catch{e('OX_ROSTER_UNAVAILABLE');}
  if(!r.ok)e('OX_ROSTER_UNAVAILABLE');`;
const replacement = `  let r;try{r=await http(url,{headers:{Authorization:\`Bearer \${key}\`,Accept:'application/json'},
    redirect:'error',signal:AbortSignal.timeout(20000)});}catch{e('OX_ROSTER_FETCH_FAILED');}
  // HTTP status alone is safe to report; never include request headers, secrets, Drive IDs or response bodies.
  if(!r.ok)e(Number.isInteger(r.status)&&r.status>=100&&r.status<=599
    ? 'OX_ROSTER_HTTP_'+r.status : 'OX_ROSTER_HTTP_INVALID');`;
if(before.split(original).length>2)fail('ambiguous roster function');
let next=before;
if(before.includes(original))next=before.replace(original,replacement);
else if(!before.includes(replacement))fail('roster transport differs; refusing overwrite');
if(cfg.compatibility_flags!==undefined&&!Array.isArray(cfg.compatibility_flags))fail('unknown compatibility flags shape');
const flags=cfg.compatibility_flags??[];
if(flags.includes('global_fetch_private_origin'))fail('conflicting fetch routing flag');
const newFlags=flags.includes('global_fetch_strictly_public')?flags:[...flags,'global_fetch_strictly_public'];
const configChanged=newFlags.length!==flags.length;
if(configChanged)cfg.compatibility_flags=newFlags;
const configNext=configChanged?JSON.stringify(cfg,null,2)+'\n':configBefore;
if(next===before&&configNext===configBefore){console.log('B9.2 ROSTER TRANSPORT FIX: already installed; no changes');process.exit(0);}
const backup=path.join(root,'local-player-b9.2','_B92_PLAYER_INTEGRATION_BACKUPS',`roster-transport-${new Date().toISOString().replace(/[:.]/g,'-')}`);
fs.mkdirSync(backup,{recursive:true});
fs.writeFileSync(path.join(backup,'b92-audit-scheduler.js'),before,{flag:'wx'});
fs.writeFileSync(path.join(backup,'wrangler.jsonc'),configBefore,{flag:'wx'});
const write=(file,content)=>{
 const tmp=file+'.b92-roster-fix.tmp';
 fs.writeFileSync(tmp,content,{flag:'wx'});
 try{fs.renameSync(tmp,file);}catch(err){fs.rmSync(tmp,{force:true});throw err;}
};
try{
 if(next!==before)write(scheduler,next);
 if(configNext!==configBefore)write(configPath,configNext);
}catch(err){
  fs.writeFileSync(scheduler,before);
  fs.writeFileSync(configPath,configBefore);
  throw err;
}
console.log('B9.2 ROSTER TRANSPORT REPAIR: PREPARED LOCALLY');
console.log('Worker: listen; Story: a-dragon-s-revenge');
console.log('Added: global_fetch_strictly_public (Cloudflare-supported Worker-to-Worker fetch)');
console.log('Roster failures now identify HTTP status or network failure without leaking credentials');
console.log('Publication: DISABLED; scheduled audit remains READ ONLY');
console.log('Manager, stream handler, payment code, D1 data and secrets: UNCHANGED');
console.log('Backup: '+backup);
console.log('Deployment: NOT PERFORMED');
