-- Transactional fixtures; rollback removes all test business rows.
begin;
do $$
declare n integer; amount float8; due text;
begin
 insert into public.rechnungen(id,beschr,betrag,faellig,kat,wiederholung,anker,folgebetrag) values(-710001,'PAYMENT TEST',10,'2026-01-31','miete','monatlich','2026-01-31',15);
 if public.lokal_occurrence('2026-01-31','monatlich',1)<>'2026-02-28'::date or public.lokal_occurrence('2026-01-31','monatlich',2)<>'2026-03-31'::date then raise exception 'Month end drift';end if;
 if public.lokal_occurrence('2024-02-29','jaehrlich',1)<>'2025-02-28'::date then raise exception 'Leap year drift';end if;
 perform public.lokal_pay_invoice(-710001,12,'2026-10-02');
 perform public.lokal_pay_invoice(-710001,99,'2026-10-03');
 select count(*),max(betrag) into n,amount from public.ausgaben where rechnung_id=-710001;
 if n<>1 or amount<>12 then raise exception 'Duplicate or overwritten payment';end if;
 update public.rechnungen set notiz='note edit' where id=-710001;
 select count(*) into n from public.ausgaben where rechnung_id=-710001;if n<>1 then raise exception 'Paid edit lost expense';end if;
 select betrag into amount from public.rechnungen where serie_id=-710001 and faellig='2026-10-31';if amount<>15 then raise exception 'Future amount not retained';end if;
 update public.rechnungen set erinnerung_am='2026-10-04' where serie_id=-710001 and faellig='2026-10-31';
 select faellig into due from public.rechnungen where serie_id=-710001 and erinnerung_am='2026-10-04';if due<>'2026-10-31' then raise exception 'Snooze changed due date';end if;
 update public.rechnungen set pausiert=true where id=-710001;
 perform public.lokal_generate_occurrences('2027-12-01');
 select count(*) into n from public.rechnungen where serie_id=-710001 and faellig>'2026-10-31';if n<>0 then raise exception 'Paused series generated';end if;
 update public.rechnungen set pausiert=false where id=-710001;
 update public.rechnungen set wiederholung='einmalig' where id=-710001;
 select count(*) into n from public.rechnungen where serie_id=-710001 and faellig>(now() at time zone 'Europe/Berlin')::date::text;if n<>0 then raise exception 'Ended series has future unpaid rows';end if;
 update public.rechnungen set bezahlt=false where id=-710001;
 select count(*) into n from public.ausgaben where rechnung_id=-710001;if n<>0 then raise exception 'Reversal kept expense';end if;
 -- Restore payment to test protection of generated expenses.
 perform public.lokal_pay_invoice(-710001,12,'2026-10-02');
 begin delete from public.ausgaben where rechnung_id=-710001;raise exception 'Expense protection failed';exception when raise_exception then if sqlerrm='Expense protection failed' then raise;end if;end;
end $$;
select 'PASS payment idempotency, month/leap dates, future amount, snooze, pause/end, reversal, expense protection' as result;
rollback;
