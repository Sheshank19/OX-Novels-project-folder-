import assert from 'node:assert/strict';
import fs from 'node:fs';
const input=fs.readFileSync(new URL('./OX-NOVELS-CANARY-COEXISTENCE-CANDIDATE.mjs',import.meta.url),'utf8');
const start=input.indexOf('async function oxPreserveOtherProviderEntitlement(');
const end=input.indexOf('__name(oxPreserveOtherProviderEntitlement',start);
assert(start>=0&&end>start,'Helper not found');
const fn=new Function(input.slice(start,end)+'\nreturn oxPreserveOtherProviderEntitlement')();
function testDb(rows=[],tier={id:'premium',name:'Premium',price:'$6.00'}){
 const updates=[];const db={prepare(sql){return {bind(...args){return {
  async all(){assert(sql.includes('member_subscriptions'));return {results:rows}},
  async first(){return tier},
  async run(){updates.push({sql,args});return {success:true}}
 }}}}};
 return {db,updates};
}
const future = new Date(Date.now()+86400000).toISOString();
const checks=[
 {name:'Dodo live ACTIVE survives PayPal expiry',source:'paypal',rows:[{provider:'dodo',environment:'live_mode',status:'ACTIVE',tier_id:'premium'}],expected:1},
 {name:'PayPal ACTIVE survives Dodo test failure',source:'dodo',rows:[{provider:'paypal',environment:'live',status:'ACTIVE',tier_id:'premium'}],expected:1},
 {name:'Cancelled PayPal keeps paid-through entitlement',source:'dodo',rows:[{provider:'paypal',environment:'live',status:'CANCELLED',next_billing_at:future}],expected:1},
 {name:'Dodo test record never grants live access',source:'paypal',rows:[{provider:'dodo',environment:'test_mode',status:'ACTIVE',tier_id:'premium'}],expected:0},
 {name:'Expired other provider cannot extend membership',source:'dodo',rows:[{provider:'paypal',environment:'live',status:'EXPIRED'}],expected:0},
 {name:'Admin grant preserved independent of billing providers',source:'paypal',rows:[],grant:{membership_status:'Granted',membership_plan:'Admin Grant'},expected:1},
];
for (const c of checks){let {db,updates}=testDb(c.rows); await fn({DB:db},'account1',c.source,c.grant??null);assert.equal(updates.length,c.expected,c.name); console.log('PASS: '+c.name)}
assert(input.includes('"/api/payments/paypal/webhook"'),'PayPal webhook missing');
assert(input.includes('B92_PLAYER_CANARY_ID'),'Player canary missing');
console.log('PASS: PayPal webhook and Player canary unchanged');
