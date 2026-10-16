# Mein Lokal

Restaurant-App auf GitHub Pages mit Supabase-Synchronisierung. `index.html` enthält die vorhandenen Ansichten, `sync.js` synchronisiert die fünf bestehenden Geschäftstabellen, `auth.js` verwaltet die Anmeldung. Supabase JS ist auf **2.117.2** festgelegt.

## Nutzung

Mit dem bestätigten Besitzerkonto anmelden. Einnahmen, Ausgaben, Schichten, Rechnungen und Lieferanten werden gemeinsam geladen und live aktualisiert. Ausstehende Änderungen bleiben in einer lokal gespeicherten Warteschlange und werden nach Wiederverbindung übertragen. Projekt und Konto begrenzen Cache und Warteschlange. Eine erneute Anmeldung oder Sitzungsverlängerung darf die Warteschlange nicht verlieren.

Einstellungen zeigen Verbindungszustand, ausstehende Änderungen und Fehler. **Jetzt synchronisieren** startet einen zusätzlichen Abgleich. Realtime-Rückkehr, Vordergrundwechsel und ein 30-Sekunden-Abgleich schließen verpasste Ereignisse. Daten werden auch oberhalb des API-Limits von 1.000 Zeilen vollständig geladen. Personal-Vorlagen und Simulationseinstellungen bleiben lokal.

**Frühere lokale Daten ergänzen** importiert gespeicherte Altdaten ausdrücklich, ohne bestehende Cloud-IDs zu überschreiben. Vorher JSON-Backup exportieren. Backups enthalten alle fünf Tabellen sowie Warteschlange und Wiederherstellungskopie. Der Import ergänzt fehlende IDs; ausstehende Löschaufträge werden nicht automatisch aus einem Backup ausgeführt.

## Rechnungen & Zahlungen (v7)

Unter **Mehr → Rechnungen & Zahlungen** eine freie Beschreibung, Betrag, Kategorie und Fälligkeit erfassen. Anbieter/Kontakt/Kundennummer sind freiwillig. Einmalig, wöchentlich, monatlich, vierteljährlich oder jährlich wiederholen. **Erledigt / bezahlt** fragt Zahlungsbetrag/-datum ab und bucht genau einmal eine verknüpfte Ausgabe. Das ist eine Erfassung, keine Banküberweisung. **Zahlung zurücknehmen** entfernt diese automatische Ausgabe. Korrekturen dieser Ausgaben immer über die Zahlung vornehmen.

**Später erinnern** verschiebt die Erinnerung, nicht die Fälligkeit. Wiederholung **pausieren**, **fortsetzen** oder **beenden**; beim Fortsetzen werden ausstehende Termine nachgetragen. Folgebetrag optional separat festlegen. Bereits bezahlte Termine bleiben erhalten. Die Seite zeigt offene Beträge der nächsten sieben Tage, des laufenden Monats und überfällige Zahlungen; Suche und Zeitraumfilter sind verfügbar. Bisherige Lieferanten sind als optionale **Anbieter-Vorlagen verwalten** in dieser Seite erhalten.

### Mitteilungen auf dem iPhone

1. App in Safari öffnen, **Teilen → Zum Home-Bildschirm**.
2. Über das Home-Screen-Symbol öffnen und anmelden.
3. **Mehr → Rechnungen & Zahlungen → Mitteilungen aktivieren**, iOS-Freigabe erteilen, danach **Test senden**.

Backend und Zeitplan sind eingerichtet: täglich um 9 Uhr deutscher Zeit, einschließlich Sommer-/Winterzeit, eine zusammengefasste Erinnerung pro registriertem Gerät. Die App muss dafür nicht geöffnet sein. Überfällige Zahlungen werden weiter berücksichtigt; Fokusmodus/Geräteeinstellungen können Mitteilungen verzögern. Auf dieser Seite lassen sich Mitteilungen für das aktuelle Gerät auch ausschalten. Keine Push-Testzustellung aufs persönliche iPhone wurde ohne dessen Freigabe durchgeführt.

