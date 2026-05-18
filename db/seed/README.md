# Seed data

The Electron build seeds from CSVs in `../../seed/` via `electron/db/seed.ts`
plus the Python helper `scripts/build-seed.py`. The web build needs to do
roughly the same thing in T-SQL.

## What needs seeding

The seed data drives the **lookups** (legal entities, departments, rate
tables, project types, expense categories, markup percentages, phase/task
taxonomy) plus the **allowed_user** table (the email → role map that auth
relies on).

## Approach

Either:

1. Convert the CSVs to T-SQL `INSERT` statements (one .sql file per table)
   and add them as a `seed/` step in the migration runner. Idempotent via
   `MERGE` or `IF NOT EXISTS`.
2. Use **bcp** (SQL Server's bulk copy CLI) called from a deploy step in
   `azure-pipelines.yml` to load CSVs directly.

Approach 1 is simpler for ~5-row tables; approach 2 wins if a table grows
into the hundreds.

## Source CSVs

- `seed/allowed_users.csv`
- `seed/legal_entities.csv`, `seed/departments.csv`, etc.
- See `electron/db/seed.ts` for the full list and the column mapping.
