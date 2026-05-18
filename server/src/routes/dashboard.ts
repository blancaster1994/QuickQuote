/**
 * Dashboard. Mirrors electron/ipc-channels.ts:60 (DASHBOARD_GET).
 */

import type { FastifyPluginAsync } from 'fastify';

export const registerDashboard: FastifyPluginAsync = async (app) => {
  app.get('/dashboard', async (_req, reply) =>
    reply.code(501).send({ error: 'dashboard.get: not implemented' }),
  );
};