Technischer Stand, SQL-Snapshot und alle geänderten Funktionen: [CHANGELOG.md](CHANGELOG.md). Private Push-Schlüssel liegen ausschließlich in Supabase Vault. Geschäftsdaten werden in den bestehenden Tabellen gespeichert; nur Geräteabonnements und Zustellungsprotokolle benötigen neue Tabellen. Der Service Worker fügt keinen Offline-Seiten-Cache hinzu.

## Mobile Navigation

Unten stehen **Übersicht**, **Einnahmen**, **Ausgaben** und **Mehr**. Unter Mehr bleiben Personal/Schichten, Tagesabschluss, Monatsauswertung, Rechnungen, Lieferanten und Einstellungen erreichbar. Auf dem PC gibt es weiterhin die Seitenleiste.

## Alltagspaket (v6)

Die Startseite zeigt zunächst den aktuellen Monat. Über **Zeitraum der Übersicht** lassen sich vorhandene Monate oder der gesamte Zeitraum wählen; die Kennzahlen oben und Dashboard-Auswertungen folgen dieser Auswahl. Das Ergebnis ist Einnahmen inklusive erfasstem Trinkgeld minus Ausgaben minus erfasste Schichtkosten. Vor Personalkosten wird es separat gezeigt. Offene Rechnungen beziehen sich auf alle Zeiträume und werden nicht nochmals vom Ergebnis abgezogen.

**Bearbeiten** öffnet einen vorhandenen Eintrag im ursprünglichen Formular. **Änderungen speichern** behält seine ID und nutzt die bestehende Cloud-Warteschlange. **Bearbeiten abbrechen** lässt die Daten unverändert. Bei Schichten werden Stunden und Kosten neu berechnet, bei Rechnungen bleibt der Zahlungsstatus erhalten. Bereits erkannte Änderungen von einem anderen Gerät verhindern das Speichern eines veralteten Entwurfs; es gibt weiterhin keinen atomaren Konfliktschutz bei exakt gleichzeitigem Speichern.

Datum ist vorausgefüllt; die zuletzt gespeicherte Ausgaben-/Lieferantenkategorie wird auf demselben Gerät beim ersten Öffnen angeboten. Eingabefehler und doppelte Speicheraktionen werden abgefangen. Die Startseite zeigt, ob Änderungen auf diesem Gerät gesichert sind, auf Übertragung warten oder mit Supabase abgeglichen wurden. **Jetzt abgleichen** startet manuell einen Abgleich. Der iPhone/PC-Praxistest bleibt wie vereinbart offen.

## Anmeldung und Zugriff

Ein erfolgreicher Login genügt nicht: Der Auth-Server muss das Konto bestätigen und administrative `app_metadata.lokal_access = owner` liefern. Alle fünf Tabellen verwenden die passenden RLS-Regeln; der öffentliche Publishable Key gewährt allein keinen Datenzugriff. Benutzer können keine Zugriffsrechte durch eigene `user_metadata` erzeugen.

Die aktivierte Datenbankänderung ist in `security/enable-owner-access.sql` dokumentiert. Sie nutzt die vorhandenen Tabellen und bricht ohne bestätigten Besitzer ab. Kontorechte ausschließlich durch den Administrator vergeben. Passkeys benötigen zusätzlich die Auth-Konfiguration im Dashboard und die Registrierung auf dem eigenen Gerät. Einrichtung und Grenzen: [CHANGELOG.md](CHANGELOG.md).

## Tests

Ohne externe Schreibzugriffe:

```sh
node tests/auth.cjs
node tests/app-smoke.cjs
```

Live-Test nur ausdrücklich mit einem berechtigten Testkonto ausführen. Er schreibt klar markierte negative Test-IDs und entfernt nur diese. Wenn möglich ein Testprojekt verwenden. Nicht in eine bestehende gemeinsam genutzte Warteschlange schreiben.

```sh
SUPABASE_TEST_SDK=/absolute/path/to/supabase-2.117.2-umd.js \
SUPABASE_TEST_EMAIL=owner@example.com \
SUPABASE_TEST_PASSWORD='set-locally' \
node tests/live-sync.cjs
```

