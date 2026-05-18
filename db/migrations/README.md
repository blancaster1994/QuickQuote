# Database migrations

Target: **Azure SQL Database (Serverless)**.

## Migration tool — staff-dev decision

Pick one in the next session. Options:

- **DbUp** (.NET) — popular for Azure SQL, declarative SQL scripts.
- **mssql-migrations** / **node-pg-migrate** style — JS/TS-native.
- **Flyway** — language-agnostic, good for CI/CD baked into Azure Pipelines.
- **Roll your own** — `mssql` library + a small runner script. Fine for ~30 tables.

Recommendation: simplest is a small Node script that reads
`0001_initial_schema.sql`, `0002_*.sql`, … in order, tracks applied migrations
in a `schema_meta` table (mirrors the SQLite approach), and runs each new file
inside a transaction. ~80 lines.

## Files

- `0001_initial_schema.sql` — port from `electron/db/schema.ts`. Tables 1-4
  translated; remaining 26 are TODO with line-number refs to the source.

## Translation cheatsheet

See the header comment in `0001_initial_schema.sql`.
