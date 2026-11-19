import { listStories, loadResolverConfig, testRoot } from './common-access.mjs';
const stories=listStories().filter(s=>s.folderId&&s.id!=='a-dragon-s-revenge');
const cfg=loadResolverConfig();
console.log(`\nSearching for one accessible second story. Candidates: ${stories.length}`);
console.log('This checks only each ROOT folder until the first readable one is found; it does not recursively build a catalog.\n');
let checked=0;
for(const s of stories){
  checked++;
  process.stdout.write(`[${checked}/${stories.length}] ${s.id} ... `);
  const r=await testRoot(s.folderId,cfg);
  if(r.ok){
    console.log('ACCESSIBLE ✅');
    console.log(`\nUse this Story ID in local-player-b5\\SYNC-ONE-STORY.bat:\n\n${s.id}\n`);
    console.log(`Title: ${s.title}`);
    console.log(`Resolver folder: ${r.name||'(unnamed)'}`);
    console.log(`Root children: ${r.folders} folders, ${r.tracks} tracks`);
    process.exit(0);
  }
  console.log(`NO ACCESS — ${r.error}`);
}
process.exit(1);
