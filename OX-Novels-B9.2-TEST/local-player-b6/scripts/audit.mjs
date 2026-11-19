import fs from 'node:fs';import path from 'node:path';
import {currentStories,loadPublishedManifest,reportsDir,cacheDir,safeStoryId} from './common.mjs';
fs.mkdirSync(reportsDir,{recursive:true});
const state=currentStories();const current=state.stories;const published=loadPublishedManifest().catalogs||[];
const byCurrent=new Map(current.map(s=>[s.id,s]));const byPub=new Map(published.map(p=>[String(p.storyId),p]));
const rows=[];
for(const s of current){
  const p=byPub.get(s.id); let status='MISSING_CATALOG';
  if(!s.visible) status='HIDDEN';
  if(!s.hasDriveSource) status='NO_DRIVE_SOURCE';
  if(p){
    if(String(p.sourceVersion)!==s.sourceVersion) status='SOURCE_CHANGED';
    else status='PUBLISHED_CURRENT';
  }
  rows.push({storyId:s.id,title:s.title,visible:s.visible,hasDriveSource:s.hasDriveSource,status,currentSourceVersion:s.sourceVersion,publishedSourceVersion:p?.sourceVersion||'',publishedGeneration:p?.generationId||'',publishedTrackCount:Number(p?.trackCount||0)});
}
for(const p of published){if(!byCurrent.has(String(p.storyId)))rows.push({storyId:String(p.storyId),title:'',visible:false,hasDriveSource:false,status:'ORPHANED_PUBLISHED',currentSourceVersion:'',publishedSourceVersion:String(p.sourceVersion||''),publishedGeneration:String(p.generationId||''),publishedTrackCount:Number(p.trackCount||0)});}
const counts={};for(const r of rows)counts[r.status]=(counts[r.status]||0)+1;
const report={generatedAt:new Date().toISOString(),storySource:state.source,storySourceGeneratedAt:state.generatedAt,currentStories:current.length,publishedCatalogs:published.length,counts,rows};
const out=path.join(reportsDir,'player-catalog-audit.json');fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(`\nPlayer Catalog Audit`);console.log(`Story source: ${state.source}${state.generatedAt?` (${state.generatedAt})`:''}`);console.log(`Current stories: ${current.length}; published catalogs: ${published.length}`);
for(const [k,v] of Object.entries(counts).sort())console.log(`${k.padEnd(22)} ${v}`);
console.log('\nAttention needed:');
for(const r of rows.filter(x=>!['PUBLISHED_CURRENT','HIDDEN'].includes(x.status)).slice(0,100))console.log(`- ${r.status.padEnd(20)} ${r.storyId}${r.title?` — ${r.title}`:''}`);
if(rows.filter(x=>!['PUBLISHED_CURRENT','HIDDEN'].includes(x.status)).length>100)console.log('... more items are in the JSON report.');
console.log(`\nReport: ${out}`);
