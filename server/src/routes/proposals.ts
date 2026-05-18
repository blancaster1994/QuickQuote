/**
 * Proposals routes — EXEMPLAR route file. Copy the patterns here when
 * implementing the other route files.
 *
 * Mirrors:
 *   electron/ipc-channels.ts:32-37 (PROPOSAL_* channels)
 *   electron/main.ts ipcMain.handle(IPC.PROPOSAL_*) handlers
 *   electron/db/queries.ts listProposals / loadProposal / saveProposal / deleteProposal
 */

import type { FastifyPluginAsync } from 'fastify';
// import { getPool } from '../db/index.js';
// import { require as requirePerm } from '../middleware/rbac.js';

export const registerProposals: FastifyPluginAsync = async (app) => {
  // GET /api/proposals → string[] of names
  app.get('/proposals', async (_req, _reply) => {
    // TODO: port from electron/db/queries.ts:listProposals
    return [] as string[];
  });

  // GET /api/proposals/:name → Proposal
  app.get<{ Params: { name: string } }>('/proposals/:name', async (req, reply) => {
    void req.params.name;
    // TODO: port from electron/db/queries.ts:loadProposal
    return reply.code(501).send({ error: 'not implemented' });
  });

  // POST /api/proposals { proposal, renameFrom? } → { ok, name, proposal }
  app.post('/proposals', async (_req, reply) => {
    // TODO: port from electron/db/queries.ts:saveProposal
    // - validate proposal shape with zod
    // - actor = req.user (from auth middleware)
    // - call saveProposal(db, actor, proposal, renameFrom)
    return reply.code(501).send({ error: 'not implemented' });
  });

  // DELETE /api/proposals/:name → { ok: true }
  app.delete<{ Params: { name: string } }>('/proposals/:name', async (req, reply) => {
    void req.params.name;
    // TODO: port from electron/db/queries.ts:deleteProposal
    return reply.code(501).send({ error: 'not implemented' });
  });
};
