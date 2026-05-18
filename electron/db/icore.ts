// iCore (Dynamics 365 F&O) integration — DB-side config CRUD.
//
// Structurally mirrors electron/db/clickup.ts (the established external-system
// pattern in QuickQuote). The schema for icore_config + icore_client cache +
// the project_icore_link / project_icore_phase_link tables landed in
// migration v5 (electron/db/schema.ts). This module owns the config
// singleton getter/setter — the cache CRUD and link CRUD will be added in
// the next slice alongside the actual sync code.
//
// Renderer never sees the full row directly; main.ts wraps reads in a
// sanitized IcoreStatus shape. Today there's no secret to strip — the
// tenant/client/env URL are non-secret app-registration metadata — but
// keeping the renderer on a smaller surface area means we can add a real
// secret (cached token, refresh token) later without changing the
// renderer-facing type.

import type Database from 'better-sqlite3';

export interface IcoreConfigRow {
  tenant_id: string | null;
  client_id: string | null;
  environment_url: string | null;
  deeplink_url_pattern: string | null;
  enabled: boolean;
  client_sync_interval_minutes: number;
  client_last_synced_at: string | null;
  updated_at: string | null;
}

const EMPTY: IcoreConfigRow = {
  tenant_id: null,
  client_id: null,
  environment_url: null,
  deeplink_url_pattern: null,
  enabled: false,
  client_sync_interval_minutes: 60,
  client_last_synced_at: null,
  updated_at: null,
};

export function getIcoreConfig(db: Database.Database): IcoreConfigRow {
  const row = db
    .prepare(`
      SELECT tenant_id, client_id, environment_url, deeplink_url_pattern,
             enabled, client_sync_interval_minutes, client_last_synced_at,
             updated_at
      FROM icore_config WHERE key='singleton'
    `)
    .get() as
    | (Omit<IcoreConfigRow, 'enabled'> & { enabled: number })
    | undefined;
  if (!row) return { ...EMPTY };
  return { ...row, enabled: !!row.enabled };
}

export function setIcoreConfig(
  db: Database.Database,
  patch: Partial<IcoreConfigRow>,
): IcoreConfigRow {
  const cur = getIcoreConfig(db);
  const next: IcoreConfigRow = { ...cur, ...patch };
  db.prepare(`
    REPLACE INTO icore_config(
      key, tenant_id, client_id, environment_url, deeplink_url_pattern,
      enabled, client_sync_interval_minutes, client_last_synced_at,
      updated_at
    ) VALUES ('singleton', ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    next.tenant_id,
    next.client_id,
    next.environment_url,
    next.deeplink_url_pattern,
    next.enabled ? 1 : 0,
    next.client_sync_interval_minutes,
    next.client_last_synced_at,
  );
  return getIcoreConfig(db);
}

// ── client cache ────────────────────────────────────────────────────────────
//
// `icore_client` is a local mirror of F&O CustomersV3 — populated by the
// refresh job (sync.ts) on an interval + user-driven "Refresh clients"
// button. The picker UI in proposal/project editors reads from this cache
// instead of hitting OData on every render.

export interface IcoreClientRow {
  id: number;
  customer_account: string;
  data_area_id: string | null;
  name: string;
  address: string | null;
  contact_name: string | null;
  contact_email: string | null;
  is_active: 0 | 1;
  last_synced_at?: string;
}

export interface ListIcoreClientsFilters {
  /** Restrict to one F&O company. When omitted, returns clients from all
   *  companies the cache has seen. */
  data_area_id?: string;
  /** Plain-text search across name + customer_account + email. */
  q?: string;
  /** Include blocked / inactive customers. Default: false (active only). */
  includeInactive?: boolean;
  /** Hard cap on the result set — keep the picker render fast. */
  limit?: number;
}

export function listIcoreClients(
  db: Database.Database,
  filters: ListIcoreClientsFilters = {},
): IcoreClientRow[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (!filters.includeInactive) where.push('is_active = 1');
  if (filters.data_area_id) {
    where.push('data_area_id = ?');
    args.push(filters.data_area_id);
  }
  if (filters.q?.trim()) {
    where.push('(LOWER(name) LIKE ? OR LOWER(customer_account) LIKE ? OR LOWER(COALESCE(contact_email,\'\')) LIKE ?)');
    const lc = `%${filters.q.trim().toLowerCase()}%`;
    args.push(lc, lc, lc);
  }
  const sql = `
    SELECT id, customer_account, data_area_id, name, address,
           contact_name, contact_email, is_active, last_synced_at
    FROM icore_client
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY name COLLATE NOCASE
    ${filters.limit ? `LIMIT ${Number(filters.limit) | 0}` : ''}
  `;
  return db.prepare(sql).all(...args) as IcoreClientRow[];
}

export function getIcoreClientByAccount(
  db: Database.Database,
  customerAccount: string,
  dataAreaId?: string | null,
): IcoreClientRow | null {
  const row = dataAreaId
    ? db.prepare(`
        SELECT id, customer_account, data_area_id, name, address,
               contact_name, contact_email, is_active, last_synced_at
        FROM icore_client
        WHERE customer_account = ? AND COALESCE(data_area_id,'') = COALESCE(?,'')
      `).get(customerAccount, dataAreaId)
    : db.prepare(`
        SELECT id, customer_account, data_area_id, name, address,
               contact_name, contact_email, is_active, last_synced_at
        FROM icore_client
        WHERE customer_account = ?
        LIMIT 1
      `).get(customerAccount);
  return (row as IcoreClientRow | undefined) ?? null;
}

/** Transactional replace: upsert every row, then mark any cached row that
 *  wasn't in this refresh as inactive. We intentionally don't DELETE
 *  missing rows — a row can disappear from F&O (e.g. an OData filter
 *  change) without us forgetting that a proposal still references it. */
export function replaceIcoreClients(
  db: Database.Database,
  rows: Array<Omit<IcoreClientRow, 'id' | 'last_synced_at'>>,
): { upserted: number; deactivated: number } {
  const tx = db.transaction(() => {
    const seen = new Set<string>();
    const upsert = db.prepare(`
      INSERT INTO icore_client(
        customer_account, data_area_id, name, address,
        contact_name, contact_email, is_active, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(data_area_id, customer_account) DO UPDATE SET
        name           = excluded.name,
        address        = excluded.address,
        contact_name   = excluded.contact_name,
        contact_email  = excluded.contact_email,
        is_active      = excluded.is_active,
        last_synced_at = datetime('now')
    `);
    for (const r of rows) {
      upsert.run(
        r.customer_account,
        r.data_area_id,
        r.name,
        r.address,
        r.contact_name,
        r.contact_email,
        r.is_active,
      );
      seen.add(`${r.data_area_id ?? ''}::${r.customer_account}`);
    }
    // Sweep: mark anything we DIDN'T see as inactive.
    const all = db.prepare('SELECT id, customer_account, data_area_id FROM icore_client WHERE is_active = 1').all() as Array<{
      id: number; customer_account: string; data_area_id: string | null;
    }>;
    const stillActive = new Set<string>();
    for (const r of rows) stillActive.add(`${r.data_area_id ?? ''}::${r.customer_account}`);
    const deactivate = db.prepare('UPDATE icore_client SET is_active = 0 WHERE id = ?');
    let deactivated = 0;
    for (const row of all) {
      const key = `${row.data_area_id ?? ''}::${row.customer_account}`;
      if (!stillActive.has(key)) {
        deactivate.run(row.id);
        deactivated++;
      }
    }
    return { upserted: rows.length, deactivated };
  });
  return tx();
}
