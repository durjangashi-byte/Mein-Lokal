/* Qonto bank sync UI. Credentials never enter the browser. */
(function(){
 const escQ=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dateQ=t=>t?String(t).slice(0,10):'';
 const bookingDate=t=>typeof qontoBookingDate==='function'?qontoBookingDate(t):dateQ(t.settled_at||t.emitted_at);
 let bankRows=[];
 const eurQ=n=>Number(n||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
 function suggested(t){return t?.raw?.suggested_category||'sonstiges'}
 const PRIVATE_CATS=['Geliehen / Geldtransfer','Shopping','Essen privat','Familie','Versicherung','Mobilfunk','Tabakwaren','Online / Abos','Sonstiges privat'];
 function privateCat(t){const s=((t.label||'')+' '+(t.reference||'')).toLowerCase();if(s.includes('geliehen'))return 'Geliehen / Geldtransfer';if(/zara|tk maxx|jd sports|otto|panda design/.test(s))return 'Shopping';if(/mcdonald|masterkoefte|masterköfte/.test(s))return 'Essen privat';if(/babyone/.test(s))return 'Familie';if(/versicherung|alexander melnik/.test(s))return 'Versicherung';if(/ortel/.test(s))return 'Mobilfunk';if(/dietz|tabak/.test(s))return 'Tabakwaren';if(/joyclub|pm international|liberty/.test(s))return 'Online / Abos';return 'Sonstiges privat'}
 function classification(t){return t.classification||'unklar'}
 function privateSummary(data){const rows=(data||[]).filter(t=>classification(t)==='privat'&&t.side==='debit');const by={};let total=0;rows.forEach(t=>{const k=t.private_category||privateCat(t),a=Number(t.amount||0);total+=a;by[k]=(by[k]||0)+a});return {rows,total,by}}
 function renderPrivate(data){const selected=typeof dashboardPeriod==='undefined'?'':dashboardPeriod;data=(data||[]).filter(t=>t.status==='completed'&&(!selected||(typeof qontoBookingDate==='function'?qontoBookingDate(t):dateQ(t.settled_at||t.emitted_at)).startsWith(selected)));const el=document.getElementById('qonto-private');if(!el)return;const s=privateSummary(data),income=(data||[]).filter(t=>classification(t)==='privat'&&t.side==='credit').reduce((sum,t)=>sum+Math.round(Number(t.amount)*100),0)/100;const cats=Object.entries(s.by).sort((a,b)=>b[1]-a[1]);el.innerHTML='<div class="sec-hd">Private Einnahmen & Ausgaben</div><p class="summary-note">Zeitraum der Übersicht: '+escQ(selected||'alle Monate')+' · Einlagen und Entnahmen sind getrennt vom betrieblichen Ergebnis.</p><div class="totals-card"><div class="t-row"><span>Private Ausgaben</span><strong class="amtr">'+eurQ(s.total)+'</strong></div><div class="t-row"><span>Private Einnahmen</span><strong class="amtg">'+eurQ(income)+'</strong></div><div class="t-row"><span>Private Buchungen</span><strong>'+(s.rows.length+(data||[]).filter(t=>classification(t)==='privat'&&t.side==='credit').length)+'</strong></div></div>'+(cats.length?'<div class="card">'+cats.map(([k,v])=>'<div class="setting-row"><div><div class="setting-lbl">'+escQ(k)+'</div></div><strong>'+eurQ(v)+'</strong></div>').join('')+'</div>':'<div class="empty"><p>Noch keine privaten Buchungen klassifiziert</p></div>')}
 const importing=new Set();
 let loadVersion=0;
 const current=(client,user)=>SB===client&&authUser===user&&!!user;
 function matchingExpenses(t){
  if(t.side!=='debit')return [];
  const day=Date.parse(bookingDate(t)+'T12:00:00Z'),cents=Math.round(Number(t.amount)*100);
  if(!Number.isFinite(day)||!Number.isSafeInteger(cents)||cents<=0)return [];
  const linked=new Set([...bankRows,...(D.privat||[])].filter(q=>q.id!==t.id&&q.imported_kind==='aus'&&q.imported_id!=null).map(q=>Number(q.imported_id)));
  const words=String(t.label||'').toLocaleLowerCase('de-DE').match(/[a-zäöüß0-9]{3,}/g)||[];
  const score=x=>words.filter(word=>String(x.beschr||'').toLocaleLowerCase('de-DE').includes(word)).length;
  return (D.aus||[]).filter(x=>![...String(x.beschr||'').matchAll(/\[Qonto:([^\]]+)\]/gi)].some(m=>m[1].toLowerCase()!==String(t.id).toLowerCase())&&!linked.has(x.id)&&Number.isSafeInteger(x.id)&&Math.round(Number(x.betrag)*100)===cents&&Math.abs(Date.parse(x.datum+'T12:00:00Z')-day)<=7*86400000).sort((a,b)=>score(b)-score(a)||Math.abs(Date.parse(a.datum)-day)-Math.abs(Date.parse(b.datum)-day)||a.id-b.id);
 }
 const callQ=(name,...args)=>escQ(name+'('+args.map(x=>JSON.stringify(x)).join(',')+')');
 function matchProposal(t){
  const matches=matchingExpenses(t);if(!matches.length)return '';
  return '<div class="qonto-matches"><p class="summary-note">Mögliche vorhandene Buchung · gleicher Betrag, Datum bis zu 7 Tage abweichend. Eine Verknüpfung erstellt keine weitere Ausgabe.</p>'+matches.map(a=>'<div class="payment-card"><p style="overflow-wrap:anywhere">'+escQ(a.datum)+' · '+escQ(a.beschr||'Ausgabe')+' · '+eurQ(a.betrag)+'</p><button type="button" class="edit-btn" onclick="'+callQ('qontoLink',t.id,a.id)+'">Mit dieser Ausgabe verknüpfen</button></div>').join('')+'</div>';
 }
 function isCardPayout(t){
  if(t?.side!=='credit')return false;
  const text=[t.label,t.reference,t.raw?.label,t.raw?.reference].filter(Boolean).join(' ').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ');
  return /zahlungen vor ort|angeforderte zahlungen|kartenauszahlung|kartenabrechnung|card payout|card settlement/.test(text);
 }
 window.isQontoCardPayout=isCardPayout;
 function cardReconciliation(data){
  const payouts=(data||[]).filter(isCardPayout).sort((a,b)=>dateQ(a.settled_at).localeCompare(dateQ(b.settled_at)));
  const income=(D.ein||[]).filter(e=>Number(e.karte)>0).map(e=>({...e,_used:false}));
  return payouts.map(p=>{
   const pd=new Date(dateQ(p.settled_at)+'T12:00:00'), amount=Math.round(Number(p.amount)*100);
   const candidates=income.filter(e=>!e._used&&new Date(e.datum+'T12:00:00')<=pd&&(pd-new Date(e.datum+'T12:00:00'))/86400000<=7);
   let chosen=null;
   for(let mask=1;mask<(1<<Math.min(candidates.length,12));mask++){let sum=0,rows=[];for(let i=0;i<Math.min(candidates.length,12);i++)if(mask&(1<<i)){sum+=Math.round(Number(candidates[i].karte)*100);rows.push(candidates[i])}if(sum===amount){chosen=rows;break}}
   if(chosen)chosen.forEach(e=>e._used=true);
   return {p,chosen};
  });
 }
 function renderCardReconciliation(data){
  const el=document.getElementById('qonto-card-check');if(!el)return;
  const rows=cardReconciliation(data), matched=rows.filter(x=>x.chosen).length;
  el.innerHTML='<div class="sec-hd">Kartenabgleich</div><div class="totals-card"><div class="t-row"><span>Qonto-Auszahlungen abgeglichen</span><strong>'+matched+' / '+rows.length+'</strong></div></div><div class="card">'+rows.slice().reverse().map(x=>{const p=x.p;return '<div class="setting-row"><div><div class="setting-lbl">'+escQ(dateQ(p.settled_at))+' · '+eurQ(p.amount)+'</div><div class="setting-sub">'+(x.chosen?'✓ passt zu '+x.chosen.map(e=>escQ(e.datum)+' · Karte '+eurQ(e.karte)).join(' + '):'Noch keine passende Kartenerfassung')+'</div></div><strong class="'+(x.chosen?'amtg':'ca')+'">'+(x.chosen?'✓':'Prüfen')+'</strong></div>'}).join('')+'</div>';
 } function internalTransfer(t){return t?.raw?.lokal_internal_transfer===true}
 function bankStatus(t){return internalTransfer(t)?'Interne Umbuchung · ergebnisneutral':isCardPayout(t)?'Kartenauszahlung · im Tagesumsatz enthalten':classification(t)==='privat'?'Privat':t.imported_kind||t.imported_id?'Bereits gebucht':t.ignored?'Ignoriert':classification(t)==='betrieblich'?'Betrieblich · noch zu übernehmen':'Zuordnung offen'}
 window.resetQontoBank=function(){bankRows=[];loadVersion++;for(const id of ['qonto-list','qonto-history','qonto-summary','qonto-card-check','qonto-private'])document.getElementById(id)?.replaceChildren();};
 window.resetQontoHistory=function(){document.getElementById('qonto-history-month').value='';document.getElementById('qonto-history-query').value='';window.renderQontoHistory()};
 window.renderQontoHistory=function(){
  const target=document.getElementById('qonto-history');if(!target)return;
  const query=(document.getElementById('qonto-history-query')?.value||'').trim().toLocaleLowerCase('de-DE'),month=document.getElementById('qonto-history-month')?.value||'';
  const rows=bankRows.filter(t=>(!month||bookingDate(t).startsWith(month))&&(!query||[t.label,t.reference,t.bank_account_id,bookingDate(t),bankStatus(t),eurQ(t.amount),String(t.amount)].join(' ').toLocaleLowerCase('de-DE').includes(query)));
  const total=side=>rows.filter(t=>t.side===side).reduce((sum,t)=>sum+Math.round(Number(t.amount)*100),0)/100;
  target.innerHTML='<p class="summary-note">'+rows.length+' / '+bankRows.length+' Bankbewegungen · Eingänge '+eurQ(total('credit'))+' · Ausgänge '+eurQ(total('debit'))+'. Bankbewegungen sind keine zusätzliche Umsatzberechnung. Offene Zuordnungen fließen nach ihrer Prüfung ins passende Ergebnis ein.</p>'+rows.map(t=>'<div class="payment-card"><div class="payment-top"><h3 style="overflow-wrap:anywhere">'+escQ(t.label||t.reference||'Bankbewegung')+'</h3><strong class="'+(t.side==='credit'?'amtg':'amtr')+'">'+(t.side==='credit'?'+':'−')+eurQ(t.amount)+'</strong></div><p>'+escQ(bookingDate(t))+' · '+escQ(bankStatus(t))+'</p>'+(t.reference?'<p style="overflow-wrap:anywhere">'+escQ(t.reference)+'</p>':'')+'</div>').join('');
 };
 function install(){
  const more=document.querySelector('#p-mehr .more-menu'); if(!more||document.getElementById('p-bank'))return;
  const btn=document.createElement('button');btn.type='button';btn.className='more-link';btn.onclick=()=>switchTab('bank');
  btn.innerHTML='<span>🏦</span><span><strong>Bank · Qonto</strong><small>Kontobewegungen synchronisieren und übernehmen</small></span><span class="more-arrow">›</span>';
  more.insertBefore(btn,more.lastElementChild);
  const panel=document.createElement('div');panel.className='panel';panel.id='p-bank';
  panel.innerHTML='<div class="sec-hd">Bank · Qonto</div><div class="card"><div class="card-hd">🏦 Qonto Verbindung</div><div style="padding:14px 16px"><p class="summary-note" id="qonto-status">Bereit. Zugangsdaten werden ausschließlich serverseitig gespeichert.</p></div><button class="btn-primary" id="qonto-sync-btn" onclick="qontoSync()">Jetzt synchronisieren</button></div><div id="qonto-summary"></div><div class="sec-hd">Noch nicht übernommene Bankbewegungen</div><div id="qonto-list"><div class="empty"><p>Noch nicht geladen</p></div></div><div class="sec-hd">Alle Bankbewegungen</div><div class="booking-tools"><div class="field"><label for="qonto-history-query">Bankbewegungen durchsuchen</label><input id="qonto-history-query" type="search" placeholder="Empfänger, Datum, Betrag, Zuordnung …" oninput="renderQontoHistory()"></div><div class="field"><label for="qonto-history-month">Monat</label><input id="qonto-history-month" type="month" onchange="renderQontoHistory()"></div><button type="button" class="edit-btn" onclick="resetQontoHistory()">Alle Monate</button></div><div id="qonto-history"></div>';
  panel.innerHTML=panel.innerHTML.replace('<div id="qonto-summary"></div>','<div id="qonto-summary"></div><div id="qonto-card-check"></div><div id="qonto-private"></div>');
  document.querySelector('.content')?.appendChild(panel);
 }
 window.renderPrivateOutflows=()=>{
  renderPrivate(typeof D!=='undefined'?D.privat||[]:[]);
  const el=document.getElementById('qonto-private');if(!el||typeof privateItems!=='function')return;
  const selected=typeof dashboardPeriod==='undefined'?'':dashboardPeriod;
  el.innerHTML+=privateItems(selected).slice().sort((a,b)=>b.datum.localeCompare(a.datum)).map(r=>'<div class="payment-card"><div class="payment-top"><h3 style="overflow-wrap:anywhere">'+escQ(r.beschreibung)+'</h3><strong class="'+(r.art==='credit'?'amtg':'amtr')+'">'+(r.art==='credit'?'+':'−')+eurQ(r.betrag)+'</strong></div><p>'+escQ(r.datum)+' · '+escQ(r.kategorie)+'</p></div>').join('');
 };
 async function load(){
  if(!SB||!authUser)return;
  const client=SB,user=authUser,version=++loadVersion;
  const data=[];let error;
  for(let offset=0;;offset+=1000){
   const result=await client.from('qonto_transactions').select('*').order('id').range(offset,offset+999);
   if(!current(client,user)||version!==loadVersion)return;
   if(result.error){error=result.error;break}
   data.push(...(result.data||[]));if((result.data||[]).length<1000)break;
  }
  const list=document.getElementById('qonto-list');if(!list||!current(client,user)||version!==loadVersion)return;
  if(error){list.innerHTML='<div class="empty"><p>'+escQ(error.message)+'</p></div>';return}
  data.sort((a,b)=>String(b.settled_at||b.emitted_at||'').localeCompare(String(a.settled_at||a.emitted_at||'')));
  bankRows=data;window.renderQontoHistory();
  window.renderPrivateOutflows();
  renderCardReconciliation(data||[]);
  const open=(data||[]).filter(t=>!t.imported_kind&&!t.imported_id&&!t.ignored&&classification(t)!=='privat'&&!isCardPayout(t)&&!internalTransfer(t)&&!(D.bank||[]).some(r=>r.qonto_transaction_id===t.id));
  document.getElementById('qonto-summary').innerHTML='<div class="totals-card"><div class="t-row"><span>Bankbewegungen geladen</span><strong>'+data.length+'</strong></div><div class="t-row"><span>Noch zu prüfen</span><strong>'+open.length+'</strong></div></div>';
  if(!open.length){list.innerHTML='<div class="empty"><p>Alles geprüft ✓</p></div>';return}
  list.innerHTML=open.map(t=>{const matches=matchingExpenses(t),debit=t.side==='debit',label=t.label||t.reference||'Bankbewegung';return '<div class="payment-card"><div class="payment-top"><h3 style="overflow-wrap:anywhere">'+escQ(label)+'</h3><strong class="'+(debit?'amtr':'amtg')+'">'+(debit?'-':'+')+eurQ(t.amount)+'</strong></div><p>'+escQ(bookingDate(t))+' · '+(debit?'Ausgang':'Eingang')+(matches.length?' · mögliche vorhandene Ausgabe':'')+'</p>'+(t.reference?'<p style="overflow-wrap:anywhere">'+escQ(t.reference)+'</p>':'')+matchProposal(t)+'<div class="payment-actions">'+(debit?'<button type="button" class="edit-btn" onclick="'+callQ('qontoImport',t.id,'aus',matches.length>0)+'">'+(matches.length?'Separate Ausgabe neu buchen':'Als Ausgabe übernehmen')+'</button>':'<button type="button" class="edit-btn" onclick="'+callQ('qontoImport',t.id,'sonstige')+'">Als sonstige Einnahme übernehmen</button>')+'<button type="button" class="edit-btn" onclick="'+callQ('qontoClassify',t.id,'betrieblich')+'">Betrieblich</button><button type="button" class="edit-btn" onclick="'+callQ('qontoClassify',t.id,'privat')+'">Privat</button><button type="button" class="edit-btn" onclick="'+callQ('qontoIgnore',t.id)+'">Ignorieren</button></div></div>'}).join('');
 }
 window.qontoSync=async function(){
  const b=document.getElementById('qonto-sync-btn'),s=document.getElementById('qonto-status');if(!SB||!authUser||b?.disabled)return;
  const client=SB,user=authUser;
  if(b)b.disabled=true;if(s)s.textContent='Qonto wird synchronisiert …';
  try{
   const {data,error}=await client.functions.invoke('qonto-sync',{body:{action:'sync'}});
   if(!current(client,user))return;
   if(error){let m=error.message;try{m=(await error.context.json()).error||m}catch{}throw new Error(m)}
   await syncEngine?.sync();if(!current(client,user))return;
   if(s)s.textContent='Synchronisiert: '+(data?.synced||0)+' Bewegungen aus '+(data?.accounts||0)+' Konto/Konten.';
   await load();
  }catch(e){if(current(client,user)&&s)s.textContent=e.message||String(e)}finally{if(b)b.disabled=false}
 };
 window.qontoLink=async function(id,expenseId){
  if(!SB||!authUser||importing.has(id))return;
  const t=bankRows.find(q=>q.id===id),a=t&&matchingExpenses(t).find(x=>x.id===expenseId);
  if(!a){toast('Vorschlag nicht mehr aktuell. Bitte Bankbewegungen neu laden.','a');return;}
  if(!confirm('Qonto: '+(t.label||'Bankbewegung')+' · '+bookingDate(t)+' · '+eurQ(t.amount)+'\nMit vorhandener Ausgabe verknüpfen: '+(a.beschr||'Ausgabe')+' · '+a.datum+' · '+eurQ(a.betrag)+'?\nEs wird keine zusätzliche Ausgabe angelegt.'))return;
  await window.qontoImport(id,'aus',false,expenseId);
 };
 window.qontoImport=async function(id,kind,allowNew=false,expenseId=null){
  if(!SB||!authUser||importing.has(id))return;
  const client=SB,user=authUser;importing.add(id);
  try{
   const {data:t,error}=await client.from('qonto_transactions').select('*').eq('id',id).single();
   if(!current(client,user))return;
   if(error)throw error;
   if(!t)return;
   if(t.imported_kind||t.imported_id||t.ignored||classification(t)==='privat'){toast('Diese Bankbewegung kann nicht erneut übernommen werden.','a');return;}
   if(internalTransfer(t)){toast('Interne Umbuchungen bleiben ergebnisneutral.','a');return;}
   if(isCardPayout(t)){toast('Kartenauszahlungen sind bereits im Tagesumsatz erfasst.','a');return;}
   if(t.side==='credit'){
    const {error:rpcError}=await client.rpc('lokal_import_qonto_income',{p_transaction_id:id});
    if(!current(client,user))return;
    if(rpcError)throw rpcError;
    await syncEngine?.sync();
    if(!current(client,user))return;
    savedToast('Sonstige Bankeinnahme übernommen');await load();return;
   }
   if(t.side!=='debit'||kind!=='aus')return;
   if(expenseId===null&&matchingExpenses(t).length&&!allowNew){toast('Bitte eine vorhandene Ausgabe verknüpfen oder ausdrücklich separat neu buchen.','a');await load();return;}
   if(expenseId===null&&allowNew&&!confirm('Trotz möglicher vorhandener Buchung eine separate neue Ausgabe über '+eurQ(t.amount)+' anlegen? Diese zusätzliche Ausgabe verringert das Ergebnis erneut.'))return;
   if(syncEngine?.pending?.()?.length){await syncEngine.sync();if(!current(client,user))return;if(syncEngine.pending().length)throw new Error('Bitte ausstehende Änderungen zuerst synchronisieren.');}
   const {error:rpcError}=await client.rpc('lokal_import_qonto_expense',{p_transaction_id:id,p_expense_id:expenseId,p_allow_new:allowNew===true});
   if(!current(client,user))return;
   if(rpcError)throw rpcError;
   await syncEngine?.sync();if(!current(client,user))return;
   savedToast(expenseId===null?'Qonto-Ausgabe gebucht':'Mit vorhandener Ausgabe verknüpft');await load();
  }catch(e){if(current(client,user)){toast(e.message||String(e),'r');await load();}}finally{importing.delete(id);}
 };
 window.qontoClassify=async function(id,kind){
  if(!SB||!authUser||importing.has(id)||!['privat','betrieblich'].includes(kind))return;
  const client=SB,user=authUser;importing.add(id);
  try{
   const {data:t,error:readError}=await client.from('qonto_transactions').select('*').eq('id',id).single();
   if(!current(client,user))return;if(readError)throw readError;
   if(!t||t.imported_kind||t.imported_id||t.ignored||internalTransfer(t))return;
   const patch={classification:kind,private_category:kind==='privat'?privateCat(t):null,updated_at:new Date().toISOString()};
   const {data,error}=await client.from('qonto_transactions').update(patch).eq('id',id).is('imported_kind',null).is('imported_id',null).eq('ignored',false).select('id');
   if(!current(client,user))return;if(error)throw error;
   if(!data?.length)toast('Bankbewegung wurde inzwischen geändert oder übernommen. Bitte neu prüfen.','a');else savedToast(kind==='privat'?'Als privat markiert':'Als betrieblich markiert');
   await syncEngine?.sync();if(current(client,user))await load();
  }catch(e){if(current(client,user))toast(e.message||String(e),'r');}finally{importing.delete(id);}
 };
 window.qontoIgnore=async function(id){
  if(!SB||!authUser||importing.has(id))return;
  const client=SB,user=authUser;importing.add(id);
  try{
   const {data:t,error:readError}=await client.from('qonto_transactions').select('*').eq('id',id).single();
   if(!current(client,user))return;if(readError)throw readError;
   if(!t||t.imported_kind||t.imported_id)return;
   const {data,error}=await client.from('qonto_transactions').update({ignored:true,updated_at:new Date().toISOString()}).eq('id',id).is('imported_kind',null).is('imported_id',null).eq('ignored',false).select('id');
   if(!current(client,user))return;if(error)throw error;
   if(!data?.length)toast('Bankbewegung wurde inzwischen geändert oder übernommen. Bitte neu prüfen.','a');
   await load();
  }catch(e){if(current(client,user))toast(e.message||String(e),'r');}finally{importing.delete(id);}
 };
 const oldSwitch=window.switchTab;
 const hook=()=>{install();window.renderPrivateOutflows();const orig=window.switchTab;if(typeof orig==='function'&&!orig.__qonto){const wrapped=function(name){const r=orig.apply(this,arguments);if(name==='bank')load();return r};wrapped.__qonto=true;window.switchTab=wrapped}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(hook,0));else setTimeout(hook,0);
 window.addEventListener('load',()=>setTimeout(hook,0));
})();