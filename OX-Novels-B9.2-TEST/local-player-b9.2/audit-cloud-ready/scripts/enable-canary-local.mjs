/** Only enables local config after operator has manually applied D1 migrations and configured resolver secrets. No network/deployment. */
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const f=path.join(root,'local-player-b5','wrangler.jsonc');
const old=fs.readFileSync(f); const cfg=JSON.parse(old);
if(cfg.name!=='listen'||!cfg.d1_databases?.some(x=>x.binding==='B92_AUDIT_DB')||cfg.vars?.B92_AUDIT_CANARY_STORY!=='a-dragon-s-revenge')throw Error('PRECHECK FAILED: Canary database, resolver or story config missing');
if(cfg.d1_databases?.some(x=>x.binding==='B92_POINTER_DB'))throw Error('Live-pointer binding must not be active in audit canary');
if(cfg.vars.B92_AUDIT_MODE==='readonly'&&cfg.triggers?.crons?.includes('*/5 * * * *')){console.log('CANARY CONFIG ALREADY ENABLED LOCALLY.');process.exit(0);}
if(cfg.vars.B92_AUDIT_MODE!=='off')throw Error('Unexpected audit mode. Refusing');
const existing=cfg.triggers?.crons||[];
if(existing.length)throw Error('Existing cron schedules present. Must not overwrite or add silently.');
cfg.triggers={...(cfg.triggers||{}),crons:['*/5 * * * *']};cfg.vars.B92_AUDIT_MODE='readonly';
const backup=f+'.before-b92-audit-canary';if(!fs.existsSync(backup))fs.writeFileSync(backup,old,{flag:'wx'});
fs.writeFileSync(f,JSON.stringify(cfg,null,2)+'\n');
console.log('ONE-STORY READ-ONLY CANARY CONFIGURED LOCALLY. Deployment still required.');
console.log('Publication: DISABLED; canary story: a-dragon-s-revenge; cron: every 5 minutes');
