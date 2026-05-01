// First-launch lookup seed. Reads seed/config.json (built from QuickProp's
// config files via scripts/build-seed.py) and bulk-inserts into the lookup
// tables. Idempotent: gated on `employee` being empty, so rerunning is safe.
//
// Path resolution mirrors PM Quoting App's pattern: dev runs from repo root,
// packaged builds find seed/ under process.resourcesPath via electron-builder's
// extraResources.
//
// Stage 1 of the PM-mode merge added two more seed entry points:
//   * seedLookupsIfEmpty       — populates the v2 lookup tables
//                                (legal_entity, department, rate_table, etc.)
//                                from seed/lookups.json. Gated on `department`
//                                being empty.
//   * seedTemplatesIfMissing   — populates template_phase from seed/templates.json.
//                                Runs every startup; only inserts when empty.
//
// In normal use the importer (electron/db/importer.ts) pulls the same data
// from PM Quoting App's DB on first run. The seed JSON files act as the
// fallback when PM Quoting App isn't installed.

import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

interface AllowedUserSeed {
  email: string;
  name: string;
  credentials?: string;
  title?: string;
  signer_name?: string;
  role: string;
}

interface EmployeeSeed {
  name: string;
  category: string;
}

interface ExpenseLineSeed {
  name: string;
  qty_unit: string;
  default_rate: number;
  rate_unit: string;
}

interface SeedConfig {
  allowed_users: AllowedUserSeed[];
  employees: EmployeeSeed[];
  category_mapping: Record<string, string>;
  consulting_rates: Record<string, number>;
  structural_rates: Record<string, number>;
  expense_lines: ExpenseLineSeed[];
}

