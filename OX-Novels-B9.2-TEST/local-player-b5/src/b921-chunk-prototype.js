/* B9.2.1 offline prototype. NEVER call from deployed Worker until D1-backed
   checkpoints, Queue budgets, stage recovery and 10 ms runtime profiling pass. */
const FOLDER_RE=/^[a-zA-Z0-9_-]{10,}$/;
const MAX_TOKENS_PER_JOB=12;
const AAD=new TextEncoder().encode('OX_PLAYER_TRACK_V1');
const encoder=new TextEncoder();
const raw=v=>String(v??'').trim();
function to64(data){let str='';for(const b of data)str+=String.fromCharCode(b);return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function from64(input){const s=raw(input).replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(s+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));}
export function workBudget(manifest,{changedStories=20,avgChangedTracks=100,chunkSize=MAX_TOKENS_PER_JOB}={}){
 if(!Array.isArray(manifest)||!Number.isInteger(chunkSize)||chunkSize<1||chunkSize>MAX_TOKENS_PER_JOB)throw new Error('Invalid free-tier workload');
 const stories=manifest.length,folders=manifest.reduce((n,s)=>n+Number(s.folderCount||0),0),tracks=manifest.reduce((n,s)=>n+Number(s.trackCount||0),0);
 // One per-story startup, one per folder fetch, one scan completion, and one token batch per changed chunk.
 const baseMessages=stories*2+folders;
 const changeMessages=changedStories*Math.ceil(avgChangedTracks/chunkSize);
 const queueMessages=baseMessages+changeMessages;
 const queueOperations=queueMessages*3;
 return {stories,folders,tracks,baseMessages,changeMessages,queueMessages,queueOperations,freeQueueOperations:10000,conservativeBudget:8500,underConservativeBudget:queueOperations<=8500,warning:'Planning approximation only; does not include retries, queue payload >64KB or extra replays, and is not a 10ms CPU measurement.'};
}
export function initialFolderCursor(rootFolderId){if(!FOLDER_RE.test(raw(rootFolderId)))throw Error('Invalid Drive folder ID');return {pending:[{id:rootFolderId,name:'Root',depth:0}],seen:[],nodes:{}};}
export function advanceFolderCursor(cursor,node){
 if(!cursor?.pending?.length)throw Error('Folder cursor is complete');
 const [current,...rest]=cursor.pending;
 if(!FOLDER_RE.test(current.id)||cursor.seen.includes(current.id))throw Error('Invalid/repeated folder in scan');
 if(current.depth>12||cursor.seen.length>=300)throw Error('Scan too deep or many folders');
 if(!node||node.truncated||!Array.isArray(node.folders)||!Array.isArray(node.tracks))throw Error('Drive response truncated or malformed');
 const folders=node.folders.map(f=>({id:raw(f.id),name:raw(f.name),depth:current.depth+1}));
 if(folders.some(f=>!FOLDER_RE.test(f.id))||node.tracks.some(t=>!FOLDER_RE.test(raw(t.id))))throw Error('Drive list invalid IDs');
 const seen=[...cursor.seen,current.id];
 const pending=[...rest,...folders.filter(f=>!seen.includes(f.id)&&!rest.some(r=>r.id===f.id))];
 const nodes={...cursor.nodes,[current.id]:{name:raw(node.name)||current.name,folders:folders.map(({id,name})=>({id,name})),tracks:node.tracks.map(t=>({id:raw(t.id),name:raw(t.name),mimeType:raw(t.mimeType),size:Number(t.size||0),modifiedAt:raw(t.modifiedAt)}))}};
 return {pending,seen,nodes,finished:pending.length===0};
}
export async function encryptTrackChunk({secret,storyId,sourceVersion,generationId,tracks}){
 if(!Array.isArray(tracks)||tracks.length<1||tracks.length>MAX_TOKENS_PER_JOB)throw Error(`Chunk must contain 1-${MAX_TOKENS_PER_JOB} tracks`);
 if(!/^[a-z0-9._-]{1,160}$/.test(raw(storyId))||!raw(sourceVersion)||!raw(generationId))throw Error('Invalid token scope');
 const bytes=from64(secret);if(bytes.length!==32)throw Error('Invalid existing Player encryption key');
 const aes=await crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['encrypt']);
 const mac=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const tokens=[];
 for(const t of tracks){
  const fileId=raw(t.id);if(!FOLDER_RE.test(fileId))throw Error('Invalid file ID');
  const scope={kind:'track',storyId,sourceVersion,generationId,fileId,mimeType:raw(t.mimeType)};
  const digest=await crypto.subtle.sign('HMAC',mac,encoder.encode(`OX_TRACK_NONCE_V1\0${storyId}\0${sourceVersion}\0${generationId}\0${fileId}`));
  const nonce=new Uint8Array(digest).slice(0,12);
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:AAD,tagLength:128},aes,encoder.encode(JSON.stringify(scope)));
  tokens.push({id:fileId,key:`t1.${to64(nonce)}.${to64(new Uint8Array(ciphertext))}`});
 }
 return tokens;
}
