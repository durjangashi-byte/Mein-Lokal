import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import webpush from 'npm:web-push@3.6.7';
const origin='https://durjangashi-byte.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
function response(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers});}
function endpointAllowed(endpoint:string){try{const u=new URL(endpoint);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(u.hostname==='fcm.googleapis.com'||u.hostname.endsWith('.push.apple.com')||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.push.services.mozilla.com')||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}}
function berlinNow(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const val=(t:string)=>parts.find(p=>p.type===t)!.value;return {day:`${val('year')}-${val('month')}-${val('day')}`,hour:Number(val('hour'))};}
async function rows(table:string){const all:any[]=[];for(let i=0;;i+=1000){const {data,error}=await admin.from(table).select('*').order('id').range(i,i+999);if(error)throw error;all.push(...data);if(data.length<1000)return all;}}
async function deliver(subscription:any,payload:any,config:any){webpush.setVapidDetails('mailto:durjangashi@gmx.de',config.publicKey,config.privateKey);try{await webpush.sendNotification(subscription.subscription,JSON.stringify(payload),{TTL:86400,urgency:'normal',timeout:15000});return true;}catch(e:any){if(e.statusCode===404||e.statusCode===410)await admin.from('push_subscriptions').delete().eq('id',subscription.id);throw new Error('Push-Zustellung fehlgeschlagen'+(e.statusCode?' ('+e.statusCode+')':''));}}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return response({error:'POST required'},405);
 try{
  const {data:config,error:configError}=await admin.rpc('lokal_push_config');if(configError||!config)throw new Error('Push-Konfiguration fehlt');
  const body=await req.json();
  if(body.action==='scheduled'){
   if(req.headers.get('x-lokal-cron')!==config.cronToken)return response({error:'Unauthorized'},401);
   const now=berlinNow();if(now.hour!==9)return response({skipped:'outside 09:00 Europe/Berlin'});
   const {error:generateError}=await admin.rpc('lokal_generate_occurrences');if(generateError)throw generateError;
   const invoices=await rows('rechnungen');const roots=new Map(invoices.filter(r=>!r.serie_id).map(r=>[r.id,r]));
   const due=invoices.filter(r=>!r.bezahlt&&r.faellig&&r.faellig<=now.day&&(!r.erinnerung_am||r.erinnerung_am<=now.day)&&!r.pausiert&&!roots.get(r.serie_id)?.pausiert);
   if(!due.length)return response({due:0,delivered:0});
   const {data:subs,error}=await admin.from('push_subscriptions').select('*');if(error)throw error;
   let delivered=0,failed=0;
   for(const sub of subs||[]){
    // Only verified owners still authorized by the Auth server receive business reminders.
    const {data:owner,error:ownerError}=await admin.auth.admin.getUserById(sub.user_id);
    if(ownerError||!owner.user?.email_confirmed_at||owner.user?.app_metadata?.lokal_access!=='owner'||owner.user?.is_anonymous)continue;
    const claim=await admin.from('push_deliveries').insert({subscription_id:sub.id,day:now.day});
    if(claim.error){if(claim.error.code==='23505')continue;throw claim.error;}
    try{
     const total=due.reduce((n,r)=>n+Number(r.betrag||0),0);
     await deliver(sub,{title:due.length===1?'Heute zahlen: '+due[0].beschr.slice(0,65):`${due.length} Zahlungen offen`,body:(due.length===1?'':due.slice(0,3).map(r=>r.beschr.slice(0,30)).join(', ')+' · ')+new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(total),tag:'lokal-payments-'+now.day,url:'https://durjangashi-byte.github.io/Mein-Lokal/?view=rechnungen'},config);
     const saved=await admin.from('push_deliveries').update({sent_at:new Date().toISOString()}).eq('subscription_id',sub.id).eq('day',now.day);if(saved.error)throw saved.error;delivered++;
    }catch{failed++;await admin.from('push_deliveries').delete().eq('subscription_id',sub.id).eq('day',now.day);}
   }
   return response({due:due.length,delivered,failed});
  }
  const token=req.headers.get('authorization')?.replace(/^Bearer /i,'');if(!token)return response({error:'Bitte anmelden'},401);
  const {data,error}=await admin.auth.getUser(token);const user=data?.user;
  if(error||!user?.email_confirmed_at||user?.is_anonymous||user?.app_metadata?.lokal_access!=='owner')return response({error:'Nicht erlaubt'},403);
  const endpoint=String(body.endpoint||body.subscription?.endpoint||'');if(endpoint.length>2048||!endpointAllowed(endpoint))return response({error:'Ungültiger Push-Endpunkt'},400);
  if(body.action==='subscribe'){
   const sub=body.subscription;
   if(!sub?.keys||!/^[-_A-Za-z0-9]{80,100}$/.test(sub.keys.p256dh)||!/^[-_A-Za-z0-9]{20,30}$/.test(sub.keys.auth))return response({error:'Ungültige Push-Schlüssel'},400);
   const {count,error:countError}=await admin.from('push_subscriptions').select('id',{head:true,count:'exact'}).eq('user_id',user.id);if(countError)throw countError;
   const {data:existing}=await admin.from('push_subscriptions').select('id,user_id').eq('endpoint',endpoint).maybeSingle();
   if(existing&&existing.user_id!==user.id)return response({error:'Gerät gehört zu anderem Konto'},409);
   if(!existing&&(count||0)>=20)return response({error:'Gerätelimit erreicht'},400);
   const result=await admin.from('push_subscriptions').upsert({user_id:user.id,endpoint,subscription:sub},{onConflict:'endpoint'});if(result.error)throw result.error;return response({ok:true});
  }
  if(body.action==='unsubscribe'){const result=await admin.from('push_subscriptions').delete().eq('user_id',user.id).eq('endpoint',endpoint);if(result.error)throw result.error;return response({ok:true});}
  if(body.action==='test'){
   const {data:sub,error:subError}=await admin.from('push_subscriptions').select('*').eq('user_id',user.id).eq('endpoint',endpoint).single();if(subError)throw subError;
   await deliver(sub,{title:'Mein Lokal · Erinnerungen aktiv',body:'Zahlungserinnerungen kommen um 9 Uhr deutscher Zeit.',tag:'lokal-test',url:'https://durjangashi-byte.github.io/Mein-Lokal/?view=rechnungen'},config);return response({ok:true});
  }
  return response({error:'Unbekannte Aktion'},400);
 }catch(e:any){console.error('payment-reminders:',e.message);return response({error:e.message||'Erinnerungen fehlgeschlagen'},500);}
});
