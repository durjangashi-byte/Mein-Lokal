# Mein Lokal

Restaurant-App auf GitHub Pages mit Supabase-Synchronisierung. `index.html` enthält die vorhandenen Ansichten, `sync.js` synchronisiert die fünf bestehenden Geschäftstabellen, `auth.js` verwaltet die Anmeldung. Supabase JS ist auf **2.117.2** festgelegt.

## Nutzung

Mit dem bestätigten Besitzerkonto anmelden. Einnahmen, Ausgaben, Schichten, Rechnungen und Lieferanten werden gemeinsam geladen und live aktualisiert. Ausstehende Änderungen bleiben in einer lokal gespeicherten Warteschlange und werden nach Wiederverbindung übertragen. Projekt und Konto begrenzen Cache und Warteschlange. Eine erneute Anmeldung oder Sitzungsverlängerung darf die Warteschlange nicht verlieren.

Einstellungen zeigen Verbindungszustand, ausstehende Änderungen und Fehler. **Jetzt synchronisieren** startet einen zusätzlichen Abgleich. Realtime-Rückkehr, Vordergrundwechsel und ein 30-Sekunden-Abgleich schließen verpasste Ereignisse. Daten werden auch oberhalb des API-Limits von 1.000 Zeilen vollständig geladen. Personal-Vorlagen und Simulationseinstellungen bleiben lokal.

**Frühere lokale Daten ergänzen** importiert gespeicherte Altdaten ausdrücklich, ohne bestehende Cloud-IDs zu überschreiben. Vorher JSON-Backup exportieren. Backups enthalten alle fünf Tabellen sowie Warteschlange und Wiederherstellungskopie. Der Import ergänzt fehlende IDs; ausstehende Löschaufträge werden nicht automatisch aus einem Backup ausgeführt.

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
