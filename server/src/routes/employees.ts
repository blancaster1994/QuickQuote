/**
 * Employee routes. Mirrors electron/ipc-channels.ts:99-103 (EMPLOYEE_*).
 */

import type { FastifyPluginAsync } from 'fastify';

export const registerEmployees: FastifyPluginAsync = async (app) => {
  app.get('/employees', async (_req, reply) =>
    reply.code(501).send({ error: 'employees.list: not implemented' }),
  );
  app.post('/employees', async (_req, reply) =>
    reply.code(501).send({ error: 'employees.save: not implemented' }),
  );
  app.delete('/employees/:id', async (_req, reply) =>
    reply.code(501).send({ error: 'employees.remove: not implemented' }),
  );
  app.post('/employees/bulk-import', async (_req, reply) =>
    reply.code(501).send({ error: 'employees.importBulk: not implemented' }),
  );
  app.get('/employees/by-email/:email', async (_req, reply) =>
    reply.code(501).send({ error: 'employees.findByEmail: not implemented' }),
  );
};
