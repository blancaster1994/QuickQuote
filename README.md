# QuickQuote

Engineering quote/proposal generator. Replaces QuickProp v3.

## Current state: Windows Electron desktop app

The shipping product is a Windows Electron app. The renderer is React + Vite;
the main process embeds SQLite (`better-sqlite3`), spawns a Python CLI for
DOCX/PDF generation, and reads/writes a local `identity.json` for the active
user. Builds produce a portable `.exe` via `electron-builder`.

## Future state: Azure-hosted web app

A migration to a web app is in progress. The renderer stays largely the same;
the Electron main process becomes a Fastify API on Azure App Service; the
local SQLite database becomes Azure SQL; identity moves to Entra ID via
MSAL.js. See `docs/ARCHITECTURE.md` and `docs/ROADMAP.md`.

## Quickstart (Electron, today)

```bash
# Once: install deps. electron-rebuild postinstall runs on Windows only;
# on macOS/Linux it's skipped (set QQ_SKIP_ELECTRON_REBUILD=true to force).
npm install

# Run the app (concurrent Vite dev server + Electron):
npm start

# Other useful scripts:
npm run typecheck       # tsc on renderer + electron
npm run lint            # ESLint
npm run test            # Vitest smoke tests
npm run dist            # Build a Windows portable .exe
npm run seed:demo       # Seed local SQLite with demo data
```

## Project layout

```
src/                Renderer (React, Vite). UI + state lives here.
electron/           Main process. IPC handlers, SQLite queries, ClickUp,
                    DOCX/PDF generation orchestrator.
quickquote_cli/     Python CLI used to render DOCX/PDF from a JSON payload.
                    Spawned by electron/proposal/generate.ts today; on web
                    will run as an Azure Function (Linux-portable as-is).
Templates/          DOCX templates bundled into the app.
seed/               CSVs and JSON for initial database seed (lookups,
                    allowed_users, demo data).
server/             Fastify API skeleton for the web port. Stubs today;
                    next session fills in real handlers.
db/migrations/      T-SQL migrations for Azure SQL (web port).
docs/               Architecture, roadmap, API mapping, risks. Read these
                    before working on the migration.
```

## Configuration

- `.env.example` — copy to `.env.local` (renderer) and `.env` (server) and
  fill in real values. Do NOT commit `.env`.
- Node version pinned via `.nvmrc` (20.18.0). Use `nvm use`.

## More reading

- `docs/ARCHITECTURE.md` — current Electron app + target web architecture.
- `docs/ROADMAP.md` — what's done, what's next, in numbered phases.
- `docs/AZURE_SETUP.md` — how to provision Azure resources (no coding).
- `docs/API.md` — IPC channel → HTTP endpoint mapping.
- `docs/AUTH.md` — identity flow today + Entra ID design.
- `docs/RISKS.md` — gotchas for the web port.
