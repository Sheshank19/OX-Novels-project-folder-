// OX B9.2 — safe local-only roster diagnostic repair.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const player=path.join(root,'local-player-b5');
const scheduler=path.join(player,'src','b92-audit-scheduler.js');
const configPath=path.join(player,'wrangler.jsonc');
const abort=why=>{throw Error('B92 DIAGNOSTIC BLOCKED: '+why+'; no files deployed');};
function readSafe(file){ const st=fs.lstatSync(file); if(!st.isFile()||st.isSymbolicLink())abort('unsafe source file'); return fs.readFileSync(file,'utf8'); }
const before=readSafe(scheduler), rawCfg=readSafe(configPath);
let cfg;try{cfg=JSON.parse(rawCfg);}catch{abort('Wrangler config is not simple JSON');}
if(cfg.name!=='listen'||cfg.main!=='src/index.js'||cfg.vars?.B92_AUDIT_MODE!=='readonly'||cfg.vars?.B92_AUDIT_CANARY_STORY!=='a-dragon-s-revenge')abort('unexpected worker identity or audit mode');
if(!cfg.triggers?.crons?.includes('*/5 * * * *')||!cfg.d1_databases?.some(x=>x.binding==='B92_AUDIT_DB'&&x.database_name==='ox-b92-catalog-control'))abort('audit binding or trigger missing');
if(!cfg.compatibility_flags?.includes('global_fetch_strictly_public'))abort('prior public fetch flag not present');
const oldPart=`  let r;try{r=await http(url,{headers:{Authorization:\`Bearer \${key}\`,Accept:'application/json'},
    redirect:'error',signal:AbortSignal.timeout(20000)});}catch{e('OX_ROSTER_FETCH_FAILED');}
  // HTTP status alone is safe to report; never include request headers, secrets, Drive IDs or response bodies.
  if(!r.ok)e(Number.isInteger(r.status)&&r.status>=100&&r.status<=599
    ? 'OX_ROSTER_HTTP_'+r.status : 'OX_ROSTER_HTTP_INVALID');`;
const newPart=`  // Never follow an authorization-bearing request to a different destination.
  // manual redirect yields a safe 3xx response and avoids hiding it as a fetch exception.
  const aborter=new AbortController();
  const timer=setTimeout(()=>aborter.abort(),20000);
  let r;
  try{
    r=await http(url,{headers:{Authorization:\`Bearer \${key}\`,Accept:'application/json'},
      redirect:'manual',signal:aborter.signal});
  }catch(error){
    // Redact URLs, Bearer headers and opaque values from Cloudflare log output.
    // Never emit request headers, shared keys, story roots, response bodies, or the env object.
    const name=String(error?.name||'Error').replace(/[^A-Za-z]/g,'').slice(0,32);
    const detail=String(error?.message||'').replace(/https?:\\/\\/[^\\s)]+/gi,'[URL]')
      .replace(/Bearer\\s+\\S+/gi,'Bearer [REDACTED]')
      .replace(/[A-Za-z0-9_-]{22,}/g,'[REDACTED]')
      .replace(/[\\r\\n\\t]/g,' ').slice(0,140);
    const cause=String(error?.cause?.code||'').replace(/[^A-Za-z0-9_]/g,'').slice(0,32);
    console.warn('[B92_ROSTER_FETCH_DIAGNOSTIC]',JSON.stringify({name,detail,cause}));
    e('OX_ROSTER_FETCH_FAILED');
  }finally{clearTimeout(timer);}
  // Failed redirects and HTTP statuses fail closed. Never follow or forward the key.
  if(!r.ok)e(Number.isInteger(r.status)&&r.status>=100&&r.status<=599
    ? 'OX_ROSTER_HTTP_'+r.status : 'OX_ROSTER_HTTP_INVALID');`;
if(before.includes(newPart)){
  console.log('B9.2 ROSTER DIAGNOSTIC: ALREADY INSTALLED; no changes');
  process.exit(0);
}
if(before.split(oldPart).length!==2)abort('live roster fetch block differs; refusing to overwrite other work');
const next=before.replace(oldPart,newPart);
const backup=path.join(root,'local-player-b9.2','_B92_PLAYER_INTEGRATION_BACKUPS',`roster-diagnostic-${new Date().toISOString().replace(/[:.]/g,'-')}`);
fs.mkdirSync(backup,{recursive:true});
fs.writeFileSync(path.join(backup,'b92-audit-scheduler.js'),before,{flag:'wx'});
const temp=scheduler+'.b92-diagnostic.tmp';
fs.writeFileSync(temp,next,{flag:'wx'});
try{fs.renameSync(temp,scheduler);}catch(error){fs.rmSync(temp,{force:true});throw error;}
console.log('B9.2 ROSTER DIAGNOSTIC: INSTALLED LOCALLY');
console.log('Scheduler: read-only; publication: disabled');
console.log('Previous scheduler backup:',backup);
console.log('Existing Player manager, site code, secrets, D1 and stream handler: NOT MODIFIED');
console.log('Cloudflare deployment: NONE');
