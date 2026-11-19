import fs from 'node:fs';import path from 'node:path';
import {catalogFingerprint} from '../../local-player-b6/scripts/common.mjs';
const root=path.resolve(import.meta.dirname,'..','..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'local-player-b5/B5-PUBLISHED-CATALOGS.json'),'utf8'));
const result={};for(const item of manifest.catalogs){const p=path.join(root,'local-audio-lab/cache',item.sourceCatalogFile);if(!fs.existsSync(p))throw Error(`Raw baseline missing: ${item.storyId}`);const raw=JSON.parse(fs.readFileSync(p));if(raw.storyId!==item.storyId||raw.generationId!==item.generationId||raw.sourceVersion!==item.sourceVersion)throw Error(`Baseline mismatch ${item.storyId}`);result[item.storyId]=catalogFingerprint(raw);}
fs.writeFileSync(path.join(root,'local-player-b5/src/b9-baseline-fingerprints.js'),`// B9.2: hashed fingerprints only; no Drive IDs/links or tokens.\nexport const BASELINE_FINGERPRINTS = ${JSON.stringify(result,null,2)};\n`);
console.log('B9.2 baseline fingerprints verified:',Object.keys(result).length);
