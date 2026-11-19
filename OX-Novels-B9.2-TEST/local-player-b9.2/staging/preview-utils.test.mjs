import assert from 'node:assert/strict';
import test from 'node:test';
import {boundedRange,sampleCandidates} from './preview-utils.mjs';
test('bounded range requests never exceed one MiB',()=>{
 assert.equal(boundedRange(''),'bytes=0-1048575');
 assert.equal(boundedRange('bytes=5-20'),'bytes=5-20');
 assert.equal(boundedRange('bytes=0-'),'bytes=0-1048575');
 assert.equal(boundedRange('bytes=20-900000000'),'bytes=20-1048595');
 for(const bad of ['bytes=-100','bytes=100-10','bytes=0-5,8-10','bytes=9000000-','invalid'])assert.throws(()=>boundedRange(bad));
});
test('preview selects only encrypted entries, preferring MP3',()=>{
 const tracks=[{key:'t1.aaa',name:'a.m4a',size:50},{key:'t1.bbb',name:'a.mp3',size:60},{key:'raw',name:'b.mp3',size:70}];
 const samples=sampleCandidates({folders:{root:{tracks}}});
 assert.equal(samples.length,2);assert.equal(samples[0].name,'a.mp3');
});
