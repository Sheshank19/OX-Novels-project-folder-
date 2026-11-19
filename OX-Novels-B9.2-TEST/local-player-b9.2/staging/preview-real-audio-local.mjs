/**
 * OX B9.2 — Loopback-only real Drive audio playback preview.
 * Uses the current B5/B6.5 Worker audio stream implementation with an
 * authenticated, in-memory test Player session. Candidate stays local.
 * There are no Cloudflare / Apps Script / catalog-publication calls.
 * This is NOT a test of production Cloudflare runtime CPU or full handoff.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { boundedRange, sampleCandidates,MAX_TOTAL_BYTES,MAX_STREAM_REQUESTS,MAX_CHUNK_BYTES } from './preview-utils.mjs';
import { assertProtectedCatalog, assertPlayerKeyMatchesStatic, decryptToken } from './catalog-compat.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..','..');
const B5=path.join(ROOT,'local-player-b5');
const DIR=path.join(HERE,'_PRIVATE_PREPARED_DO_NOT_DEPLOY');
const KEY_FILE=path.join(ROOT,'local-player-handoff','.env.player-handoff');
const TEMPLATE=path.join(B5,'src','worker-B5-template.js');
const allowed=new Set(['127.0.0.1']);
const say=(key,v)=>console.log(String(key).padEnd(32)+': '+String(v));
const fail=(c)=>{throw Object.assign(new Error(c),{safeCode:c})};
const requireTrue=(x,c)=>{if(!x)fail(c)};
const sha=(p)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
let stage='SETUP';
const setStage=s=>{stage=s};

function prepare(){
  setStage('CANDIDATE_AND_KEY');
  requireTrue(fs.existsSync(DIR),'PRIVATE_CANDIDATE_MISSING');
  requireTrue(fs.existsSync(KEY_FILE),'PLAYER_KEY_MISSING');
  const files=fs.readdirSync(DIR).filter(n=>/^prepared-[a-z0-9-]+\.PREPARED-DO-NOT-DEPLOY\.json$/i.test(n))
    .map(n=>({n,p:path.join(DIR,n)})).sort((a,b)=>fs.statSync(b.p).mtimeMs-fs.statSync(a.p).mtimeMs);
  requireTrue(files.length,'PRIVATE_CANDIDATE_MISSING');
  const candidate=JSON.parse(fs.readFileSync(files[0].p,'utf8'));
  requireTrue(candidate?.version===1&&/^[a-z0-9._-]+$/i.test(candidate.storyId||''),'CANDIDATE_INVALID');
  const secret=fs.readFileSync(KEY_FILE,'utf8').trim();
  const key=Buffer.from(secret,'base64url');
  requireTrue(key.length===32,'PLAYER_KEY_INVALID');
  const pub=path.join(B5,'public','catalogs',candidate.storyId+'.json');
  requireTrue(fs.existsSync(pub),'ORIGINAL_STATIC_CATALOG_MISSING');
  const originalHash=sha(pub);
  const published=JSON.parse(fs.readFileSync(pub,'utf8'));
  assertPlayerKeyMatchesStatic(published,key,{id:candidate.storyId,sourceVersion:candidate.sourceVersion});
  requireTrue(assertProtectedCatalog(candidate,key,{id:candidate.storyId,sourceVersion:candidate.sourceVersion})===candidate.trackCount,'CANDIDATE_TOKEN_INVALID');
  requireTrue(candidate.trackCount===534&&candidate.folderCount===7,'TEST_STORY_BASELINE_MISMATCH');
  const selected=sampleCandidates(candidate,3);
  requireTrue(selected.length>0,'PLAYABLE_SAMPLE_MISSING');
  for(const t of selected){
    const p=decryptToken(t.key,key);
    requireTrue(p.storyId===candidate.storyId&&p.sourceVersion===candidate.sourceVersion&&p.generationId===candidate.generationId,'SAMPLE_TOKEN_INVALID');
  }
  return {candidate,selected,secret,pub,originalHash};
}

async function sessionCookieFor(secret,storyId){
  const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(secret,'base64url'),iv);
  cipher.setAAD(Buffer.from('OX_PLAYER_SESSION_V1','utf8'));
  const now=Math.floor(Date.now()/1000);
  const obj={v:1,kind:'player-session',iss:'ox-player',aud:'ox-player',storyId,
    storyTitle:'Local OX B9.2 preview',iat:now,exp:now+20*60};
  const packed=Buffer.concat([cipher.update(JSON.stringify(obj)),cipher.final(),cipher.getAuthTag()]);
  return '__Host-ox_player='+encodeURIComponent('v1.'+iv.toString('base64url')+'.'+packed.toString('base64url'));
}

async function loadWorker(candidate){
  setStage('ISOLATED_PLAYER_IMPORT');
  requireTrue(fs.existsSync(TEMPLATE),'PLAYER_TEMPLATE_MISSING');
  let source=fs.readFileSync(TEMPLATE,'utf8');
  const marker='/*__OX_B5_CATALOG_INDEX__*/';
  requireTrue(source.includes(marker),'PLAYER_TEMPLATE_MARKER_MISSING');
  const entry={storyId:candidate.storyId,sourceVersion:candidate.sourceVersion,
    generationId:candidate.generationId,folderCount:candidate.folderCount,trackCount:candidate.trackCount,
    catalogPath:'/catalogs/'+candidate.storyId+'.json?v='+encodeURIComponent(candidate.generationId)};
  source=source.replace(marker,`const CATALOG_INDEX = ${JSON.stringify({[candidate.storyId]:entry})};`);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ox-b92-live-preview-'));
  try{
    for(const n of ['b9-catalog-manager.js','b9-baseline-fingerprints.js']){
      const original=path.join(B5,'src',n);
      requireTrue(fs.existsSync(original),'PLAYER_MODULE_MISSING');
      fs.copyFileSync(original,path.join(temp,n));
    }
    fs.writeFileSync(path.join(temp,'package.json'),' {"type":"module"}\n',{mode:0o600});
    const main=path.join(temp,'isolated-player.mjs');
    fs.writeFileSync(main,source,{mode:0o600});
    const mod=await import(pathToFileURL(main).href);
    requireTrue(typeof mod?.default?.fetch==='function','PLAYER_IMPORT_FAILED');
    return mod.default;
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
}

