/**
 * Proposal generation. Mirrors electron/ipc-channels.ts:62-64 (GENERATE_*).
 *
 * Server-side: instead of spawning python-docx as a local subprocess (the
 * Electron approach in electron/proposal/generate.ts), POST the payload to
 * an Azure Function running the same quickquote_cli/ code. Or run the CLI
 * in this container — the Python deps are small.
 *
 * The generated DOCX/PDF goes to Azure Blob Storage and the response contains
 * a SAS URL the renderer downloads from.
 */

import type { FastifyPluginAsync } from 'fastify';

export const registerGenerate: FastifyPluginAsync = async (app) => {
  app.post('/generate/docx', async (_req, reply) =>
    reply.code(501).send({ error: 'generate.docx: not implemented' }),
  );
  app.post('/generate/pdf', async (_req, reply) =>
    reply.code(501).send({ error: 'generate.pdf: not implemented' }),
  );
};
