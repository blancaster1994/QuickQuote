/**
 * Database queries — port target.
 *
 * Mirror of `electron/db/queries.ts` (678 lines, 18 exported functions).
 * The next Claude session ports each function across, translating SQLite SQL
 * to T-SQL as it goes.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Translation cheatsheet (SQLite → T-SQL / Azure SQL)
 * ────────────────────────────────────────────────────────────────────────
 *
 *   datetime('now')                  → SYSUTCDATETIME()
 *   strftime('%Y-%m-%d', ...)        → CONVERT(varchar(10), ..., 23)
 *   INSERT OR REPLACE INTO t ...     → MERGE t USING ... or INSERT ... ON conflict logic
 *   INSERT OR IGNORE                 → INSERT ... WHERE NOT EXISTS
 *   LAST_INSERT_ROWID()              → SCOPE_IDENTITY()
 *   AUTOINCREMENT (INTEGER PK)       → IDENTITY(1,1) on INT PK
 *   TEXT                             → NVARCHAR(MAX) or NVARCHAR(N)
 *   TEXT NOT NULL DEFAULT ''         → NVARCHAR(MAX) NOT NULL DEFAULT N''
 *   json_extract(col, '$.x')         → JSON_VALUE(col, '$.x')
 *   json_each / json_array_length    → OPENJSON(col)
 *   ? placeholders                   → @paramName (mssql library wraps it)
 *   PRAGMA foreign_keys = ON         → enabled by default in Azure SQL
 *
 * ────────────────────────────────────────────────────────────────────────
 * Functions to port (signatures preserved from electron/db/queries.ts):
 * ────────────────────────────────────────────────────────────────────────
 *
 *   getBootstrap()                      → /api/app/bootstrap
 *   listProposals()                     → GET /api/proposals
 *   loadProposal(name)                  → GET /api/proposals/:name
 *   saveProposal(actor, p, renameFrom?) → POST /api/proposals
 *   deleteProposal(name)                → DELETE /api/proposals/:name
 *   loadAllProposals()                  → (internal, used by dashboard)
 *
 *   listClientTemplates(email)          → GET /api/templates/client
 *   loadClientTemplate(email, name)     → GET /api/templates/client/:name
 *   saveClientTemplate(email, name, t)  → POST /api/templates/client
 *   deleteClientTemplate(email, name)   → DELETE /api/templates/client/:name
 *
 *   listProjectTemplates(email)         → GET /api/templates/project
 *   loadProjectTemplate(email, name)    → GET /api/templates/project/:name
 *   saveProjectTemplate(email, name, t) → POST /api/templates/project
 *   deleteProjectTemplate(email, name)  → DELETE /api/templates/project/:name
 *
 *   createVersion(name, actor, note?)   → POST /api/proposals/:name/versions
 *   listVersions(name)                  → GET /api/proposals/:name/versions
 *   loadVersion(name, version)          → GET /api/proposals/:name/versions/:n
 *
 *   getDashboard(opts)                  → GET /api/dashboard
 */

export {};
