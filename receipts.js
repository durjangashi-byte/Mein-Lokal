/* Private receipt photos. Uploaded only through the signed-in user's Storage API. */
const RECEIPT_BUCKET='lokal-receipts';
let receiptContext=null,receiptBusy=false,receiptGeneration=0;
function receiptButton(id){return `<button type="button" class="edit-btn" onclick="openReceipts(${id})">📷 Belege</button>`;}
function receiptStatus(text){const el=document.getElementById('receipt-status');if(el)el.textContent=text;}
function receiptActive(context){return receiptContext===context&&authUser?.id===context.user&&document.getElementById('receipt-files');}
function clearReceiptContext(){receiptContext=null;receiptGeneration++;}
async function openReceipts(id){
 const row=D.aus.find(a=>a.id===id);if(!row||!authUser){toast('Bitte anmelden und eine gespeicherte Ausgabe wählen.','r');return;}
 const context={id,user:authUser.id,generation:++receiptGeneration};receiptContext=context;
 document.getElementById('modal-inner').innerHTML=`<div class="modal-hd"><div class="modal-title">Belege zur Ausgabe</div><div class="modal-sub">${esc(row.beschr||KAT[row.kat]?.label||'Ausgabe')} · ${eur(row.betrag)}</div></div><div class="modal-body"><div id="receipt-files"></div><div class="modal-field"><label>Foto auswählen oder aufnehmen</label><input id="receipt-photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"></div><p class="summary-note">Fotos bis 15 MB. Für die Speicherung wird das Foto auf maximal 2400 Pixel verkleinert. Belege werden separat von deinem JSON-Backup gespeichert.</p><p id="receipt-status" class="summary-note" role="status"></p></div><div class="modal-actions"><button id="receipt-upload" class="m-btn primary" onclick="uploadReceipt()">Foto hochladen</button><button class="m-btn secondary" onclick="closeModal()">Schließen</button></div>`;
 document.getElementById('modal-bg').classList.add('show');await loadReceipts(context);
}
async function loadReceipts(context){
 if(!receiptActive(context))return;receiptStatus('Belege werden geladen…');
 try{
  const prefix=`${context.user}/${context.id}`;let files=[],offset=0;
  while(true){const r=await SB.storage.from(RECEIPT_BUCKET).list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}});if(r.error)throw r.error;files.push(...r.data);if(r.data.length<100)break;offset+=100;}
  const links=await Promise.all(files.filter(f=>f.id).map(async f=>{const r=await SB.storage.from(RECEIPT_BUCKET).createSignedUrl(`${prefix}/${f.name}`,300);if(r.error)throw r.error;return r.data.signedUrl;}));
  if(!receiptActive(context))return;
  const box=document.getElementById('receipt-files');box.replaceChildren();
  if(!links.length)box.textContent='Noch keine Belegfotos.';
  for(const url of links){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label','Belegfoto öffnen');const img=document.createElement('img');img.src=url;img.alt='Belegfoto';img.style.cssText='width:100%;max-height:280px;object-fit:contain;border-radius:10px;margin:8px 0;background:#202020';a.append(img);box.append(a);}
  receiptStatus(links.length?`${links.length} Belegfoto(s) · Antippen zum Öffnen. Links sind 5 Minuten gültig; bei Bedarf erneut öffnen.`:'Foto auswählen und hochladen.');
 }catch(e){if(receiptActive(context))receiptStatus('Belege nicht geladen: '+e.message);}
}
async function prepareReceiptPhoto(file){
 if(!file||!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)||file.size<=0||file.size>15*1024*1024)throw new Error('Bitte ein JPG-, PNG-, WebP- oder HEIC-Foto bis 15 MB wählen.');
 const url=URL.createObjectURL(file);
 try{const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Dieses Foto kann der Browser nicht lesen. Bitte als JPG oder PNG auswählen.'));image.src=url;});
 const scale=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight));if(!Number.isFinite(scale)||!img.naturalWidth||!img.naturalHeight)throw new Error('Ungültiges Bild.');
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.9));if(!blob||blob.size>10*1024*1024)throw new Error('Das Foto ist zu groß. Bitte ein kleineres Foto wählen.');return blob;
 }finally{URL.revokeObjectURL(url);}
}
async function uploadReceipt(){
 const context=receiptContext;if(receiptBusy||!context||!receiptActive(context))return;
 const file=document.getElementById('receipt-photo').files?.[0];if(!file){receiptStatus('Bitte zuerst ein Foto auswählen.');return;}
 receiptBusy=true;const button=document.getElementById('receipt-upload');button.disabled=true;
 try{
  if(navigator.onLine===false)throw new Error('Für Belegfotos wird eine Internetverbindung benötigt. Deine Ausgabe bleibt gespeichert.');
  receiptStatus('Foto wird vorbereitet…');const photo=await prepareReceiptPhoto(file);if(!receiptActive(context))return;
  if(syncEngine)await syncEngine.sync();
  const check=await SB.from('ausgaben').select('id').eq('id',context.id).maybeSingle();if(check.error)throw check.error;if(!check.data)throw new Error('Diese Ausgabe ist noch nicht synchronisiert. Bitte später erneut versuchen.');
  if(!receiptActive(context))return;
  const path=`${context.user}/${context.id}/${crypto.randomUUID()}.jpg`;receiptStatus('Foto wird hochgeladen…');
  const r=await SB.storage.from(RECEIPT_BUCKET).upload(path,photo,{contentType:'image/jpeg',upsert:false});if(r.error)throw r.error;
  if(receiptActive(context)){document.getElementById('receipt-photo').value='';await loadReceipts(context);receiptStatus('Belegfoto gespeichert.');}
 }catch(e){if(receiptActive(context))receiptStatus('Foto nicht gespeichert: '+e.message);}finally{receiptBusy=false;if(button.isConnected)button.disabled=false;}
}
