/** OX B9.2 local preview: small, bounded byte-range requests only. */
export const MAX_CHUNK_BYTES=1024*1024;
export const MAX_START_BYTES=8*1024*1024;
export const MAX_TOTAL_BYTES=24*1024*1024;
export const MAX_STREAM_REQUESTS=24;
export function boundedRange(header='') {
  const value=String(header||'').trim();
  if (!value) return 'bytes=0-1048575';
  const match=/^bytes=(\d+)-(\d*)$/.exec(value);
  if (!match) throw new Error('RANGE_UNSUPPORTED');
  const start=Number(match[1]);
  if (!Number.isSafeInteger(start)||start<0||start>MAX_START_BYTES) throw new Error('RANGE_OUTSIDE_PREVIEW');
  const proposedEnd=match[2]?Number(match[2]):start+MAX_CHUNK_BYTES-1;
  if (!Number.isSafeInteger(proposedEnd)||proposedEnd<start) throw new Error('RANGE_UNSUPPORTED');
  const end=Math.min(proposedEnd,start+MAX_CHUNK_BYTES-1);
  return `bytes=${start}-${end}`;
}
export function sampleCandidates(candidate,max=3){
  const rows=Object.values(candidate?.folders||{}).flatMap(f=>f.tracks||[]);
  const good=t=>typeof t.key==='string'&&t.key.startsWith('t1.')&&Number(t.size)>0;
  const mp3=rows.filter(t=>good(t)&&/\.mp3$/i.test(t.name||''));
  const other=rows.filter(t=>good(t)&&/\.(m4a|m4b)$/i.test(t.name||''));
  const list=[...mp3.slice(0,2),...other.slice(0,1)];
  if(list.length<max) for(const item of [...mp3.slice(2),...other.slice(1),...rows.filter(good)]) if(!list.includes(item)&&list.length<max)list.push(item);
  return list.slice(0,max);
}
