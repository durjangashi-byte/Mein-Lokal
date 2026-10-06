/* Qonto bank sync UI. Credentials never enter the browser. */
(function(){
 const escQ=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dateQ=t=>t?String(t).slice(0,10):'';
 const eurQ=n=>Number(n||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
 function suggested(t){return t?.raw?.suggested_category||'sonstiges'}
 const PRIVATE_CATS=['Geliehen / Geldtransfer','Shopping','Essen privat','Familie','Versicherung','Mobilfunk','Tabakwaren','Online / Abos','Sonstiges privat'];
 function privateCat(t){const s=((t.label||'')+' '+(t.reference||'')).toLowerCase();if(s.includes('geliehen'))return 'Geliehen / Geldtransfer';if(/zara|tk maxx|jd sports|otto|panda design/.test(s))return 'Shopping';if(/mcdonald|masterkoefte|masterköfte/.test(s))return 'Essen privat';if(/babyone/.test(s))return 'Familie';if(/versicherung|alexander melnik/.test(s))return 'Versicherung';if(/ortel/.test(s))return 'Mobilfunk';if(/dietz|tabak/.test(s))return 'Tabakwaren';if(/joyclub|pm international|liberty/.test(s))return 'Online / Abos';return 'Sonstiges privat'}
 function classification(t){return t.classification||'unklar'}
 function privateSummary(data){const rows=(data||[]).filter(t=>classification(t)==='privat'&&t.side==='debit');const by={};let total=0;rows.forEach(t=>{const k=t.private_category||privateCat(t),a=Number(t.amount||0);total+=a;by[k]=(by[k]||0)+a});return {rows,total,by}}
 function renderPrivate(data){const el=document.getElementById('qonto-private');if(!el)return;const s=privateSummary(data);const cats=Object.entries(s.by).sort((a,b)=>b[1]-a[1]);el.innerHTML='<div class="sec-hd">Privater Geldabfluss</div><div class="totals-card"><div class="t-row"><span>Privat gesamt</span><strong class="amtr">'+eurQ(s.total)+'</strong></div><div class="t-row"><span>Private Buchungen</span><strong>'+s.rows.length+'</strong></div></div>'+(cats.length?'<div class="card">'+cats.map(([k,v])=>'<div class="setting-row"><div><div class="setting-lbl">'+escQ(k)+'</div></div><strong>'+eurQ(v)+'</strong></div>').join('')+'</div>':'<div class="empty"><p>Noch keine privaten Buchungen klassifiziert</p></div>')}
 function duplicate(t){const d=dateQ(t.settled_at||t.emitted_at),a=Number(t.amount);return t.side==='debit'?D.aus.some(x=>x.datum===d&&Math.abs(Number(x.betrag)-a)<.01):D.ein.some(x=>x.datum===d&&Math.abs(Number(x.bar)-a)<.01)}
 function install(){
  const more=document.querySelector('#p-mehr .more-menu'); if(!more||document.getElementById('p-bank'))return;
  const btn=document.createElement('button');btn.type='button';btn.className='more-link';btn.onclick=()=>switchTab('bank');
  btn.innerHTML='<span>🏦</span><span><strong>Bank · Qonto</strong><small>Kontobewegungen synchronisieren und übernehmen</small></span><span class="more-arrow">›</span>';
  more.insertBefore(btn,more.lastElementChild);
  const panel=document.createElement('div');panel.className='panel';panel.id='p-bank';
  panel.innerHTML='<div class="sec-hd">Bank · Qonto</div><div class="card"><div class="card-hd">🏦 Qonto Verbindung</div><div style="padding:14px 16px"><p class="summary-note" id="qonto-status">Bereit. Zugangsdaten werden ausschließlich serverseitig gespeichert.</p></div><button class="btn-primary" id="qonto-sync-btn" onclick="qontoSync()">Jetzt synchronisieren</button></div><div id="qonto-summary"></div><div class="sec-hd">Noch nicht übernommene Bankbewegungen</div><div id="qonto-list"><div class="empty"><p>Noch nicht geladen</p></div></div>';
  panel.innerHTML=panel.innerHTML.replace('<div id="qonto-summary"></div>','<div id="qonto-summary"></div><div id="qonto-private"></div>');
  document.querySelector('.content')?.appendChild(panel);
 }
 async function load(){
  if(!SB||!authUser)return;
  const {data,error}=await SB.from('qonto_transactions').select('*').order('settled_at',{ascending:false}).limit(300);
  const list=document.getElementById('qonto-list');if(!list)return;
  if(error){list.innerHTML='<div class="empty"><p>'+escQ(error.message)+'</p></div>';return}
  renderPrivate(data||[]);
  const open=(data||[]).filter(t=>!t.imported_kind&&!t.ignored&&classification(t)==='unklar');
  document.getElementById('qonto-summary').innerHTML='<div class="totals-card"><div class="t-row"><span>Bankbewegungen geladen</span><strong>'+data.length+'</strong></div><div class="t-row"><span>Noch zu prüfen</span><strong>'+open.length+'</strong></div></div>';
  if(!open.length){list.innerHTML='<div class="empty"><p>Alles geprüft ✓</p></div>';return}
  list.innerHTML=open.map(t=>{const dup=duplicate(t),debit=t.side==='debit',label=t.label||t.reference||'Bankbewegung';return '<div class="payment-card"><div class="payment-top"><h3>'+escQ(label)+'</h3><strong class="'+(debit?'amtr':'amtg')+'">'+(debit?'-':'+')+eurQ(t.amount)+'</strong></div><p>'+escQ(dateQ(t.settled_at||t.emitted_at))+' · '+(debit?'Ausgang':'Eingang')+(dup?' · ⚠️ möglicher Doppeleintrag':'')+'</p>'+(t.reference?'<p>'+escQ(t.reference)+'</p>':'')+'<div class="payment-actions">'+(debit?'<button class="edit-btn" onclick="qontoImport(\''+escQ(t.id)+'\',\'aus\')">Als Ausgabe übernehmen</button>':'<button class="edit-btn" onclick="qontoImport(\''+escQ(t.id)+'\',\'ein\')">Als Einnahme übernehmen</button>')+'<button class="edit-btn" onclick="qontoClassify(\''+escQ(t.id)+'\',\'betrieblich\')">Betrieblich</button><button class="edit-btn" onclick="qontoClassify(\''+escQ(t.id)+'\',\'privat\')">Privat</button><button class="edit-btn" onclick="qontoIgnore(\''+escQ(t.id)+'\')">Ignorieren</button></div></div>'}).join('');
 }
 window.qontoSync=async function(){
  const b=document.getElementById('qonto-sync-btn'),s=document.getElementById('qonto-status');if(!SB||!authUser)return;
  b.disabled=true;s.textContent='Qonto wird synchronisiert …';
  try{const {data,error}=await SB.functions.invoke('qonto-sync',{body:{action:'sync'}});if(error){let m=error.message;try{m=(await error.context.json()).error||m}catch{}throw new Error(m)};s.textContent='Synchronisiert: '+(data.synced||0)+' Bewegungen aus '+(data.accounts||0)+' Konto/Konten.';await load()}catch(e){s.textContent=e.message||String(e)}finally{b.disabled=false}
 };
 window.qontoImport=async function(id,kind){
  const {data:t,error}=await SB.from('qonto_transactions').select('*').eq('id',id).single();if(error||!t)return;
  if(duplicate(t)&&!confirm('Es gibt bereits einen Eintrag mit gleichem Datum und Betrag. Trotzdem übernehmen?'))return;
  const datum=dateQ(t.settled_at||t.emitted_at)||today(), amount=Number(t.amount), desc=(t.label||t.reference||'Qonto').slice(0,180);
  const row=kind==='aus'?{id:newId(),datum,kat:suggested(t),beschr:desc,betrag:amount,rechnung_id:null}:{id:newId(),datum,bar:amount,karte:0,tip:0,gaeste:0,notiz:'Qonto Bankeingang: '+desc};
  if(!await persistChange('insert',kind,row))return;
  const {error:u}=await SB.from('qonto_transactions').update({imported_kind:kind,imported_id:row.id,updated_at:new Date().toISOString()}).eq('id',id);if(u){toast('Buchung übernommen, Bankstatus konnte nicht markiert werden.','a');return}
  savedToast('Qonto-Buchung übernommen');await load();
 };
 window.qontoClassify=async function(id,kind){const patch={classification:kind,updated_at:new Date().toISOString()};if(kind==='privat'){const {data:t}=await SB.from('qonto_transactions').select('label,reference').eq('id',id).single();patch.private_category=privateCat(t||{})}else patch.private_category=null;const {error}=await SB.from('qonto_transactions').update(patch).eq('id',id);if(error)toast(error.message,'r');else{savedToast(kind==='privat'?'Als privat markiert':'Als betrieblich markiert');load()}};
 window.qontoIgnore=async function(id){const {error}=await SB.from('qonto_transactions').update({ignored:true,updated_at:new Date().toISOString()}).eq('id',id);if(error)toast(error.message,'r');else load()};
 const oldSwitch=window.switchTab;
 const hook=()=>{install();const orig=window.switchTab;if(typeof orig==='function'&&!orig.__qonto){const wrapped=function(name){const r=orig.apply(this,arguments);if(name==='bank')load();return r};wrapped.__qonto=true;window.switchTab=wrapped}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(hook,0));else setTimeout(hook,0);
 window.addEventListener('load',()=>setTimeout(hook,0));
})();