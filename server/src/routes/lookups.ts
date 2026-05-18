/**
 * Lookup routes — name lists, markup, phase/task taxonomy, bid item templates.
 * Mirrors electron/ipc-channels.ts:71-97 (LOOKUP_*, MARKUP_*, PHASE_DEF_*,
 * TASK_DEF_*, BID_ITEM_TEMPLATE_*).
 */

import type { FastifyPluginAsync } from 'fastify';

export const registerLookups: FastifyPluginAsync = async (app) => {
  // Name lists: legal_entity, department, rate_table, project_type, expense_category
  app.get('/lookups/:table', async (_req, reply) =>
    reply.code(501).send({ error: 'lookups.list: not implemented' }),
  );
  app.post('/lookups/:table', async (_req, reply) =>
    reply.code(501).send({ error: 'lookups.add: not implemented' }),
  );
  app.patch('/lookups/:table/:id', async (_req, reply) =>
    reply.code(501).send({ error: 'lookups.update: not implemented' }),
  );
  app.delete('/lookups/:table/:id', async (_req, reply) =>
    reply.code(501).send({ error: 'lookups.remove: not implemented' }),
  );

  // Markup percentages
  app.get('/markup', async (_req, reply) =>
    reply.code(501).send({ error: 'markup.list: not implemented' }),
  );
  app.post('/markup', async (_req, reply) =>
    reply.code(501).send({ error: 'markup.add: not implemented' }),
  );
  app.patch('/markup/:id', async (_req, reply) =>
    reply.code(501).send({ error: 'markup.update: not implemented' }),
  );
  app.delete('/markup/:id', async (_req, reply) =>
    reply.code(501).send({ error: 'markup.remove: not implemented' }),
  );

  // Phase defs
  app.get('/phases', async (_req, reply) =>
    reply.code(501).send({ error: 'phases.list: not implemented' }),
  );
  app.post('/phases', async (_req, reply) =>
    reply.code(501).send({ error: 'phases.save: not implemented' }),
  );
  app.delete('/phases/:id', async (_req, reply) =>
    reply.code(501).send({ error: 'phases.remove: not implemented' }),
  );

  // Task defs
  app.get('/tasks', async (_req, reply) =>
    reply.code(501).send({ error: 'tasks.list: not implemented' }),
  );
  app.post('/tasks', async (_req, reply) =>
    reply.code(501).send({ error: 'tasks.save: not implemented' }),
  );
  app.delete('/tasks/:id', async (_req, reply) =>
    reply.code(501).send({ error: 'tasks.remove: not implemented' }),
  );

  // Bid item templates (legal_entity, department)-scoped phases + nested tasks
  app.get('/bid-item-templates', async (_req, reply) =>
    reply.code(501).send({ error: 'bidItemTemplates.list: not implemented' }),
  );
  app.get('/bid-item-templates/:legalEntity/:department/:name', async (_req, reply) =>
    reply.code(501).send({ error: 'bidItemTemplates.get: not implemented' }),
  );
  app.post('/bid-item-templates', async (_req, reply) =>
    reply.code(501).send({ error: 'bidItemTemplates.save: not implemented' }),
  );
  app.delete('/bid-item-templates/:legalEntity/:department/:name', async (_req, reply) =>
    reply.code(501).send({ error: 'bidItemTemplates.remove: not implemented' }),
  );
  app.post('/bid-item-templates/rename', async (_req, reply) =>
    reply.code(501).send({ error: 'bidItemTemplates.rename: not implemented' }),
  );
};
