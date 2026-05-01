// SQLite schema + versioned migration runner for QuickQuote.
//
// Schema design rationale: proposal bodies live in `proposal_version.payload_json`
// as a verbatim copy of QuickProp v3's EditorState shape. Header columns on
// `proposal` are denormalized for fast list/dashboard queries. See the plan at
// ~/.claude/plans/this-is-a-software-zany-umbrella.md for the full reasoning.
//
// Migrations are versioned via the `schema_meta.schema_version` row. To add a
// migration, append to MIGRATIONS — never edit a past entry, since the runner
// only applies versions strictly greater than the recorded current.

import type Database from 'better-sqlite3';

const SCHEMA_V1 = `
-- Header table: every column is a list/dashboard query target. Body content
-- lives in proposal_version.payload_json.
CREATE TABLE IF NOT EXISTS proposal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  rate_table TEXT NOT NULL DEFAULT 'consulting',
  owner_email TEXT,
  owner_name TEXT,
  created_by_email TEXT,
  created_by_name TEXT,
  last_modified_by_email TEXT,
  last_modified_by_name TEXT,
  last_modified_at TEXT,
  sent_date TEXT,
  won_date TEXT,
  lost_date TEXT,
  lost_reason TEXT,
  lost_notes TEXT,
  follow_up_at TEXT,
  icore_project_id TEXT,
  client_name TEXT,
  client_contact TEXT,
  client_address TEXT,
  client_city_state_zip TEXT,
  project_address TEXT,
  project_city_state_zip TEXT,
  proposal_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  current_version_id INTEGER
);

-- Immutable version snapshots. payload_json holds the full v3 EditorState
-- shape (sections[], labor[], expenses[], header fields). 'draft' versions
-- remain editable; 'final' are frozen until cloned to draft.
CREATE TABLE IF NOT EXISTS proposal_version (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id INTEGER NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
  version_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  status_at_snapshot TEXT,
  notes TEXT,
  payload_json TEXT NOT NULL,
  payload_schema_version INTEGER NOT NULL DEFAULT 3,
  created_by_email TEXT,
  created_by_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Append-only audit log: every status transition, note, generation, reassignment.
CREATE TABLE IF NOT EXISTS proposal_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id INTEGER NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  user_email TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  meta_json TEXT
);

-- Generated DOCX/PDF metadata. (proposal_id, format, content_hash) drives
-- the reuse-detection short-circuit in proposal/generate.ts (Step 7).
CREATE TABLE IF NOT EXISTS proposal_file (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id INTEGER NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
  version_id INTEGER REFERENCES proposal_version(id) ON DELETE SET NULL,
  format TEXT NOT NULL,
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  generated_by_email TEXT
);

-- Per-engineer client templates. Replaces QuickProp's client_templates/<email>.json.
CREATE TABLE IF NOT EXISTS client_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_email TEXT NOT NULL,
  name TEXT NOT NULL,
  client TEXT,
  contact TEXT,
  client_address TEXT,
  client_city_state_zip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner_email, name)
);

-- Per-engineer project (scope) templates. sections_json holds [{title, scope}, ...]
-- verbatim. Replaces QuickProp's project_templates/<email>.json.
CREATE TABLE IF NOT EXISTS project_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_email TEXT NOT NULL,
  name TEXT NOT NULL,
  sections_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner_email, name)
);

-- Custom fee presets (was the fee_templates/ folder).
CREATE TABLE IF NOT EXISTS fee_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_email TEXT,
  name TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner_email, name)
);

-- Lookups previously hardcoded in QuickProp/quickprop/config.py + config/*.json.
CREATE TABLE IF NOT EXISTS employee (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS category_mapping (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_category TEXT NOT NULL UNIQUE,
  rate_key TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_entry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rate_table TEXT NOT NULL,
  rate_key TEXT NOT NULL,
  price REAL NOT NULL,
  effective_date TEXT,
  end_date TEXT
);

CREATE TABLE IF NOT EXISTS expense_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL UNIQUE,
  qty_unit TEXT NOT NULL,
  default_rate REAL NOT NULL,
  rate_unit TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Allowed users + role. Replaces QuickProp's config/allowed_users.json.
CREATE TABLE IF NOT EXISTS allowed_user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  credentials TEXT,
  title TEXT,
  signer_name TEXT,
  role TEXT NOT NULL DEFAULT 'pm',
  active INTEGER NOT NULL DEFAULT 1
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_proposal_status    ON proposal(status);
CREATE INDEX IF NOT EXISTS idx_proposal_owner     ON proposal(owner_email);
CREATE INDEX IF NOT EXISTS idx_proposal_updated   ON proposal(updated_at);
CREATE INDEX IF NOT EXISTS idx_proposal_followup  ON proposal(follow_up_at);
CREATE INDEX IF NOT EXISTS idx_version_proposal   ON proposal_version(proposal_id);
CREATE INDEX IF NOT EXISTS idx_activity_proposal  ON proposal_activity(proposal_id);
CREATE INDEX IF NOT EXISTS idx_activity_ts        ON proposal_activity(timestamp);
CREATE INDEX IF NOT EXISTS idx_file_hash          ON proposal_file(format, content_hash);
CREATE INDEX IF NOT EXISTS idx_client_tpl_owner   ON client_template(owner_email);
CREATE INDEX IF NOT EXISTS idx_project_tpl_owner  ON project_template(owner_email);
CREATE INDEX IF NOT EXISTS idx_rate_lookup        ON rate_entry(rate_table, rate_key, effective_date);
CREATE INDEX IF NOT EXISTS idx_employee_active    ON employee(active);
`;

interface Migration {
  version: number;
  up: (db: Database.Database) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(SCHEMA_V1);
    },
  },
  // Append future migrations here. Never edit a past entry — the runner
  // only applies versions strictly greater than the current recorded one.
];

/**
 * Open a freshly opened DB to its target schema version. Creates schema_meta
 * if missing, then applies pending migrations inside a transaction each.
 */
export function migrate(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // The schema_meta singleton table holds the current schema version. Created
  // outside the versioned migration list so the runner has somewhere to read
  // version=0 from on a fresh install.
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const row = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'")
    .get() as { value: string } | undefined;
  const current = row ? parseInt(row.value, 10) : 0;

  for (const m of MIGRATIONS) {
    if (m.version > current) {
      const tx = db.transaction(() => {
        m.up(db);
        db.prepare(
          "REPLACE INTO schema_meta(key, value) VALUES ('schema_version', ?)",
        ).run(String(m.version));
      });
      tx();
      console.log(`schema: migrated to v${m.version}`);
    }
  }
}
