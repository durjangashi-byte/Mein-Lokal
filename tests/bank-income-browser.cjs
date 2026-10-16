// WebKit integration test with real pinned SDKs and an entirely local fake API.
// No request is allowed to reach Supabase or any other external host.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const sdk=process.env.TEST_SUPABASE_SDK||'/tmp/mein-lokal-test-assets/supabase.js',pdf=process.env.TEST_JSPDF_SDK||'/tmp/mein-lokal-test-assets/jspdf.js';
for(const file of [sdk,pdf])if(!fs.existsSync(file))throw new Error('Missing pinned browser SDK: '+file+'. Set TEST_SUPABASE_SDK and TEST_JSPDF_SDK to local copies.');
const owner={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email',providers:['email'],lokal_access:'owner'},user_metadata:{},is_anonymous:false,created_at:'2026-01-01T00:00:00Z'};
const jwt=()=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:owner.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),app_metadata:owner.app_metadata})).toString('base64url'),'local-test-signature'].join('.');
const token=()=>({access_token:jwt(),refresh_token:'local-refresh-token',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:owner});
const month=new Date().toISOString().slice(0,7),date=month+'-02',previous='2025-01';
function fixtures(){return {einnahmen:[{id:1,datum:date,bar:800,karte:200,tip:0,gaeste:10,notiz:'Restaurant test'}],ausgaben:[{id:2,datum:date,betrag:100,kat:'lebensmittel',beschr:'Food',rechnung_id:null}],schichten:[],rechnungen:[],lieferanten:[],qonto_transactions:[],sonstige_einnahmen:[{id:3,datum:date,betrag:50,kategorie:'cashback',beschreibung:'Fixture Cashback',quelle:'manuell',qonto_transaction_id:null},{id:4,datum:previous+'-02',betrag:30,kategorie:'bankueberweisung',beschreibung:'Alter Eingang',quelle:'manuell',qonto_transaction_id:null}]};}
async function waitFor(fn,message){for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw new Error(message);}
(async()=>{
 const server=http.createServer((req,res)=>{const requested=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));if(!requested.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}fs.readFile(requested,(error,data)=>{if(error){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',requested.endsWith('.js')?'application/javascript':requested.endsWith('.html')?'text/html':requested.endsWith('.webmanifest')?'application/manifest+json':'application/octet-stream');res.end(data);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
 browser=await webkit.launch({headless:true});
 for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
  const context=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500,serviceWorkers:'block'}),data=fixtures(),errors=[],unexpected=[],writes=[];
  if(context.routeWebSocket)await context.routeWebSocket('**/*',ws=>ws.close());
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),method=request.method();
   if(url.origin===base)return route.continue();
   if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({path:sdk,contentType:'application/javascript'});
   if(url.hostname==='cdnjs.cloudflare.com')return route.fulfill({path:pdf,contentType:'application/javascript'});
   if(url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com')return route.fulfill({body:'',contentType:'text/css'});
   const json=(body,status=200,headers={})=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*',...headers},body:JSON.stringify(body)});
   if(url.hostname.endsWith('.supabase.co')){
    if(method==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
    if(url.pathname==='/auth/v1/token'){assert.equal(request.postDataJSON().email,owner.email);return json(token());}
    if(url.pathname==='/auth/v1/user')return json(owner);
    if(url.pathname.startsWith('/auth/v1/logout'))return json({});
    if(url.pathname.startsWith('/rest/v1/')){
     const table=url.pathname.slice('/rest/v1/'.length);if(!Object.hasOwn(data,table)){unexpected.push(method+' '+url.pathname);return json({message:'Unknown mocked table'},400);}
     const idFilter=url.searchParams.get('id'),id=idFilter?.startsWith('eq.')?Number(idFilter.slice(3)):null;
     if(method==='GET'){
      let rows=data[table].filter(r=>id===null||r.id===id);const start=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);rows=rows.slice(start,start+limit);
      if(url.searchParams.get('select')==='id')rows=rows.map(r=>({id:r.id}));
      return json(request.headers().accept?.includes('vnd.pgrst.object')?rows[0]:rows);
     }
     writes.push({table,method});assert.equal(table,'sonstige_einnahmen','Browser bank workflow must only write bank-income table');
     if(method==='POST'){const incoming=request.postDataJSON(),rows=Array.isArray(incoming)?incoming:[incoming],inserted=[];for(const row of rows)if(!data[table].some(r=>r.id===row.id)){data[table].push({...row});inserted.push({id:row.id});}return json(inserted,201);}
     if(method==='PATCH'){const row=data[table].find(r=>r.id===id);if(row)Object.assign(row,request.postDataJSON());return json(row?[{id:row.id}]:[]);}
     if(method==='DELETE'){const removed=data[table].filter(r=>r.id===id);data[table]=data[table].filter(r=>r.id!==id);return json(removed.map(r=>({id:r.id})));}
    }
    unexpected.push(method+' '+url.pathname);return json({message:'Mock endpoint unavailable'},400);
   }
   unexpected.push(method+' '+url.hostname+url.pathname);return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
  const nav=async name=>{if(viewport.width<500){if(name==='monat'){await page.locator('#ni-mehr').click();await page.locator('#p-mehr [onclick="switchTab(\'monat\')"]').click();}else await page.locator('#ni-'+(name==='einnahmen'?'buchungen':name)).click();}else await page.locator('#sni-'+name).first().click();};
  await page.goto(base);await page.locator('#auth-email').fill(owner.email);await page.locator('#auth-password').fill('local-test-password');await page.locator('button[type="submit"]').filter({hasText:'Mit E-Mail und Passwort anmelden'}).click();
  await page.waitForFunction(()=>!document.body.classList.contains('auth-locked'));await page.waitForFunction(()=>syncEngine?.loaded===true);
  await nav('dashboard');await page.locator('#dashboard-period').selectOption(month);assert.match(await page.locator('#dh-val').innerText(),/950/);assert.match(await page.locator('#m-ein').innerText(),/1\.000/);
  await nav('einnahmen');assert.equal(await page.locator('#bank-list .payment-card').count(),1);
  await page.locator('#bank-query').fill('not-present');assert.equal(await page.locator('#bank-list .payment-card').count(),0);await page.locator('#bank-query').fill('cashback');assert.equal(await page.locator('#bank-list .payment-card').count(),1);await page.locator('#bank-query').fill('');
  await page.locator('#bank-month').fill(previous);await page.locator('#bank-month').press('Tab');assert.equal(await page.locator('#bank-list .payment-card').count(),1);assert.match(await page.locator('#bank-list').innerText(),/Alter Eingang/);await page.locator('#bank-all').click();assert.equal(await page.locator('#bank-list .payment-card').count(),2);await page.locator('#bank-month').fill(month);await page.locator('#bank-month').press('Tab');
  await page.locator('#bank-date').fill(date);await page.locator('#bank-amount').fill('25.00');await page.locator('#bank-description').fill('Browser Bank test');await page.locator('#bank-save').click();
  await waitFor(()=>data.sonstige_einnahmen.some(r=>r.beschreibung==='Browser Bank test'),'bank insert did not reach local mock');await page.waitForFunction(()=>syncEngine.pending().length===0);assert.equal(await page.locator('#bank-list .payment-card').count(),2);
  const card=page.locator('#bank-list .payment-card').filter({hasText:'Browser Bank test'});await card.getByRole('button',{name:'Bearbeiten'}).click();await page.locator('#bank-amount').fill('35.00');await page.locator('#bank-description').fill('Browser Bank edited');await page.locator('#bank-save').click();
  await waitFor(()=>data.sonstige_einnahmen.some(r=>r.beschreibung==='Browser Bank edited'&&r.betrag===35),'bank update did not reach mock');await page.waitForFunction(()=>syncEngine.pending().length===0);
  await nav('dashboard');assert.match(await page.locator('#dh-val').innerText(),/985/);assert.match(await page.locator('#m-ein').innerText(),/1\.000/);await page.locator('#dashboard-booking-kind').selectOption('bank');assert.match(await page.locator('#dashboard-bookings').innerText(),/Browser Bank edited/);
  await nav('monat');assert.match(await page.locator('#monat-cards').innerText(),/985/);assert.match(await page.locator('#monat-cards').innerText(),/Sonstige betriebliche Einnahmen/);
  // Real jsPDF generation with capture-only save: PDF totals include all bank income, independently of restaurant turnover.
  const pdfs=await page.evaluate(()=>{const Base=window.jspdf.jsPDF,outputs=[];window.jspdf.jsPDF=function(options){const doc=new Base(options),text=doc.text.bind(doc),texts=[];doc.text=(...args)=>{texts.push(args[0]);return text(...args);};doc.save=name=>outputs.push({name,texts,data:doc.output('datauristring')});return doc;};try{exportPDF();exportTagesPDF();}finally{window.jspdf.jsPDF=Base;}return outputs;});
  assert.equal(pdfs.length,2);assert.ok(pdfs[0].texts.includes('SONSTIGE BETRIEBLICHE EINNAHMEN'));assert.ok(pdfs[0].texts.includes('115,00 €'));assert.ok(pdfs[1].texts.includes('Sonstige betriebliche Einnahmen'));
  if(process.env.TEST_PDF_OUTPUT){fs.mkdirSync(process.env.TEST_PDF_OUTPUT,{recursive:true});for(let i=0;i<pdfs.length;i++)fs.writeFileSync(path.join(process.env.TEST_PDF_OUTPUT,'bank-'+viewport.width+'-'+i+'.pdf'),Buffer.from(pdfs[i].data.split(',')[1],'base64'));}
  await page.reload();await page.waitForFunction(()=>!document.body.classList.contains('auth-locked')&&syncEngine?.loaded===true);await nav('einnahmen');assert.match(await page.locator('#bank-list').innerText(),/Browser Bank edited/);
  const overflow=await page.locator('#sonstige-einnahmen-panel').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,right:el.getBoundingClientRect().right,viewport:innerWidth}));assert.ok(overflow.scroll<=overflow.width+1&&overflow.right<=overflow.viewport+1,'Bank panel horizontal overflow: '+JSON.stringify(overflow));
  await page.locator('#bank-list .payment-card').filter({hasText:'Browser Bank edited'}).getByRole('button',{name:'Löschen'}).click();await waitFor(()=>!data.sonstige_einnahmen.some(r=>r.beschreibung==='Browser Bank edited'),'bank delete did not reach mock');await page.waitForFunction(()=>syncEngine.pending().length===0);
  await nav('dashboard');assert.match(await page.locator('#dh-val').innerText(),/950/);assert.deepEqual(errors,[],'browser page errors');assert.deepEqual(unexpected,[],'unmocked external requests');assert.deepEqual(new Set(writes.map(w=>w.method)),new Set(['POST','PATCH','DELETE']));
  console.log('PASS WebKit '+viewport.width+'x'+viewport.height+' real SDK login, bank CRUD/search/month, dashboard/month totals, reload sync, no overflow/page errors/external access');await context.close();
 }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
