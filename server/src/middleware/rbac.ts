/**
 * Permission gates. Mirrors `electron/identity/identity.ts:22-27`.
 *
 * Usage:
 *   app.post('/proposals', { preHandler: require('edit') }, handler);
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['view', 'edit', 'mark_sent', 'mark_won', 'mark_lost', 'reopen', 'manage'],
  pm: ['view', 'edit', 'mark_sent', 'mark_won', 'mark_lost'],
  accounting: ['view', 'mark_won', 'mark_lost'],
  viewer: ['view'],
};

export function require(permission: string) {
  return async function (req: FastifyRequest, reply: FastifyReply) {
    const perms = req.user?.permissions ?? [];
    if (!perms.includes(permission)) {
      return reply.code(403).send({ error: `requires permission: ${permission}` });
    }
  };
}
