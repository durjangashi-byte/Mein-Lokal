# Mein-Lokal: Finance safety rules (implementation specification)

Status: design only; no production data or schema changes.

## Revenue
- `gross_total` is the entire day's revenue, regardless of tender.
- `card_amount` is a component of `gross_total`, NOT additional revenue.
- `cash_amount = gross_total - card_amount`; validate 0 <= card_amount <= gross_total.
- Example: gross_total=500 EUR, card_amount=250 EUR -> revenue=500 EUR, cash=250 EUR.
- Use integer cents or exact decimal arithmetic; never binary floating-point for posting.

## Qonto reconciliation
- Bank sync imports to a read-only staging/review state first.
- Idempotency key: provider + organization + bank account ID + provider transaction ID; unique database constraint.
- On retries, update staging metadata without creating a second accounting entry.
- Candidate matches by amount, date window, counterparty, reference and existing receipt/invoice links; never auto-post uncertain matches.
- Review choices: link existing entry, create approved entry, ignore, or mark internal transfer.
- Never treat bank transfers between own accounts as revenue/expense.
- Restrict Qonto credentials to server secrets, never client bundle.
- Audit reviewer, timestamp, source transaction and accounting entry ID.

## Invoices and payroll
- Paid invoice -> one expense only after explicit confirmation; use invoice ID as unique origin reference.
- Repeated invoices are generated with distinct period keys, not automatically marked paid.
- Store receipts privately with authenticated access.
- Payroll separates gross wages, employer costs, deductions and cash payment; avoid double counting payroll and bank debits.

## Debt and reporting
- Principal repayment affects liquidity and liability, not profit.
- Interest is separately classified as a possible expense, subject to accounting/tax treatment.
- Cash-flow, operational profit and tax profit are separate views; tax result requires accounting policy and professional verification.
- Preserve all historical entries; corrections use traceable adjustments rather than destructive edits.

## Acceptance tests
1. 500 total / 250 card => 500 revenue, 250 cash.
2. Card > total and negative inputs rejected.
3. Re-import of same Qonto ID creates zero additional accounting entries.
4. Existing expense matched to bank transaction is linked, not duplicated.
5. Internal transfer does not change P&L.
6. Invoice paid twice triggers only one expense.
7. Principal debt repayment changes cash, not profit.
8. Concurrent mobile and desktop edits synchronize consistently without overwriting data.
9. Permissions prevent cross-user access to finance and receipt data.

Before implementation: inspect current actual application source and DB schema; add tests, run CI, request review before merging/deploying.
