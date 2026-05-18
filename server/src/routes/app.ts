/**
 * App-level routes. Mirrors electron/ipc-channels.ts:9-12 (APP_*).
 *
 * Skip APP_IMPORT_FROM_QUICKPROP and APP_IMPORT_FROM_PMQUOTING in web — those
 * read from a local Windows path and don't apply on Azure.
 */

import type { FastifyPluginAsync } from 'fastify';

export const registerApp: FastifyPluginAsync = async (app) => {
  app.get('/app/bootstrap', async (_req, reply) =>
    reply.code(501).send({ error: 'app.bootstrap: not implemented' }),
  );
};
