// Exercise the real edge handler with local Qonto and database stubs only.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
let code=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../supabase/functions/qonto-sync/index.ts'),'utf8'),{disableExperimentalWarning:true});
code=code.replace(/^import .*withSupabase.*;\s*/m,'').replace('export default','globalThis.handler=');
const owner={sub:'owner',app_metadata:{lokal_access:'owner'},is_anonymous:false};
const tx=(id='test-bank',extra={})=>({id,amount_cents:1234,side:'credit',currency:'EUR',label:'Test',settled_at:'2026-10-01T12:00:00Z',created_at:'2026-10-01T12:00:00Z',...extra});
const page=(transactions,meta={})=>({transactions,meta:{next_page:null,...meta}});
function harness(options={}){
 const calls=[],upserts=[],stored=new Map(Object.entries(options.stored||{}));
 const ctx=vm.createContext({Response,URL,AbortSignal,console,Deno:{env:{get:()=>options.unconfigured?undefined:'test-server-only'}},withSupabase:(config,callback)=>{assert.equal(config.auth,'user');return callback;},fetch:async(url,settings)=>{
  const u=new URL(url);assert.equal(u.origin,'https://thirdparty.qonto.com');assert.ok(settings.signal instanceof AbortSignal);calls.push(u);
  if(options.fetch) return options.fetch(u,calls);
  const body=u.pathname.endsWith('/organization')?(options.organization||{organization:{bank_accounts:options.accounts||[{id:'account'}]}}):options.pages?await options.pages(u):page([tx()]);
  return new Response(JSON.stringify(body),{status:200});
 }});
 vm.runInContext(code,ctx);
 const invoke=(claims=owner,method='POST')=>ctx.handler.fetch(new Request('https://local.test',{method}),{userClaims:claims,supabaseAdmin:{from:table=>{assert.equal(table,'qonto_transactions');return {upsert:async(rows,config)=>{
  upserts.push({rows,config});if(options.dbError)return {error:{message:'secret DB details'}};
  for(const row of rows){assert.ok(row.id&&row.id!=='undefined');stored.set(row.id,{...(stored.get(row.id)||{}),...row});}
  return {error:null};
 }};}}});
 return {calls,upserts,stored,invoke};
}
(async()=>{
 let groups=0;async function test(name,fn){await fn();groups++;console.log('PASS '+name);}
 await test('owner auth/HTTP/config checks happen before bank access',async()=>{
  const h=harness();for(const claims of [{},{sub:'user'},{sub:'user',user_metadata:{lokal_access:'owner'}},{sub:'user',app_metadata:{lokal_access:'staff'}},{...owner,is_anonymous:true}])assert.equal((await h.invoke(claims)).status,403);
  assert.equal((await h.invoke({app_metadata:{lokal_access:'owner'}})).status,401);assert.equal((await h.invoke(owner,'GET')).status,405);assert.equal((await h.invoke({},'OPTIONS')).status,200);assert.equal(h.calls.length,0);assert.equal(h.upserts.length,0);
  const noSecrets=harness({unconfigured:true});assert.equal((await noSecrets.invoke()).status,503);assert.equal(noSecrets.calls.length,0);
 });
 await test('cents, amount-only, null cents, signed amounts, strings and real zero',async()=>{
  const rows=[tx('cent'),tx('amount',{amount_cents:undefined,amount:343.8}),tx('null-cents',{amount_cents:null,amount:'9.99'}),tx('negative',{amount_cents:-420,amount:-4.2,side:'debit'}),tx('string',{amount_cents:'1624',amount:'16.24'}),tx('float',{amount_cents:undefined,amount:0.29}),tx('zero',{amount_cents:0,amount:0}),tx('amount-zero',{amount_cents:undefined,amount:0}),tx('invalid-cents-valid-euro',{amount_cents:'bad',amount:'8.12'})];
  const h=harness({pages:()=>page(rows)}),response=await h.invoke();assert.equal(response.status,200);assert.equal((await response.json()).synced,rows.length);
  assert.deepEqual(Array.from(h.stored.values(),r=>r.amount),[12.34,343.8,9.99,4.2,16.24,0.29,0,0,8.12]);
 });
 await test('malformed/missing/conflicting amounts cannot zero or overwrite existing rows',async()=>{
  for(const extra of [{amount_cents:undefined},{amount_cents:null,amount:null},{amount_cents:'',amount:''},{amount_cents:false,amount:true},{amount_cents:'NaN'},{amount_cents:1.5},{amount_cents:undefined,amount:1.001},{amount_cents:undefined,amount:1e-10},{amount_cents:0,amount:12.34},{amount_cents:1250,amount:12.51},{amount_cents:Number.MAX_SAFE_INTEGER+1}]){
   const h=harness({stored:{existing:{amount:42}},pages:()=>page([tx('good'),tx('existing',extra)])}),r=await h.invoke();assert.equal(r.status,502,JSON.stringify(extra));assert.equal(h.upserts.length,0);assert.equal(h.stored.get('existing').amount,42);const body=await r.json();assert.equal(body.complete,false);assert.doesNotMatch(body.error,/test-server-only/);
  }
 });
 await test('more than ten pages, both sides, multiple accounts, no duplicate source rows',async()=>{
  const h=harness({accounts:[{id:'account-a'},{id:'account-b'},{id:'account-a'}],pages:u=>{const p=Number(u.searchParams.get('page')),a=u.searchParams.get('bank_account_id');assert.equal(u.searchParams.get('status[]'),'completed');assert.equal(u.searchParams.get('sort_by'),'created_at:desc');assert.ok(u.searchParams.get('created_at_to'));return page([tx(a+'-'+p,{side:p%2?'credit':'debit'})],{current_page:p,next_page:p<12?p+1:null,total_pages:12});}});
  const r=await h.invoke();assert.equal(r.status,200);assert.deepEqual(await r.json(),{configured:true,synced:24,accounts:2,complete:true});assert.equal(h.stored.size,24);assert.equal(h.calls.length,25);
 });
 await test('overlapping pages are deduplicated while existing classification/import metadata survives retries',async()=>{
  const metadata={classification:'privat',private_category:'Shopping',ignored:true,imported_kind:'aus',imported_id:99};
  const h=harness({stored:{same:{amount:0,...metadata}},pages:u=>Number(u.searchParams.get('page'))===1?page([tx('same')],{next_page:2}):page([tx('same'),tx('other')])});
  for(let i=0;i<2;i++){const r=await h.invoke();assert.equal(r.status,200);assert.equal((await r.json()).synced,2);}
  assert.equal(h.stored.size,2);for(const [key,value]of Object.entries(metadata))assert.equal(h.stored.get('same')[key],value);assert.equal(h.stored.get('same').amount,12.34);
  for(const call of h.upserts){assert.equal(call.config.onConflict,'id');for(const row of call.rows){assert.equal(row.user_id,'owner');for(const key of Object.keys(metadata))assert.equal(key in row,false);}}
 });
 await test('internal transfer flag is reconstructed only for own-IBAN internal references',async()=>{
  const ownA='DE11111111111111111111',ownB='DE22222222222222222222';
  const rows=[tx('internal-credit',{reference:'Interne Ueberweisung',income:{counterparty_account_number:ownB},side:'credit'}),tx('internal-debit',{reference:'Interne Überweisung',transfer:{counterparty_account_number:ownA.toLowerCase()},side:'debit'}),tx('external',{reference:'Interne Ueberweisung',transfer:{counterparty_account_number:'DE99999999999999999999'}}),tx('ordinary',{reference:'Rechnung',transfer:{counterparty_account_number:ownA}})];
  const h=harness({accounts:[{id:'account',iban:'DE11 1111 1111 1111 1111 11'},{id:'other-account',iban:ownB}],stored:{'internal-credit':{classification:'betrieblich',ignored:true,imported_id:10,imported_kind:'aus'}},pages:u=>page(u.searchParams.get('bank_account_id')==='account'?rows:[])});
  assert.equal((await h.invoke()).status,200);for(const id of ['internal-credit','internal-debit'])assert.equal(h.stored.get(id).raw.lokal_internal_transfer,true);for(const id of ['external','ordinary'])assert.equal(h.stored.get(id).raw.lokal_internal_transfer,false);
  assert.equal(h.stored.get('internal-credit').ignored,true);assert.equal(h.stored.get('internal-credit').classification,'betrieblich');assert.equal(h.stored.get('internal-credit').imported_id,10);
 });
 await test('looping/backward/skipping/missing/inconsistent pagination fails visibly',async()=>{
  for(const body of [page([tx()],{next_page:1}),page([tx()],{next_page:0}),page([tx()],{next_page:'bad'}),page([tx()],{next_page:1.5}),page([tx()],{next_page:3}),page([tx()],{current_page:2}),page([tx()],{total_pages:2}),page([],{next_page:2}),{transactions:[tx()],meta:{}},{transactions:[tx()]},{meta:{next_page:null}},page([tx(),tx()])]){
   const h=harness({pages:()=>body}),r=await h.invoke();assert.equal(r.status,502,JSON.stringify(body));assert.equal((await r.json()).complete,false);assert.ok(h.calls.length<=2);
  }
  const repeated=harness({pages:u=>page([tx()],{next_page:Number(u.searchParams.get('page'))+1})}),r=await repeated.invoke();assert.equal(r.status,502);assert.equal(repeated.upserts.length,1);assert.equal(repeated.calls.length,3);
 });
 await test('10,000 API ceiling rolls the creation window back and deduplicates inclusive boundary',async()=>{
  let firstUpper;const h=harness({pages:u=>{
   const p=Number(u.searchParams.get('page')),upper=u.searchParams.get('created_at_to');firstUpper??=upper;
   if(upper===firstUpper)return page(Array.from({length:100},(_,i)=>tx('old-'+p+'-'+i,{created_at:'2026-09-'+String(30-Math.floor(p/4)).padStart(2,'0')+'T12:00:00Z'})),{current_page:p,next_page:p+1,total_pages:101});
   assert.equal(p,1);assert.equal(upper,'2026-09-05T12:00:00Z');return page([tx('old-100-99'),tx('beyond-ceiling')],{current_page:1,total_pages:1});
  }}),r=await h.invoke();assert.equal(r.status,200);assert.equal((await r.json()).synced,10001);assert.equal(h.stored.size,10001);assert.equal(h.calls.length,102);assert.ok(h.stored.has('beyond-ceiling'));
 });
 await test('untraversable timestamp boundary fails instead of silently claiming complete',async()=>{
  const h=harness({pages:u=>{const p=Number(u.searchParams.get('page'));return page([tx('row-'+p,{created_at:undefined})],{next_page:p+1});}}),r=await h.invoke();assert.equal(r.status,502);assert.equal((await r.json()).complete,false);assert.equal(h.calls.length,101);
 });
 await test('upstream HTTP/JSON/network and database failures stay explicit and sanitized',async()=>{
  for(const fetch of [async()=>new Response('upstream-secret',{status:429}),async()=>new Response('bad json'),async()=>{throw new Error('network-secret');}]){const h=harness({fetch}),r=await h.invoke();assert.equal(r.status,502);assert.doesNotMatch(JSON.stringify(await r.json()),/secret/);}
  const h=harness({dbError:true}),r=await h.invoke();assert.equal(r.status,500);assert.doesNotMatch(JSON.stringify(await r.json()),/secret DB details/);
  const partial=harness({pages:u=>{if(u.searchParams.get('page')==='2')throw new Error('second-page-secret');return page([tx()],{next_page:2});}}),p=await partial.invoke();assert.equal(p.status,502);assert.equal((await p.json()).synced,1);
 });
 await test('invalid organization, source identity, currency or side cannot create synthetic rows',async()=>{
  for(const options of [{organization:{}},{accounts:[{}]},{pages:()=>page([tx(undefined,{id:undefined})])},{pages:()=>page([tx('bad-side',{side:'unknown'})])},{pages:()=>page([tx('currency',{currency:'USD'})])}]){const h=harness(options);assert.equal((await h.invoke()).status,502);assert.equal(h.upserts.length,0);}
 });
 console.log('PASS '+groups+' Qonto edge regression groups; all bank/database calls were local stubs');
})().catch(e=>{console.error(e);process.exitCode=1;});