Die UMD-Datei stammt aus dem gleichen festgelegten jsDelivr-Paket wie die App. `SUPABASE_URL` und `SUPABASE_PUBLISHABLE_KEY` können das Testziel überschreiben. Keine Zugangsdaten oder Sitzungstokens im Repository speichern. Der DOM-Test ersetzt keinen Layout- oder Safari-Test; der Live-Test prüft die echten Daten- und Realtime-Schnittstellen.


## Sonstige betriebliche Bankeinnahmen

Unter **Einnahmen → Sonstige betriebliche Einnahmen** lassen sich Überweisungen, Cashback und weitere betriebliche Einnahmen separat anlegen, bearbeiten, löschen sowie nach Monat und Text durchsuchen. Ein leerer Monatsfilter zeigt alle Monate. Die Summe folgt beiden Filtern. Die Restaurant-Tagesumsätze, Bar-/Kartenanteile und Umsatzdiagramme bleiben unverändert. Cockpit, Tagesergebnis, Monatsauswertung sowie PDF-/CSV-Auswertung berücksichtigen die zusätzlichen Einnahmen genau einmal. Monatsübersicht und Cockpit enthalten auch Monate mit ausschließlich Bankeinnahmen. Der allgemeine PDF-Export umfasst weiterhin alle gespeicherten Zeiträume.

Die Tabelle `sonstige_einnahmen` nutzt die gemeinsame Sync-Engine, Owner-RLS, gerätegebundenen Cache und dauerhafte Warteschlange. Realtime, Vordergrundwechsel und 30-Sekunden-Abgleich übertragen Änderungen; das JSON-Backup enthält `bank` samt Qonto-Verknüpfungen. Nicht übertragene Änderungen werden als ausstehend angezeigt. Erkannte Änderungen an einem geöffneten Entwurf verhindern veraltetes Speichern; exakt gleichzeitige manuelle Änderungen unterliegen wie die übrige App noch Last-Write-Wins.

Qonto-Gutschriften werden ausschließlich über `lokal_import_qonto_income` in sonstige Einnahmen übernommen. Die RPC sperrt die Quellzeile, prüft Owner/Quellenbesitzer, Status und Kartenkennzeichen und nutzt die eindeutige Qonto-Verknüpfung. Wiederholungen liefern denselben Eintrag; ein Löschmarker verhindert erneutes Importieren gelöschter verknüpfter Einnahmen. Bereits manuell erfasste, eindeutig passende Einnahmen werden verknüpft, bei Mehrdeutigkeit wird abgebrochen. Der alte Qonto-Debitimport bleibt unverändert und ist weiterhin kein atomarer Bankimport. Bankbewegungen sind auf die letzten 300 geladenen Vorgänge begrenzt.

Die Migration `supabase/migrations/*_bank_income_sync_and_import.sql` erweitert die bereits vorhandene Tabelle und aktiviert ihre Realtime-Publikation. Sie schreibt keine vorhandenen Finanzbuchungen um. Keine Service-Role-Schlüssel im Browser.

Zusätzliche lokale Tests:

```sh
node tests/qonto-private.cjs
npm install --prefix /tmp/ml-db-test @electric-sql/pglite@0.3.14 --no-audit --no-fund
PG_TEST_MODULE=/tmp/ml-db-test/node_modules/@electric-sql/pglite node tests/bank-income-db.cjs
```

`tests/bank-income-browser.cjs` prüft die echte App und den festgelegten Supabase-SDK in WebKit mit lokal simulierten Auth-/REST-Antworten, ohne Produktionszugriffe. Voraussetzung: Playwright samt WebKit und Systembibliotheken; `TEST_SUPABASE_SDK` und `TEST_JSPDF_SDK` geben die lokal geladenen, in index.html festgelegten Browser-Bundles an. Dies ersetzt keinen echten iPhone- und Zwei-Geräte-Praxistest mit dem Besitzerkonto.
