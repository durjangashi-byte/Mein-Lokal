# Rechnungen & Zahlungen – 2. Oktober 2026 (v7)

## Umgesetzter Ablauf

Zahlung mit Beschreibung, Betrag, Ausgabenkategorie und Fälligkeit erfassen; Anbieter, Kontakt und Kundennummer sind optional. Wiederholung: einmalig, wöchentlich, monatlich, vierteljährlich oder jährlich. Jeder Termin hat seinen eigenen Zahlungsstatus. Beim Bestätigen von **Erledigt / bezahlt** lassen sich Betrag und Zahlungsdatum anpassen. Eine Datenbanktransaktion erstellt genau eine zugehörige Ausgabe. Mehrfaches Bestätigen, verlorene Bestätigungen und Zahlungen von zwei Geräten erzeugen keine Duplikate; der zuerst serverseitig bestätigte Betrag bleibt erhalten. Das ist eine Buchung in der App, keine Banküberweisung.

**Zahlung zurücknehmen** öffnet den Termin wieder und entfernt ausschließlich seine automatisch erzeugte Ausgabe. Diese Ausgabe wird direkt in Ausgaben nicht bearbeitet/gelöscht; Korrekturen erfolgen über die Zahlung. Bezahlte Beträge/Kategorien werden erst nach Rücknahme korrigiert. Historisch bereits als bezahlt gespeicherte Rechnungen werden nicht rückwirkend in Ausgaben umgewandelt.

Wiederholungen werden auf dem Server angelegt, einschließlich des jeweils nächsten zukünftigen Termins. Monatsenden bleiben am ursprünglichen Tag verankert (31. Januar → 28./29. Februar → 31. März). Eine Pause stoppt neue Termine und Erinnerungen der Serie, ohne bereits erfasste Forderungen zu löschen. Beim Fortsetzen werden ausstehende Termine nachgetragen; Beenden entfernt zukünftige unbezahlte Folgetermine, bereits fällige/bezahlte bleiben erhalten. Der optionale Folgebetrag erlaubt andere Beträge für künftige Termine. Die Anpassung eines konkreten Zahlungsbetrags verändert keine bereits bezahlten Folgetermine.

**Später erinnern** setzt einen neuen Erinnerungstag um 9 Uhr, behält aber die ursprüngliche Fälligkeit. Übersicht: nächste sieben Tage, laufender Monat und überfällige Beträge. Suche über Beschreibung, Anbieter, Kundennummer und Notiz; Filter nach überfällig, Woche oder Monat. Überfällige Zahlungen bleiben offen sichtbar.

## Dateien und Funktionen

| Datei | Änderungen |
|---|---|
| `index.html` | Erweiterte Rechnungseingabe, `addRechnung`, `openPayment`, `payInvoice`, `completePayment`, `reversePayment`, `snoozePayment`, `openSnooze`, `setSeries`, `confirmStopSeries`, `paymentRoot`, `renderRechnungen`. `editEntry`/`commitForm` berücksichtigen bezahlte Rechnungen und einzelne Serientermine; `_del` schützt verknüpfte Ausgaben/Serien. `addDays` nutzt UTC-Datumsrechnung gegen Sommerzeitverschiebungen. |
| `index.html` | Lieferantenansicht als **Anbieter-Vorlagen verwalten** innerhalb Rechnungen integriert. Bestehende `lieferanten`-Tabelle, CRUD und Backup erhalten. `useProvider` übernimmt Namen, Kontakt, Kategorie und Zahlungsziel. Alte Navigation zu Lieferanten öffnet diese Vorlagen. |
| `index.html` | `enablePaymentPush`, `pushCall`, `currentPaymentSubscription`, `testPaymentPush`, `disablePaymentPush`; Nutzerfreigabe auf dem Gerät, Home-Screen-Hinweis, Test und Ausschalten. Benachrichtigungsklick öffnet Zahlungen, nötigenfalls nach Anmeldung. Öffentliches VAPID-Public-Key eingebunden, keine privaten Schlüssel im Repository. |
| `sync.js` | `normalize` erhält neue Rechnungsfelder und nullable Referenzen; `write` nutzt die atomare, wiederholbare Zahlungs-RPC. Bestehende Tabellenabonnements, Rückkehrabgleich und dauerhafte Offline-Warteschlange erhalten. Ausgaben entstehen bei der Serverbestätigung, offline sieht man zunächst den ausstehenden Zahlungsauftrag. |
| `security/payment-workflow.sql` | Konsolidierter Stand der angewandten Datenbankänderungen für ein frisches Ausgangsschema; nicht erneut auf dem bereits migrierten Projekt ausführen. Zusätzliche Felder auf `rechnungen`/`ausgaben`, eindeutige Rechnung-Ausgabe-Verknüpfung, IDs innerhalb des sicheren JS-Zahlenbereichs, `lokal_pay_invoice`, Zahlungs-/Serientrigger, `lokal_occurrence`, `lokal_generate_occurrences`, Backend-Push-Tabellen mit RLS und eingeschränkten Rechten, Vault-Zugriff ausschließlich für Service-Rolle. |
| `supabase/functions/payment-reminders/index.ts` | Bereitgestellter Push-Dienst, Supabase JS 2.117.2 / web-push 3.6.7. Prüft Besitzer gegen Auth-Server, erlaubt Registrierung/Test/Abmeldung nur für dessen Geräte; Endpunkt-Allowlist verhindert beliebige Serveranfragen. Cron verwendet eigenen Zufallsschlüssel aus Vault. Gateway-JWT-Prüfung bewusst deaktiviert, da Funktionskörper Benutzer-JWT oder Cron-Schlüssel selbst prüft. |
| `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png` | Home-Screen-App, Push-Empfang/Anzeige und Öffnen der Zahlungsansicht. Service Worker speichert keine Sitzungen/Geschäftsdaten und fügt keinen Offline-Seiten-Cache hinzu. |
| `tests/payment-database.sql` | Wegwerf-Testdaten innerhalb Rollback-Transaktion: keine doppelte Ausgabe/kein überschriebener Betrag, bezahlte Notizänderung, Monats-/Schaltjahrtermine, Folgebetrag, Erinnerung verschieben, Pause/Ende, Rücknahme, geschützte Ausgabe. |
| `tests/app-smoke.cjs`, `tests/live-sync.cjs` | Frontend-Zahlungsabläufe und Anbieterübernahme ergänzt; Live-Test bestätigt automatisch erzeugte Ausgabe und Rücknahme auf zweitem Client sowie bereits vorhandene fünf Tabellen, verlorene Bestätigung und Offline-Neustart. Tests bereinigen ausschließlich eigene IDs. |
| `README.md`, `CHANGELOG.md` | Bedienung, Einrichtung, Dateifunktionen, Prüfungen und Grenzen. |

