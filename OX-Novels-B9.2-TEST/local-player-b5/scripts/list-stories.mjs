import { listStories } from './common.mjs';
const rows=listStories();
const withDrive=rows.filter(s=>s.hasDriveSource);
console.log(`\nLocal stories: ${rows.length}; with Drive source: ${withDrive.length}\n`);
for (const s of withDrive) console.log(`${s.id.padEnd(42)} ${s.visible?'VISIBLE':'HIDDEN '}  ${s.title}`);
console.log('\nUse the story ID in SYNC-ONE-STORY.bat.');
