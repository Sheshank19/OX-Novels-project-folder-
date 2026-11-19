/* OX V6 Promotion Partners. Separate reporting/authentication; NEVER modifies payments or entitlements. */
const OX_PROMO_SESSION_COOKIE = 'ox_promo_partner_session';
const OX_PROMO_LOGIN_ITERATIONS = 160000;
function oxPromoResponse(payload, status=200, extra={}) {
  return new Response(JSON.stringify(payload), {status, headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store, private',
    'x-content-type-options':'nosniff', ...extra
  }});
}
function oxPromoCheckOrigin(request,url) {
  const origin=request.headers.get('origin');
  const fetchSite=String(request.headers.get('sec-fetch-site')||'').toLowerCase();
  return (!origin || origin===url.origin) && !['cross-site'].includes(fetchSite);
}
function oxPromoRandomToken(n=32) {
  const bytes=crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
async function oxPromoSha(input) {
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(input)));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
async function oxPromoPasswordDigest(password,salt,iterations=OX_PROMO_LOGIN_ITERATIONS) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),
    {name:'PBKDF2'},false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),
    iterations,hash:'SHA-256'},key,256);
  return Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('');
}
function oxPromoConstantEqual(a,b) {
  a=String(a||'');b=String(b||'');
  let diff=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++) diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
}
function oxPromoCookie(request) {
  const cookie=request.headers.get('cookie')||'';
  const match=cookie.match(/(?:^|;\s*)ox_promo_partner_session=([a-f0-9]{64})(?:;|$)/i);
  return match ? match[1] : '';
}
async function oxPromoPartnerAuth(request,env) {
  const token=oxPromoCookie(request);
  if(!token) return null;
  const hash=await oxPromoSha(token);
  return env.DB.prepare(`SELECT p.id,p.channel_name,p.login_name FROM ox_promo_partner_sessions s
    JOIN ox_promo_partners p ON p.id=s.partner_id
    WHERE s.token_hash=? AND s.expires_at>? AND p.active=1 LIMIT 1`)
    .bind(hash,new Date().toISOString()).first();
}
async function oxPromoGetBody(request) {
  if(!String(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))
    throw new Error('Send JSON.');
  return request.json();
}
function oxPromoMoney(amount,currency) {
  const n=Number(amount);
  if(!Number.isFinite(n)||n<0) return null;
  return {amount:Math.round(n*100)/100,currency:String(currency||'USD').toUpperCase()};
}
function oxPromoMaskEmail(value) {
  const s=String(value||'');
  const at=s.indexOf('@');
  if(at<1) return '—';
  return s[0]+'***'+s.slice(at);
}
function oxPromoMonthAfter(dateText) {
  const d=new Date(dateText||'');
  if(!Number.isFinite(d.getTime())) return null;
  const original=d.getUTCDate();
  d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);
  const endOfMonth=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  d.setUTCDate(Math.min(original,endOfMonth));
  return d.toISOString();
}
async function oxPromoBuildReport(env,filterPartnerId=null,showPrivate=false) {
  const [partnersRes, attributionRes, subscriptionsRes, paidRes, lifetimeRes, refundsRes]=await Promise.all([
    env.DB.prepare('SELECT id,channel_name,login_name,active,created_at FROM ox_promo_partners ORDER BY created_at ASC').all(),
    env.DB.prepare(`SELECT a.user_id,a.source_type,a.partner_id,a.other_source,a.selected_at,
      u.name AS customer_name,u.email AS customer_email,p.channel_name
      FROM ox_promo_attributions a JOIN users u ON u.id=a.user_id
      LEFT JOIN ox_promo_partners p ON p.id=a.partner_id ORDER BY a.selected_at DESC`).all(),
    env.DB.prepare(`SELECT provider_subscription_id,user_id,provider,environment,status,next_billing_at
      FROM member_subscriptions WHERE provider='dodo' AND environment='live_mode'`).all(),
    env.DB.prepare(`SELECT id,user_id,provider_subscription_id,amount,currency,occurred_at,created_at
      FROM payment_events WHERE provider='dodo' AND environment='live_mode' AND event_type='payment.succeeded'
      ORDER BY COALESCE(occurred_at,created_at),id`).all(),
    env.DB.prepare(`SELECT id,user_id,amount,currency,provider,environment,purchase_status,
      entitlement_status,purchased_at,original_title FROM story_lifetime_purchases
      WHERE purchase_status='Completed' AND entitlement_status='Active'
      AND LOWER(COALESCE(environment,'')) NOT IN ('sandbox','test','test_mode')
      ORDER BY purchased_at DESC`).all(),
    env.DB.prepare(`SELECT user_id,provider_subscription_id,event_type,environment,provider FROM payment_events
      WHERE provider='dodo' AND environment='live_mode' AND event_type IN ('refund.succeeded','refund.failed')`).all()
  ]);
  const partners=partnersRes.results||[];
  const attributions=attributionRes.results||[];
  const byUser=new Map(attributions.map(r=>[String(r.user_id),r]));
  const subs=subscriptionsRes.results||[];
  const bySub=new Map(subs.map(r=>[String(r.provider_subscription_id),r]));
  const paid=paidRes.results||[];
  const refunds=refundsRes.results||[];
  const refundedSubs=new Set(refunds.filter(r=>r.event_type==='refund.succeeded' && r.provider_subscription_id)
    .map(r=>String(r.provider_subscription_id)));
  const ledger=[];
  let unmatchedPaymentEvents=0;
  const firstPaidByUser=new Map();
  const firstCreditedUsers=new Set();
  for(const e of paid) {
    const subId=String(e.provider_subscription_id||'');
    const sub=bySub.get(subId);
    // Do not infer a commission from an unlinked event; these require manual review.
    if(!subId || !sub) {unmatchedPaymentEvents++;continue;}
    const userId=String(e.user_id||sub.user_id||'');
    if(!userId || userId!==String(sub.user_id)) {unmatchedPaymentEvents++;continue;}
    const source=byUser.get(userId);
    if(!source) {unmatchedPaymentEvents++;continue;}
    const amount=oxPromoMoney(e.amount,e.currency);
    if(!amount) {unmatchedPaymentEvents++;continue;}
    const date=String(e.occurred_at||e.created_at||'');
    // Only one first PAID month per customer; no duplicate earnings on a re-subscription.
    const firstForCustomer=amount.amount>0 && !firstCreditedUsers.has(userId);
    if(firstForCustomer) { firstCreditedUsers.add(userId); firstPaidByUser.set(userId,date); }
    const owner=source.source_type==='other'?'unassigned':
      (firstForCustomer&&source.source_type==='partner'&&source.partner_id ? source.partner_id : 'owner');
    const partner=partners.find(x=>String(x.id)===String(owner));
    ledger.push({key:'payment:'+e.id,kind:firstForCustomer?'First membership payment':'Membership renewal',
      date,customerId:userId,sourceType:source.source_type,sourceName:source.channel_name||source.other_source||'OX Novels',
      recipientId:owner,recipientName:partner?.channel_name||(owner==='unassigned'?'Unassigned':'Mine'),...amount,
      review:refundedSubs.has(subId)?'Refund review required':'Recorded gross; verify net settlement',
      subscriptionStatus:sub.status||'UNKNOWN'});
  }
  for(const e of lifetimeRes.results||[]) {
    const userId=String(e.user_id||'');const source=byUser.get(userId);
    if(!source) continue;
    const amount=oxPromoMoney(e.amount,e.currency);
    if(!amount) continue;
    const owner=source.source_type==='other'?'unassigned':
      (source.source_type==='partner'&&source.partner_id?String(source.partner_id):'owner');
    const partner=partners.find(p=>String(p.id)===owner);
    ledger.push({key:'lifetime:'+e.id,kind:'Lifetime story purchase',date:e.purchased_at||'',customerId:userId,
      sourceType:source.source_type,sourceName:source.channel_name||source.other_source||'OX Novels',
      recipientId:owner,recipientName:partner?.channel_name||(owner==='unassigned'?'Unassigned':'Mine'),...amount,
      review:'Recorded gross; verify refunds, taxes and fees',story:e.original_title||''});
  }
  const today=Date.now();
  const customerRows=attributions.map(a=>{
    const userId=String(a.user_id);
    const first=firstPaidByUser.get(userId)||'';
    const eligibleThrough=first?oxPromoMonthAfter(first):null;
    const hasLiveSub=subs.some(s=>String(s.user_id)===userId);
    const hasLifetime=(lifetimeRes.results||[]).some(l=>String(l.user_id)===userId);
    let currentOwner='Mine';
    if(a.source_type==='partner' && first && eligibleThrough && today<Date.parse(eligibleThrough))
      currentOwner=a.channel_name||'Partner';
    else if(a.source_type==='partner' && !first && hasLifetime) currentOwner='Lifetime credited to '+(a.channel_name||'Partner');
    else if(a.source_type==='partner' && !first) currentOwner='Pending first payment';
    else if(a.source_type==='other') currentOwner='Unassigned / review';
    return {userId,customerName:a.customer_name||'Customer',email:showPrivate?(a.customer_email||''):oxPromoMaskEmail(a.customer_email),
      sourceType:a.source_type,sourceName:a.channel_name||a.other_source||(a.source_type==='owner'?'OX Novels':'Unknown'),
      partnerId:a.partner_id||null,selectedAt:a.selected_at,firstMembershipPayment:first||null,
      firstPeriodEnd:eligibleThrough,currentOwner,hasLiveSubscription:hasLiveSub,hasLifetimePurchase:hasLifetime};
  });
  const customers=filterPartnerId ? customerRows.filter(c=>String(c.partnerId)===String(filterPartnerId)) : customerRows;
  const allowedLedger=filterPartnerId ? ledger.filter(l=>String(l.recipientId)===String(filterPartnerId)) : ledger;
  const visibleLedger=allowedLedger.map(l=>{
    const c=customerRows.find(c=>c.userId===l.customerId);
    return {...l,customerName:c?.customerName||'Customer',email:c?.email||'—'};
  });
  const totals={};
  for(const l of visibleLedger) {
    if(!totals[l.currency]) totals[l.currency]={count:0,gross:0};
    totals[l.currency].count++;
    totals[l.currency].gross=Math.round((totals[l.currency].gross+l.amount)*100)/100;
  }
  return {ok:true,generatedAt:new Date().toISOString(),
    partners: filterPartnerId?partners.filter(p=>String(p.id)===String(filterPartnerId)):partners,
    customers,ledger:visibleLedger.sort((a,b)=>String(b.date).localeCompare(String(a.date))),totals,
    unmatchedPaymentEvents:filterPartnerId?null:unmatchedPaymentEvents,
    note:'Tracking/allocation only: gross recorded amounts, not net payable commissions. Refunds, taxes, fees, settlements and unlinked payment events require review.'};
}
async function oxPromoApi(request,env,url) {
  const path=url.pathname,method=request.method;
  try {
    if(method==='POST' && !oxPromoCheckOrigin(request,url))
      return oxPromoResponse({error:'Invalid request origin.'},403);
    if(path==='/api/promo/sources' && method==='GET') {
      const user=await getCurrentUser(request,env);
      const partners=await env.DB.prepare('SELECT id,channel_name FROM ox_promo_partners WHERE active=1 ORDER BY channel_name').all();
      const selection=user?await env.DB.prepare('SELECT source_type,partner_id,other_source FROM ox_promo_attributions WHERE user_id=?').bind(user.id).first():null;
      return oxPromoResponse({ok:true,partners:partners.results||[],selected:selection||null,loggedIn:!!user});
    }
    if(path==='/api/promo/choose' && method==='POST') {
      const user=await getCurrentUser(request,env);
      if(!user) return oxPromoResponse({error:'Sign in to continue.',code:'LOGIN_REQUIRED'},401);
      const existing=await env.DB.prepare('SELECT user_id FROM ox_promo_attributions WHERE user_id=?').bind(user.id).first();
      if(existing) return oxPromoResponse({ok:true,alreadySelected:true});
      const b=await oxPromoGetBody(request);
      const type=String(b.sourceType||'').trim();
      const partnerId=String(b.partnerId||'').trim();
      const other=String(b.otherSource||'').trim().slice(0,120);
      if(!['owner','partner','other'].includes(type)) return oxPromoResponse({error:'Choose a valid source.'},400);
      if(type==='other' && !other) return oxPromoResponse({error:'Mention the other source.'},400);
      if(type==='partner') {
        const partner=await env.DB.prepare('SELECT id FROM ox_promo_partners WHERE id=? AND active=1').bind(partnerId).first();
        if(!partner) return oxPromoResponse({error:'Channel unavailable.'},400);
      }
      await env.DB.prepare(`INSERT OR IGNORE INTO ox_promo_attributions(user_id,source_type,partner_id,other_source,selected_at)
        VALUES(?,?,?,?,?)`).bind(user.id,type,type==='partner'?partnerId:null,type==='other'?other:'',new Date().toISOString()).run();
      return oxPromoResponse({ok:true,saved:true});
    }
    if(path==='/api/promo/admin/report' && method==='GET') {
      if(!await isAdminAuthenticated(request,env)) return oxPromoResponse({error:'Admin login required.'},401);
      return oxPromoResponse(await oxPromoBuildReport(env,null,true));
    }
    if(path==='/api/promo/admin/create' && method==='POST') {
      if(!await isAdminAuthenticated(request,env)) return oxPromoResponse({error:'Admin only.'},403);
      const b=await oxPromoGetBody(request);
      const channelName=String(b.channelName||'').trim().slice(0,80);
      const login=String(b.loginName||'').trim().toLowerCase();
      const password=String(b.password||'');
      if(channelName.length<2||!/^[a-z][a-z0-9_.-]{2,39}$/.test(login)||password.length<12||password.length>128)
        return oxPromoResponse({error:'Channel name (2+), login (3+ letters/numbers), and password (12–128 characters) are required.'},400);
      const id=crypto.randomUUID(),salt=oxPromoRandomToken(16),now=new Date().toISOString();
      const digest=await oxPromoPasswordDigest(password,salt);
      await env.DB.prepare(`INSERT INTO ox_promo_partners(id,channel_name,login_name,password_salt,password_hash,password_iterations,active,created_at,updated_at)
        VALUES(?,?,?,?,?,?,1,?,?)`).bind(id,channelName,login,salt,digest,OX_PROMO_LOGIN_ITERATIONS,now,now).run();
      return oxPromoResponse({ok:true,id,channelName,loginName:login},201);
    }
    if(path==='/api/promo/admin/update' && method==='POST') {
      if(!await isAdminAuthenticated(request,env)) return oxPromoResponse({error:'Admin only.'},403);
      const b=await oxPromoGetBody(request);
      const id=String(b.id||'').trim();
      const existing=await env.DB.prepare('SELECT id FROM ox_promo_partners WHERE id=?').bind(id).first();
      if(!existing) return oxPromoResponse({error:'Partner not found.'},404);
      const now=new Date().toISOString();
      if(b.active!==undefined) {
        const flag=b.active===true?1:0;
        await env.DB.prepare('UPDATE ox_promo_partners SET active=?,updated_at=? WHERE id=?').bind(flag,now,id).run();
        if(!flag) await env.DB.prepare('DELETE FROM ox_promo_partner_sessions WHERE partner_id=?').bind(id).run();
      }
      const name=String(b.channelName||'').trim();
      if(name) {
        if(name.length<2||name.length>80) return oxPromoResponse({error:'Invalid channel name.'},400);
        await env.DB.prepare('UPDATE ox_promo_partners SET channel_name=?,updated_at=? WHERE id=?').bind(name,now,id).run();
      }
      const pass=String(b.newPassword||'');
      if(pass) {
        if(pass.length<12||pass.length>128) return oxPromoResponse({error:'Password must be 12–128 characters.'},400);
        const salt=oxPromoRandomToken(16),hash=await oxPromoPasswordDigest(pass,salt);
        await env.DB.batch([
          env.DB.prepare('UPDATE ox_promo_partners SET password_salt=?,password_hash=?,password_iterations=?,updated_at=? WHERE id=?').bind(salt,hash,OX_PROMO_LOGIN_ITERATIONS,now,id),
          env.DB.prepare('DELETE FROM ox_promo_partner_sessions WHERE partner_id=?').bind(id)
        ]);
      }
      return oxPromoResponse({ok:true});
    }
    if(path==='/api/promo/partner/login' && method==='POST') {
      const b=await oxPromoGetBody(request),login=String(b.loginName||'').trim().toLowerCase().slice(0,80);
      const pass=String(b.password||'');
      if(!/^[a-z][a-z0-9_.-]{2,39}$/.test(login)||!pass||pass.length>128)
        return oxPromoResponse({error:'Invalid login.'},401);
      const attempted=await env.DB.prepare('SELECT failures,locked_until_ms FROM ox_promo_login_attempts WHERE login_name=?').bind(login).first();
      const now=Date.now();
      if(Number(attempted?.locked_until_ms||0)>now) return oxPromoResponse({error:'Too many attempts. Try again later.'},429);
      const partner=await env.DB.prepare(`SELECT id,channel_name,login_name,password_salt,password_hash,password_iterations
        FROM ox_promo_partners WHERE login_name=? AND active=1`).bind(login).first();
      const digest=await oxPromoPasswordDigest(pass,partner?.password_salt||'unused-salt',partner?.password_iterations||OX_PROMO_LOGIN_ITERATIONS);
      const valid=partner&&oxPromoConstantEqual(digest,partner.password_hash);
      if(!valid) {
        const failed=Number(attempted?.failures||0)+1;
        const locked=failed>=5?now+15*60*1000:0;
        await env.DB.prepare(`INSERT INTO ox_promo_login_attempts(login_name,failures,locked_until_ms) VALUES(?,?,?)
          ON CONFLICT(login_name) DO UPDATE SET failures=excluded.failures,locked_until_ms=excluded.locked_until_ms`)
          .bind(login,locked?0:failed,locked).run();
        return oxPromoResponse({error:'Invalid login credentials.'},401);
      }
      await env.DB.prepare('DELETE FROM ox_promo_login_attempts WHERE login_name=?').bind(login).run();
      const token=oxPromoRandomToken(32),hash=await oxPromoSha(token);
      const expires=new Date(now+24*60*60*1000).toISOString();
      await env.DB.prepare('INSERT INTO ox_promo_partner_sessions(token_hash,partner_id,expires_at,created_at) VALUES(?,?,?,?)')
        .bind(hash,partner.id,expires,new Date().toISOString()).run();
      const cookie=`${OX_PROMO_SESSION_COOKIE}=${token}; Path=/api/promo/partner; Max-Age=86400; HttpOnly; Secure; SameSite=Strict`;
      return oxPromoResponse({ok:true,channelName:partner.channel_name},200,{'set-cookie':cookie});
    }
    if(path==='/api/promo/partner/logout' && method==='POST') {
      const token=oxPromoCookie(request);
      if(token) await env.DB.prepare('DELETE FROM ox_promo_partner_sessions WHERE token_hash=?').bind(await oxPromoSha(token)).run();
      const cookie=`${OX_PROMO_SESSION_COOKIE}=; Path=/api/promo/partner; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
      return oxPromoResponse({ok:true},200,{'set-cookie':cookie});
    }
    if(path==='/api/promo/partner/report' && method==='GET') {
      const partner=await oxPromoPartnerAuth(request,env);
      if(!partner) return oxPromoResponse({error:'Partner login required.'},401);
      const data=await oxPromoBuildReport(env,partner.id,false);
      return oxPromoResponse({...data,viewer:{channelName:partner.channel_name,role:'read-only'}});
    }
    return oxPromoResponse({error:'Not found.'},404);
  } catch(error) {
    console.error('Promotion Partners API error',error);
    return oxPromoResponse({error:'Promotion service unavailable or migration not yet applied.'},500);
  }
}
