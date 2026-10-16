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

export default {
  fetch: withSupabase({auth:"user"}, async (req,ctx)=>{
    if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
    if(req.method!=="POST") return json({error:"Method not allowed"},405);
    if(ctx.userClaims?.app_metadata?.lokal_access!=="owner" || ctx.userClaims?.is_anonymous===true) return json({error:"Kein Lokal-Zugriff."},403);
    const login=Deno.env.get("QONTO_LOGIN");
    const secret=Deno.env.get("QONTO_SECRET_KEY");
    if(!login||!secret) return json({configured:false,error:"Qonto-Zugangsdaten noch nicht hinterlegt."},503);
    const userId=ctx.userClaims?.sub;
    if(!userId) return json({error:"Nicht angemeldet"},401);
    const headers={Authorization:login+":"+secret,Accept:"application/json"};
    const orgRes=await fetch("https://thirdparty.qonto.com/v2/organization",{headers});
    if(!orgRes.ok) return json({error:"Qonto-Verbindung fehlgeschlagen.",status:orgRes.status},502);
    const org=await orgRes.json();
    const accounts=org?.organization?.bank_accounts||[];
    let synced=0;
    for(const account of accounts){
      let page=1;
      while(page<=10){
        const u=new URL("https://thirdparty.qonto.com/v2/transactions");
        u.searchParams.set("bank_account_id",account.id||account.slug);
        u.searchParams.set("status[]","completed");
        u.searchParams.set("sort_by","settled_at:desc");
        u.searchParams.set("per_page","100");
        u.searchParams.set("page",String(page));
        const tr=await fetch(u,{headers});
        if(!tr.ok) return json({error:"Qonto-Transaktionen konnten nicht geladen werden.",status:tr.status},502);
        const payload=await tr.json(), txs=payload?.transactions||[];
        if(!txs.length) break;
        const rows=txs.map((t:any)=>({
          id:String(t.id||t.transaction_id),
          user_id:userId,
          bank_account_id:String(account.id||account.slug||""),
          iban:String(account.iban||""),
          amount:Math.abs(Number(t.amount_cents||0))/100,
          side:t.side==="credit"?"credit":"debit",
          status:String(t.status||"completed"),
          label:String(t.label||t.counterparty_name||t.initiator_name||""),
          reference:String(t.reference||t.note||""),
          settled_at:t.settled_at||null,
          emitted_at:t.emitted_at||null,
          raw:{...t,suggested_category:suggest(String(t.label||t.counterparty_name||""),String(t.reference||t.note||""))},
          updated_at:new Date().toISOString()
        }));
        const {error}=await ctx.supabaseAdmin.from("qonto_transactions").upsert(rows,{onConflict:"id"});
        if(error) return json({error:"Bankbewegungen konnten nicht gespeichert werden."},500);
        synced+=rows.length;
        if(!payload?.meta?.next_page) break;
        page=Number(payload.meta.next_page);
      }
    }
    return json({configured:true,synced,accounts:accounts.length});
  })
}
