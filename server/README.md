# QuickQuote API server

Fastify on Node 20, deployed to Azure App Service (Linux). Mirrors the IPC
channels in `electron/ipc-channels.ts` as HTTP endpoints — each route file
in `src/routes/` corresponds to one channel group.

## State today

Everything is a stub. The exemplar is `src/routes/proposals.ts` — copy that
pattern when implementing the rest. `src/db/queries.ts` is the target for
porting `electron/db/queries.ts` (translation cheatsheet in the header).

## Local dev

```bash
cd server
npm install
npm run dev    # tsx watch on src/index.ts
```

Requires `.env` with at least:

- `JWT_ISSUER`, `JWT_AUDIENCE` — set both to enable real auth; leave both
  unset for insecure dev mode (any request is treated as admin).
- `AZURE_SQL_CONNECTION_STRING` — required as soon as a route touches the DB.

## Deploy

Built artifact: `dist/`. Entry: `node dist/index.js`. See
`../azure-pipelines.yml` for the pipeline; `../docs/AZURE_SETUP.md` for
resource provisioning.

## Route mapping

See `../docs/API.md` for the full IPC → HTTP mapping table.
