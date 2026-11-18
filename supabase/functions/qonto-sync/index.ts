import { withSupabase } from "npm:@supabase/server@1";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});

function suggest(label:string, reference:string) {
  const s=(label+" "+reference).toLocaleLowerCase("de-DE");
  if(/aok|krankenkasse/.test(s)) return "aok";
  if(/finanzamt|steuer/.test(s)) return "finanzamt";
  if(/versicherung/.test(s)) return "versicherung";
  if(/strom|energie/.test(s)) return "strom";
  if(/gas/.test(s)) return "gas";
  if(/wasser/.test(s)) return "wasser";
  if(/telekom|vodafone|internet|telefon/.test(s)) return "internet";
  if(/miete|pacht/.test(s)) return "miete";
  if(/lohn|gehalt/.test(s)) return "personal";
  return "sonstiges";
}

// Qonto v2: amount is in account currency; amount_cents is integer cents.
// https://docs.qonto.com/api-reference/business-api/transactions-statements/transactions/list-transactions
function euroAmount(t:any) {
  const numeric=(value:unknown)=>typeof value==='number'?value:typeof value==='string'&&/^-?\d+(?:\.\d+)?$/.test(value.trim())?Number(value):NaN;
  const cents=numeric(t.amount_cents), euros=numeric(t.amount);
  const validCents=Number.isSafeInteger(cents);
  const scaled=euros*100, rounded=Math.round(scaled);
  const validEuros=Number.isFinite(euros)&&Number.isSafeInteger(rounded)&&(euros===0||rounded!==0)&&Math.abs(scaled-rounded)<=Math.min(0.0000001,Number.EPSILON*Math.max(1,Math.abs(scaled))*4);
  if(validCents&&validEuros&&Math.abs(cents)!==Math.abs(rounded))throw new Error('Widersprüchlicher Qonto-Betrag.');
  if(validCents)return Math.abs(cents)/100;
  if(validEuros)return Math.abs(rounded)/100;
  throw new Error('Ungültiger oder fehlender Qonto-Betrag.');
}
function identifier(value:unknown) {
  if(typeof value!=='string'||!value.trim())throw new Error('Qonto-Kennung fehlt.');
  return value;
}

