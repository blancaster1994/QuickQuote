// ClickUp integration — DB-side queries.
//
// Tables:
//   * clickup_config              — singleton: bot token + workspace + admin
//                                   requests destination IDs + enabled flag.
//   * project_clickup_link        — one row per project that's been pushed to
//                                   ClickUp at least once (the project mapping).
//   * project_clickup_phase_link  — one row per phase that's been pushed (the
//                                   task mapping; supports re-send Skip / Update
//                                   decisions per phase).
//
// Ported from PM Quoting App's electron/db/clickup.ts. Renamed every `quote_*`
// column/table reference to `project_*` since the QuickQuote integration ties
// ClickUp to the post-Won Project record, not the proposal.

import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// ── Config ─────────────────────────────────────────────────────────────────

export interface ClickUpConfigRow {
  api_token: string | null;
  workspace_id: string | null;
  admin_requests_space_id: string | null;
  admin_requests_list_id: string | null;
  enabled: boolean;
  updated_at: string | null;
}

export function getClickUpConfig(db: Database.Database): ClickUpConfigRow {
  const row = db
    .prepare(`
      SELECT api_token, workspace_id, admin_requests_space_id, admin_requests_list_id,
             enabled, updated_at
      FROM clickup_config WHERE key='singleton'
    `)
    .get() as
    | (Omit<ClickUpConfigRow, 'enabled'> & { enabled: number })
    | undefined;
  if (!row) {
    return {
      api_token: null,
      workspace_id: null,
      admin_requests_space_id: null,
      admin_requests_list_id: null,
      enabled: false,
      updated_at: null,
    };
  }
  return { ...row, enabled: !!row.enabled };
}

export function setClickUpConfig(
  db: Database.Database,
  patch: Partial<ClickUpConfigRow>,
): ClickUpConfigRow {
  const cur = getClickUpConfig(db);
  const next: ClickUpConfigRow = { ...cur, ...patch };
  db.prepare(`
    REPLACE INTO clickup_config(
      key, api_token, workspace_id, admin_requests_space_id, admin_requests_list_id,
      enabled, updated_at
    ) VALUES ('singleton',?,?,?,?,?,datetime('now'))
  `).run(
    next.api_token,
    next.workspace_id,
    next.admin_requests_space_id,
    next.admin_requests_list_id,
    next.enabled ? 1 : 0,
  );
  return getClickUpConfig(db);
}

/**
 * One-shot bootstrap: read a JSON file from userData and seed clickup_config
 * from it. The file is deleted after a successful read so the secret doesn't
 * linger on disk. After the first run the config lives in the DB and the
 * file is gone.
 */
