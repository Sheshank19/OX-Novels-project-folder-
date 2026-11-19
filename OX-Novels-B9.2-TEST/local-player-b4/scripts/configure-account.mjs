import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const b4Root = path.resolve(here, '..');
const file = path.join(b4Root, '.player-account-id');
const rl = readline.createInterface({ input, output });
const value = String(await rl.question('Paste the Account ID shown in the OX Audio Player Cloudflare account: ')).trim();
rl.close();
if (!/^[a-f0-9]{20,64}$/i.test(value)) { console.error('That does not look like a Cloudflare Account ID. Nothing was saved.'); process.exit(1); }
fs.writeFileSync(file, value, 'utf8');
console.log('Saved locally in local-player-b4/.player-account-id');
console.log('This is not an API token or secret.');
