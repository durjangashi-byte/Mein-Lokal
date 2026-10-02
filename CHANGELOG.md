# Alltagspaket – 2. Oktober 2026 (v6)

Das gemeinsam freigegebene Paket verbessert die bestehende Oberfläche. Keine neuen Tabellen, keine Änderungen an Supabase-Auth, RLS, dem Synchronisierungsmodul oder Exportformaten.

| Datei | Geänderte Funktionen / Verhalten |
|---|---|
| `index.html` | Startseite: `dashboardPeriod`, `periodData`, `renderDashboard`, `updateMetrics` mit aktuellem Monat als Standard, vorhandenen Monaten und Gesamtzeitraum. Headerkennzahlen, Charts, Tagesdurchschnitt und Hochrechnung nutzen denselben Zeitraum. `metrics-period` benennt ihn auch auf anderen Seiten. Einnahmen enthalten wie bisher Trinkgeld. Ergebnis vor und nach erfassten Personalkosten getrennt, offener Rechnungsbetrag über alle Zeiträume separat; keine doppelte Kostenanrechnung aus Rechnungen. |
| `index.html` | `formSpecs`, `editEntry`, `cancelEdit`, `commitForm`, `editButton`: alle fünf Bereiche bearbeiten über vorhandene Formulare, gleiche ID, UPDATE über bestehende dauerhafte Warteschlange. Schichtstunden/-kosten neu berechnet, Rechnungsstatus beim Bearbeiten erhalten. Im geladenen Datenstand inzwischen geänderte/gelöschte Einträge blockieren veraltete Entwürfe. Das ist kein atomarer serverseitiger Konfliktschutz; zeitgleiche Schreibvorgänge können weiterhin zuletzt akzeptierte Werte übernehmen. |
| `index.html` | `prepareQuickForm`, alle fünf `add…`-Funktionen: leere Datumsfelder vorausfüllen, zuletzt gespeicherte Kategorie auf diesem Gerät bei erster Öffnung anbieten, Eingaben bei Fehlern behalten. Doppeltes Absenden blockiert. Nicht negative endliche Zahlen, ganze Gästezahl/Zahlungsziele; Stundenlohn und Zahlungsziel 0 bleiben gültig. Unbekannte Kategorien/Positionen aus Altbeständen bleiben bearbeitbar. |
| `index.html` | `setSyncStatus`, `lockApp`, `_del`: sichtbarer Speicherstatus mit Zahl ausstehender Änderungen, Fehler/letztem Abgleich und manuellem Abgleich auf Startseite. Header weiterhin auf allen Seiten. Abmeldung verwirft Formulare, erfolgreiches Löschen beendet zugehöriges Bearbeiten. CSS: 44-px-Bearbeiten-Buttons, 16-px-Formulartext auf Mobilgeräten, umbrechende Hinweise/Toast, verlässlich ausgeblendete Abbrechen-Buttons. |
| `tests/app-smoke.cjs` | Erweitert: fünf Bearbeitenabläufe ohne neue ID/Duplikate, Neuberechnung Nachtschicht, bezahlte Rechnung bleibt bezahlt, Abbrechen, bekannte Bearbeitungskonflikte, Monats-/Gesamtsummen, tatsächliche UPDATE-Warteschlange, Doppelabsenden, Offline-/Fehlerstatus, ungültiger Betrag und unbekannte Alt-Kategorie. DOM-Testobjekte einschließlich Select-Optionen und Storage-API. |
| `README.md`, `CHANGELOG.md` | Bedienung, Dateizuordnung, Prüfungen und Grenzen des Pakets. |

Prüfung: `node tests/app-smoke.cjs`, `node tests/auth.cjs` und `git diff --check` bestanden. Der neue Bearbeitenablauf wurde lokal mit der echten Warteschlangenlogik geprüft, ohne zusätzliche Datenbankabfragen oder Änderungen an Geschäftsdaten. Der vorherige Zwei-Client-Realtime-Test ist dokumentiert; in diesem Paket wurde er nicht erneut ausgeführt. Der Nutzer hat den praktischen iPhone/PC-Test verschoben. Kein neuer visueller Safari-Test und keine Face-ID-Aktivierung in diesem Paket.

---

# Technische Änderungen – 2. Oktober 2026

Dieses Paket vervollständigt die begonnene Anmeldung und stabilisiert die vorhandene Synchronisierung. Es enthält keine größere Neugestaltung. Die bestehenden fünf Geschäftstabellen und Exporte bleiben erhalten.

