/**
 * Template routes — both client templates (per-engineer) and project (scope)
 * templates. Mirrors electron/ipc-channels.ts:20-30.
 */

import type { FastifyPluginAsync } from 'fastify';

export const registerTemplates: FastifyPluginAsync = async (app) => {
  // Client templates (per-engineer)
  app.get('/templates/client', async (_req, reply) =>
    reply.code(501).send({ error: 'clientTemplates.list: not implemented' }),
  );
  app.get('/templates/client/:name', async (_req, reply) =>
    reply.code(501).send({ error: 'clientTemplates.load: not implemented' }),
  );
  app.post('/templates/client', async (_req, reply) =>
    reply.code(501).send({ error: 'clientTemplates.save: not implemented' }),
  );
  app.delete('/templates/client/:name', async (_req, reply) =>
    reply.code(501).send({ error: 'clientTemplates.remove: not implemented' }),
  );

  // Project templates (scope templates)
  app.get('/templates/project', async (_req, reply) =>
    reply.code(501).send({ error: 'projectTemplates.list: not implemented' }),
  );
  app.get('/templates/project/:name', async (_req, reply) =>
    reply.code(501).send({ error: 'projectTemplates.load: not implemented' }),
  );
  app.post('/templates/project', async (_req, reply) =>
    reply.code(501).send({ error: 'projectTemplates.save: not implemented' }),
  );
  app.delete('/templates/project/:name', async (_req, reply) =>
    reply.code(501).send({ error: 'projectTemplates.remove: not implemented' }),
  );
};