export function bootstrapClickUpConfigFromFile(
  db: Database.Database,
  userDataPath: string,
): { bootstrapped: boolean; reason?: string } {
  const file = path.join(userDataPath, 'clickup-bootstrap.json');
  if (!fs.existsSync(file)) return { bootstrapped: false, reason: 'no bootstrap file' };
  try {
    const text = fs.readFileSync(file, 'utf-8');
    const data = JSON.parse(text) as Partial<ClickUpConfigRow>;
    if (!data.api_token) return { bootstrapped: false, reason: 'bootstrap file missing api_token' };
    setClickUpConfig(db, {
      api_token: data.api_token,
      workspace_id: data.workspace_id ?? null,
      admin_requests_space_id: data.admin_requests_space_id ?? null,
      admin_requests_list_id: data.admin_requests_list_id ?? null,
      enabled: true,
    });
    try {
      fs.unlinkSync(file);
    } catch {
      // Failure to unlink is non-fatal — the config is already in the DB.
    }
    return { bootstrapped: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { bootstrapped: false, reason: `bootstrap failed: ${msg}` };
  }
}

// ── Per-project mapping ────────────────────────────────────────────────────

export interface ClickUpLinkRow {
  project_id: number;
  workspace_id: string;
  space_id: string;
  folder_id: string | null;
  list_id: string;
  list_url: string | null;
  first_synced_at: string;
  last_synced_at: string;
  last_synced_by_email: string | null;
  last_synced_by_name: string | null;
}

export function getClickUpLink(db: Database.Database, projectId: number): ClickUpLinkRow | null {
  const row = db
    .prepare('SELECT * FROM project_clickup_link WHERE project_id=?')
    .get(projectId) as ClickUpLinkRow | undefined;
  return row ?? null;
}

export function upsertClickUpLink(
  db: Database.Database,
  link: Omit<ClickUpLinkRow, 'first_synced_at' | 'last_synced_at'> & {
    first_synced_at?: string;
    last_synced_at?: string;
  },
): ClickUpLinkRow {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const existing = getClickUpLink(db, link.project_id);
  if (existing) {
    db.prepare(`
      UPDATE project_clickup_link
      SET workspace_id=?, space_id=?, folder_id=?, list_id=?, list_url=?,
          last_synced_at=?, last_synced_by_email=?, last_synced_by_name=?
      WHERE project_id=?
    `).run(
      link.workspace_id, link.space_id, link.folder_id, link.list_id, link.list_url,
      now, link.last_synced_by_email, link.last_synced_by_name,
      link.project_id,
    );
  } else {
    db.prepare(`
      INSERT INTO project_clickup_link(
        project_id, workspace_id, space_id, folder_id, list_id, list_url,
        first_synced_at, last_synced_at, last_synced_by_email, last_synced_by_name
      ) VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      link.project_id, link.workspace_id, link.space_id, link.folder_id,
      link.list_id, link.list_url,
      now, now, link.last_synced_by_email, link.last_synced_by_name,
    );
  }
  return getClickUpLink(db, link.project_id)!;
}

// ── Per-phase task mapping ─────────────────────────────────────────────────

export interface ClickUpPhaseLinkRow {
  id: number;
  project_id: number;
  phase_index: number;
  phase_name: string;
  task_id: string;
  task_url: string | null;
  payload_hash: string | null;
  subtask_ids_json: string | null;
  last_synced_at: string;
  last_synced_by_email: string | null;
  last_synced_by_name: string | null;
}

export function listClickUpPhaseLinks(
  db: Database.Database,
  projectId: number,
): ClickUpPhaseLinkRow[] {
  return db
    .prepare(`
      SELECT * FROM project_clickup_phase_link
      WHERE project_id=? ORDER BY phase_index
    `)
    .all(projectId) as ClickUpPhaseLinkRow[];
}

export function upsertClickUpPhaseLink(
  db: Database.Database,
  row: Omit<ClickUpPhaseLinkRow, 'id' | 'last_synced_at'> & { last_synced_at?: string },
): void {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  // (project_id, phase_index) is the unique tuple — re-syncing the same
  // phase updates instead of inserting.
  db.prepare(`
    INSERT INTO project_clickup_phase_link(
      project_id, phase_index, phase_name, task_id, task_url,
      payload_hash, subtask_ids_json,
      last_synced_at, last_synced_by_email, last_synced_by_name
    ) VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(project_id, phase_index) DO UPDATE SET
      phase_name=excluded.phase_name,
      task_id=excluded.task_id,
      task_url=excluded.task_url,
      payload_hash=excluded.payload_hash,
      subtask_ids_json=excluded.subtask_ids_json,
      last_synced_at=excluded.last_synced_at,
      last_synced_by_email=excluded.last_synced_by_email,
      last_synced_by_name=excluded.last_synced_by_name
  `).run(
    row.project_id, row.phase_index, row.phase_name, row.task_id, row.task_url,
    row.payload_hash, row.subtask_ids_json,
    now, row.last_synced_by_email, row.last_synced_by_name,
  );
}

export function clearClickUpPhaseLinks(db: Database.Database, projectId: number): void {
  db.prepare('DELETE FROM project_clickup_phase_link WHERE project_id=?').run(projectId);
}

/**
 * Hard unlink: drop both the project mapping AND every per-phase mapping for
 * a project. Used when the PM deleted the ClickUp project manually and wants
 * the next "Send to ClickUp" to start fresh. Does NOT touch ClickUp itself.
 */
export function deleteClickUpLink(db: Database.Database, projectId: number): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM project_clickup_phase_link WHERE project_id=?').run(projectId);
    db.prepare('DELETE FROM project_clickup_link WHERE project_id=?').run(projectId);
  });
  tx();
}
