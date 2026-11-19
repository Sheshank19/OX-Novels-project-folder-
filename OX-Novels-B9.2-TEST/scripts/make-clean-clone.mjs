import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

function crc32(buffer){
  let crc=0xFFFFFFFF;
  for(const byte of buffer){
    crc^=byte;
    for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xEDB88320:0);
  }
  return (crc^0xFFFFFFFF)>>>0;
}
function dosDateTime(date){
  const d=date instanceof Date?date:new Date(date);
  const year=Math.max(1980,d.getFullYear());
  const time=(d.getHours()<<11)|(d.getMinutes()<<5)|Math.floor(d.getSeconds()/2);
  const day=((year-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
  return {time,date:day};
}
function collectFiles(base,current=base,out=[]){
  for(const name of fs.readdirSync(current)){
    const full=path.join(current,name),st=fs.statSync(full);
    if(st.isDirectory())collectFiles(base,full,out);
    else out.push({full,rel:path.relative(base,full).split(path.sep).join('/'),mtime:st.mtime});
  }
  return out;
}
function writeZip(sourceDir,zipFile,rootName){
  const files=collectFiles(sourceDir);
  const locals=[],centrals=[];let offset=0;
  for(const item of files){
    const data=fs.readFileSync(item.full);
    const compressed=zlib.deflateRawSync(data,{level:9});
    const method=8,crc=crc32(data),nameBuf=Buffer.from(`${rootName}/${item.rel}`,'utf8'),dt=dosDateTime(item.mtime);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);local.writeUInt16LE(method,8);
    local.writeUInt16LE(dt.time,10);local.writeUInt16LE(dt.date,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBuf.length,26);local.writeUInt16LE(0,28);
    locals.push(local,nameBuf,compressed);
    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x0800,8);central.writeUInt16LE(method,10);
    central.writeUInt16LE(dt.time,12);central.writeUInt16LE(dt.date,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(nameBuf.length,28);central.writeUInt16LE(0,30);central.writeUInt16LE(0,32);central.writeUInt16LE(0,34);central.writeUInt16LE(0,36);central.writeUInt32LE(0,38);central.writeUInt32LE(offset,42);
    centrals.push(central,nameBuf);
    offset+=local.length+nameBuf.length+compressed.length;
  }
  const centralSize=centrals.reduce((n,b)=>n+b.length,0),centralOffset=offset;
  const eocd=Buffer.alloc(22);eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(0,4);eocd.writeUInt16LE(0,6);eocd.writeUInt16LE(files.length,8);eocd.writeUInt16LE(files.length,10);eocd.writeUInt32LE(centralSize,12);eocd.writeUInt32LE(centralOffset,16);eocd.writeUInt16LE(0,20);
  fs.writeFileSync(zipFile,Buffer.concat([...locals,...centrals,eocd]));
}


const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const stamp = new Date().toISOString().replace(/[-:]/g,'').replace(/\..+/, '').replace('T','-');
const stageParent = path.join(root, '_clean_clone_build');
const stageName = 'OX-Novels-Clean-Copy';
const stage = path.join(stageParent, stageName);
const zipPath = path.join(root, `OX-Novels-CLEAN-CLONE-${stamp}.zip`);

const includeDirs = ['src','public','migrations','apps-script','scripts'];
const includeFiles = [
  'package.json','package-lock.json','wrangler.jsonc','.gitignore','.dev.vars.example',
  'INIT-LOCAL-BACKEND.bat','INSTALL-ONLY.bat','START-OX-NOVELS.bat','OPEN-ADMIN.bat',
  'SETUP-GOOGLE-DRIVE.bat','TEST-GOOGLE-DRIVE-SCAN.bat','SETUP-STORY-CHECKER.bat',
  'BACKEND-SETUP-FIRST.txt','CLONE-ARCHITECTURE.txt','MAKE-CLEAN-CLONE.bat'
];

const excludedNames = new Set([
  '.dev.vars','.wrangler','node_modules','_clean_clone_build','DRIVE-SCAN-RESULT.json','DRIVE-SCAN-TEST-URL.txt',
  'payment_schema_test.sqlite','AGENTS.md'
]);
const excludedExtensions = new Set(['.sqlite','.sqlite3','.db','.log','.zip']);

function copyTree(src,dst){
  const st=fs.statSync(src);
  if(st.isDirectory()){
    fs.mkdirSync(dst,{recursive:true});
    for(const name of fs.readdirSync(src)){
      if(excludedNames.has(name))continue;
      const source=path.join(src,name),target=path.join(dst,name);
      const ext=path.extname(name).toLowerCase();
      if(excludedExtensions.has(ext))continue;
      copyTree(source,target);
    }
  }else{
    fs.mkdirSync(path.dirname(dst),{recursive:true});
    fs.copyFileSync(src,dst);
  }
}

fs.rmSync(stageParent,{recursive:true,force:true});
fs.mkdirSync(stage,{recursive:true});
for(const dir of includeDirs){const src=path.join(root,dir);if(fs.existsSync(src))copyTree(src,path.join(stage,dir));}
for(const file of includeFiles){const src=path.join(root,file);if(fs.existsSync(src))copyTree(src,path.join(stage,file));}

// The source project may contain old demonstration cover SVGs. A clean clone
// starts with zero stories, so remove those branded demo assets too.
fs.rmSync(path.join(stage,'public','covers'),{recursive:true,force:true});
const cloneStoryLinks=path.join(stage,'src','story-links.js');
if(fs.existsSync(cloneStoryLinks))fs.writeFileSync(cloneStoryLinks,'export const CODE_STORIES = [];\n');

// Fresh clones start with an empty story library and no membership tiers. The
// schema/default appearance remain, and the new owner configures their own data
// from Admin without editing code.
const initialMigration=path.join(stage,'migrations','0001_initial.sql');
if(fs.existsSync(initialMigration)){
  let sql=fs.readFileSync(initialMigration,'utf8');
  sql=sql.replace(/\nINSERT OR IGNORE INTO stories[\s\S]*?;\n\nINSERT OR IGNORE INTO membership_tiers[\s\S]*?;\s*$/m,'\n-- Clean clone: no seeded stories or membership tiers. Add them from Admin.\n');
  sql=sql.replace(/\('appearance',\s*'[^']*(?:''[^']*)*'\)/, `('appearance', '{"name":"","handle":"","description":"","accent":"#13c3b3","layout":"Integrated banner"}')`);
  sql=sql.replace(/\('settings',\s*'[^']*(?:''[^']*)*'\)/, `('settings', '{"language":"English","timezone":"UTC","currency":"USD — US Dollar","supportEmail":"","supportLabel":"Support","showSearch":true,"showChat":true,"showSupport":true,"preventSelection":true}')`);
  fs.writeFileSync(initialMigration,sql);
}

// Never carry a real local secret file into a clone. The example stays only as
// a template and INIT-LOCAL-BACKEND.bat asks the new owner for their password.
fs.rmSync(path.join(stage,'.dev.vars'),{force:true});
fs.rmSync(path.join(stage,'.wrangler'),{recursive:true,force:true});

// A clean clone must never point at the source owner's production D1 or public
// preview routing. Replace the database UUID with an obvious setup placeholder
// and keep public Worker routes disabled until the new owner configures them.
const cloneWrangler=path.join(stage,'wrangler.jsonc');
if(fs.existsSync(cloneWrangler)){
  let text=fs.readFileSync(cloneWrangler,'utf8');
  text=text.replace(/"name"\s*:\s*"[^"]+"/, '"name": "story-site"');
  text=text.replace(/"database_name"\s*:\s*"[^"]+"/, '"database_name": "story-site-db"');
  text=text.replace(/"database_id"\s*:\s*"[^"]+"/, '"database_id": "00000000-0000-0000-0000-000000000000"');
  text=text.replace(/"workers_dev"\s*:\s*true/g, '"workers_dev": false');
  text=text.replace(/"preview_urls"\s*:\s*true/g, '"preview_urls": false');
  text=text.replace(/,?\s*"remote"\s*:\s*true/g, '');
  fs.writeFileSync(cloneWrangler,text);
}

const setup=`NEW INDEPENDENT STORY SITE COPY
================================

This package contains the finished site engine only.
It intentionally contains NO users, chats, payments, local D1 data, login sessions, owner branding or owner secrets.

FIRST LOCAL START
1. Extract this folder.
2. Double-click INIT-LOCAL-BACKEND.bat.
3. Choose this copy's own Admin password when asked.
4. Open http://localhost:8787/admin.html
5. Configure Appearance first: site name, handle, description, logo, profile and banner.
6. In Site Settings, add this owner's optional Contact / support email and public Support label.
7. Add this owner's stories and membership tiers from Admin.

GOOGLE MEMBER SIGN-IN
- Create this copy's own Google OAuth 2.0 Web Client ID.
- Add http://localhost:8787 while testing and the final HTTPS domain later as Authorized JavaScript origins.
- In Admin > Integrations > Google Sign-In, paste only that copy's Web Client ID.
- Member sign-up/login is Google-only; no member passwords are stored for normal sign-in.

GOOGLE DRIVE / APPS SCRIPT
- Run SETUP-GOOGLE-DRIVE.bat and use this owner's own Drive/Apps Script configuration.

PAYPAL
- Use this owner's own PayPal REST app, Client ID, Client Secret, Plan IDs, webhook and Support target.
- Never copy another owner's .dev.vars or PayPal secret.

CLOUDFLARE / LIVE DEPLOYMENT
- Create a separate Cloudflare account/project and D1 database for this copy.
- Replace 00000000-0000-0000-0000-000000000000 in wrangler.jsonc with that new database UUID before remote deployment.
- Apply migrations to that copy's own D1, add its own Worker secrets, and connect its own domain.

SEPARATION RULE
Each clone is independent. Do not share D1, users, Google OAuth Client IDs, PayPal credentials, Drive roots, Admin passwords or domains between copies.
`;
fs.writeFileSync(path.join(stage,'NEW-COPY-SETUP.txt'),setup);

fs.rmSync(zipPath,{force:true});
writeZip(stage,zipPath,stageName);
if(!fs.existsSync(zipPath))throw new Error("ZIP file was not created.");
console.log(`\nClean clone ZIP created:\n${zipPath}`);
console.log('\nPrivate/local files excluded: .dev.vars, .wrangler, node_modules, local databases, logs, test results and existing ZIPs.');
