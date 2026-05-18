/**
 * Identity routes. Mirrors electron/ipc-channels.ts:15-18 (IDENTITY_*).
 *
 * Web flow: MSAL.js handles login/logout on the SPA side. This server side
 * just reports who the JWT says the user is, and lists the configured
 * allowed_user rows for admin UIs.
 *
 *   GET  /identity         → current user from JWT (req.user)
 *   GET  /identity/allowed → list of allowed_user rows (admin only)
 *
 * No 'set' or 'clear' — those don't exist on web. Drop them from the
 * renderer when porting (they go away with the identity.json file).
 */

import type { FastifyPluginAsync } from 'fastify';

export const registerIdentity: FastifyPluginAsync = async (app) => {
  app.get('/identity', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'not authenticated' });
    return req.user;
  });

  app.get('/identity/allowed', async (_req, reply) =>
    reply.code(501).send({ error: 'identity.listAllowed: not implemented' }),
  );
};
