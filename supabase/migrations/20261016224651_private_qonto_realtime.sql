-- Read-only private withdrawals refresh through the existing Qonto owner RLS.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='qonto_transactions') then
   alter publication supabase_realtime add table public.qonto_transactions;
 end if;
end $$;
