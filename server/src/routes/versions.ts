/**
 * Versioning routes. Mirrors electron/ipc-channels.ts:54-57 (VERSION_* channels).
 */

import type { FastifyPluginAsync } from 'fastify';

export const registerVersions: FastifyPluginAsync = async (app) => {
  app.post('/proposals/:name/versions', async (_req, reply) =>
    reply.code(501).send({ error: 'versions.create: not implemented' }),
  );
  app.get('/proposals/:name/versions', async (_req, reply) =>
    reply.code(501).send({ error: 'versions.list: not implemented' }),
  );
  app.get('/proposals/:name/versions/:version', async (_req, reply) =>
    reply.code(501).send({ error: 'versions.load: not implemented' }),
  );
};
