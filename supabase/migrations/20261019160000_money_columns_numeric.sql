-- Geldbeträge centgenau speichern: double precision -> numeric.
-- Vorab geprüft (19.10.2026): alle Bestandswerte sind bereits centgenau,
-- Summen vor/nach Umstellung identisch (Trockenlauf mit Rollback).
-- App (sync.js normalize -> Number()), Edge Functions (Number()) und
-- Datenbankfunktionen/Trigger funktionieren unverändert weiter.
-- lokal_pay_invoice behält seine Signatur (p_amount double precision);
-- der Wert wird beim Speichern automatisch auf 2 Nachkommastellen gerundet.

begin;

alter table public.einnahmen
  alter column bar   type numeric(12,2) using round(bar::numeric, 2),
  alter column karte type numeric(12,2) using round(karte::numeric, 2),
  alter column tip   type numeric(12,2) using round(tip::numeric, 2);

alter table public.ausgaben
  alter column betrag type numeric(12,2) using round(betrag::numeric, 2);

alter table public.schichten
  alter column stunden    type numeric(6,2)  using round(stunden::numeric, 2),
  alter column lohn       type numeric(8,2)  using round(lohn::numeric, 2),
  alter column ausgezahlt type numeric(12,2) using round(ausgezahlt::numeric, 2);

alter table public.rechnungen
  alter column betrag      type numeric(12,2) using round(betrag::numeric, 2),
  alter column folgebetrag type numeric(12,2) using round(folgebetrag::numeric, 2);

commit;