function internalTransfer(t:any, ownIbans:Set<string>) {
  const reference=String(t.reference||t.note||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ');
  if(!/\binterne (?:ueberweisung|uberweisung)\b/.test(reference))return false;
  return [t.income?.counterparty_account_number,t.transfer?.counterparty_account_number].some(value=>typeof value==='string'&&ownIbans.has(value.replace(/\s/g,'').toUpperCase()));
}

export default {
  fetch: withSupabase({auth:"user"}, async (req,ctx)=>{
    if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
    if(req.method!=="POST") return json({error:"Method not allowed"},405);
    // jwtClaims is the raw JWT payload (app_metadata, is_anonymous, sub); userClaims uses camelCase keys.
    if(ctx.jwtClaims?.app_metadata?.lokal_access!=="owner" || ctx.jwtClaims?.is_anonymous===true) return json({error:"Kein Lokal-Zugriff."},403);
    const userId=ctx.jwtClaims?.sub;
    if(!userId) return json({error:"Nicht angemeldet"},401);
    const login=Deno.env.get("QONTO_LOGIN");
    const secret=Deno.env.get("QONTO_SECRET_KEY");
    if(!login||!secret) return json({configured:false,error:"Qonto-Zugangsdaten noch nicht hinterlegt."},503);
    const headers={Authorization:login+":"+secret,Accept:"application/json"};
    let synced=0;
    try {
      const source=async(url:string|URL)=>{
        const response=await fetch(url,{headers,signal:AbortSignal.timeout(25000)});
        if(!response.ok)throw new Error('Qonto-Abfrage fehlgeschlagen (HTTP '+response.status+').');
        return await response.json();
      };
      const org=await source("https://thirdparty.qonto.com/v2/organization");
      const accounts=org?.organization?.bank_accounts;
      if(!Array.isArray(accounts))throw new Error('Ungültige Qonto-Kontenliste.');
      const accountIds=new Set<string>();
      const ownIbans=new Set<string>(accounts.map((a:any)=>String(a.iban||'').replace(/\s/g,'').toUpperCase()).filter(Boolean));
      // A fixed creation cutoff avoids new transactions shifting pages during this run.
      const cutoff=new Date().toISOString();
      for(const account of accounts){
        const accountId=identifier(account.id||account.slug);
        if(accountIds.has(accountId))continue;
        accountIds.add(accountId);
        const seen=new Set<string>();
        let page=1,upper=cutoff,windowAdded=0;
        const pageSignatures=new Set<string>();
        while(true){
          const u=new URL("https://thirdparty.qonto.com/v2/transactions");
          u.searchParams.set("bank_account_id",accountId);
          u.searchParams.set("status[]","completed");
          u.searchParams.set("sort_by","created_at:desc");
          u.searchParams.set("created_at_to",upper);
          u.searchParams.set("per_page","100");
          u.searchParams.set("page",String(page));
          const payload=await source(u),txs=payload?.transactions,meta=payload?.meta;
          if(!Array.isArray(txs)||!meta||typeof meta!=='object')throw new Error('Ungültige Qonto-Transaktionsseite.');
          if(meta.current_page!=null&&Number(meta.current_page)!==page)throw new Error('Qonto-Seitenfolge stimmt nicht.');
          const next=meta.next_page;
          if(next!==null&&next!==undefined&&(!Number.isSafeInteger(Number(next))||Number(next)!==page+1))throw new Error('Ungültige Qonto-Folgeseite.');
          if(next===undefined)throw new Error('Qonto-Seiteninformationen fehlen.');
          if(meta.total_pages!=null&&(!Number.isSafeInteger(Number(meta.total_pages))||Number(meta.total_pages)<0||Number(meta.total_pages)<page&&txs.length>0))throw new Error('Ungültige Qonto-Seitenzahl.');
          if((next===null||next===undefined)&&meta.total_pages!=null&&Number(meta.total_pages)>page)throw new Error('Qonto-Folgeseite fehlt.');
          if(!txs.length){if(next!=null)throw new Error('Leere Qonto-Seite mit Folgeseite.');break;}
          // Validate the complete page before writing any of its rows. Never invent zero amounts or debit sides.
          const rows=txs.map((t:any)=>{
            const id=identifier(t?.id||t?.transaction_id);
            if(t.side!=='credit'&&t.side!=='debit')throw new Error('Ungültige Qonto-Buchungsrichtung.');
            const amount=euroAmount(t);
            if(t.currency&&t.currency!=='EUR')throw new Error('Qonto-Kontowährung ist nicht EUR.');
            return {
              id,user_id:userId,bank_account_id:accountId,iban:String(account.iban||''),amount,side:t.side,
              status:String(t.status||'completed'),label:String(t.label||t.counterparty_name||t.initiator_name||''),reference:String(t.reference||t.note||''),
              settled_at:t.settled_at||null,emitted_at:t.emitted_at||null,
              raw:{...t,lokal_internal_transfer:internalTransfer(t,ownIbans),suggested_category:suggest(String(t.label||t.counterparty_name||''),String(t.reference||t.note||''))},updated_at:new Date().toISOString()
            };
          });
          const ids=rows.map((r:any)=>r.id);
          if(new Set(ids).size!==ids.length)throw new Error('Doppelte Qonto-Kennung auf einer Seite.');
          const signature=JSON.stringify(ids);
          if(pageSignatures.has(signature))throw new Error('Qonto wiederholt eine Seite.');
          pageSignatures.add(signature);
          const fresh=rows.filter((r:any)=>!seen.has(r.id));
          if(fresh.length){
            // Only source columns are supplied: classification/private/import metadata stay untouched.
            const {error}=await ctx.supabaseAdmin.from('qonto_transactions').upsert(fresh,{onConflict:'id'});
            if(error)return json({error:'Bankbewegungen konnten nicht gespeichert werden.',synced,complete:false},500);
            fresh.forEach((r:any)=>seen.add(r.id));synced+=fresh.length;windowAdded+=fresh.length;
          }
          if(next===null||next===undefined)break;
          if(page<100){page=Number(next);continue;}
          // Qonto limits page*per_page to 10,000. Continue inclusively from the
          // oldest created_at, deduplicating boundary rows. Fail visibly if ties
          // make that boundary impossible to traverse rather than claiming success.
          const boundary=txs[txs.length-1]?.created_at;
          const boundaryTime=typeof boundary==='string'?Date.parse(boundary):NaN;
          if(!windowAdded||!Number.isFinite(boundaryTime)||boundaryTime>=Date.parse(upper))throw new Error('Qonto-Zeitgrenze kann nicht sicher fortgesetzt werden.');
          upper=boundary;page=1;windowAdded=0;pageSignatures.clear();
        }
      }
      return json({configured:true,synced,accounts:accountIds.size,complete:true});
    } catch {
      // Never expose upstream bodies, credentials or database details to the browser.
      return json({error:'Qonto-Abgleich unvollständig. Quelldaten, Beträge oder Seitenfolge konnten nicht sicher gelesen werden.',synced,complete:false},502);
    }
  })
}
