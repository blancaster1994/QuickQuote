// iCore (Dynamics 365 F&O) sync orchestrator — scaffolding.
//
// This module mirrors electron/clickup/sync.ts at the surface level
// (testConnection, preflight, execute) so the main process and renderer
// can wire up the integration end-to-end before the auth + API client
// land. Today only `testConnection` does anything useful, and it only
// validates the saved config shape — there's no MSAL token acquisition
// yet, so no actual call to F&O is made.
//
// When the auth slice ships, testConnection will additionally:
//   1. Acquire a bearer token via MSAL public-client + PKCE
//   2. Hit `${environment_url}/data/Companies?$top=1` as a cheap probe
//   3. Return the user identity from the token claims
//
// Until then, "configured" means "looks well-formed and points somewhere".

import type Database from 'better-sqlite3';
import { getIcoreConfig } from '../db/icore';

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const OPERATIONS_URL_RE = /^https:\/\/[^/]+\.operations\.dynamics\.com\/?$/;

export type IcoreTestResult =
  | { ok: true; mode: 'config-only'; message: string }
  | { ok: false; error: string };

/**
 * Validate the saved iCore config and report what's still needed.
 * Does NOT hit the network — auth scaffolding ships in a later slice.
 *
 * The renderer's "Test Connection" button calls this. The success
 * variant carries `mode: 'config-only'` so the UI can clearly label
 * "config looks good, real connectivity not implemented yet" rather
 * than over-promising.
 */
export function testConnection(db: Database.Database): IcoreTestResult {
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

  // Format checks. Friendly errors so a typo doesn't masquerade as an
  // auth problem when the auth code lands.
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

  return {
    ok: true,
    mode: 'config-only',
    message: 'Config looks well-formed. Live connectivity check is added in the next slice (auth + API client).',
  };
}
