// iCore (Dynamics 365 F&O) sync orchestrator.
//
// This module owns:
//   - testConnection() — config-shape validation + cached-token probe. When
//     the API client is wired up (slice 4 adds api.ts) it also calls
//     `/data/Companies?$top=1` to verify connectivity end-to-end.
//   - refreshClients() — TODO (slice 4): pull F&O CustomersV3 → upsert into
//     the local icore_client cache.
//   - preflight() / execute() — TODO (slice 5): two-phase send-to-iCore that
//     creates the project upstream and stamps the returned ID.
//
// Mirrors electron/clickup/sync.ts at the surface level so the renderer
// can wire both integrations the same way.

import type Database from 'better-sqlite3';
import { getIcoreConfig } from '../db/icore';
import * as Auth from './auth';

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const OPERATIONS_URL_RE = /^https:\/\/[^/]+\.operations\.dynamics\.com\/?$/;

export type IcoreTestResult =
  | { ok: true; mode: 'config-only' | 'token'; message: string; account?: { username: string; name: string | null } }
  | { ok: false; error: string };

/**
 * Validate the saved iCore config + (when signed in) verify a token can be
 * acquired silently for the configured environment scope.
 *
 * Three terminal states:
 *   1. Config malformed/missing             → ok: false
 *   2. Config good, no cached account       → ok: true, mode: 'config-only'
 *   3. Config good + silent token acquired  → ok: true, mode: 'token'
 *
 * Live OData probe (mode: 'api') ships in slice 4 alongside api.ts.
 */
export async function testConnection(db: Database.Database): Promise<IcoreTestResult> {
  const cfg = getIcoreConfig(db);
  const missing: string[] = [];
  if (!cfg.tenant_id)       missing.push('Tenant ID');
  if (!cfg.client_id)       missing.push('Application (client) ID');
  if (!cfg.environment_url) missing.push('Environment URL');

  if (missing.length) {
    return {
      ok: false,
      error: `Missing required config: ${missing.join(', ')}. Fill these in before testing.`,
    };
  }
  if (cfg.tenant_id && !GUID_RE.test(cfg.tenant_id)) {
    return { ok: false, error: 'Tenant ID is not a valid GUID (expected 8-4-4-4-12 hex).' };
  }
  if (cfg.client_id && !GUID_RE.test(cfg.client_id)) {
    return { ok: false, error: 'Application (client) ID is not a valid GUID.' };
  }
  if (cfg.environment_url && !OPERATIONS_URL_RE.test(cfg.environment_url)) {
    return {
      ok: false,
      error: 'Environment URL should look like https://<env>.operations.dynamics.com (no trailing path).',
    };
  }

  // Try silent token acquisition. If no account is cached this errors out
  // and we return the friendlier "config-only" state with a hint to sign in.
  const account = await Auth.getAccount(db).catch(() => null);
  if (!account) {
    return {
      ok: true,
      mode: 'config-only',
      message: 'Config looks well-formed. Sign in to test token acquisition.',
    };
  }
  try {
    await Auth.acquireToken(db, { interactive: false });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
  return {
    ok: true,
    mode: 'token',
    message: `Signed in as ${account.username} and silent token acquisition succeeded.`,
    account: { username: account.username, name: account.name },
  };
}
