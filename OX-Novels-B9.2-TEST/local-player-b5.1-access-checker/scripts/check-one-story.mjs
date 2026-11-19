import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { getStory, loadResolverConfig, testRoot } from './common-access.mjs';
const rl=readline.createInterface({input,output});
const id=String(await rl.question('Story ID to check: ')).trim(); rl.close();
const story=getStory(id);
if(!story){console.error('\nStory not found in local D1.');process.exit(1);}
console.log(`\nChecking resolver access: ${story.title} (${story.id})`);
if(!story.folderId){console.error('NO ACCESS: no valid Drive folder ID could be extracted from drive_url.');process.exit(1);}
const r=await testRoot(story.folderId,loadResolverConfig());
if(!r.ok){console.error(`NO ACCESS: ${r.error}`);console.error('\nThe story has a Drive source recorded, but the Audio Resolver account cannot currently read that root folder or the stored ID is invalid.');process.exit(1);}
console.log('ACCESSIBLE ✅');
console.log(`Resolver folder name: ${r.name||'(unnamed)'}`);
console.log(`Immediate child folders: ${r.folders}; immediate tracks: ${r.tracks}`);
console.log(`\nUse this Story ID in SYNC-ONE-STORY.bat: ${story.id}`);
