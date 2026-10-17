-- Add an atomic, explicitly confirmed expense matching/import API.
-- No historical business rows, classifications, or legacy markers are changed.
begin;

-- Includes private/ignored sources and rows hidden from an invoker by RLS.
-- Conflicting historical links must be reviewed, never silently rewritten.
create unique index lokal_qonto_expense_import_unique
  on public.qonto_transactions(imported_id)
  where imported_kind='aus' and imported_id is not null;

create function public.lokal_import_qonto_expense(
  p_transaction_id text,
  p_expense_id bigint default null,
  p_allow_new boolean default false
) returns bigint
language plpgsql security invoker set search_path='' as $$
declare
  q public.qonto_transactions%rowtype;
  expense public.ausgaben%rowtype;
  booking_date date;
  expense_date date;
  legacy_ids bigint[];
  expense_id bigint;
  category text;
  description text;
  affected integer;
begin
  if auth.uid() is null
    or coalesce(auth.jwt()->'app_metadata'->>'lokal_access','')<>'owner'
    or coalesce(auth.jwt()->>'is_anonymous','false')<>'false' then
    raise exception 'Kein Lokal-Zugriff.';
  end if;
  if p_transaction_id is null or btrim(p_transaction_id)='' then
    raise exception 'Qonto-Buchung fehlt.';
  end if;

  select * into q from public.qonto_transactions
    where id=p_transaction_id for update;
  if not found or q.user_id is distinct from auth.uid() then
    raise exception 'Qonto-Buchung nicht zugänglich.';
  end if;
  if q.side is distinct from 'debit' or q.status is distinct from 'completed'
    or q.classification='privat' or coalesce(q.ignored,false)
    or coalesce(q.raw->>'lokal_internal_transfer','false')='true' then
    raise exception 'Keine übernehmbare betriebliche Lastschrift.';
  end if;
  if q.amount is null or q.amount::text in ('NaN','Infinity','-Infinity')
    or q.amount<=0 or q.amount::numeric<>round(q.amount::numeric,2)
    or q.amount::numeric*100>9007199254740991 then
    raise exception 'Qonto-Betrag muss positiv und centgenau sein.';
  end if;
  booking_date := (coalesce(q.settled_at,q.emitted_at) at time zone 'Europe/Berlin')::date;
  if booking_date is null or not isfinite(booking_date) then
    raise exception 'Qonto-Buchungsdatum fehlt oder ist ungültig.';
  end if;

  -- Lost acknowledgements are harmless. A deleted/hidden target is a tombstone,
  -- not permission to create another expense, even with p_allow_new=true.
  if q.imported_kind='aus' and q.imported_id is not null then
    if p_expense_id is not null and p_expense_id<>q.imported_id then
      raise exception 'Qonto-Buchung ist bereits mit einer anderen Ausgabe verknüpft.';
    end if;
    select * into expense from public.ausgaben where id=q.imported_id for update;
    if not found then
      raise exception 'Qonto-Ausgabe wurde bereits übernommen; Ziel fehlt oder wurde gelöscht.';
    end if;
    return expense.id;
  end if;
  if q.imported_kind is not null or q.imported_id is not null then
    raise exception 'Qonto-Buchung wurde bereits übernommen oder die Verknüpfung ist unvollständig.';
  end if;

  -- Exact legacy source tags are evidence of a prior capture, never an automatic
  -- name/amount match. An explicit valid target is required to repair the link.
  select array_agg(id) into legacy_ids from public.ausgaben
    where strpos(lower(coalesce(beschr,'')),'[qonto:'||lower(q.id)||']')>0;
  if coalesce(cardinality(legacy_ids),0)>0 and
     (p_expense_id is null or not p_expense_id=any(legacy_ids)
      or cardinality(legacy_ids)>1) then
    raise exception 'Bestehende Ausgabe mit Qonto-Markierung gefunden. Bitte Zuordnung prüfen und ausdrücklich verknüpfen.';
  end if;

  if p_expense_id is not null then
    select * into expense from public.ausgaben where id=p_expense_id for update;
    if not found then raise exception 'Ausgabe fehlt oder ist nicht zugänglich.'; end if;
    if expense.betrag is null or expense.betrag::text in ('NaN','Infinity','-Infinity')
      or expense.betrag::numeric<>round(expense.betrag::numeric,2)
      or expense.betrag::numeric<>q.amount::numeric then
      raise exception 'Ausgabe und Qonto-Buchung müssen denselben Centbetrag haben.';
    end if;
    if coalesce(expense.datum::text,'')!~'^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Ausgabedatum ist ungültig.';
    end if;
    begin
      expense_date:=expense.datum::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Ausgabedatum ist ungültig.';
    end;
    if expense_date<booking_date-7 or expense_date>booking_date+7 then
      raise exception 'Ausgabedatum muss innerhalb von sieben Tagen der Qonto-Buchung liegen.';
    end if;
    if exists(select 1 from public.qonto_transactions other
      where other.id<>q.id and other.imported_kind='aus' and other.imported_id=expense.id)
      or exists(select 1 from regexp_matches(coalesce(expense.beschr,''),'\[Qonto:([^]]+)\]','gi') as marker(parts)
        where lower(btrim(parts[1]))<>lower(q.id)) then
      raise exception 'Diese Ausgabe gehört bereits zu einer anderen Qonto-Buchung.';
    end if;
    expense_id:=expense.id;
    -- No UPDATE of ausgaben: invoice/category/amount/description/date stay intact.
  else
    if not coalesce(p_allow_new,false) and exists(
      select 1 from public.ausgaben candidate
      where candidate.betrag::numeric=q.amount::numeric
        and candidate.datum::text ~ '^\d{4}-\d{2}-\d{2}$'
        and candidate.datum::text between (booking_date-7)::text and (booking_date+7)::text
        and coalesce(candidate.beschr,'')!~*'\[Qonto:[^]]+\]'
        and not exists(select 1 from public.qonto_transactions other
          where other.imported_kind='aus' and other.imported_id=candidate.id)
    ) then
      raise exception 'Mögliche bestehende Ausgabe gefunden. Bitte verknüpfen oder eine separate neue Ausgabe ausdrücklich bestätigen.';
    end if;
    category:=lower(btrim(coalesce(q.raw->>'suggested_category','')));
    if category='aok' then category:='krankenkasse'; end if;
    if category not in ('lebensmittel','getraenke','personal','krankenkasse','sozialversicherung',
      'finanzamt','versicherung','miete','strom','gas','wasser','internet','steuerberater',
      'gebuehren','reparatur','fahrzeug','reinigung','sonstiges','schulden') then
      category:='sonstiges';
    end if;
    description:=regexp_replace(coalesce(nullif(btrim(q.label),''),nullif(btrim(q.reference),''),'Qonto Bankausgang'),'[[:cntrl:]]',' ','g');
    insert into public.ausgaben(id,datum,kat,beschr,betrag,rechnung_id)
      values(nextval('public.lokal_payment_ids'),booking_date::text,category,
        left(description,180)||' [Qonto:'||q.id||']',q.amount,null)
      returning id into expense_id;
  end if;

  -- The unique index also rejects competing links hidden by RLS.
  update public.qonto_transactions
    set imported_kind='aus',imported_id=expense_id,classification='betrieblich',private_category=null,updated_at=now()
    where id=q.id;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Qonto-Verknüpfung konnte nicht gespeichert werden.'; end if;
  return expense_id;
end $$;

revoke all on function public.lokal_import_qonto_expense(text,bigint,boolean) from public,anon;
grant execute on function public.lokal_import_qonto_expense(text,bigint,boolean) to authenticated;

-- Preserve neutral own-account transfers even when a new source has not yet
-- been classified/ignored. This complements the existing income guards.
create function public.lokal_guard_internal_bank_income()
returns trigger language plpgsql security invoker set search_path='' as $$
declare q public.qonto_transactions%rowtype;
begin
  if new.qonto_transaction_id is null then return new; end if;
  select * into q from public.qonto_transactions
    where id=new.qonto_transaction_id for update;
  if not found or q.user_id is distinct from auth.uid() then
    raise exception 'Qonto-Buchung nicht zugänglich.';
  end if;
  if coalesce(q.raw->>'lokal_internal_transfer','false')='true' then
    raise exception 'Interne Umbuchungen sind ergebnisneutral und keine zusätzliche Einnahme.';
  end if;
  return new;
end $$;
revoke all on function public.lokal_guard_internal_bank_income() from public,anon,authenticated;
create trigger lokal_internal_bank_income_guard before insert or update
  on public.sonstige_einnahmen for each row
  execute function public.lokal_guard_internal_bank_income();
commit;
