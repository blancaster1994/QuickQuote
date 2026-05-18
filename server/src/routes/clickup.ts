/**
 * ClickUp routes. Mirrors electron/ipc-channels.ts:116-129 (CLICKUP_*).
 *
 * CRITICAL: api_token MUST stay server-side only. getConfig responses must
 * NEVER include the token; the renderer only sees a `configured` flag.
 * Mirror the sanitize pattern from electron/db/clickup.ts:43.
 *
 * For Azure deployment: store the ClickUp token in Azure Key Vault, NOT in
 * the database. Reference by name (env var CLICKUP_TOKEN_KV_REF).
 */

import type { FastifyPluginAsync } from 'fastify';

export const registerClickUp: FastifyPluginAsync = async (app) => {
  app.get('/clickup/config', async (_req, reply) =>
    reply.code(501).send({ error: 'clickup.getConfig: not implemented' }),
  );
  app.post('/clickup/config', async (_req, reply) =>
    reply.code(501).send({ error: 'clickup.setConfig: not implemented' }),
  );
  app.post('/clickup/test-connection', async (_req, reply) =>
    reply.code(501).send({ error: 'clickup.testConnection: not implemented' }),
  );
  app.post('/projects/:projectId/clickup/preflight', async (_req, reply) =>
    reply.code(501).send({ error: 'clickup.preflight: not implemented' }),
  );
  app.post('/projects/:projectId/clickup/send', async (_req, reply) =>
    reply.code(501).send({ error: 'clickup.send: not implemented' }),
  );
  app.get('/projects/:projectId/clickup/link', async (_req, reply) =>
    reply.code(501).send({ error: 'clickup.getLink: not implemented' }),
  );
  app.get('/projects/:projectId/clickup/phase-links', async (_req, reply) =>
    reply.code(501).send({ error: 'clickup.listPhaseLinks: not implemented' }),
  );
  app.delete('/projects/:projectId/clickup/link', async (_req, reply) =>
    reply.code(501).send({ error: 'clickup.unlink: not implemented' }),
  );
};
