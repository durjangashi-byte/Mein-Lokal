-- Existing bank income table is retained. No financial rows are rewritten.
-- All functions run as the caller: owner RLS and Qonto ownership remain enforced.
create or replace function public.lokal_guard_bank_income()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare q public.qonto_transactions%rowtype; linked text;
begin
  linked := case when TG_OP='DELETE' then OLD.qonto_transaction_id else NEW.qonto_transaction_id end;
  if TG_OP<>'DELETE' then
    if NEW.betrag <= 0 or NEW.betrag <> round(NEW.betrag,2) or btrim(NEW.beschreibung)='' then
      raise exception 'Gültige Beschreibung und positiven Cent-Betrag eingeben.';
    end if;
    if lower(NEW.beschreibung) ~ 'zahlungen[ -]vor[ -]ort|angeforderte zahlungen|kartenauszahlung|kartenabrechnung|card payout|card settlement' then
      raise exception 'Kartenauszahlungen sind bereits im Tagesumsatz enthalten.';
    end if;
    if TG_OP='UPDATE' and OLD.qonto_transaction_id is not null and NEW.qonto_transaction_id is distinct from OLD.qonto_transaction_id then
      raise exception 'Die Qonto-Verknüpfung darf nicht entfernt oder ersetzt werden.';
    end if;
  end if;
  if linked is not null then
    select * into q from public.qonto_transactions where id=linked for update;
    if not found or q.user_id is distinct from auth.uid() then raise exception 'Qonto-Buchung nicht zugänglich.'; end if;
    if TG_OP<>'DELETE' then
      if q.side<>'credit' or q.status<>'completed' or q.classification='privat' or q.ignored then raise exception 'Keine übernehmbare betriebliche Gutschrift.'; end if;
      if lower(q.label || ' ' || q.reference) ~ 'zahlungen[ -]vor[ -]ort|angeforderte zahlungen|kartenauszahlung|kartenabrechnung|card payout|card settlement' then
        raise exception 'Kartenauszahlungen sind bereits im Tagesumsatz enthalten.';
      end if;
      if (q.imported_kind is not null or q.imported_id is not null) and not (TG_OP='UPDATE' and OLD.qonto_transaction_id=linked) then
        raise exception 'Qonto-Buchung wurde bereits übernommen.';
      end if;
    end if;
    -- Retain a tombstone after deletion, so sync/reimport cannot recreate it.
    update public.qonto_transactions set imported_kind='ein',imported_id=case when TG_OP='DELETE' then OLD.id else NEW.id end,updated_at=now() where id=linked;
  end if;
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end $$;
revoke all on function public.lokal_guard_bank_income() from public,anon,authenticated;
create trigger lokal_bank_income_guard before insert or update or delete on public.sonstige_einnahmen
for each row execute function public.lokal_guard_bank_income();

create or replace function public.lokal_import_qonto_income(p_transaction_id text)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare q public.qonto_transactions%rowtype; existing_id bigint; candidates bigint[]; booking_date date;
begin
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'lokal_access','')<>'owner'
     or coalesce(auth.jwt()->>'is_anonymous','false')<>'false' then raise exception 'Kein Lokal-Zugriff.'; end if;
  -- Lock the source, serializing concurrent imports across devices.
  select * into q from public.qonto_transactions where id=p_transaction_id for update;
  if not found or q.user_id is distinct from auth.uid() then raise exception 'Qonto-Buchung nicht zugänglich.'; end if;
  select id into existing_id from public.sonstige_einnahmen where qonto_transaction_id=q.id;
  if found then return existing_id; end if;
  if q.imported_kind is not null or q.imported_id is not null or q.ignored or q.classification='privat'
    or q.side<>'credit' or q.status<>'completed' or q.amount<=0 then raise exception 'Bankbewegung ist bereits übernommen oder nicht importierbar.'; end if;
  if lower(q.label || ' ' || q.reference) ~ 'zahlungen[ -]vor[ -]ort|angeforderte zahlungen|kartenauszahlung|kartenabrechnung|card payout|card settlement' then
    raise exception 'Kartenauszahlungen sind bereits im Tagesumsatz enthalten.';
  end if;
  booking_date := (coalesce(q.settled_at,q.emitted_at) at time zone 'Europe/Berlin')::date;
  if booking_date is null then raise exception 'Buchungsdatum fehlt.'; end if;
  -- Recover a previously captured legacy Qonto row with no source FK.
  -- Ambiguous matches stop instead of creating another financial entry.
  select array_agg(id) into candidates from public.sonstige_einnahmen
    where qonto_transaction_id is null and datum=booking_date and betrag=q.amount
      and (lower(beschreibung) like '%'||lower(q.id)||'%'
        or (length(btrim(q.label))>3 and left(lower(beschreibung),length(btrim(q.label)))=lower(btrim(q.label))));
  if cardinality(candidates)>1 then raise exception 'Mehrere mögliche bestehende Einnahmen. Bitte Zuordnung prüfen.'; end if;
  if cardinality(candidates)=1 then
    update public.sonstige_einnahmen set qonto_transaction_id=q.id where id=candidates[1] returning id into existing_id;
    return existing_id;
  end if;
  insert into public.sonstige_einnahmen(datum,betrag,kategorie,beschreibung,quelle,qonto_transaction_id)
    values(booking_date,q.amount,case when lower(q.label||' '||q.reference) like '%cashback%' then 'cashback' else 'bankueberweisung' end,
      coalesce(nullif(btrim(q.label),''),nullif(btrim(q.reference),''),'Qonto Bankeingang'),'qonto',q.id)
    returning id into existing_id;
  return existing_id;
end $$;
revoke all on function public.lokal_import_qonto_income(text) from public,anon;
grant execute on function public.lokal_import_qonto_income(text) to authenticated;
-- Realtime publication membership is independent of SELECT/RLS access.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sonstige_einnahmen') then
   alter publication supabase_realtime add table public.sonstige_einnahmen;
 end if;
end $$;