function pageHtml(access,samples){
  const options=samples.map((s,i)=>`<button type="button" data-index="${i}">Sample ${i+1} (${s.format})</button>`).join(' ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OX B9.2 Local Audio Preview</title><style>body{font:16px system-ui,sans-serif;max-width:740px;margin:50px auto;padding:0 20px;line-height:1.6;background:#0e1320;color:#eee}button{padding:10px;margin:4px;background:#35465d;border:1px solid #788fa5;border-radius:8px;color:#fff;cursor:pointer}audio{display:block;width:100%;margin-top:20px}small{color:#bbc7d6}</style></head>
<body><h1>OX B9.2 — local audio preview</h1><p>Choose an episode sample, then press Play. These are <strong>real Google Drive audio bytes</strong> streamed through the existing B6.5 handler. This preview does not publish a catalog or deploy a Worker.</p>
<div id="choices">${options}</div><audio id="a" controls preload="none"></audio><p id="status" role="status">Choose a sample.</p><small>Loopback-only; short bounded audio excerpts. MP3 preferred. Close the BAT window to stop. Cloudflare Free limits are not verified here.</small>
<script>const a=document.getElementById('a'),s=document.getElementById('status');const names=${JSON.stringify(samples.map(x=>x.id))};const access=${JSON.stringify(access)};document.querySelectorAll('[data-index]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.index);a.pause();a.src='/preview/'+names[i]+'?access='+encodeURIComponent(access);a.load();s.textContent='Sample '+(i+1)+' selected; click Play.';});a.addEventListener('playing',()=>s.textContent='Real audio playback started.');a.addEventListener('error',()=>{const c=Number(a.error?.code||0);const d={1:'interrupted',2:'network error',3:'audio decode error',4:'source unsupported or blocked'}[c]||'unknown';s.textContent='Sample could not play (browser media code '+c+': '+d+'). Check BAT console for safe diagnostic. This does not prove the audio file is damaged.';});</script></body></html>`;
}
function safeHeaders(){return {'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src 'self'; base-uri 'none'; frame-ancestors 'none'"};}
function shortResponse(res,status,code){res.writeHead(status,{...safeHeaders(),'content-type':'text/plain; charset=utf-8'});res.end(code);}

async function main(){
  say('Mode','LOCALHOST / REAL DRIVE RANGE PREVIEW');
  say('Cloudflare / Apps Script requests','NONE');
  say('Google Drive audio reads','YES, small range requests only');
  say('Production / catalog changes','NONE');
  const {candidate,selected,secret,pub,originalHash}=prepare();
  const worker=await loadWorker(candidate);
  const env={OX_HANDOFF_KEY:secret};
  const cookie=await sessionCookieFor(secret,candidate.storyId);
  const access=crypto.randomBytes(24).toString('hex');
  const samples=selected.map((t,i)=>({id:crypto.randomBytes(12).toString('hex'),key:t.key,format:/\.mp3$/i.test(t.name||'')?'MP3':'M4A'}));
  const lookup=new Map(samples.map(s=>[s.id,s]));
  let hits=0, totalBytes=0, port=0;
  const server=http.createServer(async (req,res)=>{
    try{
      const expectedHost=`127.0.0.1:${port}`;
      if(!allowed.has(req.socket.localAddress)||req.headers.host!==expectedHost)return shortResponse(res,403,'LOCALHOST_ONLY');
      const site=String(req.headers['sec-fetch-site']||'');
      if(site==='cross-site')return shortResponse(res,403,'CROSS_SITE_DENIED');
      const u=new URL(req.url||'/','http://'+expectedHost);
      if(!['GET','HEAD'].includes(req.method||''))return shortResponse(res,405,'READ_ONLY');
      if(u.searchParams.get('access')!==access)return shortResponse(res,403,'LOCAL_ACCESS_REQUIRED');
      if(u.pathname==='/'){
        const html=pageHtml(access,samples);
        res.writeHead(200,{...safeHeaders(),'content-type':'text/html; charset=utf-8'});
        return res.end(html);
      }
      const match=/^\/preview\/([a-f0-9]{24})$/.exec(u.pathname);
      if(!match || !lookup.has(match[1]))return shortResponse(res,404,'NOT_FOUND');
      const sample=lookup.get(match[1]);
      if(hits>=MAX_STREAM_REQUESTS||totalBytes>=MAX_TOTAL_BYTES){
        say('Preview rejection',sample.format+' / REQUEST_OR_TRANSFER_BUDGET_EXHAUSTED');
        return shortResponse(res,429,'PREVIEW_BUDGET_EXHAUSTED');
      }
      let range;
      try{range=boundedRange(req.headers.range||'')}catch(err){
        const code=err?.message==='RANGE_OUTSIDE_PREVIEW'?'RANGE_START_ABOVE_8_MIB':'UNSUPPORTED_BROWSER_RANGE';
        say('Preview rejection',sample.format+' / '+code);
        return shortResponse(res,416,'PREVIEW_RANGE_NOT_ALLOWED');
      }
      hits++;
      say('Preview request',sample.format+' / ACCEPTED_BOUNDED_RANGE');
      const playerUrl='https://isolated-player.invalid/api/audio/stream?track='+encodeURIComponent(sample.key);
      const playerReq=new Request(playerUrl,{method:req.method,headers:{cookie,range}});
      const result=await worker.fetch(playerReq,env);
      if(result.status!==206){
        say('Real audio request',`FAILED / ${sample.format} / Player HTTP ${result.status} / reason ${String(result.headers.get('x-ox-drive-reason')||'unavailable').slice(0,60)}`);
        try{await result.body?.cancel()}catch{}
        return shortResponse(res,502,'DRIVE_SAMPLE_UNAVAILABLE');
      }
      const lengthHeader=result.headers.get('content-length');
      const cr=String(result.headers.get('content-range')||'');
      const crMatch=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(cr);
      const derived=crMatch ? Number(crMatch[2])-Number(crMatch[1])+1 : 0;
      const length=lengthHeader===null ? derived : Number(lengthHeader);
      if(!crMatch||!Number.isSafeInteger(derived)||derived<1||derived>MAX_CHUNK_BYTES||
         !Number.isSafeInteger(length)||length!==derived){
        say('Preview rejection',sample.format+' / UPSTREAM_RANGE_INVALID_OR_TOO_LARGE');
        try{await result.body?.cancel()}catch{}
        return shortResponse(res,502,'UNEXPECTED_AUDIO_RANGE');
      }
      if(totalBytes+length>MAX_TOTAL_BYTES){
        say('Preview rejection',sample.format+' / TRANSFER_BUDGET_EXHAUSTED');
        try{await result.body?.cancel()}catch{};
        return shortResponse(res,429,'PREVIEW_BYTES_EXHAUSTED');
      }
      totalBytes+=length; // reserve the budget before streaming; concurrent requests cannot bypass it
      res.writeHead(206,{...safeHeaders(), 'content-type':result.headers.get('content-type')||'audio/mpeg',
        'content-range':cr,'content-length':String(length),'accept-ranges':'bytes'});
      let sent=0;
      try{
        for await(const chunk of result.body){
          const buf=Buffer.from(chunk); sent+=buf.length;
          if(sent>length||totalBytes+sent>MAX_TOTAL_BYTES)throw new Error('STREAM_BUDGET');
          if(!res.write(buf))await once(res,'drain');
        }
        res.end();
        say('Real audio request',`HTTP 206 / ${sent} bytes / ${sample.format}`);
      }catch{
        res.destroy(); say('Real audio request','FAILED / '+sample.format+' / interrupted stream');
      }
    }catch{
      if(!res.headersSent)shortResponse(res,502,'LOCAL_PREVIEW_STREAM_ERROR');
      else res.destroy();
      say('Real audio request','FAILED / local handler error');
    }
  });
  server.on('error',()=>{say('CHECK STATUS','LOCAL_PORT_UNAVAILABLE');process.exitCode=1;});
  server.listen(0,'127.0.0.1',()=>{
    port=server.address().port;
    const local=`http://127.0.0.1:${port}/?access=${access}`;
    say('Protected candidate',`${candidate.folderCount} folders / ${candidate.trackCount} tracks`);
    say('Isolated playback options',samples.length);
    say('Server binding','127.0.0.1 only');
    say('One-request range cap','1 MiB');
    say('Entire preview transfer cap','24 MiB');
    say('Candidate + static catalog','READ-ONLY / NOT DEPLOYED');
    say('CHECK STATUS','LOCAL REAL AUDIO PREVIEW READY — CLICK PLAY');
    console.log('\nOpen this LOCAL URL in your browser:\n'+local+'\n');
    if(process.platform==='win32' && process.env.B92_NO_BROWSER!=='1'){
      try{const p=spawn('cmd.exe',['/c','start','',local],{stdio:'ignore',windowsHide:true,detached:true});p.unref();}catch{}
    }
  });
  const exit=()=>{try{server.close()}catch{};if(sha(pub)!==originalHash)say('Static catalog integrity','CHANGED — STOP');else say('Static catalog integrity','UNCHANGED');};
  process.once('SIGINT',exit);process.once('SIGTERM',exit);
}
main().catch(err=>{
  say('CHECK STATUS','LOCAL PREVIEW INCOMPLETE — NO DEPLOYMENT');
  const allowed=new Set(['PRIVATE_CANDIDATE_MISSING','PLAYER_KEY_MISSING','CANDIDATE_INVALID','PLAYER_KEY_INVALID','ORIGINAL_STATIC_CATALOG_MISSING','CANDIDATE_TOKEN_INVALID','TEST_STORY_BASELINE_MISMATCH','PLAYABLE_SAMPLE_MISSING','SAMPLE_TOKEN_INVALID','PLAYER_TEMPLATE_MISSING','PLAYER_TEMPLATE_MARKER_MISSING','PLAYER_MODULE_MISSING','PLAYER_IMPORT_FAILED']);
  say('Failed verification stage',stage);
  say('Reason',allowed.has(err?.safeCode)?err.safeCode:'LOCAL_PREVIEW_SETUP_FAILED');
  say('Private details','REDACTED');
  process.exitCode=1;
});
