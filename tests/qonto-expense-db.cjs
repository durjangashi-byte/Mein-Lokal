// Isolated PostgreSQL tests: no network, Supabase project, or production credentials.
// npm install --prefix /tmp/ml-expense-db-test @electric-sql/pglite@0.3.14
// PG_TEST_MODULE=/absolute/path/to/@electric-sql/pglite node tests/qonto-expense-db.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let PGlite;try{({PGlite}=require(process.env.PG_TEST_MODULE||'/tmp/ml-expense-db-test/node_modules/@electric-sql/pglite'));}catch{console.error('Optional local DB dependency missing. Run npm install --prefix /tmp/ml-expense-db-test @electric-sql/pglite@0.3.14, or set PG_TEST_MODULE to an installed @electric-sql/pglite directory.');process.exit(1);}
const owner='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';
(async()=>{
 const db=new PGlite(),failures=[];let passed=0;
 const exec=sql=>db.exec(sql),query=(sql,args=[])=>db.query(sql,args),scalar=async(sql,args=[])=>Object.values((await query(sql,args)).rows[0])[0];
 const rpc=(id,expense=null,allow=false)=>scalar('select public.lokal_import_qonto_expense($1,$2,$3)',[id,expense,allow]);
 const denied=(work,pattern)=>assert.rejects(work,pattern);
 async function test(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(e){failures.push({name,message:e.message});console.error('FAIL '+name+': '+e.message);}}
 async function session(id=owner,access='owner',anonymous=false,userMetadata={}){await query("select set_config('test.uid',$1,false),set_config('test.jwt',$2,false)",[id,JSON.stringify({app_metadata:{lokal_access:access},user_metadata:userMetadata,is_anonymous:anonymous})]);}
 async function source(id,changes={}){
  const row={id,user_id:owner,amount:100,side:'debit',status:'completed',label:'Qonto '+id,reference:'',settled_at:'2026-10-01T12:00:00Z',emitted_at:null,classification:'unklar',private_category:null,ignored:false,raw:{suggested_category:'sonstiges'},imported_kind:null,imported_id:null,...changes};
  const columns=Object.keys(row);await query('insert into public.qonto_transactions('+columns.join(',')+') values('+columns.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(row));
 }
 async function expense(id,changes={}){const r={id,datum:'2026-10-01',betrag:100,kat:'lebensmittel',beschr:'Manuelle Ausgabe '+id,rechnung_id:null,...changes},cols=Object.keys(r);await query('insert into public.ausgaben('+cols.join(',')+') values('+cols.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(r));}
 const snapshot=async(table,id)=>(await query('select * from public.'+table+' where id=$1',[id])).rows[0];
 await exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb$$;
 grant usage on schema public,auth to authenticated;grant execute on all functions in schema auth to authenticated;
 create sequence public.lokal_payment_ids start 8000000000000000 maxvalue 9007199254740991;
 grant usage on sequence public.lokal_payment_ids to authenticated;
 create table public.qonto_transactions(id text primary key,user_id uuid not null,amount numeric,side text,status text,label text,reference text,settled_at timestamptz,emitted_at timestamptz,classification text,private_category text,ignored boolean,raw jsonb,imported_kind text,imported_id bigint,updated_at timestamptz default now());
 create table public.rechnungen(id bigint primary key,beschr text,betrag numeric(12,2),bezahlt boolean);
 create table public.ausgaben(id bigint primary key,datum text,betrag numeric(12,2),kat text,beschr text,rechnung_id bigint references public.rechnungen(id));
 create table public.einnahmen(id bigint primary key,datum text,bar numeric(12,2),karte numeric(12,2),tip numeric(12,2));
 create table public.sonstige_einnahmen(id bigint primary key,datum date,betrag numeric,qonto_transaction_id text references public.qonto_transactions(id));
 alter table qonto_transactions enable row level security;alter table ausgaben enable row level security;alter table rechnungen enable row level security;alter table einnahmen enable row level security;alter table sonstige_einnahmen enable row level security;
 create policy own_qonto on qonto_transactions to authenticated using(user_id=auth.uid() and auth.jwt()->'app_metadata'->>'lokal_access'='owner' and coalesce(auth.jwt()->>'is_anonymous','false')='false') with check(user_id=auth.uid() and auth.jwt()->'app_metadata'->>'lokal_access'='owner' and coalesce(auth.jwt()->>'is_anonymous','false')='false');
 create policy owner_expense on ausgaben to authenticated using(auth.jwt()->'app_metadata'->>'lokal_access'='owner' and coalesce(auth.jwt()->>'is_anonymous','false')='false') with check(auth.jwt()->'app_metadata'->>'lokal_access'='owner' and coalesce(auth.jwt()->>'is_anonymous','false')='false');
 create policy owner_invoice on rechnungen to authenticated using(auth.jwt()->'app_metadata'->>'lokal_access'='owner') with check(auth.jwt()->'app_metadata'->>'lokal_access'='owner');
 create policy owner_turnover on einnahmen to authenticated using(auth.jwt()->'app_metadata'->>'lokal_access'='owner') with check(auth.jwt()->'app_metadata'->>'lokal_access'='owner');
 create policy owner_bank_income on sonstige_einnahmen to authenticated using(auth.jwt()->'app_metadata'->>'lokal_access'='owner') with check(auth.jwt()->'app_metadata'->>'lokal_access'='owner');
 grant select,insert,update,delete on all tables in schema public to authenticated;
 create function public.test_invoice_guard() returns trigger language plpgsql as $$begin if old.rechnung_id is not null then raise exception 'Invoice expense must remain unchanged';end if;if tg_op='DELETE' then return old;end if;return new;end$$;
 create trigger invoice_expense_guard before update or delete on ausgaben for each row execute function public.test_invoice_guard();
 insert into einnahmen values(1,'2026-10-01',500,100,2);insert into sonstige_einnahmen values(1,'2026-10-01',50);
 insert into rechnungen values(1,'Bezahlte Rechnung',100,true);`);
 const files=fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(f=>f.endsWith('_qonto_expense_match_and_import.sql'));assert.equal(files.length,1);
 const before=(await query("select (select count(*) from ausgaben)::int expenses,(select count(*) from qonto_transactions)::int sources")).rows;
 await exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',files[0]),'utf8'));
 assert.deepEqual((await query("select (select count(*) from ausgaben)::int expenses,(select count(*) from qonto_transactions)::int sources")).rows,before,'Migration must not create historical financial rows');
 await source('foreign',{user_id:foreign,amount:991});await source('hidden-linked',{user_id:foreign,amount:192,imported_kind:'aus',imported_id:92,classification:'privat'});await expense(92,{betrag:192});
 await exec('set role authenticated');await session();const turnoverBefore=await snapshot('einnahmen',1),bankBefore=await snapshot('sonstige_einnahmen',1);
 await test('RPC is security invoker, restricted to authenticated, owner app claims and nonanonymous',async()=>{
  const def=(await query("select prosecdef,proconfig,pronargdefaults from pg_proc where proname='lokal_import_qonto_expense'")).rows[0];assert.equal(def.prosecdef,false);assert.equal(def.pronargdefaults,2);assert.equal(await scalar("select has_function_privilege('anon','public.lokal_import_qonto_expense(text,bigint,boolean)','EXECUTE')"),false);
  for(const [id,access,anonymous,metadata]of [[owner,'staff',false,{lokal_access:'owner'}],[owner,'owner',true,{}],['','owner',false,{}]]){await session(id,access,anonymous,metadata);await denied(()=>rpc('foreign'),/Kein Lokal-Zugriff/);}await session();await denied(()=>rpc('foreign'),/nicht zugänglich/);assert.equal(await scalar("select count(*)::int from qonto_transactions where id='foreign'"),0);
 });await session();
 await test('new import is atomic/idempotent, uses sequence, source guards and category sanitation',async()=>{
  await source('new',{amount:12.34,label:'  Lieferant\nTest  ',raw:{suggested_category:'aok'}});const id=await rpc('new');assert.ok(Number(id)>=8000000000000000);const e=await snapshot('ausgaben',id),q=await snapshot('qonto_transactions','new');assert.equal(Number(e.betrag),12.34);assert.equal(e.kat,'krankenkasse');assert.equal(e.datum,'2026-10-01');assert.doesNotMatch(e.beschr,/\n/);assert.match(e.beschr,/\[Qonto:new\]/);assert.equal(q.imported_kind,'aus');assert.equal(q.imported_id,id);assert.equal(q.classification,'betrieblich');assert.equal(q.private_category,null);assert.equal(await rpc('new'),id);assert.equal(await rpc('new',id,true),id);await denied(()=>rpc('new',123,true),/anderen Ausgabe verknüpft/);assert.equal(await scalar("select count(*)::int from ausgaben where beschr like '%[Qonto:new]%'"),1);
 });
 await test('private, ignored, internal, credit, noncompleted and invalid amounts/dates reject without writes',async()=>{
  const patches=[{classification:'privat'},{ignored:true},{raw:{lokal_internal_transfer:true}},{side:'credit'},{status:'pending'},{status:null},{side:null},{amount:0},{amount:-1},{amount:null},{amount:'NaN'},{amount:'Infinity'},{amount:'-Infinity'},{amount:1.001},{amount:'90071992547409.92'},{settled_at:null,emitted_at:null}];
  for(const [i,patch]of patches.entries()){const id='guard-'+i;await source(id,{amount:901+i,...patch});const count=await scalar('select count(*)::int from ausgaben');await denied(()=>rpc(id,null,true),/Lastschrift|centgenau|Buchungsdatum/);assert.equal(await scalar('select count(*)::int from ausgaben'),count);assert.equal((await snapshot('qonto_transactions',id)).imported_id,null);}
 });
 await test('matching unbound expense requires explicit target or confirmed separate creation',async()=>{
  await expense(10,{betrag:71.23});await source('match',{amount:71.23});const original=await snapshot('ausgaben',10);await denied(()=>rpc('match'),/Mögliche bestehende Ausgabe/);assert.equal(await rpc('match',10),10);assert.deepEqual(await snapshot('ausgaben',10),original);
  await expense(11,{betrag:72.23});await source('separate',{amount:72.23});await denied(()=>rpc('separate'),/Mögliche bestehende Ausgabe/);const id=await rpc('separate',null,true);assert.notEqual(id,11);assert.equal(await scalar('select count(*)::int from ausgaben where betrag=72.23'),2);
 });
 await test('ambiguous candidates never automatically link; explicit valid target is sufficient',async()=>{
  await source('ambiguous',{amount:73.23});await expense(12,{betrag:73.23});await expense(13,{betrag:73.23});await denied(()=>rpc('ambiguous'),/Mögliche bestehende Ausgabe/);assert.equal(await rpc('ambiguous',13),13);assert.equal((await snapshot('qonto_transactions','ambiguous')).imported_id,13);
 });
 await test('explicit target is locked and validated by cents, real date and inclusive Berlin +/-7 days',async()=>{
  await source('berlin',{amount:74.23,settled_at:'2026-09-30T22:30:00Z'});await expense(14,{betrag:74.23,datum:'2026-09-24'});assert.equal(await rpc('berlin',14),14);
  await source('plus7',{amount:75.23});await expense(15,{betrag:75.23,datum:'2026-10-08'});assert.equal(await rpc('plus7',15),15);
  await source('outside',{amount:76.23});await expense(16,{betrag:76.23,datum:'2026-09-23'});await denied(()=>rpc('outside',16),/sieben Tagen/);await query('update ausgaben set datum=$1 where id=16',['2026-10-09']);await denied(()=>rpc('outside',16),/sieben Tagen/);
  await query('update ausgaben set datum=$1 where id=16',['2026-02-30']);await denied(()=>rpc('outside',16),/Ausgabedatum ist ungültig/);
  await query('update ausgaben set datum=$1,betrag=$2 where id=16',['2026-10-01',76.231]);await denied(()=>rpc('outside',16),/Centbetrag/);await query('update ausgaben set betrag=$1 where id=16',[76.24]);await denied(()=>rpc('outside',16),/Centbetrag/);
  await denied(()=>rpc('outside',999999),/Ausgabe fehlt/);
 });
 await test('existing paid-invoice expense links without any mutation of invoice or expense',async()=>{
  await expense(17,{betrag:100,rechnung_id:1});await source('invoice');const e=await snapshot('ausgaben',17),invoice=await snapshot('rechnungen',1);assert.equal(await rpc('invoice',17),17);assert.deepEqual(await snapshot('ausgaben',17),e);assert.deepEqual(await snapshot('rechnungen',1),invoice);
 });
 await test('another linked source, including private and RLS-hidden sources, cannot share a target',async()=>{
  await expense(18,{betrag:81});await source('private-linked',{amount:81,classification:'privat',imported_kind:'aus',imported_id:18});await source('other-private',{amount:81});await denied(()=>rpc('other-private',18),/anderen Qonto/);
  await source('other-hidden',{amount:192});await denied(()=>rpc('other-hidden',92),/lokal_qonto_expense_import_unique/);assert.equal((await snapshot('qonto_transactions','other-hidden')).imported_id,null);
 });
 await test('legacy source markers require explicit safe repair and block repeat/new imports',async()=>{
  const id='11111111-aaaa-4111-8111-111111111111';await expense(19,{betrag:83,beschr:'Legacy Rechnung [Qonto:'+id+']'});await source(id,{amount:83});const original=await snapshot('ausgaben',19);await denied(()=>rpc(id),/Qonto-Markierung/);await denied(()=>rpc(id,null,true),/Qonto-Markierung/);assert.equal(await rpc(id,19),19);assert.deepEqual(await snapshot('ausgaben',19),original);
  await expense(20,{betrag:84,beschr:'Anderer Import [Qonto:some-other-source]'});await source('wrong-marker',{amount:84});await denied(()=>rpc('wrong-marker',20),/anderen Qonto/);
  await expense(21,{betrag:85,beschr:'[Qonto:duplicate-marker]'});await expense(22,{betrag:85,beschr:'[Qonto:duplicate-marker]'});await source('duplicate-marker',{amount:85});await denied(()=>rpc('duplicate-marker',21),/Qonto-Markierung/);
 });
 await test('deleted target and partial source markers are tombstones, never recreated by allow_new',async()=>{
  await source('delete',{amount:86});const id=await rpc('delete');await query('delete from ausgaben where id=$1',[id]);for(const allow of [false,true])await denied(()=>rpc('delete',null,allow),/Ziel fehlt oder wurde gelöscht/);assert.equal((await snapshot('qonto_transactions','delete')).imported_id,id);
  for(const [name,patch]of [['partial-kind',{imported_kind:'aus'}],['partial-id',{imported_id:999}],['other-kind',{imported_kind:'ein',imported_id:100}]]){await source(name,{amount:87,...patch});await denied(()=>rpc(name,null,true),/unvollständig/);}
  await denied(()=>rpc('missing-source'),/nicht zugänglich/);await denied(()=>rpc(''),/Buchung fehlt/);
 });
 await test('RLS update denial rolls back a newly inserted expense',async()=>{
  await source('denied-update',{amount:88});const count=await scalar('select count(*)::int from ausgaben');await exec('reset role');await exec('create policy no_update_dummy on qonto_transactions as restrictive for update to authenticated using(false)');await exec('set role authenticated');await denied(()=>rpc('denied-update',null,true),/nicht zugänglich|Verknüpfung konnte nicht gespeichert/);assert.equal(await scalar('select count(*)::int from ausgaben'),count);await exec('reset role');await exec('drop policy no_update_dummy on qonto_transactions');await exec("create function test_suppress_qonto_update() returns trigger language plpgsql as $$begin return null;end$$;create trigger suppress_qonto_update before update on qonto_transactions for each row execute function test_suppress_qonto_update()");await exec('set role authenticated');await denied(()=>rpc('denied-update',null,true),/Verknüpfung konnte nicht gespeichert/);assert.equal(await scalar('select count(*)::int from ausgaben'),count);await exec('reset role');await exec('drop trigger suppress_qonto_update on qonto_transactions;drop function test_suppress_qonto_update()');await exec('set role authenticated');
 });
 await test('internal credit source guard blocks insert/update without relying on labels or ignored status',async()=>{
  await source('internal-credit',{side:'credit',amount:31,ignored:false,raw:{lokal_internal_transfer:true},label:'Harmless looking label'});
  await denied(()=>query("insert into sonstige_einnahmen(id,datum,betrag,qonto_transaction_id) values(20,'2026-10-01',31,'internal-credit')"),/Interne Umbuchungen/);
  assert.equal(await scalar('select count(*)::int from sonstige_einnahmen where id=20'),0);
  await denied(()=>query("update sonstige_einnahmen set qonto_transaction_id='internal-credit' where id=1"),/Interne Umbuchungen/);
  assert.equal((await snapshot('sonstige_einnahmen',1)).qonto_transaction_id,null);
  await denied(()=>query("insert into sonstige_einnahmen(id,datum,betrag,qonto_transaction_id) values(21,'2026-10-01',991,'foreign')"),/nicht zugänglich/);
  await source('normal-cashback',{side:'credit',amount:19.95,label:'Cashback',ignored:false,raw:{lokal_internal_transfer:false}});
  await query("insert into sonstige_einnahmen(id,datum,betrag,qonto_transaction_id) values(22,'2026-10-01',19.95,'normal-cashback')");
  await query("update sonstige_einnahmen set betrag=19.96 where id=22");assert.equal((await snapshot('sonstige_einnahmen',22)).qonto_transaction_id,'normal-cashback');
  for(const role of ['anon','authenticated'])assert.equal(await scalar("select has_function_privilege($1,'public.lokal_guard_internal_bank_income()','EXECUTE')",[role]),false);
  const guard=(await query("select prosecdef from pg_proc where proname='lokal_guard_internal_bank_income'")).rows[0];assert.equal(guard.prosecdef,false);
 });
 await test('turnover and bank income stay unchanged throughout expense linking/import',async()=>{assert.deepEqual(await snapshot('einnahmen',1),turnoverBefore);assert.deepEqual(await snapshot('sonstige_einnahmen',1),bankBefore);});
 await db.close();console.log(`${passed} expense database groups passed; ${failures.length} failed.`);if(failures.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