| Datei | Geänderte Funktionen / Verhalten |
|---|---|
| `index.html` | Login-Oberfläche, `initSupabase`, `lockApp`, `unlockApp`, `passwordLogin`, `logoutApp`; Synchronisierung startet erst nach bestätigter Besitzeranmeldung. Cache und Warteschlange werden Konto und Projekt zugeordnet. Altdaten bleiben als explizite Wiederherstellung erhalten. `readLocal`, `saveLocal`, `importData` behandeln beschädigte Daten und validieren Importe. Benutzertexte werden beim Rendern maskiert. |
| `auth.js` | Neuer Controller `LokalAuth`: Passwort, E-Mail-Link, Code, native Passkey-Anmeldung/-Registrierung, Abmeldung und serverseitige Kontoprüfung. Sitzungsverlängerung baut einen bestehenden Sync-Client nicht neu auf. Abgebrochene oder deaktivierte Passkeys erzeugen verständliche Hinweise. Berechtigung kommt aus administrativ gesetzten `app_metadata`, niemals aus editierbaren `user_metadata`. |
| `sync.js` | `pending`, `enqueue`, `read`, `run`, `start`: validierte Warteschlange, Kopie statt veränderbarer Referenz, sichere Normalisierung von Nullwerten und Zahlen, IDs geprüft, pausierte Offline-Abfragen, keine Quittierung durch gestoppte Clients und keine doppelten Abonnements. Alle fünf Tabellen bleiben live abonniert. |
| `security/enable-owner-access.sql` | Transaktionale Umstellung aller fünf Tabellen auf angemeldete Besitzer. Anonymer Zugriff entzogen; SELECT/INSERT/UPDATE/DELETE für berechtigte Besitzer mit RLS. Die Transaktion bricht ab, wenn kein bestätigter Besitzer konfiguriert ist. Keine Geschäftsdaten gelöscht und keine neuen Geschäftstabellen angelegt. |
| `tests/auth.cjs` | Berechtigte/unberechtigte Konten, gefälschte Benutzer-Metadaten, Netzwerkfehler, Sitzungsverlängerung, Passwort- und Passkey-Fehlerpfade. |
| `tests/app-smoke.cjs` | Anmeldungssperre, fünf Eingabe-/Anzeige-/Löschabläufe, Rechnungsstatus, Nachtschicht, Import ohne Duplikate, Maskierung von HTML in Benutzereingaben. DOM-Test mit Testobjekten, kein Safari-Test. |
| `tests/live-sync.cjs` | Zwei getrennt angemeldete Besitzer-Clients; gebündelte Tests für fünf Tabellen, Rückrichtung bei Rechnung, Wiederholung nach verlorener Bestätigung, Offline-Warteschlange und Wiederstart. Ausschließlich markierte negative Test-IDs; Bereinigung dieser IDs. Zugangsdaten ausschließlich über Prozessumgebung, niemals im Repository. |
| `README.md` | Aktuelle Einrichtung, Zugriffsschutz, Prüfverfahren und verbleibende Grenzen dokumentiert. |

## Verbleibende Einrichtung

Der Server meldete bei dieser Prüfung `passkeys_enabled: false`. Die vorhandene Supabase-Verbindung bietet keine Methode zum Ändern der Auth-Projektkonfiguration. Im Supabase-Dashboard unter **Authentication → Passkeys** aktivieren:

- Display Name: `Mein Lokal`
- RP ID: `durjangashi-byte.github.io` (ohne Pfad oder https)
- Allowed Origin: `https://durjangashi-byte.github.io`

Danach App neu laden, mit dem bestehenden Konto anmelden und **Einstellungen → Face ID / Passkey einrichten** auf dem eigenen iPhone wählen. Die biometrische Bestätigung führt ausschließlich der Nutzer aus. Passkeys sind in Supabase derzeit experimentell. Face ID ist eine Passkey-Anmeldung; sie ist keine zusätzliche biometrische Sperre bei jedem Öffnen einer bereits angemeldeten Sitzung.

Unter **Authentication → URL Configuration** müssen Site URL und erlaubte Weiterleitung `https://durjangashi-byte.github.io/Mein-Lokal/` enthalten, damit die alternative E-Mail-Anmeldung korrekt zurückführt. Der serverseitige Konfigurationswert ist mit dieser Verbindung nicht einsehbar.

Die Supabase-Sicherheitsprüfung meldete als verbleibenden Hinweis deaktivierte Prüfung auf geleakte Passwörter. Sie kann im Dashboard aktiviert werden: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Grenzen

- Der abschließende Face-ID-/Safari-Test auf dem echten iPhone bleibt erforderlich; Server-Freischaltung und biometrische Registrierung sind noch nicht abgeschlossen.
- Offline-Eingaben setzen eine bereits geladene, angemeldete App und funktionierenden Gerätespeicher voraus. Bei abgelaufener Sitzung ist eine erneute Anmeldung nötig.
- Unterschiedliche gleichzeitige Änderungen am selben Rechnungsfeld: zuletzt vom Server angenommene Änderung gewinnt.
- Lokale Browser-Caches/Altdaten sind nicht verschlüsselt. Eine Passkey-Anmeldung verschlüsselt keine bereits vorhandenen Browserdateien. Gerätesperre verwenden und Altdaten vor gezielter Bereinigung exportieren.
- Personal-Vorlagen und Simulationseinstellungen bleiben wie bisher gerätebezogen; die fünf Geschäftstabellen teilen den Cloud-Datenbestand.
