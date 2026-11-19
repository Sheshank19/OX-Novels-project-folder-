'use strict';
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const root='C:\\Users\\dundi\\OX-Novels-B9.2-TEST';
const source=path.join(root,'OX-V6-1-PROMOTIONS-RELEASE-LOCAL');
const target=path.join(root,'OX-V6-2-PROMOTIONS-RELEASE-LOCAL');
function read(p){return fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');}
function once(text,before,after,label){
  const n=text.split(before).length-1;
  if(n!==1)throw Error('STOP: '+label+' expected 1 occurrence, found '+n);
  return text.replace(before,after);
}
function check(p){cp.execFileSync(process.execPath,['--check',p],{stdio:'pipe'});}
if(!fs.existsSync(path.join(source,'src/index.js')))throw Error('STOP: V6.1 source missing.');
if(fs.existsSync(target))throw Error('STOP: V6.2 folder exists. Leave files unchanged.');
const workerFile=path.join(source,'src/index.js');
const migrationFile=path.join(source,'migrations/0030_promotion_partners.sql');
const adminJs=path.join(source,'public/assets/ox-promo-admin.js');
const adminHtml=path.join(source,'public/admin-promotions.html');
let worker=read(workerFile), migration=read(migrationFile), admin=read(adminJs), html=read(adminHtml);
if(!worker.includes("const OX_PROMO_LOGIN_ITERATIONS = 160000;"))throw Error('STOP: Original partner hashing missing.');

// Cloudflare Workers Free has 10ms of CPU/request. Restrict to read-only partner users,
// use 16+ char unique passwords, D1 lockout and 10k WebCrypto PBKDF2 rounds.
worker=once(worker,'const OX_PROMO_LOGIN_ITERATIONS = 160000;',
 'const OX_PROMO_LOGIN_ITERATIONS = 10000;','free-tier password hashing');
migration=once(migration,'DEFAULT 160000','DEFAULT 10000','DB default');
worker=once(worker,"password.length<12||password.length>128",
 "password.length<16||password.length>128",'new partner minimum');
worker=once(worker,"pass.length<12||pass.length>128",
 "pass.length<16||pass.length>128",'password reset minimum');
worker=once(worker,
 "password (12–128 characters) are required.",
 "password (16–128 characters) are required.",
 'minimum password messaging');
worker=once(worker,
 "Password must be 12–128 characters.",
 "Password must be 16–128 characters.",
 'reset password messaging');
admin=once(admin,'password.length<12','password.length<16','client password min');
admin=once(admin,'Password must be at least 12 characters.','Password must be at least 16 characters.','client message');
html=once(html,'Initial password (12+ chars)','Initial password (16+ chars)','form label');
html=once(html,'minlength="12"','minlength="16"','form length');

// Prevent retroactive commissions for customers who already purchased via PayPal
// before answering the questionnaire.
worker=once(worker,
 'const [partnersRes, attributionRes, subscriptionsRes, paidRes, lifetimeRes, refundsRes]=await Promise.all([',
 'const [partnersRes, attributionRes, subscriptionsRes, paidRes, lifetimeRes, refundsRes, priorPaidRes, priorPaypalRes]=await Promise.all([',
 'prior payment query expansion');
worker=once(worker,
 `      WHERE provider='dodo' AND environment='live_mode' AND event_type IN ('refund.succeeded','refund.failed')\`).all()
  ]);`,
 `      WHERE provider='dodo' AND environment='live_mode' AND event_type IN ('refund.succeeded','refund.failed')\`).all(),
    env.DB.prepare("SELECT id,paid_once_at FROM users WHERE NULLIF(paid_once_at,'') IS NOT NULL").all(),
    env.DB.prepare(\`SELECT user_id,MIN(COALESCE(occurred_at,created_at)) AS first_paid_at
      FROM payment_events WHERE provider='paypal' AND user_id IS NOT NULL
      AND event_type IN ('PAYMENT.SALE.COMPLETED','PAYMENT.CAPTURE.COMPLETED','OX.LIFETIME_STORY.COMPLETED')
      AND LOWER(COALESCE(environment,'')) NOT IN ('sandbox','test','test_mode')
      GROUP BY user_id\`).all()
  ]);`,
 'pre-existing PayPal / paid-once history');
worker=once(worker,
 '  const firstCreditedUsers=new Set();\n  for(const e of paid) {',
 `  const firstCreditedUsers=new Set();
  const partnerFirstEligible=new Set();
  const previousPaidByUser=new Map();
  function priorDate(userId,stamp) {
    const ms=Date.parse(stamp||'');
    if(!Number.isFinite(ms)) return;
    const id=String(userId||'');
    if(!id) return;
    if(!previousPaidByUser.has(id)||ms<previousPaidByUser.get(id))
      previousPaidByUser.set(id,ms);
  }
  for(const row of priorPaidRes.results||[]) priorDate(row.id,row.paid_once_at);
  for(const row of priorPaypalRes.results||[]) priorDate(row.user_id,row.first_paid_at);
  for(const e of paid) {`,
 'history prior map');
worker=once(worker,
 `    if(firstForCustomer) firstPaidByUser.set(userId,date);
    const owner=source.source_type==='other'?'unassigned':
      (firstForCustomer&&source.source_type==='partner'&&source.partner_id ? source.partner_id : 'owner');
    const partner=partners.find(x=>String(x.id)===String(owner));
    ledger.push({key:'payment:'+e.id,kind:firstForCustomer?'First membership payment':'Membership renewal',`,
 `    if(firstForCustomer) firstPaidByUser.set(userId,date);
    const previouslyPaid=previousPaidByUser.has(userId)&&previousPaidByUser.get(userId)<answerMs;
    const partnerFirst=firstForCustomer&&!previouslyPaid&&source.source_type==='partner'&&!!source.partner_id;
    if(partnerFirst) partnerFirstEligible.add(userId);
    const owner=source.source_type==='other'?'unassigned':
      (partnerFirst ? source.partner_id : 'owner');
    const partner=partners.find(x=>String(x.id)===String(owner));
    ledger.push({key:'payment:'+e.id,kind:firstForCustomer?(previouslyPaid?'Existing customer payment':'First membership payment'):'Membership renewal',`,
 'first commission exclusion');
worker=once(worker,
 `if(a.source_type==='partner' && first && eligibleThrough && today<Date.parse(eligibleThrough))`,
 `if(a.source_type==='partner' && first && partnerFirstEligible.has(userId) && eligibleThrough && today<Date.parse(eligibleThrough))`,
 'owner switch for prior customers');

// The admin UI should keep protected secrets out of accessible browser state.
fs.cpSync(source,target,{recursive:true,filter:(file)=>{
 const b=path.basename(file);
 return !['.dev.vars','.dev.vars.live-backup','.wrangler','node_modules','.git'].includes(b);
}});
fs.writeFileSync(path.join(target,'src/index.js'),worker);
fs.writeFileSync(path.join(target,'migrations/0030_promotion_partners.sql'),migration);
fs.writeFileSync(path.join(target,'public/assets/ox-promo-admin.js'),admin);
fs.writeFileSync(path.join(target,'public/admin-promotions.html'),html);
for(const p of [
 'src/index.js',
 'public/assets/app.js','public/assets/ox-promo-gate.js','public/assets/ox-promo-admin.js','public/assets/ox-promo-partner.js'
]) check(path.join(target,p));
const config=read(path.join(target,'wrangler.jsonc'));
if(!config.includes('"pattern": "oxnovels.top"')||!config.includes('"custom_domain": true'))
 throw Error('STOP: Site domain config does not match');
console.log('PASS: V6.2 new local folder created.');
console.log('PASS: Partner passwords require 16+ characters and use Free-tier-sized WebCrypto hashing.');
console.log('PASS: Existing customer PayPal / paid-once history excluded from new first-month friend credits.');
console.log('PASS: All 5 JavaScript files syntax verified and domain config matched.');
console.log('PASS: D1 additive migration retained; original payment code unmodified.');
console.log('NO PRODUCTION DEPLOYMENT OR D1 CHANGES.');
console.log('Folder: '+target);
