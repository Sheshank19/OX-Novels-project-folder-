import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here=path.dirname(fileURLToPath(import.meta.url));
export const checkerRoot=path.resolve(here,'..');
export const oxRoot=path.resolve(checkerRoot,'..');
const resolverConfigPath=path.join(oxRoot,'local-audio-lab','config','resolver.local.json');

function extractFolderId(value){
  const text=String(value||'').trim();
  let m=text.match(/(?:drive\/folders|folders)\/([A-Za-z0-9_-]{10,})/i); if(m)return m[1];
  m=text.match(/[?&]id=([A-Za-z0-9_-]{10,})/i); if(m)return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(text)?text:'';
}
function locateD1(){
  const dir=path.join(oxRoot,'.wrangler','state','v3','d1','miniflare-D1DatabaseObject');
  if(!fs.existsSync(dir)) throw new Error('Local D1 folder not found. Start OX localhost once first.');
  const files=fs.readdirSync(dir).filter(n=>n.endsWith('.sqlite')&&n!=='metadata.sqlite');
  const candidates=[];
  for(const name of files){
    let db;
    try{
      const dbPath=path.join(dir,name); db=new DatabaseSync(dbPath,{readOnly:true});
      if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stories'").get()){db.close();continue;}
      const count=Number(db.prepare('SELECT COUNT(*) n FROM stories').get()?.n||0);
      candidates.push({db,count});
    }catch{try{db?.close()}catch{}}
  }
  if(!candidates.length) throw new Error('Could not locate local D1 stories database.');
  candidates.sort((a,b)=>b.count-a.count); for(const c of candidates.slice(1))try{c.db.close()}catch{}
  return candidates[0].db;
}
export function listStories(){
  const db=locateD1();
  try{return db.prepare('SELECT id,title,drive_url,visible FROM stories ORDER BY title COLLATE NOCASE').all().map(r=>({id:String(r.id||''),title:String(r.title||''),visible:Number(r.visible||0)===1,folderId:extractFolderId(r.drive_url)}));}
  finally{db.close();}
}
export function getStory(id){return listStories().find(s=>s.id===String(id||''));}
export function loadResolverConfig(){
  if(!fs.existsSync(resolverConfigPath)) throw new Error('resolver.local.json not found. Keep your working Audio Lab resolver configuration.');
  const c=JSON.parse(fs.readFileSync(resolverConfigPath,'utf8'));
  const resolverUrl=String(c.resolverUrl||'').trim(),resolverSecret=String(c.resolverSecret||'').trim();
  if(!/^https:\/\/script\.google\.com\//i.test(resolverUrl)||!resolverSecret) throw new Error('Audio resolver is not configured.');
  return {resolverUrl,resolverSecret};
}
export async function testRoot(folderId,cfg){
  if(!folderId) return {ok:false,error:'NO_VALID_FOLDER_ID'};
  try{
    const r=await fetch(cfg.resolverUrl,{method:'POST',redirect:'follow',headers:{'content-type':'application/json'},body:JSON.stringify({secret:cfg.resolverSecret,mode:'list_children',folderId})});
    const text=await r.text(); let p; try{p=JSON.parse(text)}catch{return {ok:false,error:`NON_JSON_RESPONSE_${r.status}`};}
    if(!r.ok||p?.ok!==true) return {ok:false,error:String(p?.error||`Resolver failed (${r.status})`)};
    return {ok:true,name:String(p?.folder?.name||''),folders:Array.isArray(p?.folders)?p.folders.length:0,tracks:Array.isArray(p?.tracks)?p.tracks.length:0};
  }catch(e){return {ok:false,error:String(e?.message||e)};}
}
