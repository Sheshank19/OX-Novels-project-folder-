import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const input=process.argv[2];
if (!input) {console.error('Usage: node VERIFY-ORIGINAL-SOURCE.mjs <full-path-to-current-main-worker.mjs>');process.exit(2);}
const data=readFileSync(input);
const got=createHash('sha256').update(data).digest('hex');
const expected=createHash('sha256').update(readFileSync(new URL('./ORIGINAL-READONLY-NOV1.mjs',import.meta.url))).digest('hex');
if(got!==expected) {console.error('STOP: this Worker differs from the reviewed November 1 baseline. Do not deploy the staged candidate.'); console.error('Export prefix:',got.slice(0,16),'Reviewed prefix:',expected.slice(0,16));process.exit(1);}
console.log('PASS: source matches reviewed November 1 production export. No files modified.');
