# Risk register — web port gotchas

Each entry: what's the risk, where in the code, what to do.

## Native module: `better-sqlite3`

- **Where:** `package.json:dependencies`; `electron-rebuild` postinstall.
- **Why it's a risk:** the binary is platform-specific. Linux build agents
  can't rebuild it for Windows-Electron and vice versa.
- **Mitigation:** the postinstall script is now gated — runs only on win32
  or when explicitly invoked via `npm run rebuild:electron`. The Azure
  pipeline sets `QQ_SKIP_ELECTRON_REBUILD=true` for extra safety.
- **Long-term:** server side moves to `mssql`. `better-sqlite3` stays in
  the renderer-only / Electron-only dep tree. Consider moving it to
  `optionalDependencies` later.

## SQLite-specific SQL

- **Where:** `electron/db/queries.ts` (678 lines).
- **Why it's a risk:** `datetime('now')`, `INSERT OR REPLACE`,
  `LAST_INSERT_ROWID()`, `json_extract`, `?` placeholders all need
  translation.
- **Mitigation:** cheatsheet at the top of
  `db/migrations/0001_initial_schema.sql` and `server/src/db/queries.ts`.
  Port each function carefully, one at a time, with a smoke test.

## Hash routing

- **Where:** `src/main.tsx:9` (`<HashRouter>`).
- **Why it's a risk:** Hash routes work everywhere but feel dated for a web
  app, and deep-linking + SEO is worse.
- **Mitigation:** switch to `BrowserRouter` and add a SWA fallback route to
  `/index.html`. This is a small renderer change in `src/main.tsx`.

## OS-path assumptions

- **Where:**
  - `electron/main.ts` (`app.getPath('userData')`)
  - `electron/identity/identity.ts:48-52` (identity.json path)
  - `electron/proposal/generate.ts:59-60` (Generated Proposals/ folder)
  - `quickquote_cli/paths.py`
- **Why it's a risk:** all assume a writable local FS at a Windows-specific
  path.
- **Mitigation:** identity goes away (replaced by JWT). Generated files
  move to Blob Storage and the renderer downloads via SAS URLs. The Python
  CLI runs in a stateless container — its `paths.py` becomes
  Function-temp-dir-relative.

## Python CLI deployment

- **Where:** `electron/proposal/generate.ts` spawns
  `python -m quickquote_cli.cli` with `child_process.spawn`.
- **Why it's a risk:** App Service Linux doesn't have Python by default.
- **Mitigation:** two options:
  1. Package `quickquote_cli/` as an Azure Function (Python 3.11) and call
     it via HTTPS from the Fastify server. Cleanest separation.
  2. Install Python in the App Service container (a 2-line `package.json`
     startup hook) and `spawn()` the CLI the same way Electron does.

## ClickUp token storage

- **Where:** `electron/db/clickup.ts` stores `api_token` in the
  `clickup_config` SQLite table; `getConfig` strips it on read.
- **Why it's a risk:** a SQL row containing a third-party API token is
  audit-unfriendly; Azure best practice is Key Vault.
- **Mitigation:** in Phase 10, `setConfig` writes the token to Key Vault
  via the App Service's managed identity; `clickup_config` stores only the
  reference name. The sanitize-on-read pattern is already correct —
  preserve it.

## Generated file storage

- **Where:** `proposal_file.path` (`electron/db/schema.ts:87`) stores
  absolute Windows paths to generated DOCX/PDF.
- **Why it's a risk:** absolute paths don't make sense in cloud.
- **Mitigation:** the column already exists in the migration starter as
  `path NVARCHAR(MAX)` but semantically becomes the **blob name** within
  the configured container. Renderer downloads via SAS URLs returned from
  the generate endpoint. Drop `os.openFile`/`revealInExplorer`/
  `copyFileToClipboard` from the renderer (no web equivalents).

## Bundled Templates/ and seed/

- **Where:** `package.json:23-46` lists them as `extraResources` for the
  Electron build.
- **Why it's a risk:** on Azure they're not bundled — they need to be
  present on disk wherever the generator runs.
- **Mitigation:** copy `Templates/` into the server's deploy artifact (or
  the Function's package). For `seed/`, port the CSVs to migration `INSERT`s
  or `bcp` calls — see `db/seed/README.md`.

## Identity bootstrap

- **Where:** every `actorFromIdentity()` call in `electron/main.ts`
  attaches the active user to writes.
- **Why it's a risk:** there's no `identity.json` on web.
- **Mitigation:** replace `actorFromIdentity()` with `req.user` from the
  auth middleware. The shape (`{ email, name, role }`) is the same.

## CORS

- **Where:** `server/src/index.ts` registers `@fastify/cors`.
- **Why it's a risk:** SWA and App Service have different URLs; misconfigured
  CORS blocks all calls.
- **Mitigation:** set `ALLOWED_ORIGIN` to the SWA URL (or a comma-separated
  list) when wiring up Phase 7.

## Electron + web parallel maintenance

- **Why it's a risk:** during Phases 2-9, the Electron build still needs
  to ship to users while the web port is in progress. Both transports must
  keep working through every change.
- **Mitigation:** `src/api/client.ts` picks at runtime. The renderer code
  never branches. As long as both adapters export the same `QuickQuoteApi`
  shape, both builds work. The smoke tests cover the adapter selector.
