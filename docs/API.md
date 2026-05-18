# API mapping — IPC channels → HTTP endpoints

Source of truth for payload types: `src/types/api.d.ts` (the
`QuickQuoteApi` interface). This document is the transport-layer mapping.

All routes are under `/api/`. All routes (except `/healthz`) require a valid
Entra ID bearer token. Role-gated endpoints are noted; see `docs/AUTH.md`.

## Bootstrap

| IPC channel | HTTP | Notes |
|---|---|---|
| `app:bootstrap` | `GET /api/app/bootstrap` | One-shot mount call |
| `app:importFromQuickProp` | _omit on web_ | Reads from `C:\Users\...\QuickProp` — irrelevant |
| `app:importFromPMQuoting` | _omit on web_ | Same |

## Identity

| IPC channel | HTTP | Notes |
|---|---|---|
| `identity:get` | `GET /api/identity` | Returns current JWT claims + role |
| `identity:set` | _omit on web_ | MSAL handles login |
| `identity:clear` | _omit on web_ | MSAL handles logout |
| `identity:listAllowed` | `GET /api/identity/allowed` | Admin-only |

## Proposals

| IPC channel | HTTP | Notes |
|---|---|---|
| `proposal:list` | `GET /api/proposals` | Returns `string[]` (names) |
| `proposal:load` | `GET /api/proposals/:name` | Returns full Proposal |
| `proposal:save` | `POST /api/proposals` | Body: `{ proposal, renameFrom? }` |
| `proposal:delete` | `DELETE /api/proposals/:name` | |

## Lifecycle

All under `/api/proposals/:name/lifecycle/`:

| IPC channel | HTTP |
|---|---|
| `lifecycle:markSent` | `POST .../mark-sent` |
| `lifecycle:markWon` | `POST .../mark-won` |
| `lifecycle:markLost` | `POST .../mark-lost` |
| `lifecycle:markArchived` | `POST .../mark-archived` |
| `lifecycle:reopen` | `POST .../reopen` |
| `lifecycle:addNote` | `POST .../note` |
| `lifecycle:reassign` | `POST .../reassign` |
| `lifecycle:setFollowUp` | `POST .../follow-up` |
| `lifecycle:sendAndInitialize` | `POST .../send-and-initialize` |
| `lifecycle:markWonAndSync` | `POST .../mark-won-and-sync` |

## Versions

| IPC channel | HTTP |
|---|---|
| `version:create` | `POST /api/proposals/:name/versions` |
| `version:list` | `GET /api/proposals/:name/versions` |
| `version:load` | `GET /api/proposals/:name/versions/:version` |

## Templates

| IPC channel | HTTP |
|---|---|
| `clientTemplate:list` | `GET /api/templates/client` |
| `clientTemplate:load` | `GET /api/templates/client/:name` |
| `clientTemplate:save` | `POST /api/templates/client` |
| `clientTemplate:delete` | `DELETE /api/templates/client/:name` |
| `projectTemplate:list` | `GET /api/templates/project` |
| `projectTemplate:load` | `GET /api/templates/project/:name` |
| `projectTemplate:save` | `POST /api/templates/project` |
| `projectTemplate:delete` | `DELETE /api/templates/project/:name` |

## Lookups, markup, phases, tasks, bid item templates

