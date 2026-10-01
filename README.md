# Mein Lokal

Static restaurant tracker served by GitHub Pages. Open `index.html` through a web server. Supabase JS is pinned to 2.117.2; `sync.js` contains the shared synchronization engine.

## Synchronization

Existing tables: `einnahmen`, `ausgaben`, `schichten`, `rechnungen`, `lieferanten`. No database schema, policies or existing business records were changed by this fix.

- Initial reads and Realtime subscriptions cover all five tables.
- Writes are persisted in a project-scoped local outbox before submission. Failed requests remain queued. Insert retries do not overwrite newer rows.
- Each write checks returned errors. Updates verify affected rows; deletes check the row is gone. UI success is distinguished from pending cloud delivery.
- Realtime updates refresh lists, totals, dashboard, daily and monthly reports. Reconnection, foregrounding and a 30-second fallback reconcile missed events.
- Reads paginate beyond the default 1,000-row API limit. Web Locks serialize outbox processing across same-origin tabs where supported.
- Settings show actual connection state, pending count, last successful reconciliation and detailed errors.
- Existing local data is preserved once in `rv4_recovery`. **Settings → Frühere lokale Daten ergänzen** adds missing IDs without replacing existing cloud rows. Export a backup before recovery. This is explicit to avoid automatically resurrecting stale deleted records from another device.
- JSON backups include invoices, suppliers, pending operations and the recovery snapshot. Import merges absent IDs; it does not restore pending deletions or overwrite existing cloud records.
- Personal templates and simulation settings remain device-local.

Offline edits require an already loaded app and persistent browser storage. This is not a service-worker offline installation. Different edits to the same invoice field use the last write accepted by the server; there is no collaborative field-conflict UI. Invalid/denied operations remain visible in the queue and need their cause corrected. Clear browser storage only after exporting a backup and completing synchronization.

## Existing access model

The project currently has anonymous ALL policies (`USING true`, `WITH CHECK true`) on all five public tables. Its publishable key is intentionally a public client key, not a password. Therefore anyone with the public app configuration can read and modify these tables. The existing policies were not widened or silently replaced; adding real Supabase Auth plus owner/team authorization is required before treating this as private financial storage. A clean advisor result is not proof that this public access model is appropriate.

## Tests

`node tests/app-smoke.cjs` checks boot and all five input/render/delete flows with DOM doubles, invoice payment status, overnight shifts and additive imports. This is not a real-browser layout or Safari test.

`SUPABASE_TEST_SDK=/absolute/path/to/supabase-2.117.2-umd.js node tests/live-sync.cjs` runs an explicitly invoked live integration test with two independent clients. It creates clearly labelled records with negative IDs and removes only those IDs in `finally`. Use a test project when available. It covers five-table INSERT/DELETE propagation, reverse-direction invoice UPDATE, idempotent insert retry, and durable offline recovery. The SDK can be fetched from the same pinned official jsDelivr package used by the app. Optional `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` override the target.

## Original failure

PostgREST query builders are thenables, not native Promises, and do not expose `.catch()`. The overridden initial loader called `.catch()` directly on invoice and supplier query builders. This threw before loading completed while the independent WebSocket remained connected. Additional duplicate functions, omitted table subscriptions and ignored mutation errors compounded the problem.