export function resolveSeedPath(appRoot: string): string {
  const candidates = [
    path.join(appRoot, 'seed', 'config.json'),
    path.join(appRoot, '..', 'seed', 'config.json'),
    path.join(process.resourcesPath || '', 'seed', 'config.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

/**
 * Insert lookup data if the DB hasn't been seeded yet (gate: employee table
 * count). Returns true if seeding ran, false if the DB was already populated
 * or the seed file is missing.
 */
export function seedIfEmpty(db: Database.Database, seedJsonPath: string): boolean {
  const row = db.prepare('SELECT COUNT(*) AS n FROM employee').get() as { n: number };
  if (row.n > 0) return false;

  if (!fs.existsSync(seedJsonPath)) {
    console.warn('seed: config not found at', seedJsonPath, '— starting with empty lookups.');
    return false;
  }

  const data: SeedConfig = JSON.parse(fs.readFileSync(seedJsonPath, 'utf-8'));

  const tx = db.transaction(() => {
    // Allowed users. signer_name in QuickProp's JSON is implicit (falls back
    // to name); we leave the column null so the lookup falls back the same way.
    const insUser = db.prepare(`
      INSERT OR IGNORE INTO allowed_user(email, name, credentials, title, signer_name, role, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    for (const u of data.allowed_users) {
      insUser.run(
        u.email,
        u.name,
        u.credentials || null,
        u.title || null,
        u.signer_name || null,
        u.role || 'pm',
      );
    }

    // Employees.
    const insEmp = db.prepare(`
      INSERT OR IGNORE INTO employee(name, category, active) VALUES (?, ?, 1)
    `);
    for (const e of data.employees) {
      insEmp.run(e.name, e.category);
    }

    // Category → rate-key mapping.
    const insMap = db.prepare(`
      INSERT OR IGNORE INTO category_mapping(employee_category, rate_key) VALUES (?, ?)
    `);
    for (const [cat, key] of Object.entries(data.category_mapping)) {
      insMap.run(cat, key);
    }

    // Rates: one row per (rate_table, rate_key) pair.
    const insRate = db.prepare(`
      INSERT INTO rate_entry(rate_table, rate_key, price, effective_date, end_date)
      VALUES (?, ?, ?, NULL, NULL)
    `);
    for (const [key, price] of Object.entries(data.consulting_rates)) {
      insRate.run('consulting', key, price);
    }
    for (const [key, price] of Object.entries(data.structural_rates)) {
      insRate.run('structural', key, price);
    }

    // Expense line presets.
    const insExp = db.prepare(`
      INSERT OR IGNORE INTO expense_line(display_name, qty_unit, default_rate, rate_unit, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    data.expense_lines.forEach((e, i) => {
      insExp.run(e.name, e.qty_unit, e.default_rate, e.rate_unit, i);
    });
  });

  tx();
  return true;
}

// ── PM-mode lookup seeding (Stage 1) ───────────────────────────────────────

interface LookupsSeed {
  legal_entities: string[];
  rate_tables: string[];
  project_types: string[];
  markup: number[];
  expense_categories: string[];
  departments: string[];
  phases_by_department: Record<string, string[]>;
  /** Keyed `"<department>||<phase>"`, value = task names. */
  tasks_by_dept_phase: Record<string, string[]>;
  employees?: Array<{
    resource_id: string | null;
    legal_entity: string | null;
    category: string | null;
    name: string;
    email?: string | null;
    home_department?: string | null;
  }>;
  rates?: Array<{
    legal_entity: string | null;
    category: string | null;
    rate_table: string | null;
    price: number | null;
    effective_date: string | null;
    end_date: string | null;
  }>;
}

interface TemplateRow {
  legal_entity: string;
  department: string;
  template: string;
  phase_name: string;
  rate_table: string;
  sort_order: number;
}

function resolveCandidate(appRoot: string, file: string): string {
  const candidates = [
    path.join(appRoot, 'seed', file),
    path.join(appRoot, '..', 'seed', file),
    path.join(process.resourcesPath || '', 'seed', file),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

export function resolveLookupsSeedPath(appRoot: string): string {
  return resolveCandidate(appRoot, 'lookups.json');
}

export function resolveTemplatesSeedPath(appRoot: string): string {
  return resolveCandidate(appRoot, 'templates.json');
}

export function seedLookupsIfEmpty(db: Database.Database, seedJsonPath: string): boolean {
  const row = db.prepare('SELECT COUNT(*) AS n FROM department').get() as { n: number };
  if (row.n > 0) return false;

  if (!fs.existsSync(seedJsonPath)) {
    console.warn('seed: lookups.json not found at', seedJsonPath, '— starting with empty PM lookups.');
    return false;
  }
  const data: LookupsSeed = JSON.parse(fs.readFileSync(seedJsonPath, 'utf-8'));

  const tx = db.transaction(() => {
    const insLE = db.prepare('INSERT OR IGNORE INTO legal_entity(name) VALUES (?)');
    (data.legal_entities || []).forEach((v) => insLE.run(v));

    const insRT = db.prepare('INSERT OR IGNORE INTO rate_table(name) VALUES (?)');
    (data.rate_tables || []).forEach((v) => insRT.run(v));

    const insPT = db.prepare('INSERT OR IGNORE INTO project_type(name) VALUES (?)');
    (data.project_types || []).forEach((v) => insPT.run(v));

    const insMk = db.prepare('INSERT OR IGNORE INTO markup_pct(value) VALUES (?)');
    (data.markup || []).forEach((v) => insMk.run(v));

    const insEC = db.prepare('INSERT OR IGNORE INTO expense_category(name) VALUES (?)');
    (data.expense_categories || []).forEach((v) => insEC.run(v));

    const insDept = db.prepare('INSERT OR IGNORE INTO department(name) VALUES (?)');
    (data.departments || []).forEach((v) => insDept.run(v));

    const insPhase = db.prepare(
      'INSERT OR IGNORE INTO phase_def(department, name, sort_order) VALUES (?,?,?)',
    );
    Object.entries(data.phases_by_department || {}).forEach(([dept, phases]) => {
      phases.forEach((p, i) => insPhase.run(dept, p, i));
    });

    const insTask = db.prepare(
      'INSERT OR IGNORE INTO task_def(department, phase, name, sort_order) VALUES (?,?,?,?)',
    );
    Object.entries(data.tasks_by_dept_phase || {}).forEach(([key, tasks]) => {
      const [dept, phase] = key.split('||');
      tasks.forEach((t, i) => insTask.run(dept, phase, t, i));
    });

    // Only seed employees if the table is empty (preserve QuickProp imports).
    const empCount = db.prepare('SELECT COUNT(*) AS n FROM employee').get() as { n: number };
    if (empCount.n === 0 && data.employees) {
      const insEmp = db.prepare(
        'INSERT INTO employee(resource_id, name, category, legal_entity, email, home_department, active) VALUES (?,?,?,?,?,?,1)',
      );
      data.employees.forEach((e) => {
        if (!e.name) return;
        const le = e.legal_entity ? e.legal_entity.toUpperCase() : null;
        insEmp.run(
          e.resource_id ?? null,
          e.name,
          e.category ?? null,
          le,
          e.email ?? null,
          e.home_department ?? null,
        );
      });
    }

    if (data.rates) {
      const insRate = db.prepare(
        'INSERT INTO rate_entry(legal_entity, rate_table, category, price, effective_date, end_date) VALUES (?,?,?,?,?,?)',
      );
      data.rates.forEach((r) => {
        if (!r.rate_table || !r.category || r.price == null) return;
        const le = (r.legal_entity || '').toUpperCase();
        const eff = r.effective_date ? r.effective_date.slice(0, 10) : null;
        const end = r.end_date ? r.end_date.slice(0, 10) : null;
        insRate.run(le, r.rate_table, r.category, r.price, eff, end);
      });
    }
  });
  tx();
  return true;
}

/**
 * Seed template_phase rows. Idempotent: only inserts when the table is empty.
 * Re-run on every startup so a fresh seed file takes effect without forcing
 * users to wipe their DB.
 */
export function seedTemplatesIfMissing(db: Database.Database, appRoot: string): number {
  const p = resolveTemplatesSeedPath(appRoot);
  if (!fs.existsSync(p)) return 0;
  const existing = db.prepare('SELECT COUNT(*) AS n FROM template_phase').get() as { n: number };
  if (existing.n > 0) return 0;
  const rows: TemplateRow[] = JSON.parse(fs.readFileSync(p, 'utf-8'));
  const ins = db.prepare(
    'INSERT OR IGNORE INTO template_phase(legal_entity, department, template, phase_name, rate_table, sort_order) VALUES (?,?,?,?,?,?)',
  );
  const tx = db.transaction(() => {
    for (const r of rows) {
      ins.run(r.legal_entity, r.department, r.template, r.phase_name, r.rate_table, r.sort_order);
    }
  });
  tx();
  return rows.length;
}
