/* Darlehen-Übersicht: Restschuld, Raten, zinsfreie Frist und nötige Monatsrate.
   Raten sind normale Schuldenzahlungen (ausgaben, kat=schulden), erkannt am Muster des Darlehens.
   Bei Verrechnung (Automaten-Einnahmen gehen direkt an den Gläubiger) wird zusätzlich dieselbe Summe
   als sonstige betriebliche Einnahme gebucht: Einnahme und Tilgung heben sich im Ergebnis auf. */
(function(){
 const LOANS=[{
  key:'ds',name:'D&S Automaten GmbH',kurz:'Darlehen D&S Automaten',betrag:10000,auszahlung:'2026-05-06',zinsfreiMonate:12,zins:7.2,
  match:/d\s*&\s*s|automaten/i,verrechnung:true,
  einnahmeText:'Automaten-Einnahmen D&S (mit Darlehen verrechnet)',
  hinweis:'Die Automaten-Einnahmen gehen direkt als Rate an D&S. Datum und Betrag stehen auf dem Abrechnungsschein.'
 }];
 const DAY=86400000,MONTH=30.4375;
 const cents=v=>Math.round(Number(v)*100);
 const addMonths=(iso,n)=>{const [y,m,d]=iso.split('-').map(Number);const t=new Date(Date.UTC(y,m-1+n,d));return t.toISOString().slice(0,10);};
 const days=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/DAY);
 const dmy=s=>{const [y,m,d]=s.split('-');return d+'.'+m+'.'+y;};
 let busy=false;

 function rates(loan,rows){return rows.filter(a=>a.kat==='schulden'&&loan.match.test(a.beschr||'')).sort((a,b)=>a.datum.localeCompare(b.datum)||a.id-b.id);}
 // Pure calculation, also used by tests.
 function status(loan,rows,stichtag){
  const list=rates(loan,rows),getilgt=list.reduce((s,a)=>s+cents(a.betrag),0)/100;
  const rest=Math.max(0,Math.round((loan.betrag-getilgt)*100)/100);
  const frist=addMonths(loan.auszahlung,loan.zinsfreiMonate);
  const tageBis=days(stichtag,frist),monateBis=Math.max(0,tageBis/MONTH);
  const monateSeit=Math.max(1,days(loan.auszahlung,stichtag)/MONTH);
  const schnitt=Math.round(getilgt/monateSeit*100)/100;
  const noetig=rest<=0?0:tageBis<=0?rest:Math.round(rest/Math.max(1,monateBis)*100)/100;
  const prognoseRest=rest<=0?0:Math.max(0,Math.round((rest-schnitt*monateBis)*100)/100);
  const zinsJahr=Math.round(prognoseRest*loan.zins)/100;
  const lage=rest<=0?'fertig':tageBis<=0?'zins':schnitt>=noetig?'gut':'knapp';
  return {list,getilgt,rest,frist,tageBis,monateBis,schnitt,noetig,prognoseRest,zinsJahr,lage,anteil:Math.min(1,getilgt/loan.betrag)};
 }

 function css(){
  if(document.getElementById('loan-style'))return;const s=document.createElement('style');s.id='loan-style';
  s.textContent='.loan-card{margin:0 14px 12px;padding:16px;background:var(--bg1);border:1px solid var(--border);border-radius:var(--r)}.loan-top{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}.loan-top h3{font-size:15px}.loan-top small{font-size:13px;color:var(--text2)}.loan-rest{font-size:30px;font-weight:800;letter-spacing:-.02em;margin:10px 0 2px;font-variant-numeric:tabular-nums}.loan-sub{font-size:13px;color:var(--text2)}.loan-bar{height:10px;border-radius:99px;background:var(--bg3);overflow:hidden;margin:12px 0 6px}.loan-bar i{display:block;height:100%;border-radius:99px;background:var(--green);transition:width .4s}.loan-legend{display:flex;justify-content:space-between;font-size:13px;color:var(--text2)}.loan-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.loan-tile{background:var(--bg2);border:1px solid var(--border);border-radius:var(--rsm);padding:10px 12px}.loan-tile span{display:block;font-size:13px;color:var(--text2)}.loan-tile strong{display:block;font-size:17px;margin-top:3px;font-variant-numeric:tabular-nums}.loan-note{margin-top:12px;padding:10px 12px;border-radius:var(--rsm);font-size:13px;line-height:1.5;border:1px solid var(--border)}.loan-note.gut,.loan-note.fertig{border-color:var(--green)}.loan-note.knapp{border-color:var(--amber)}.loan-note.zins{border-color:var(--red)}.loan-form{margin-top:14px;border-top:1px solid var(--border);padding-top:12px}.loan-form .field{padding-left:0;padding-right:0}.loan-check{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:var(--text2);margin:4px 0 10px;line-height:1.45}.loan-check input{width:22px;height:22px;flex:none;margin-top:1px}.loan-rates{margin-top:12px}.loan-rate{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 0;border-top:1px solid var(--border);font-size:14px}.loan-rate:first-child{border-top:0}.loan-rate b{font-variant-numeric:tabular-nums}.loan-rate .edit-btn{margin-left:8px}';
  document.head.appendChild(s);
 }
 function host(){let h=document.getElementById('loan-host');if(h)return h;const p=document.getElementById('p-schulden');if(!p)return null;css();h=document.createElement('div');h.id='loan-host';p.insertBefore(h,p.children[1]||null);return h;}

 function note(loan,s){
  if(s.lage==='fertig')return 'Komplett getilgt. Es fallen keine Zinsen an.';
  if(s.lage==='zins')return `Die zinsfreie Frist ist am ${dmy(s.frist)} abgelaufen. Auf die Restschuld fallen ${String(loan.zins).replace('.',',')} % p. a. an, das sind rund ${eur(Math.round(s.rest*loan.zins)/100)} im Jahr.`;
  if(s.lage==='gut')return `Das Tempo reicht: bisher im Schnitt ${eur(s.schnitt)} pro Monat, nötig sind ${eur(s.noetig)}.`;
  return `Das Tempo reicht nicht ganz. Bisher kommen im Schnitt ${eur(s.schnitt)} pro Monat, nötig sind ${eur(s.noetig)}. Bleibt es so, sind am ${dmy(s.frist)} noch etwa ${eur(s.prognoseRest)} offen. Das kostet dann rund ${eur(s.zinsJahr)} Zinsen im Jahr, außer du zahlst den Rest vorher extra.`;
 }
 function card(loan,s){
  const pct=Math.round(s.anteil*100);
  return `<div class="loan-card" data-loan="${loan.key}"><div class="loan-top"><h3>💳 ${esc(loan.kurz)}</h3><small>${eur(loan.betrag)} am ${dmy(loan.auszahlung)}</small></div>
  <div class="loan-rest">${eur(s.rest)}</div><div class="loan-sub">Restschuld · ${s.list.length} ${s.list.length===1?'Rate':'Raten'} gezahlt</div>
  <div class="loan-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Getilgt"><i style="width:${pct}%"></i></div>
  <div class="loan-legend"><span>Getilgt ${eur(s.getilgt)}</span><span>${pct} %</span></div>
  <div class="loan-grid"><div class="loan-tile"><span>Zinsfrei bis</span><strong>${dmy(s.frist)}</strong></div><div class="loan-tile"><span>${s.tageBis>0?'Noch':'Seit'}</span><strong>${Math.abs(s.tageBis)} Tage</strong></div><div class="loan-tile"><span>Nötig pro Monat</span><strong>${eur(s.noetig)}</strong></div><div class="loan-tile"><span>Bisher im Schnitt</span><strong>${eur(s.schnitt)}</strong></div></div>
  <div class="loan-note ${s.lage}" role="status">${note(loan,s)}</div>
  <form class="loan-form" data-loan-form="${loan.key}"><div class="card-hd" style="padding:0 0 8px">Neue Rate eintragen</div><p class="summary-note" style="margin:0 0 10px">${esc(loan.hinweis)}</p>
  <div class="field"><label for="loan-${loan.key}-datum">Datum</label><input type="date" id="loan-${loan.key}-datum" required></div><div class="field"><label for="loan-${loan.key}-betrag">Betrag (€)</label><input type="number" id="loan-${loan.key}-betrag" min="0.01" step="0.01" inputmode="decimal" required></div>
  ${loan.verrechnung?`<label class="loan-check"><input type="checkbox" id="loan-${loan.key}-ein" checked><span>Auch als Automaten-Einnahme buchen. Die Einnahme und die Tilgung heben sich im Ergebnis auf, nichts wird doppelt gezählt.</span></label>`:''}
  <button type="submit" class="btn-primary">Rate speichern</button></form>
  <div class="loan-rates"><div class="card-hd" style="padding:12px 0 4px">Raten</div>${s.list.slice().reverse().map(a=>`<div class="loan-rate"><span>${dmy(a.datum)}</span><span><b>${eur(a.betrag)}</b><button type="button" class="edit-btn" onclick="editDebt(${a.id})">Bearbeiten</button></span></div>`).join('')||'<p class="summary-note">Noch keine Raten.</p>'}</div></div>`;
 }
 function render(){
  const h=host();if(!h)return;
  const rows=(typeof authUser!=='undefined'&&authUser)?D.aus:[];const t=today();
  h.innerHTML=LOANS.map(l=>card(l,status(l,rows,t))).join('');
  for(const l of LOANS){const d=document.getElementById(`loan-${l.key}-datum`);if(d&&!d.value)d.value=t;}
  h.querySelectorAll('[data-loan-form]').forEach(f=>f.onsubmit=e=>{e.preventDefault();save(f.dataset.loanForm);});
  const small=document.querySelector('#p-mehr .more-link small');const s=status(LOANS[0],rows,t);
  if(small&&rows.length)small.textContent=`${LOANS[0].kurz}: noch ${eur(s.rest)}`;
 }
 async function save(key){
  const loan=LOANS.find(l=>l.key===key);if(!loan||busy)return;
  const datum=document.getElementById(`loan-${key}-datum`).value,betrag=Number(document.getElementById(`loan-${key}-betrag`).value);
  const mitEinnahme=loan.verrechnung&&document.getElementById(`loan-${key}-ein`)?.checked;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(datum)||!Number.isFinite(betrag)||betrag<=0||Math.abs(betrag*100-Math.round(betrag*100))>1e-6){toast('Bitte Datum und einen positiven Betrag mit höchstens zwei Nachkommastellen eingeben.','r');return;}
  const b=Math.round(betrag*100)/100;
  if(rates(loan,D.aus).some(a=>a.datum===datum&&cents(a.betrag)===cents(b))){toast('Diese Rate ist schon eingetragen.','r');return;}
  busy=true;
  try{
   const ok=await persistChange('insert','aus',{id:newId(),datum,beschr:`${loan.kurz} – Rate`,betrag:b,kat:'schulden'});
   if(ok&&mitEinnahme)await persistChange('insert','bank',{id:newId(),datum,betrag:b,kategorie:'sonstiges',beschreibung:loan.einnahmeText,quelle:'manuell',qonto_transaction_id:null});
   if(ok){document.getElementById(`loan-${key}-betrag`).value='';savedToast(mitEinnahme?'Rate und Einnahme gespeichert':'Rate gespeichert');render();}
  }finally{busy=false;}
 }
 window.LokalDarlehen={LOANS,status,rates};
 window.renderDarlehen=render;
 if(typeof document!=='undefined'&&document.readyState==='loading')document.addEventListener('DOMContentLoaded',render);else render();
})();
