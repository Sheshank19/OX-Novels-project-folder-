import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(root, 'config', 'resolver.local.json');
let config = { resolverUrl: '', resolverSecret: '', defaultStoryId: 'a-dragon-s-revenge' };
if (existsSync(configPath)) {
  try { config = { ...config, ...JSON.parse(await readFile(configPath, 'utf8')) }; } catch {}
}
if (!config.resolverSecret) config.resolverSecret = randomBytes(32).toString('hex');
await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
console.log('Created/updated: local-audio-lab/config/resolver.local.json');
console.log('');
console.log('1) In the NEW Apps Script project, open Project Settings > Script properties.');
console.log('2) Add property name: OX_AUDIO_RESOLVER_SECRET');
console.log('3) Set its value to the resolverSecret stored in resolver.local.json.');
console.log('4) Deploy the Apps Script as a Web app, then put its /exec URL into resolverUrl in resolver.local.json.');
console.log('');
console.log('Do not send resolver.local.json or its secret to anyone.');
