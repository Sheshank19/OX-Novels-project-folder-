/** Build an optional SYNTHETIC SQL seed in this folder; contains no secrets or real story data. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {membershipDigest} from '../src/step-j-index-gate.mjs';
import {STORY,SOURCE,CURRENT,PREVIOUS,CURRENT_COUNT,PREVIOUS_COUNT,
 PREVIOUS_GRACE_UNTIL,syntheticToken} from '../src/synthetic-fixture.mjs';
const file=fileURLToPath(new URL('../synthetic-seed.sql',import.meta.url));
const check=process.argv.slice(2).includes('--check-only');
export async function buildSeed(){
 const entries=[];
 for(const [gen,count] of [[PREVIOUS,PREVIOUS_COUNT],[CURRENT,CURRENT_COUNT]]){
  for(let i=0;i<count;i++){
   entries.push(`('${STORY}','${gen}','${SOURCE}','${await membershipDigest(syntheticToken(gen,i))}')`);
  }
 }
 const sql=['-- SYNTHETIC ONLY. Apply ONLY to NEW ox-b92-step-k-index-db. No Drive data, tokens or keys.',
  `INSERT OR IGNORE INTO b92_j_pointers (story_id,revision,current_generation,current_source_version,previous_generation,previous_source_version,grace_until_ms) VALUES ('${STORY}',2,'${CURRENT}','${SOURCE}','${PREVIOUS}','${SOURCE}',${PREVIOUS_GRACE_UNTIL});`];
 for(let i=0;i<entries.length;i+=50){
   sql.push('INSERT OR IGNORE INTO b92_j_members (story_id,generation_id,source_version,token_digest) VALUES\n '+entries.slice(i,i+50).join(',\n ')+';');
 }
 return sql.join('\n')+'\n';
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const sql=await buildSeed();
 if(!check){if(fs.existsSync(file))throw Error('SYNTHETIC_SEED_ALREADY_EXISTS_DO_NOT_OVERWRITE');
   fs.writeFileSync(file,sql,{flag:'wx',mode:0o600});}
 console.log(`SYNTHETIC INDEX ONLY: ${PREVIOUS_COUNT} previous + ${CURRENT_COUNT} current = ${PREVIOUS_COUNT+CURRENT_COUNT} hash rows`);
 console.log(check?'CHECK ONLY — NO SQL FILE WRITTEN':'Synthetic SQL seed created in Step K staging folder; NOT executed remotely.');
}
