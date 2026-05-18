/**
 * QuickQuote API server — Fastify bootstrap.
 *
 * Routes mirror the IPC channel groups in `electron/ipc-channels.ts`. Each
 * route file is a stub today; the staff dev / next Claude session ports the
 * corresponding ipcMain handler from `electron/main.ts`.
 *
 * Auth: every route under /api requires a valid Entra ID JWT. Health check
 * stays open for App Service liveness probes.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { authPlugin } from './middleware/auth.js';
import { registerProposals } from './routes/proposals.js';
import { registerLifecycle } from './routes/lifecycle.js';
import { registerVersions } from './routes/versions.js';
import { registerTemplates } from './routes/templates.js';
import { registerLookups } from './routes/lookups.js';
import { registerEmployees } from './routes/employees.js';
import { registerRates } from './routes/rates.js';
import { registerClickUp } from './routes/clickup.js';
import { registerProject } from './routes/project.js';
import { registerGenerate } from './routes/generate.js';
import { registerIdentity } from './routes/identity.js';
import { registerDashboard } from './routes/dashboard.js';
import { registerApp } from './routes/app.js';

const PORT = Number(process.env.PORT) || 8080;

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: process.env.ALLOWED_ORIGIN?.split(',') ?? false,
    credentials: true,
  });

  app.get('/healthz', async () => ({ ok: true, ts: new Date().toISOString() }));

  await app.register(
    async (api) => {
      await api.register(authPlugin);
      await api.register(registerApp);
      await api.register(registerIdentity);
      await api.register(registerProposals);
      await api.register(registerLifecycle);
      await api.register(registerVersions);
      await api.register(registerTemplates);
      await api.register(registerLookups);
      await api.register(registerEmployees);
      await api.register(registerRates);
      await api.register(registerClickUp);
      await api.register(registerProject);
      await api.register(registerGenerate);
      await api.register(registerDashboard);
    },
    { prefix: '/api' },
  );

  await app.listen({ port: PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
