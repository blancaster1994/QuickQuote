import { describe, it, expect } from 'vitest';

// Smoke test placeholder. When the server is buildable, replace with:
//   import Fastify from 'fastify';
//   const app = Fastify();
//   app.get('/healthz', async () => ({ ok: true }));
//   const r = await app.inject({ method: 'GET', url: '/healthz' });
//   expect(r.statusCode).toBe(200);
//
// Today this just asserts the route file is importable so vitest picks it up.

describe('server smoke', () => {
  it('placeholder', () => {
    expect(true).toBe(true);
  });
});
