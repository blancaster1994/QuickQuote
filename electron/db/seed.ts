// First-launch lookup seed. Reads seed/config.json (built from QuickProp's
// config files via scripts/build-seed.py) and bulk-inserts into the lookup
// tables. Idempotent: gated on `employee` being empty, so rerunning is safe.
//
// Path resolution mirrors PM Quoting App's pattern: dev runs from repo root,
// packaged builds find seed/ under process.resourcesPath via electron-builder's
// extraResources.

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
