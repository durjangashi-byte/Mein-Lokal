begin;
create sequence if not exists public.lokal_payment_ids start 8000000000000000 maxvalue 9007199254740991;
grant usage on sequence public.lokal_payment_ids to authenticated,service_role;
alter table public.rechnungen
 add column if not exists kat text not null default 'sonstiges',
 add column if not exists anbieter text not null default '',
 add column if not exists kontakt text not null default '',
 add column if not exists kundennummer text not null default '',
 add column if not exists wiederholung text not null default 'einmalig' check(wiederholung in ('einmalig','woechentlich','monatlich','vierteljaehrlich','jaehrlich')),
 add column if not exists pausiert boolean not null default false,
 add column if not exists anker date,
 add column if not exists serie_id bigint references public.rechnungen(id),
 add column if not exists erinnerung_am date,
 add column if not exists bezahlt_am date,
 add column if not exists folgebetrag double precision;
create unique index if not exists rechnung_occurrence_unique on public.rechnungen(serie_id,faellig) where serie_id is not null;
alter table public.ausgaben add column if not exists rechnung_id bigint references public.rechnungen(id);
create unique index if not exists ausgabe_rechnung_unique on public.ausgaben(rechnung_id) where rechnung_id is not null;
create or replace function public.lokal_occurrence(anchor date, rule text, n integer) returns date
language sql immutable strict set search_path='' as $$
 select case when rule='woechentlich' then anchor+n*7
 else (date_trunc('month',anchor)::date + make_interval(months=>n*case rule when 'monatlich' then 1 when 'vierteljaehrlich' then 3 when 'jaehrlich' then 12 else 0 end))::date
 + (least(extract(day from anchor)::int,extract(day from (date_trunc('month',anchor)+make_interval(months=>n*case rule when 'monatlich' then 1 when 'vierteljaehrlich' then 3 when 'jaehrlich' then 12 else 0 end)+interval '1 month - 1 day'))::int)-1) end;
$$;
create or replace function public.lokal_generate_occurrences(p_until date default (now() at time zone 'Europe/Berlin')::date) returns integer
language plpgsql security invoker set search_path='' as $$
declare r public.rechnungen; d date; n integer; added integer:=0; c integer;
begin
 if coalesce(auth.role(),'') not in ('service_role') and current_user not in ('postgres','supabase_admin') and coalesce(auth.jwt()->'app_metadata'->>'lokal_access','')<>'owner' then raise exception 'Nicht erlaubt';end if;
 perform pg_advisory_xact_lock(819341);
 for r in select * from public.rechnungen where serie_id is null and wiederholung<>'einmalig' and not pausiert loop
  if coalesce(r.anker,case when r.faellig ~ '^\d{4}-\d{2}-\d{2}$' then r.faellig::date end) is null then continue;end if;
  for n in 1..1200 loop
   d:=public.lokal_occurrence(coalesce(r.anker,r.faellig::date),r.wiederholung,n);
   insert into public.rechnungen(id,beschr,betrag,faellig,notiz,bezahlt,kat,anbieter,kontakt,kundennummer,wiederholung,serie_id,anker)
    values(nextval('public.lokal_payment_ids'),r.beschr,coalesce(r.folgebetrag,r.betrag),d::text,r.notiz,false,r.kat,r.anbieter,r.kontakt,r.kundennummer,'einmalig',r.id,coalesce(r.anker,r.faellig::date))
    on conflict do nothing;
   get diagnostics c=row_count;added:=added+c;
   exit when d>p_until;
  end loop;
 end loop;
 return added;
end $$;
revoke all on function public.lokal_generate_occurrences(date) from public,anon;
grant execute on function public.lokal_generate_occurrences(date) to authenticated,service_role;
create or replace function public.lokal_payment_change() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.bezahlt and coalesce(new.betrag,0)<=0 then raise exception 'Zahlungsbetrag muss positiv sein';end if;
 if tg_op='UPDATE' and old.bezahlt and new.bezahlt and (new.betrag is distinct from old.betrag or new.kat is distinct from old.kat or new.bezahlt_am is distinct from old.bezahlt_am) then raise exception 'Zuerst Zahlung zurücknehmen, dann korrigieren';end if;
 if new.bezahlt and (tg_op='INSERT' or not old.bezahlt) then
  new.bezahlt_am:=coalesce(new.bezahlt_am,(now() at time zone 'Europe/Berlin')::date);
  insert into public.ausgaben(id,datum,kat,beschr,betrag,rechnung_id)
   values(nextval('public.lokal_payment_ids'),new.bezahlt_am::text,new.kat,new.beschr,new.betrag,new.id)
   on conflict(rechnung_id) where rechnung_id is not null do nothing;
 elsif tg_op='UPDATE' and old.bezahlt and not new.bezahlt then
  delete from public.ausgaben where rechnung_id=new.id;new.bezahlt_am:=null;
 end if;
 return new;