## Push-Einrichtung und Betrieb

Auf dem iPhone App in Safari öffnen → Teilen → Zum Home-Bildschirm. Von dort anmelden und **Mehr → Rechnungen & Zahlungen → Mitteilungen aktivieren** wählen; anschließend **Test senden**. Die iOS-Mitteilungsfreigabe kann nur der Nutzer auf seinem Gerät erteilen. Technische Grundlage: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

Serverzeitplan ist aktiv: Termine um 08:55, Erinnerungen um 09:00 **Europe/Berlin**. Cron prüft diese Zeitzone aus stündlichen UTC-Zeitfenstern, damit Sommer-/Winterzeit berücksichtigt werden. Push fasst fällige und überfällige Zahlungen einmal täglich pro Gerät zusammen; verschobene/pausierte Termine werden ausgelassen. Zustellungsprotokoll verhindert parallel doppelte Sendungen. Push-Netzwerk, Fokusmodus und Geräteeinstellungen können die tatsächliche Anzeige verzögern. Die Mitteilung kann Betrag/Beschreibung auf dem Sperrbildschirm zeigen.

Private VAPID- und Cron-Schlüssel wurden ausschließlich in Supabase Vault provisioniert, nicht in GitHub. Der SQL-Snapshot enthält keine Geheimnisse und erwartet für einen Neuaufbau separat provisionierte Vault-Konfiguration. Die bestehende Besitzer-RLS der Geschäftstabellen bleibt aktiv. Neue Push-Tabellen sind nur vom Backend erreichbar.

## Prüfstand und offene Punkte

- Lokale App- und Auth-Tests, JS/TS-Syntax und `git diff --check` bestanden.
- Datenbanktest mit vollständigem Rollback bestanden.
- Zwei getrennte angemeldete Clients: fünf Tabellen INSERT/UPDATE/DELETE live, Rechnung → einmalige Ausgabe, wiederholte Zahlung mit anderem Betrag überschreibt nicht, Rücknahme entfernt Ausgabe, Insert-Replay und Offline-Neustart bestanden. Testdatensätze anschließend entfernt.
- Push-Dienst antwortete auf Cron mit HTTP 200 (`due: 0`, `delivered: 0`); Aufruf ohne Cron-Schlüssel wurde mit Unauthorized abgewiesen. Beide Cron-Jobs aktiv. Kein Gerät ohne Nutzerfreigabe registriert, daher keine behauptete Testzustellung aufs iPhone.
- SQL-Rechteprüfung: anonyme Zahlungs-RPC und authentifizierter Zugriff auf Push-Geheimnisse/-Tabellen nicht erlaubt. Sicherheitsprüfung nach Änderungen: keine neuen Warnungen; vorhandene deaktivierte Leaked-Password-Protection bleibt offen (https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Nutzer muss Push auf dem eigenen iPhone aktivieren und Testmitteilung prüfen. Praktischer iPhone/PC-Test und Face-ID-Dashboard-Aktivierung bleiben wie vorher offen. Keine visuellen Safari-Tests in diesem Paket.

---

# Mobile Navigation – 2. Oktober 2026

`index.html`: untere Navigation von neun auf vier Einträge reduziert: Übersicht, Einnahmen, Ausgaben, Mehr. Neue Ansicht `p-mehr` mit großen Zeilen für Personal/Schichten, Tagesabschluss, Monatsauswertung, Rechnungen, Lieferanten und Einstellungen. `switchTab` markiert Mehr auch beim Öffnen dieser Unterbereiche; `aria-current` folgt dem aktiven Navigationsbereich. Größere Beschriftung und Berücksichtigung der iPhone-Safe-Area. Die Desktop-Seitenleiste und sämtliche Funktionen bleiben erhalten. `README.md`: Navigation dokumentiert.

Vorhandene lokale Ablauf- und Login-Tests bestanden; keine Datenbank- oder Auth-Änderungen, keine zusätzlichen Supabase-Abfragen. Die Darstellung auf dem tatsächlichen iPhone bleibt vom Nutzer zu prüfen.

---

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
