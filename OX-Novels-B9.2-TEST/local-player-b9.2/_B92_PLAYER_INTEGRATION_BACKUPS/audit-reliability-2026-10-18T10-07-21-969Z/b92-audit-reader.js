/** Restricted read-only Google Apps Script page transport. No Drive/KV/D1 writes. */
const DRIVE=/^[A-Za-z0-9_-]{10,}$/;
const STORY=/^[a-z0-9][a-z0-9._-]{0,159}$/;
const VERSION='ox-stage-multiroot-v2';
const retryHttp=new Set([408,429,500,502,503,504]);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const err=code=>{throw Object.assign(new Error(code),{code});};
export function safeResolverUrl(raw){
  let url;try{url=new URL(raw);}catch{err('INVALID_RESOLVER_URL');}
  if(url.protocol!=='https:'||url.hostname!=='script.google.com'||
    !/^\/macros\/s\/[^/]+\/exec\/?$/.test(url.pathname)||url.search||url.hash)err('INVALID_RESOLVER_URL');
  return url.href;
}
export function assertPage(page,{storyId,rootId,folderId,pageNo}){
  if(!STORY.test(storyId)||!DRIVE.test(rootId)||!DRIVE.test(folderId)||
     !Number.isSafeInteger(pageNo)||pageNo<0||pageNo>79)err('INVALID_PAGE_SCOPE');
  if(!page||page.ok!==true||page.version!==VERSION||page.storyId!==storyId||
    page.storyRootId!==rootId||page.folderId!==folderId||page.pageNo!==pageNo||
    page.readOnly!==true||page.pinnedSnapshot!==false||page.stableSnapshot!==false||
    page.publishAllowed!==false||typeof page.complete!=='boolean'||
    page.hasMore!==!page.complete||!Array.isArray(page.folders)||!Array.isArray(page.tracks)||
    page.folders.length>20||page.tracks.length>40||
    (page.complete?page.nextCursor!==null:typeof page.nextCursor!=='string'||!page.nextCursor||page.nextCursor.length>30000))
    err('INVALID_RESOLVER_PAGE');
  const seen=new Set();
  for(const f of page.folders){
    if(!f||f.type!=='folder'||!DRIVE.test(f.id||'')||!f.name||seen.has(f.id))err('INVALID_FOLDER_ENTRY');
    seen.add(f.id);
  }
  for(const t of page.tracks){
    if(!t||t.type!=='track'||!DRIVE.test(t.id||'')||!t.name||
       !Number.isSafeInteger(t.size)||t.size<0||!Number.isFinite(Date.parse(t.modifiedAt))||
       typeof t.mimeType!=='string'||seen.has(t.id))err('INVALID_TRACK_ENTRY');
    seen.add(t.id);
  }
  return page;
}
export async function fetchDrivePage(env, scope, {http=fetch,delay=pause}={}){
  const endpoint=safeResolverUrl(env.B92_AUDIT_RESOLVER_URL);
  const secret=String(env.B92_AUDIT_RESOLVER_SECRET||'');
  if(secret.length<32)err('RESOLVER_SECRET_MISSING');
  const {storyId,rootId,folderId,pageNo,cursor=''}=scope;
  if(pageNo===0&&cursor||pageNo>0&&!cursor)err('CURSOR_SEQUENCE_INVALID');
  for(let attempt=1;attempt<=3;attempt++){
    const nonce=[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');
    let r;
    try {
      r=await http(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({mode:'list_children_page',storyId,storyRootId:rootId,folderId,pageNo,
          ...(cursor?{cursor}:{}),requestNonce:nonce,secret}),redirect:'follow',
        signal:AbortSignal.timeout(45000)});
    }catch{if(attempt<3){await delay(1200*attempt);continue;}err('RESOLVER_TRANSPORT_FAILED');}
    let host;try{host=new URL(r.url).hostname;}catch{err('UNTRUSTED_RESOLVER_HOST');}
    if(host!=='script.google.com'&&host!=='script.googleusercontent.com')err('UNTRUSTED_RESOLVER_HOST');
    if(r.status!==200){
      if(attempt<3&&(retryHttp.has(r.status)||(r.status===404&&host==='script.googleusercontent.com'&&r.redirected))){await delay(1800*attempt);continue;}
      err('RESOLVER_HTTP_FAILED');
    }
    let s;try{s=await r.text();}catch{err('RESOLVER_BODY_FAILED');}
    if(s.length>2_000_000)err('RESOLVER_BODY_TOO_LARGE');
    let body;try{body=JSON.parse(s);}catch{err('RESOLVER_INVALID_JSON');}
    if(body?.requestNonce!==nonce){
      if(attempt<3){await delay(1200*attempt);continue;}
      err('RESOLVER_NONCE_MISMATCH');
    }
    return assertPage(body,scope);
  }
  err('RESOLVER_RETRIES_EXHAUSTED');
}