end $$;

create or replace function public.lokal_pay_invoice(p_id bigint,p_amount double precision,p_date date) returns table(id bigint)
language plpgsql security invoker set search_path='' as $$
declare invoice public.rechnungen;
begin
 if p_amount is null or p_amount<=0 or p_amount='NaN'::float8 or p_amount='Infinity'::float8 or p_date is null then raise exception 'Ungültiger Zahlungsbetrag oder Datum';end if;
 select r.* into invoice from public.rechnungen r where r.id=p_id for update;
 if not found then raise exception 'Zahlung fehlt oder Zugriff nicht erlaubt';end if;
 if not invoice.bezahlt then update public.rechnungen r set bezahlt=true,betrag=p_amount,bezahlt_am=p_date where r.id=p_id;end if;
 return query select p_id;
end $$;
revoke all on function public.lokal_pay_invoice(bigint,double precision,date) from public,anon;
grant execute on function public.lokal_pay_invoice(bigint,double precision,date) to authenticated,service_role;

-- AFTER insert/update ensures the invoice FK exists; payment date is set BEFORE.
create or replace function public.lokal_payment_date() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.bezahlt and (tg_op='INSERT' or not old.bezahlt) then new.bezahlt_am:=coalesce(new.bezahlt_am,(now() at time zone 'Europe/Berlin')::date);elsif new.bezahlt then null;else new.bezahlt_am:=null;end if;return new;
end $$;
create trigger lokal_payment_date before insert or update on public.rechnungen for each row execute function public.lokal_payment_date();
create trigger lokal_payment_change after insert or update on public.rechnungen for each row execute function public.lokal_payment_change();
create or replace function public.lokal_series_change() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.serie_id is not null then return new;end if;
 if tg_op='UPDATE' and (old.wiederholung is distinct from new.wiederholung or old.anker is distinct from new.anker or old.faellig is distinct from new.faellig) then
  delete from public.rechnungen where serie_id=new.id and not bezahlt and faellig>(now() at time zone 'Europe/Berlin')::date::text;
 end if;
 if new.wiederholung<>'einmalig' then
  update public.rechnungen set beschr=new.beschr,betrag=coalesce(new.folgebetrag,new.betrag),kat=new.kat,anbieter=new.anbieter,kontakt=new.kontakt,kundennummer=new.kundennummer,notiz=new.notiz
   where serie_id=new.id and not bezahlt and faellig>(now() at time zone 'Europe/Berlin')::date::text;
  perform public.lokal_generate_occurrences();
 end if;return new;
end $$;
create trigger lokal_series_change after insert or update on public.rechnungen for each row execute function public.lokal_series_change();
create or replace function public.lokal_protect_expense() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if pg_trigger_depth()<=1 and old.rechnung_id is not null then raise exception 'Diese Ausgabe gehört zu einer Rechnung. Zahlung dort zurücknehmen.';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger lokal_protect_expense before update or delete on public.ausgaben for each row execute function public.lokal_protect_expense();
-- Keep historic paid invoices unchanged: no retrospective expense booking.
create table public.push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,endpoint text not null unique,subscription jsonb not null,created_at timestamptz not null default now());
create table public.push_deliveries(subscription_id uuid references public.push_subscriptions(id) on delete cascade,day date,claimed_at timestamptz not null default now(),sent_at timestamptz,primary key(subscription_id,day));
alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;
create policy push_backend_only on public.push_subscriptions for all to service_role using(true) with check(true);
create policy delivery_backend_only on public.push_deliveries for all to service_role using(true) with check(true);
revoke all on public.push_subscriptions,public.push_deliveries from anon,authenticated;
grant select,insert,update,delete on public.push_subscriptions,public.push_deliveries to service_role;
create or replace function public.lokal_push_config() returns jsonb language sql security definer set search_path='' as $$
 select decrypted_secret::jsonb from vault.decrypted_secrets where name='lokal_push_config';
$$;
revoke all on function public.lokal_push_config() from public,anon,authenticated;
grant execute on function public.lokal_push_config() to service_role;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('lokal-generate-payments','55 * * * *',$job$select public.lokal_generate_occurrences() where extract(hour from now() at time zone 'Europe/Berlin')=8;$job$);
select cron.schedule('lokal-payment-reminders','0 * * * *',$job$
 select net.http_post(url:='https://ofrowanjbedqbmpgtkkv.supabase.co/functions/v1/payment-reminders',headers:=jsonb_build_object('Content-Type','application/json','x-lokal-cron',(select (decrypted_secret::jsonb)->>'cronToken' from vault.decrypted_secrets where name='lokal_push_config')),body:='{"action":"scheduled"}'::jsonb,timeout_milliseconds:=30000)
 where extract(hour from now() at time zone 'Europe/Berlin')=9;
$job$);
notify pgrst,'reload schema';
commit;
