# Roadmap

Numbered phases for the web port. Each phase is the natural size of one
Claude session.

## Recommended target architecture

| Concern | Recommendation |
|---|---|
| SPA hosting | Azure Static Web Apps (Standard) |
| API hosting | Azure App Service (Linux, Node 20 LTS) |
| Database | Azure SQL Database (Serverless) |
| Secrets | Azure Key Vault + Managed Identity |
| File storage | Azure Blob Storage (SAS download URLs) |
| Auth | Entra ID via MSAL.js + JWT validation |
| Python DOCX/PDF | Azure Functions (Python 3.11) |
| CI/CD | Azure Pipelines (Azure DevOps) |
| API framework | Fastify 5 |

## Phase 1 — Handoff hygiene + scaffolding (DONE this session)

- README, ARCHITECTURE, ROADMAP, API, AUTH, RISKS, AZURE_SETUP docs
- `.env.example`, `.nvmrc`, `.editorconfig`, `package.json` engines + scripts
- ESLint / Prettier / Vitest configs + smoke tests
- API client seam (`src/api/{client,electronAdapter,httpAdapter,msal}.ts`)
- Renderer refactor: `window.api.*` → `apiClient.*` in all 19 call sites
- Server skeleton (`server/`) with Fastify + route stubs
- `db/migrations/0001_initial_schema.sql` exemplar (tables 1-4)
- `azure-pipelines.yml` + `.github/workflows/ci.yml` skeletons
- `package.json` postinstall gated so Linux installs don't fail

## Phase 2 — Provision Azure resources (USER + Claude, no code)

User-driven, see `AZURE_SETUP.md`. Output: a populated `.env` with real
client IDs, tenant ID, App Service URL, SQL connection string, etc.
Phases 3+ are blocked until this is done.

## Phase 3 — Schema port

Port the remaining ~26 tables in `db/migrations/0001_initial_schema.sql` from
`electron/db/schema.ts`. Use the translation cheatsheet in the file header.
Run against the provisioned Azure SQL Database. Add seed data (lookups,
`allowed_user`).

Definition of done: `db/migrations/` has all tables; `SELECT COUNT(*) FROM
information_schema.tables` matches the SQLite source.

## Phase 4 — Port DB queries + first read route

Port `electron/db/queries.ts:listProposals` and `loadProposal` to
`server/src/db/queries.ts` (T-SQL via `mssql`). Wire the existing
`server/src/routes/proposals.ts` `GET /proposals` and `GET /proposals/:name`
stubs to call them. Test against a real Azure SQL DB.

Definition of done: `curl https://<api>/api/proposals` returns a list.

## Phase 5 — Auth seam (Entra ID)

- Install `@azure/msal-browser` and `@azure/msal-react`. Wrap `<App>` in
  `<MsalProvider>` in `src/main.tsx`.
- Implement `src/api/msal.ts` with real `acquireTokenSilent` / popup fallback.
- Implement `server/src/middleware/auth.ts` JWT validation:
  pull `email` claim, look up in `allowed_user`, attach `req.user`.
- Test: SPA login → token → API call → 200 with claims-driven role.

Definition of done: dev mode auth is replaced with real Entra-validated JWTs.

## Phase 6 — Port the remaining routes

Mechanical: for each stub in `server/src/routes/`, port the corresponding
ipcMain handler from `electron/main.ts`. Order by impact:

1. `lifecycle.*` (Mark Sent/Won/Lost/etc.)
2. `lookups.*`, `markup.*`, `phases.*`, `tasks.*`, `bidItemTemplates.*`,
   `employees.*`, `rates.*`
3. `project.*`
4. `clickup.*` (move token storage to Key Vault here)
5. `versions.*`, `dashboard.get`, `app.bootstrap`

Definition of done: every endpoint in `docs/API.md` returns real data.

## Phase 7 — Transport flip

- Set `VITE_API_BASE_URL` in the SPA build.
- Verify `apiClient` resolves to `httpAdapter` automatically.
- Walk every UI flow end-to-end against the deployed API.
- Fix any places that assumed Electron-specific behavior (e.g. blocking IPC,
  immediate file paths) — usually the `os.*` calls.

Definition of done: SPA can be used end-to-end against the cloud API without
Electron running anywhere.

## Phase 8 — Generation on Azure Functions

- Package `quickquote_cli/` as an Azure Function (Python 3.11).
- Reimplement `server/src/routes/generate.ts` to POST the payload to the
  Function URL (or, simpler: install Python in the App Service container and
  spawn the CLI in-process like Electron does).
- Generated files write to Blob Storage; response returns a SAS URL.

Definition of done: clicking "Generate DOCX" in the SPA produces a download
link that opens the right file.

## Phase 9 — Blob storage for files + remove `os.*`

- `proposal_file.path` → blob name. Update the `proposal_file` row + queries.
- Renderer: replace `apiClient.os.openFile(path)` with a download from the
  SAS URL. Remove `revealInExplorer` and `copyFileToClipboard` entirely from
  the web UI (no equivalents).

Definition of done: no `os.*` calls remain on the renderer side in the web build.

## Phase 10 — Cutover

- Migrate ClickUp `api_token` from SQLite `clickup_config` to Key Vault.
- Migrate existing user proposals/projects from local SQLite to Azure SQL
  (one-time ETL — manual or scripted).
- Point users at the Static Web App URL.
- Deprecate the Electron build (or keep it for the offline use case).
