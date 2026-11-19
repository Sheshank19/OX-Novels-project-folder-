/* OX V6: asked once for signed-in customers before Dodo Live checkout. */
window.oxPromoGate = async function oxPromoGate() {
  try {
    const response=await fetch('/api/promo/sources',{credentials:'same-origin',cache:'no-store'});
    const data=await response.json();
    if(!response.ok) throw Error(data.error||'Promotion sources are unavailable.');
    if(!data.loggedIn) throw Error('Please sign in to OX Novels first.');
    if(data.selected) return true;
    return await new Promise(resolve=>{
      const layer=document.createElement('div');
      layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');
      layer.setAttribute('aria-label','How did you hear about OX Novels?');
      layer.style.cssText='position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.84);display:flex;align-items:center;justify-content:center;padding:18px';
      const card=document.createElement('section');
      card.style.cssText='width:min(460px,100%);max-height:90vh;overflow:auto;color:#f4f7fb;background:#171d28;border:1px solid #405068;border-radius:18px;padding:24px;box-sizing:border-box;font:15px system-ui;box-shadow:0 18px 60px #000a';
      const title=document.createElement('h2');title.textContent='Where did you hear about OX Novels?';title.style.cssText='margin:0 0 8px;font-size:24px;line-height:1.3';
      const desc=document.createElement('p');desc.textContent='Choose the YouTube channel that introduced you to OX Novels. We ask only once.';desc.style.cssText='color:#b8c5d8;margin-bottom:16px';
      const label=document.createElement('label');label.textContent='Your source';label.style.cssText='display:block;font-weight:600;margin-bottom:7px';
      const select=document.createElement('select');select.setAttribute('aria-label','Promotion source');
      select.style.cssText='width:100%;padding:13px;margin-bottom:12px;color:#fff;background:#263345;border:1px solid #506480;border-radius:9px;font:inherit';
      select.add(new Option('Select a channel or source',''));
      select.add(new Option('OX Novels — Official YouTube','owner'));
      for(const p of data.partners||[]) select.add(new Option(p.channel_name+' — YouTube',p.id));
      select.add(new Option('Other — Please specify','other'));
      const other=document.createElement('input');other.type='text';other.maxLength=120;other.placeholder='Channel, search, or other source';other.setAttribute('aria-label','Other source name');
      other.style.cssText='display:none;width:100%;padding:13px;box-sizing:border-box;margin-bottom:12px;border-radius:9px;font:inherit';
      select.addEventListener('change',()=>{other.style.display=select.value==='other'?'block':'none';});
      const error=document.createElement('p');error.setAttribute('role','alert');error.style.cssText='color:#ffb6b6;min-height:18px';
      const row=document.createElement('div');row.style.cssText='display:flex;gap:10px;justify-content:flex-end';
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.style.cssText='padding:12px 17px;background:transparent;color:#eee;border:1px solid #6d7b91;border-radius:9px';
      const proceed=document.createElement('button');proceed.type='button';proceed.textContent='Continue to payment';proceed.style.cssText='padding:12px 17px;background:#13c3b3;color:#071f1d;border:0;border-radius:9px;font-weight:700';
      let done=false;
      const key=(e)=>{if(e.key==='Escape')finish(false);};
      function finish(ok){if(done)return;done=true;document.removeEventListener('keydown',key);layer.remove();resolve(ok);}
      document.addEventListener('keydown',key);
      cancel.addEventListener('click',()=>finish(false));
      proceed.addEventListener('click',async()=>{
        if(!select.value){error.textContent='Select a source to continue.';return;}
        if(select.value==='other'&&!other.value.trim()){error.textContent='Please name the other source.';return;}
        error.textContent='';proceed.disabled=true;
        try {
          const sourceType=select.value==='owner'?'owner':select.value==='other'?'other':'partner';
          const res=await fetch('/api/promo/choose',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
            body:JSON.stringify({sourceType,partnerId:sourceType==='partner'?select.value:'',otherSource:sourceType==='other'?other.value.trim():''})});
          const r=await res.json();if(!res.ok) throw Error(r.error||'Could not save your answer.');
          finish(true);
        }catch(ex){error.textContent=ex.message||'Unable to save source.';proceed.disabled=false;}
      });
      row.append(cancel,proceed);card.append(title,desc,label,select,other,error,row);layer.append(card);document.body.append(layer);select.focus();
    });
  } catch(err) {
    if(typeof showToast==='function')showToast(err.message||'Source confirmation unavailable.');
    else alert(err.message||'Source confirmation unavailable.');
    return false;
  }
};
