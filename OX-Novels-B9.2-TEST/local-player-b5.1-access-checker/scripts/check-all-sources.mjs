import fs from 'node:fs';
import path from 'node:path';
import { checkerRoot, listStories, loadResolverConfig, testRoot } from './common-access.mjs';
const stories=listStories(); const cfg=loadResolverConfig(); const rows=[];
console.log(`\nChecking ${stories.length} story ROOT Drive sources. This makes one resolver metadata request per story with a valid folder ID.\n`);
let n=0;
for(const s of stories){
  n++;
  let result=s.folderId?await testRoot(s.folderId,cfg):{ok:false,error:'NO_VALID_FOLDER_ID'};
  rows.push({storyId:s.id,title:s.title,visible:s.visible,hasFolderId:Boolean(s.folderId),accessible:Boolean(result.ok),resolverFolderName:result.name||'',error:result.ok?'':String(result.error||'UNKNOWN')});
  console.log(`[${n}/${stories.length}] ${result.ok?'ACCESSIBLE':'NO ACCESS '} ${s.id}${result.ok?'':` — ${result.error}`}`);
}
const ok=rows.filter(r=>r.accessible).length,bad=rows.length-ok;
const jsonPath=path.join(checkerRoot,'drive-access-report.json');
const txtPath=path.join(checkerRoot,'drive-access-report.txt');
fs.writeFileSync(jsonPath,JSON.stringify({generatedAt:new Date().toISOString(),total:rows.length,accessible:ok,inaccessible:bad,stories:rows},null,2));
fs.writeFileSync(txtPath,[`Total: ${rows.length}`,`Accessible: ${ok}`,`Inaccessible: ${bad}`,'',...rows.map(r=>`${r.accessible?'ACCESSIBLE':'NO ACCESS '}  ${r.storyId}  ${r.title}${r.error?`  |  ${r.error}`:''}`)].join('\n'));
console.log(`\nDone. Accessible: ${ok}; inaccessible/unreadable: ${bad}`);
console.log(`JSON: ${jsonPath}`); console.log(`Text: ${txtPath}`);
