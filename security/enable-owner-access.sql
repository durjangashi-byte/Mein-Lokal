-- Activate ONLY after a confirmed account has been explicitly assigned
-- raw_app_meta_data.lokal_access = 'owner' by the project administrator.
-- Never grant access based on user_metadata or first-signup-wins.
begin;
do $$
declare t text;
begin
  if not exists(select 1 from auth.users where email_confirmed_at is not null
      and not is_anonymous and raw_app_meta_data->>'lokal_access'='owner') then
    raise exception 'No verified owner configured; rollout aborted to prevent lockout';
  end if;
  foreach t in array array['einnahmen','ausgaben','schichten','rechnungen','lieferanten'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists %I on public.%I','app_access_'||t,t);
    execute format('drop policy if exists lokal_owner_access on public.%I',t);
    execute format($policy$
      create policy lokal_owner_access on public.%I for all to authenticated
      using ((select auth.jwt()->'app_metadata'->>'lokal_access') = 'owner'
        and coalesce((select auth.jwt()->>'is_anonymous'),'false') = 'false')
      with check ((select auth.jwt()->'app_metadata'->>'lokal_access') = 'owner'
        and coalesce((select auth.jwt()->>'is_anonymous'),'false') = 'false')
    $policy$,t);
    execute format('revoke all on public.%I from anon',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  end loop;
end $$;
commit;