| IPC channel | HTTP |
|---|---|
| `lookup:list` | `GET /api/lookups/:table` |
| `lookup:add` | `POST /api/lookups/:table` |
| `lookup:update` | `PATCH /api/lookups/:table/:id` |
| `lookup:delete` | `DELETE /api/lookups/:table/:id` |
| `markup:list` | `GET /api/markup` |
| `markup:add` | `POST /api/markup` |
| `markup:update` | `PATCH /api/markup/:id` |
| `markup:delete` | `DELETE /api/markup/:id` |
| `phaseDef:list` | `GET /api/phases?department=…` |
| `phaseDef:save` | `POST /api/phases` |
| `phaseDef:delete` | `DELETE /api/phases/:id` |
| `taskDef:list` | `GET /api/tasks?department=…&phase=…` |
| `taskDef:save` | `POST /api/tasks` |
| `taskDef:delete` | `DELETE /api/tasks/:id` |
| `bidItemTemplate:list` | `GET /api/bid-item-templates?legalEntity=…&department=…` |
| `bidItemTemplate:get` | `GET /api/bid-item-templates/:legalEntity/:department/:name` |
| `bidItemTemplate:save` | `POST /api/bid-item-templates` |
| `bidItemTemplate:delete` | `DELETE /api/bid-item-templates/:legalEntity/:department/:name` |
| `bidItemTemplate:rename` | `POST /api/bid-item-templates/rename` |

## Employees and rates

| IPC channel | HTTP |
|---|---|
| `employee:list` | `GET /api/employees?activeOnly=…` |
| `employee:save` | `POST /api/employees` |
| `employee:delete` | `DELETE /api/employees/:id` |
| `employee:importBulk` | `POST /api/employees/bulk-import` |
| `employee:findByEmail` | `GET /api/employees/by-email/:email` |
| `rate:list` | `GET /api/rates?legal_entity=…&rate_table=…` |
| `rate:save` | `POST /api/rates` |
| `rate:delete` | `DELETE /api/rates/:id` |
| `rate:importBulk` | `POST /api/rates/bulk-import` |
| `rate:lookup` | `GET /api/rates/lookup?legalEntity=…&rateTable=…&category=…&resourceId=…` |
| `rate:categories` | `GET /api/rates/categories?legalEntity=…` |
| `rate:tablesForEntity` | `GET /api/rates/tables-for-entity/:legalEntity` |

## ClickUp

| IPC channel | HTTP | Notes |
|---|---|---|
| `clickup:getConfig` | `GET /api/clickup/config` | NEVER returns api_token |
| `clickup:setConfig` | `POST /api/clickup/config` | Store token in Key Vault, not DB |
| `clickup:testConnection` | `POST /api/clickup/test-connection` | |
| `clickup:preflight` | `POST /api/projects/:projectId/clickup/preflight` | |
| `clickup:send` | `POST /api/projects/:projectId/clickup/send` | |
| `clickup:getLink` | `GET /api/projects/:projectId/clickup/link` | |
| `clickup:listPhaseLinks` | `GET /api/projects/:projectId/clickup/phase-links` | |
| `clickup:unlink` | `DELETE /api/projects/:projectId/clickup/link` | |

## Project mode

| IPC channel | HTTP |
|---|---|
| `project:initialize` | `POST /api/projects` |
| `project:get` | `GET /api/projects/:id` |
| `project:getByProposalName` | `GET /api/projects/by-proposal/:proposalName` |
| `project:list` | `GET /api/projects?…filters` |
| `project:updateHeader` | `PATCH /api/projects/:id/header` |
| `project:savePayload` | `PUT /api/projects/:id/payload` |
| `project:reassignPm` | `POST /api/projects/:id/reassign-pm` |

## Generation

| IPC channel | HTTP | Notes |
|---|---|---|
| `generate:docx` | `POST /api/generate/docx` | Returns `{ blob_name, sas_url }` on web |
| `generate:pdf` | `POST /api/generate/pdf` | Same |

## Dashboard

| IPC channel | HTTP |
|---|---|
| `dashboard:get` | `GET /api/dashboard?stale_days=…&win_rate_window_days=…&owner_email=…` |

## Endpoints with NO web equivalent

These are Electron-only and must be replaced at the call site:

| IPC channel | Web replacement |
|---|---|
| `os:openFile` | Browser download from SAS URL |
| `os:revealInExplorer` | n/a — remove from UI |
| `os:copyFileToClipboard` | n/a — remove from UI |
| `dialog:openFile` | `<input type="file">` |
