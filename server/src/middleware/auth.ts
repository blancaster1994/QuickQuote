/**
 * Entra ID JWT validation middleware.
 *
 * Stub. Production version should:
 *   1. Fetch and cache JWKS from `${JWT_ISSUER}/.well-known/openid-configuration`
 *   2. Verify the bearer token's signature, `iss`, `aud`, `exp`
 *   3. Extract the `email` (or `upn`/`preferred_username`) claim
 *   4. Look up the email in `allowed_user` (port `electron/identity/identity.ts:77-85`)
 *   5. Attach `request.user = { email, name, role, permissions }`
 *   6. Reject with 401 if no token; 403 if email not in allowed_user
 *
 * Mirror the role → permissions map from `electron/identity/identity.ts:22-27`.
 */

import type { FastifyPluginAsync } from 'fastify';
import { jwtVerify, createRemoteJWKSet } from 'jose';

export interface AuthenticatedUser {
  email: string;
  name: string;
  role: string;
  permissions: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

export const authPlugin: FastifyPluginAsync = async (app) => {
  const issuer = process.env.JWT_ISSUER;
  const audience = process.env.JWT_AUDIENCE;

  if (!issuer || !audience) {
    app.log.warn(
      '[auth] JWT_ISSUER or JWT_AUDIENCE not set — running in INSECURE dev mode (no auth).',
    );
    app.addHook('onRequest', async (req) => {
      req.user = {
        email: 'dev@example.com',
        name: 'Dev User',
        role: 'admin',
        permissions: ['view', 'edit', 'mark_sent', 'mark_won', 'mark_lost', 'reopen', 'manage'],
      };
    });
    return;
  }

  const JWKS = createRemoteJWKSet(new URL(`${issuer}/discovery/v2.0/keys`));

  app.addHook('onRequest', async (req, reply) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'missing bearer token' });
    }
    const token = header.slice(7);
    try {
      const { payload } = await jwtVerify(token, JWKS, { issuer, audience });
      const email = String(payload.email ?? payload.preferred_username ?? payload.upn ?? '');
      if (!email) return reply.code(401).send({ error: 'no email claim' });
      // TODO: look up email in `allowed_user`, attach role + permissions.
      // For now, accept any email with viewer role.
      req.user = {
        email,
        name: String(payload.name ?? email),
        role: 'viewer',
        permissions: ['view'],
      };
    } catch (err) {
      app.log.warn({ err }, 'jwt verify failed');
      return reply.code(401).send({ error: 'invalid token' });
    }
  });
};
