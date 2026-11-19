import fs from 'node:fs';
import path from 'node:path';
import { b5Root, oxRoot } from './common.mjs';

const wranglerPath = path.join(b5Root, 'wrangler.jsonc');
const b4Root = path.join(oxRoot, 'local-player-b4');
const b6Root = path.join(oxRoot, 'local-player-b6');

function valid(value){ return /^[a-f0-9]{20,64}$/i.test(String(value||'').trim()); }
function read(file){ try { return fs.readFileSync(file,'utf8'); } catch { return ''; } }
function fromFile(file){ const v=read(file).trim(); return valid(v)?v:''; }
function fromWrangler(file){ const m=read(file).match(/"account_id"\s*:\s*"([^"]+)"/); return m&&valid(m[1])?m[1].trim():''; }

const candidates = [
  ['local-player-b5/wrangler.jsonc', fromWrangler(wranglerPath)],
  ['local-player-b4/.player-account-id', fromFile(path.join(b4Root,'.player-account-id'))],
  ['local-player-b5/.player-account-id', fromFile(path.join(b5Root,'.player-account-id'))],
  ['local-player-b6/.player-account-id', fromFile(path.join(b6Root,'.player-account-id'))],
  ['local-player-b4/wrangler.jsonc', fromWrangler(path.join(b4Root,'wrangler.jsonc'))]
];
const found = candidates.find(([,value])=>value);
if(!found){ console.error('ERROR: No OX Audio Player account ID was found. Run local-player-b4\\SET-PLAYER-ACCOUNT-ID.bat first.'); process.exit(1); }
const [source, accountId] = found;
let out=read(wranglerPath);
if(!out){ console.error('ERROR: local-player-b5/wrangler.jsonc is missing.'); process.exit(1); }
if(/"account_id"\s*:/.test(out)) out=out.replace(/"account_id"\s*:\s*"[^"]*"/, `"account_id": "${accountId}"`);
else if(/"name"\s*:\s*"listen"\s*,/.test(out)) out=out.replace(/"name"\s*:\s*"listen"\s*,/, `"name": "listen",\n  "account_id": "${accountId}",`);
else { console.error('ERROR: Could not safely update local-player-b5/wrangler.jsonc.'); process.exit(1); }
fs.writeFileSync(wranglerPath,out,'utf8');
fs.writeFileSync(path.join(b5Root,'.player-account-id'),accountId,'utf8');
console.log(`Player account target ready from ${source}.`);
