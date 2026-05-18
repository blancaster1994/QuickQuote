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
import {
  getIcoreConfig,
  setIcoreConfig,
  replaceIcoreClients,
} from '../db/icore';
import * as Auth from './auth';
import { IcoreApi, IcoreApiError, customerToCacheRow } from './api';

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const OPERATIONS_URL_RE = /^https:\/\/[^/]+\.operations\.dynamics\.com\/?$/;

export type IcoreTestResult =
  | { ok: true; mode: 'config-only' | 'token' | 'api'; message: string; account?: { username: string; name: string | null } }
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

  // Live OData probe: cheapest endpoint that exercises the auth path.
  // `/data/Companies?$top=1` returns the first company the user can see
  // (every F&O user belongs to at least one). A 200 here means token →
  // F&O round-trip is healthy end-to-end.
  try {
    const api = new IcoreApi(cfg.environment_url!, () => Auth.acquireToken(db, { interactive: false }));
    const companies = await api.listCompanies(1);
    return {
      ok: true,
      mode: 'api',
      message: `Signed in as ${account.username}; F&O reachable (${companies.length ? `first company: ${companies[0].DataArea}` : 'no companies visible'}).`,
      account: { username: account.username, name: account.name },
    };
  } catch (e: any) {
    if (e instanceof IcoreApiError) {
      return { ok: false, error: `F&O API ${e.status}${e.code ? ' / ' + e.code : ''}: ${e.message}` };
    }
    return { ok: false, error: e?.message ?? String(e) };
  }
}

// ── client cache refresh ─────────────────────────────────────────────────

export interface RefreshClientsResult {
  ok: true;
  upserted: number;
  deactivated: number;
  total: number;
  duration_ms: number;
}

/**
 * Pull every visible non-blocked customer from F&O and replace the local
 * `icore_client` cache transactionally. Updates
 * `icore_config.client_last_synced_at` on success so the interval timer
 * knows when the next sweep is due. Caller (IPC handler / interval timer)
 * is responsible for catching errors and presenting them.
 */
export async function refreshClients(
  db: Database.Database,
): Promise<RefreshClientsResult> {
  const cfg = getIcoreConfig(db);
  if (!cfg.environment_url) throw new Error('iCore environment URL not configured.');
  const api = new IcoreApi(cfg.environment_url, () => Auth.acquireToken(db, { interactive: false }));

  const start = Date.now();
  const customers = await api.listCustomers({ includeBlocked: false });
  const rows = customers.map(customerToCacheRow);
  const { upserted, deactivated } = replaceIcoreClients(db, rows);
  setIcoreConfig(db, { client_last_synced_at: new Date().toISOString() });
  return {
    ok: true,
    upserted,
    deactivated,
    total: rows.length,
    duration_ms: Date.now() - start,
  };
}

// ── background interval ──────────────────────────────────────────────────
//
// Single setInterval started from main.ts at app ready. Reads config each
// tick (so changes to interval_minutes take effect within a minute) and
// fires `refreshClients` when:
//   - sync is enabled,
//   - we have a cached account (silent refresh won't prompt),
//   - the last sync is older than the configured interval.

let intervalHandle: NodeJS.Timeout | null = null;

export function startBackgroundRefresh(db: Database.Database): void {
  if (intervalHandle) return;
  const tick = async () => {
    try {
      const cfg = getIcoreConfig(db);
      if (!cfg.enabled || !cfg.environment_url) return;
      const account = await Auth.getAccount(db).catch(() => null);
      if (!account) return;

      const intervalMs = Math.max(5, cfg.client_sync_interval_minutes) * 60_000;
      const lastMs = cfg.client_last_synced_at ? new Date(cfg.client_last_synced_at).getTime() : 0;
      if (Date.now() - lastMs < intervalMs) return;

      await refreshClients(db);
    } catch (e) {
      console.warn('[icore] background refresh failed:', e);
    }
  };
  // First tick after 30s so app startup doesn't compete with renderer
  // bootstrap; then once per minute.
  intervalHandle = setInterval(tick, 60_000);
  setTimeout(tick, 30_000);
}

export function stopBackgroundRefresh(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
