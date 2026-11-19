'use strict';
/* Small, offline follow-up patch to the validated V6 local candidate. NO DB or deploy calls. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const base='C:\\Users\\dundi\\OX-Novels-B9.2-TEST';
const source=path.resolve(process.argv[2]||path.join(base,'OX-V6-PROMOTIONS-REBUILT-LOCAL'));
const target=path.resolve(process.argv[3]||path.join(base,'OX-V6-1-PROMOTIONS-RELEASE-LOCAL'));
function fail(s){throw Error('STOP: '+s)}
if(!fs.existsSync(path.join(source,'src/index.js')))fail('V6 rebuilt candidate not found');
if(fs.existsSync(target))fail('V6.1 destination already exists; no files changed');
const file=path.join(source,'src/index.js');let code=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
function replaceExactly(a,b,label){const count=code.split(a).length-1;if(count!==1)fail(label+' expected one match but saw '+count);code=code.replace(a,b)}
replaceExactly(`  const firstPaidByUser=new Map();
  const firstCreditedUsers=new Set();`,
`  const firstPaidByUser=new Map();
  // Track every observed paid subscription event, including ones older than the questionnaire.
  // A later renewal must NEVER become a partner's first-month credit.
  const firstCreditedUsers=new Set();`, 'paid history');
replaceExactly(`    const source=byUser.get(userId);
    if(!source) {unmatchedPaymentEvents++;continue;}
    const amount=oxPromoMoney(e.amount,e.currency);
    if(!amount) {unmatchedPaymentEvents++;continue;}
    const date=String(e.occurred_at||e.created_at||'');
    // Only one first PAID month per customer; no duplicate earnings on a re-subscription.
    const firstForCustomer=amount.amount>0 && !firstCreditedUsers.has(userId);
    if(firstForCustomer) { firstCreditedUsers.add(userId); firstPaidByUser.set(userId,date); }`,
`    const amount=oxPromoMoney(e.amount,e.currency);
    if(!amount) {unmatchedPaymentEvents++;continue;}
    const date=String(e.occurred_at||e.created_at||'');
    // Mark the first positive subscription event BEFORE evaluating attribution.
    // This prevents previously-paying customers from granting renewal commissions retroactively.
    const firstForCustomer=amount.amount>0 && !firstCreditedUsers.has(userId);
    if(amount.amount>0) firstCreditedUsers.add(userId);
    const source=byUser.get(userId);
    const purchaseMs=Date.parse(date), answerMs=Date.parse(source?.selected_at||'');
    if(!source || !Number.isFinite(purchaseMs) || !Number.isFinite(answerMs) || purchaseMs<answerMs) {
      unmatchedPaymentEvents++;continue;
    }
    if(firstForCustomer) firstPaidByUser.set(userId,date);`, 'no retroactive subscription credits');
replaceExactly(`    const userId=String(e.user_id||'');const source=byUser.get(userId);
    if(!source) continue;
    const amount=oxPromoMoney(e.amount,e.currency);`,
`    const userId=String(e.user_id||'');const source=byUser.get(userId);
    const purchaseMs=Date.parse(e.purchased_at||'');
    const answerMs=Date.parse(source?.selected_at||'');
    // Never award an older lifetime purchase to a newly selected friend.
    if(!source || !Number.isFinite(purchaseMs) || !Number.isFinite(answerMs) || purchaseMs<answerMs) continue;
    const amount=oxPromoMoney(e.amount,e.currency);`, 'no retroactive lifetime credits');
const temp=path.join(source,'.ox-v61-syntax-check.js');
try{fs.writeFileSync(temp,code);cp.execFileSync(process.execPath,['--check',temp],{stdio:'pipe'})}
finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
for(const f of ['public/assets/ox-promo-admin.js','public/assets/ox-promo-partner.js','public/assets/ox-promo-gate.js','public/assets/app.js']) {
  cp.execFileSync(process.execPath,['--check',path.join(source,f)],{stdio:'pipe'});
}
const migration=fs.readFileSync(path.join(source,'migrations/0030_promotion_partners.sql'),'utf8');
for(const name of ['ox_promo_partners','ox_promo_attributions','ox_promo_partner_sessions','ox_promo_login_attempts'])
  if(!migration.includes('CREATE TABLE IF NOT EXISTS '+name))fail('migration incomplete: '+name);
const config=fs.readFileSync(path.join(source,'wrangler.jsonc'),'utf8');
if(!config.includes('"pattern": "oxnovels.top"')||!config.includes('"custom_domain": true'))fail('wrong domain');
fs.mkdirSync(target,{recursive:false});
fs.cpSync(path.join(source,'public'),path.join(target,'public'),{recursive:true});
fs.cpSync(path.join(source,'migrations'),path.join(target,'migrations'),{recursive:true});
fs.mkdirSync(path.join(target,'src'));fs.writeFileSync(path.join(target,'src/index.js'),code);
fs.copyFileSync(path.join(source,'wrangler.jsonc'),path.join(target,'wrangler.jsonc'));
console.log('PASS: V6.1 corrected first-month commission allocation.');
console.log('PASS: Older purchases cannot be newly credited to a friend.');
console.log('PASS: Both Dodo checkout gates and partner viewer retained.');
console.log('PASS: JS syntax, additive migration, domain checks.');
console.log('NO PRODUCTION DEPLOYMENT OR D1 CHANGES.');
console.log('Folder: '+target);
