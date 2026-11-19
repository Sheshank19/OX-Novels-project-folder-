/**
 * OX B9.2: No-network, no-secret, read-only readiness for existing listen Worker.
 * This does not deploy anything, write to the project, or touch private folders.
 */
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const fail = message => { console.error('STOP:',message); process.exitCode=1; };
const root=process.argv[2]||'C:\\Users\\dundi\\OX-Novels-B9.2-TEST';
const player=join(root,'local-player-b5');
const code=join(player,'src');
const required = [
 ['wrangler.jsonc','bfe393c96dbe20fb14cc2a7b02b3c3978325ffa8804bd703fc23d3a0d3943e63'],
 ['src/b92-audit-scheduler.js','bfbea99d28f5b7a3b71dece7f7507ee53230b4f3fa9054e08ce5b4b23e107f2b'],
 ['src/b92-generation-adapter.js','8e4d7914199fcc63401fc0a841fe4fdffdfea2a9fcd5ca7d92878a049269858c'],
 ['src/b9-catalog-manager.js','57c38b3052be78b3351b1fb61209efb6b2b6070a51015ebfc0a38c934205dce0'],
 ['src/index.js','9b3ac6911dcf9321991f3c936693b691fcc92ce1493f34a4bc187da8da8a5c33']
];
let ok=true;
for(const [rel, expected] of required){
 const file=join(player,rel);
 if(!existsSync(file)){fail('Missing expected file: '+rel);ok=false;continue;}
 const actual=createHash('sha256').update(readFileSync(file)).digest('hex');
 if(actual!==expected){fail('Source changed since inspected snapshot: '+rel);ok=false;}
}
if(!ok)process.exit(1);
let cfg;
try{cfg=JSON.parse(readFileSync(join(player,'wrangler.jsonc'),'utf8'))}catch{fail('Expected Wrangler JSON config missing/invalid');process.exit(1)}
if(cfg.name!=='listen'||cfg.vars?.B92_AUDIT_MODE!=='readonly'||
 cfg.vars?.B92_AUDIT_CANARY_STORY!=='a-dragon-s-revenge'||
 JSON.stringify(cfg.triggers?.crons)!=='["*/5 * * * *"]'||
 cfg.d1_databases?.length!==1||cfg.d1_databases[0].binding!=='B92_AUDIT_DB'){
 fail('Unexpected Worker/cron/audit bindings: no modifications recommended');process.exit(1);
}
const src=readFileSync(join(code,'index.js'),'utf8');
const meta=[...src.matchAll(/"folderCount":(\d+),"trackCount":(\d+)/g)]
 .map(m=>({folders:Number(m[1]),tracks:Number(m[2])}));
if(meta.length!==242||meta.reduce((s,x)=>s+x.tracks,0)!==154699){
 fail('Static catalog count changed; manual review needed');process.exit(1);
}
const folders=meta.reduce((s,x)=>s+x.folders,0);
const floor=meta.reduce((s,x)=>s+Math.max(1,Math.ceil(x.tracks/40)),0);
const ticks=24*60/5;const capacity=ticks*5;
console.log('PASS: verified installed Player source and preserved B9 manager.');
console.log('PASS: existing separate Player account and B92_AUDIT_DB binding detected.');
console.log('PASS: readonly cron set to every five minutes; 242 stories from static index.');
console.log(`Inventory: stories=242, folders=${folders}, tracks=154699.`);
console.log(`Optimistic metadata-page floor: ${floor} pages (40 audio entries/page).`);
console.log(`Maximum logical pages/day at unchanged 5-minute cron: ${capacity}.`);
console.log(`Optimistic lower-bound duration: ${(floor/capacity).toFixed(2)} days; actual longer.`);
console.log('No Worker code, project file, Cloudflare resource or secret was modified.');
console.log('For FULL ROSTER (separate Player account only), REMOVE the B92_AUDIT_CANARY_STORY variable in Cloudflare Dashboard.');
console.log('Keep B92_AUDIT_MODE=readonly; keep existing cron; publication remains disabled.');
console.log('Do NOT deploy an older local Player build. Restore the canary variable to revert audit scope.');
