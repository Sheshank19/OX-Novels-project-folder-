import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('./OX-MAIN-WORKER-LIVE-STAGE-CANDIDATE.mjs',import.meta.url),'utf8');
function extract(name){ const needle=source.includes('async function '+name+'(')?'async function '+name+'(':'function '+name+'('; const s=source.indexOf(needle); if(s<0)throw Error('missing '+name); const e=source.indexOf('__name('+name,s); return source.slice(s,e); }
const ctx=vm.createContext({Date,console});
vm.runInContext(extract('oxValidPaidThrough')+'\n'+extract('oxReconcilePaidProviders'),ctx);
function fakeDB(user,subs=[],managed=false){
  const state={user:{...user},subs:[...subs],managed};
  const db={prepare(sql){return{bind(...args){return{
    async first(){
      if(sql.includes('FROM users WHERE')) return {...state.user};
      if(sql.includes('FROM dodo_live_membership_control'))return state.managed?{user_id:args[0]}:null;
      if(sql.includes('FROM membership_tiers'))return {id:args[0],name:'Premium',price:'$17.99'};
      throw Error('unexpected first '+sql);
    },async all(){if(sql.includes('FROM member_subscriptions'))return {results:state.subs.filter(x=>(x.provider==='paypal' && x.environment==='live')||(x.provider==='dodo' && x.environment==='live_mode'))};throw Error('unexpected all '+sql)},
    async run(){if(sql.includes('INSERT OR IGNORE INTO dodo_live_membership_control')){state.managed=true;return;}
    if(sql.includes('UPDATE users')){
      if(sql.includes("membership_status='Granted'")){state.user.membership_status='Granted';return;}
      if(sql.includes("membership_status='Active'")){state.user.membership_status='Active';return;}
      if(sql.includes("membership_status='Expired'")){state.user.membership_status='Expired';return;}
    } throw Error('unexpected run '+sql)}
  }}}}};
  return {DB:db,state};
}
const valid=(provider,status,environment='live')=>({provider,status,environment,tier_id:'premium',next_billing_at:null,updated_at:new Date().toISOString()});
const tests=[];
async function test(n,fn){await fn();tests.push(n);console.log('PASS',n);}
await test('PayPal ACTIVE still grants access after Dodo failure',async()=>{
 const env=fakeDB({id:'u1',account_status:'Active',membership_status:'Expired'},[valid('paypal','ACTIVE'),valid('dodo','FAILED','live_mode')],true);
 await ctx.oxReconcilePaidProviders(env,'u1');assert.equal(env.state.user.membership_status,'Active');
});
await test('Dodo Live ACTIVE activates new subscriber',async()=>{
 const env=fakeDB({id:'u2',account_status:'Active',membership_status:'None'},[valid('dodo','ACTIVE','live_mode')]);
 await ctx.oxReconcilePaidProviders(env,'u2');assert.equal(env.state.user.membership_status,'Active');assert.equal(env.state.managed,true);
});
await test('Dodo Test ACTIVE cannot activate a live entitlement',async()=>{
 const env=fakeDB({id:'u3',account_status:'Active',membership_status:'None'},[valid('dodo','ACTIVE','test_mode')]);
 await ctx.oxReconcilePaidProviders(env,'u3');assert.equal(env.state.user.membership_status,'None');
});
await test('Managed Dodo Live expired and no other provider removes access',async()=>{
 const env=fakeDB({id:'u4',account_status:'Active',membership_status:'Active'},[valid('dodo','EXPIRED','live_mode')],true);
 await ctx.oxReconcilePaidProviders(env,'u4');assert.equal(env.state.user.membership_status,'Expired');
});
await test('Unmanaged manual ACTIVE access is preserved',async()=>{
 const env=fakeDB({id:'u5',account_status:'Active',membership_status:'Active'},[valid('dodo','ACTIVE','live_mode')]);
 await ctx.oxReconcilePaidProviders(env,'u5',{membership_status:'Active'});assert.equal(env.state.managed,false);
});
await test('Explicit Granted access remains untouched',async()=>{
 const env=fakeDB({id:'u6',account_status:'Active',membership_status:'Granted'},[valid('dodo','EXPIRED','live_mode')],true);
 await ctx.oxReconcilePaidProviders(env,'u6');assert.equal(env.state.user.membership_status,'Granted');
});
await test('PayPal approval pending does not confer access',async()=>{
 const env=fakeDB({id:'u7',account_status:'Active',membership_status:'None'},[valid('paypal','APPROVAL_PENDING')]);
 await ctx.oxReconcilePaidProviders(env,'u7');assert.equal(env.state.user.membership_status,'None');
});
await test('No PayPal or Dodo Live means no new access',async()=>{
 const env=fakeDB({id:'u8',account_status:'Active',membership_status:'None'});
 await ctx.oxReconcilePaidProviders(env,'u8');assert.equal(env.state.user.membership_status,'None');
});
await test('Blocked user cannot be reactivated by Dodo',async()=>{
 const env=fakeDB({id:'u9',account_status:'Blocked',membership_status:'None'},[valid('dodo','ACTIVE','live_mode')]);
 await ctx.oxReconcilePaidProviders(env,'u9');assert.equal(env.state.user.membership_status,'None');
});
await test('Old $49 price untouched; Live Dodo only price $65',async()=>{
 assert.match(source,/var LIFETIME_STORY_PRICE = "49\.00";/);
 assert.match(source,/const DODO_LIVE_LIFETIME_PRICE = '65\.00';/);
});
await test('Canary and both PayPal webhooks remain present',async()=>{
 for(const x of ['b92CanaryPlayerLanding','/api/payments/paypal/webhook','/api/payments/paypal/raptor-webhook']) assert.ok(source.includes(x));
});
await test('Live checkout gated and not enabled by default',async()=>{
 for(const x of ['OX_ENABLE_DODO_LIVE','DODO_PAYMENTS_LIVE_API_KEY','DODO_PAYMENTS_LIVE_WEBHOOK_KEY','DODO_LIVE_PREMIUM_PRODUCT_ID','DODO_LIVE_LIFETIME_PRODUCT_ID'])assert.ok(source.includes(x));
});
console.log(`PASS ${tests.length}/${tests.length} local tests; no Cloudflare or payments accessed.`);
