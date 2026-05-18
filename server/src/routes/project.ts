/**
 * Project routes. Mirrors electron/ipc-channels.ts:131-141 (PROJECT_*).
 */

import type { FastifyPluginAsync } from 'fastify';

export const registerProject: FastifyPluginAsync = async (app) => {
  app.post('/projects', async (_req, reply) =>
    reply.code(501).send({ error: 'project.initialize: not implemented' }),
  );
  app.get('/projects/:id', async (_req, reply) =>
    reply.code(501).send({ error: 'project.get: not implemented' }),
  );
  app.get('/projects/by-proposal/:proposalName', async (_req, reply) =>
    reply.code(501).send({ error: 'project.getByProposalName: not implemented' }),
  );
  app.get('/projects', async (_req, reply) =>
    reply.code(501).send({ error: 'project.list: not implemented' }),
  );
  app.patch('/projects/:id/header', async (_req, reply) =>
    reply.code(501).send({ error: 'project.updateHeader: not implemented' }),
  );
  app.put('/projects/:id/payload', async (_req, reply) =>
    reply.code(501).send({ error: 'project.savePayload: not implemented' }),
  );
  app.post('/projects/:id/reassign-pm', async (_req, reply) =>
    reply.code(501).send({ error: 'project.reassignPm: not implemented' }),
  );
};
