# Architecture

## Today: Electron desktop app

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron BrowserWindow                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Renderer (React 18 + Vite + TypeScript)              │   │
│  │   - src/                                              │   │
│  │   - HashRouter (works in file://)                     │   │
│  │   - Calls apiClient.* (src/api/client.ts)             │   │
│  │     → resolves to window.api (electronAdapter)        │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          │ contextBridge / IPC               │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Preload (electron/preload.ts)                        │   │
│  │   exposes window.api with one namespace per IPC group │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          │ ipcRenderer.invoke                │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Main process (electron/main.ts, Node)                │   │
│  │   - ~85 ipcMain.handle() registrations                │   │
│  │   - Auth: reads/writes %APPDATA%/QuickQuote/          │   │
│  │     identity.json + lookups allowed_user table        │   │
│  │   - DB: better-sqlite3 → quickquote.db                │   │
│  │   - ClickUp: REST client (electron/clickup/)          │   │
│  │   - DOCX/PDF: spawns python -m quickquote_cli.cli     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ├──► better-sqlite3 (embedded)
                           ├──► quickquote_cli (Python subprocess)
                           ├──► Generated Proposals/ (local FS)
                           └──► ClickUp API (HTTPS)
```

Key files:
- `electron/ipc-channels.ts` — 60 channels, single source of truth
- `electron/preload.ts` — bridge mirrored by IPC channel names
- `src/types/api.d.ts` — `QuickQuoteApi` interface (HTTP-shaped already)
- `electron/db/schema.ts` — ~30 SQLite tables
- `electron/db/queries.ts` — 18 query functions (678 lines)
- `electron/identity/identity.ts` — `allowed_user` table + permissions

## Target: Azure-hosted web app

```
                         User browser
                              │
                              │ HTTPS
                              ▼
        ┌──────────────────────────────────────────┐
        │  Azure Static Web Apps                   │
        │   - Vite build of src/                   │
        │   - MSAL.js for Entra ID login           │
        │   - apiClient → httpAdapter              │
        └──────────────────────────────────────────┘
                              │
                              │ HTTPS + Bearer JWT
                              ▼
        ┌──────────────────────────────────────────┐
        │  Azure App Service (Linux, Node 20)      │
        │   - Fastify API (server/)                │
        │   - JWT validation against Entra JWKS    │
        │   - Mirrors IPC channel groups as routes │
        └──────────────────────────────────────────┘
              │                  │              │
              │                  │              │
              ▼                  ▼              ▼
    ┌─────────────────┐  ┌──────────────┐  ┌─────────────────┐
    │  Azure SQL DB   │  │  Azure Blob  │  │  Azure Function │
    │  (Serverless)   │  │   Storage    │  │  (Python 3.11)  │
    │  - Schema in    │  │  - Generated │  │  - quickquote_  │
    │    db/migr.     │  │    DOCX/PDF  │  │    cli/ verbatim│
    │  - allowed_user │  │  - SAS URLs  │  │  - Stateless    │
    │    for RBAC     │  │              │  │                 │
    └─────────────────┘  └──────────────┘  └─────────────────┘
              │
              │ Managed Identity
              ▼
    ┌─────────────────┐
    │  Azure Key Vault│
    │  - ClickUp token│
    │  - DB conn str  │
    └─────────────────┘
```

Recommended Azure services and rationale: see the top of `ROADMAP.md`.

## What stays the same

- React renderer (`src/`). Components, state, routing — unchanged.
- `QuickQuoteApi` interface (`src/types/api.d.ts`) — same contract, different
  transport.
- `quickquote_cli/` Python code — runs as-is on Linux.
- ClickUp client logic (`electron/clickup/`) — port shape unchanged, just
  move from Electron main to the API server and swap token storage.

## What changes

- Transport: IPC → HTTP. Single chokepoint at `src/api/client.ts`.
- DB: SQLite → Azure SQL. Schema port in `db/migrations/`.
- Auth: `identity.json` → Entra ID via MSAL.js. `allowed_user` stays for RBAC.
- File output: local FS → Azure Blob Storage + SAS URLs.
- Secrets: `clickup_config.api_token` row → Azure Key Vault.
- Native deps: `better-sqlite3` goes away on the server side. `electron-builder`
  is still used for the Electron build (which we keep working in parallel
  during the migration).
- Router: `HashRouter` → `BrowserRouter` (with SWA fallback route).
