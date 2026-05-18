/**
 * Lifecycle routes. Mirrors electron/ipc-channels.ts:38-53 (LIFECYCLE_* channels).
 * Port from electron/main.ts ipcMain.handle(IPC.LIFECYCLE_*) handlers.
 */

import type { FastifyPluginAsync } from 'fastify';

export const registerLifecycle: FastifyPluginAsync = async (app) => {
  const stub = (name: string) => async (_req: unknown, reply: { code(n: number): { send(b: unknown): unknown } }) =>
    reply.code(501).send({ error: `${name}: not implemented` });

  app.post('/proposals/:name/lifecycle/mark-sent', stub('lifecycle.markSent') as never);
  app.post('/proposals/:name/lifecycle/mark-won', stub('lifecycle.markWon') as never);
  app.post('/proposals/:name/lifecycle/mark-lost', stub('lifecycle.markLost') as never);
  app.post('/proposals/:name/lifecycle/mark-archived', stub('lifecycle.markArchived') as never);
  app.post('/proposals/:name/lifecycle/reopen', stub('lifecycle.reopen') as never);
  app.post('/proposals/:name/lifecycle/note', stub('lifecycle.addNote') as never);
  app.post('/proposals/:name/lifecycle/reassign', stub('lifecycle.reassign') as never);
  app.post('/proposals/:name/lifecycle/follow-up', stub('lifecycle.setFollowUp') as never);
  app.post('/proposals/:name/lifecycle/send-and-initialize', stub('lifecycle.sendAndInitialize') as never);
  app.post('/proposals/:name/lifecycle/mark-won-and-sync', stub('lifecycle.markWonAndSync') as never);
};
