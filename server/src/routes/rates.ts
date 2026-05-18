/**
 * Rate routes. Mirrors electron/ipc-channels.ts:105-111 (RATE_*).
 */

import type { FastifyPluginAsync } from 'fastify';

export const registerRates: FastifyPluginAsync = async (app) => {
  app.get('/rates', async (_req, reply) =>
    reply.code(501).send({ error: 'rates.list: not implemented' }),
  );
  app.post('/rates', async (_req, reply) =>
    reply.code(501).send({ error: 'rates.save: not implemented' }),
  );
  app.delete('/rates/:id', async (_req, reply) =>
    reply.code(501).send({ error: 'rates.remove: not implemented' }),
  );
  app.post('/rates/bulk-import', async (_req, reply) =>
    reply.code(501).send({ error: 'rates.importBulk: not implemented' }),
  );
  app.get('/rates/lookup', async (_req, reply) =>
    reply.code(501).send({ error: 'rates.lookup: not implemented' }),
  );
  app.get('/rates/categories', async (_req, reply) =>
    reply.code(501).send({ error: 'rates.categories: not implemented' }),
  );
  app.get('/rates/tables-for-entity/:legalEntity', async (_req, reply) =>
    reply.code(501).send({ error: 'rates.tablesForEntity: not implemented' }),
  );
};
