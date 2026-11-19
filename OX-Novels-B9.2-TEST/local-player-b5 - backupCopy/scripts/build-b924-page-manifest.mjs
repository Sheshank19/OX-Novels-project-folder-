/* B9.2.4 offline-only repeatable baseline generator: does not contact Drive. */
import fs from 'node:fs';
import path from 'node:path';
import {makeCompactBaseline} from '../src/b924-compact-checkpoints.js';
const root=path.resolve(import.meta.dirname,'../..');
const catalogFile=path.join(root,'local-player-b5/B5-PUBLISHED-CATALOGS.json');
const entries=JSON.parse(fs.readFileSync(catalogFile,'utf8')).catalogs;
if(entries.length!==242)throw Error('Expected 242 frozen baseline stories; abort without writing');
const baseline={};
for(const e of entries){
 const sourceFile=path.join(root,'local-audio-lab/cache',e.sourceCatalogFile);
 const raw=JSON.parse(fs.readFileSync(sourceFile,'utf8'));
 const b=await makeCompactBaseline({storyId:e.storyId,sourceVersion:e.sourceVersion,raw});
 if(b.folderCount!==e.folderCount||b.trackCount!==e.trackCount)throw Error('Baseline mismatch for '+e.storyId);
 baseline[e.storyId]=b;
}
const output=path.join(root,'local-player-b5/src/b924-baseline-page-commitments.js');
fs.writeFileSync(output,'// B9.2.4 offline private commitments only, no raw Drive IDs or links. DO NOT publish as an asset.\nexport const BASELINE_PAGE_COMMITMENTS = '+JSON.stringify(baseline)+';\n');
console.log(`Created ${Object.keys(baseline).length} private story baselines; ${Object.values(baseline).reduce((s,x)=>s+x.pageCount,0)} page digests`);
