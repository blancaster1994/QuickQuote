// Lookups CRUD — single read/write surface for the v2 reference-data tables:
// legal_entity, department, rate_table, project_type, markup_pct,
// expense_category, phase_def, task_def, template_phase, employee, rate_entry.
//
// Ported from PM Quoting App's electron/db/queries.ts (lookup-related
// functions only). The 4-tier `lookupRate` algorithm is the load-bearing
// piece — keep its priority order intact when refactoring.

import type Database from 'better-sqlite3';

// ── Simple name lists ──────────────────────────────────────────────────────
//
// All five tables share the same `(id, name UNIQUE)` shape, so a single
// generic helper covers all of them.

export const NAME_TABLES = [
  'legal_entity',
  'rate_table',
  'project_type',
  'expense_category',
  'department',
] as const;

export type NameTable = typeof NAME_TABLES[number];

export function listNames(db: Database.Database, table: NameTable): Array<{ id: number; name: string }> {
  return db
    .prepare(`SELECT id, name FROM ${table} ORDER BY name`)
    .all() as Array<{ id: number; name: string }>;
}

export function insertName(db: Database.Database, table: NameTable, name: string): number {
  return db.prepare(`INSERT INTO ${table}(name) VALUES (?)`).run(name).lastInsertRowid as number;
}

export function updateName(db: Database.Database, table: NameTable, id: number, name: string): void {
  db.prepare(`UPDATE ${table} SET name=? WHERE id=?`).run(name, id);
}

export function deleteName(db: Database.Database, table: NameTable, id: number): void {
  db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
}

// ── Markup percentages ─────────────────────────────────────────────────────

export function listMarkup(db: Database.Database): Array<{ id: number; value: number }> {
  return db
    .prepare('SELECT id, value FROM markup_pct ORDER BY value')
    .all() as Array<{ id: number; value: number }>;
}

export function insertMarkup(db: Database.Database, value: number): number {
  return db.prepare('INSERT INTO markup_pct(value) VALUES (?)').run(value).lastInsertRowid as number;
}

export function updateMarkup(db: Database.Database, id: number, value: number): void {
  db.prepare('UPDATE markup_pct SET value=? WHERE id=?').run(value, id);
}

export function deleteMarkup(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM markup_pct WHERE id=?').run(id);
}

// ── Phase definitions (department-scoped) ──────────────────────────────────

export interface PhaseDefRow {
  id: number;
  department: string;
  name: string;
  sort_order: number;
}

export function listPhases(db: Database.Database, department?: string): PhaseDefRow[] {
  if (department) {
    return db
      .prepare('SELECT id, department, name, sort_order FROM phase_def WHERE department=? ORDER BY sort_order, name')
      .all(department) as PhaseDefRow[];
  }
  return db
    .prepare('SELECT id, department, name, sort_order FROM phase_def ORDER BY department, sort_order, name')
    .all() as PhaseDefRow[];
}

export function upsertPhase(
  db: Database.Database,
  row: { id?: number; department: string; name: string; sort_order: number },
): number {
  if (row.id) {
    db.prepare('UPDATE phase_def SET department=?, name=?, sort_order=? WHERE id=?').run(
      row.department, row.name, row.sort_order, row.id,
    );
    return row.id;
  }
  return db
    .prepare('INSERT INTO phase_def(department, name, sort_order) VALUES (?,?,?)')
    .run(row.department, row.name, row.sort_order).lastInsertRowid as number;
}

export function deletePhase(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM phase_def WHERE id=?').run(id);
}

// ── Task definitions ((department, phase)-scoped) ──────────────────────────

export interface TaskDefRow {
  id: number;
  department: string;
  phase: string;
  name: string;
  sort_order: number;
}

export function listTasks(db: Database.Database, department?: string, phase?: string): TaskDefRow[] {
  if (department && phase) {
    return db
      .prepare('SELECT id, department, phase, name, sort_order FROM task_def WHERE department=? AND phase=? ORDER BY sort_order, name')
      .all(department, phase) as TaskDefRow[];
  }
  if (department) {
    return db
      .prepare('SELECT id, department, phase, name, sort_order FROM task_def WHERE department=? ORDER BY phase, sort_order, name')
      .all(department) as TaskDefRow[];
  }
  return db
    .prepare('SELECT id, department, phase, name, sort_order FROM task_def ORDER BY department, phase, sort_order, name')
    .all() as TaskDefRow[];
}

export function upsertTask(
  db: Database.Database,
  row: { id?: number; department: string; phase: string; name: string; sort_order: number },
): number {
  if (row.id) {
    db.prepare('UPDATE task_def SET department=?, phase=?, name=?, sort_order=? WHERE id=?').run(
      row.department, row.phase, row.name, row.sort_order, row.id,
    );
    return row.id;
  }
  return db
    .prepare('INSERT INTO task_def(department, phase, name, sort_order) VALUES (?,?,?,?)')
    .run(row.department, row.phase, row.name, row.sort_order).lastInsertRowid as number;
}

export function deleteTask(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM task_def WHERE id=?').run(id);
}

// ── Employees (extended for PM mode) ───────────────────────────────────────
//
// QuickQuote's v1 employee table had only (name, category, active). v2 adds
// resource_id, legal_entity, email, home_department, title, credentials, role.
// `EmployeeRow` is the full row — used by the lookups admin, resource picker,
// PM picker, and rate lookups.

export interface EmployeeRow {
  id?: number;
  resource_id: string | null;
  name: string;
  category: string | null;
  legal_entity: string | null;
  email: string | null;
  home_department: string | null;
  title?: string | null;
  credentials?: string | null;
  role?: string;
  active: number; // 0 | 1
}

const EMP_FIELDS = 'id, resource_id, name, category, legal_entity, email, home_department, title, credentials, role, active';

export function listEmployees(db: Database.Database, activeOnly = true): EmployeeRow[] {
  const where = activeOnly ? 'WHERE active=1' : '';
  return db.prepare(`SELECT ${EMP_FIELDS} FROM employee ${where} ORDER BY name`).all() as EmployeeRow[];
}

export function upsertEmployee(db: Database.Database, row: EmployeeRow): number {
  if (row.id) {
    db.prepare(
      'UPDATE employee SET resource_id=?, name=?, category=?, legal_entity=?, email=?, home_department=?, title=?, credentials=?, role=?, active=? WHERE id=?',
    ).run(
      row.resource_id, row.name, row.category, row.legal_entity, row.email,
      row.home_department, row.title ?? null, row.credentials ?? null,
      row.role ?? 'pm', row.active, row.id,
    );
    return row.id;
  }
  return db
    .prepare(
      'INSERT INTO employee(resource_id, name, category, legal_entity, email, home_department, title, credentials, role, active) VALUES (?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      row.resource_id, row.name, row.category, row.legal_entity, row.email,
      row.home_department, row.title ?? null, row.credentials ?? null,
      row.role ?? 'pm', row.active,
    ).lastInsertRowid as number;
}

export function deleteEmployee(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM employee WHERE id=?').run(id);
}

/**
 * Bulk replace preserves any existing title/credentials/role for matching
 * resource_ids — those come from a different source (proposal config in
 * QuickProp historically) and shouldn't be wiped by a category/email refresh.
 */
export function bulkReplaceEmployees(
  db: Database.Database,
  rows: Array<Omit<EmployeeRow, 'id' | 'active'>>,
): void {
  const tx = db.transaction(() => {
    const existing = db
      .prepare('SELECT resource_id, title, credentials, role FROM employee')
      .all() as Array<{ resource_id: string | null; title: string | null; credentials: string | null; role: string }>;
    const byId = new Map(existing.filter((e) => e.resource_id).map((e) => [e.resource_id!, e]));
    db.prepare('DELETE FROM employee').run();
    const ins = db.prepare(
      'INSERT INTO employee(resource_id, name, category, legal_entity, email, home_department, title, credentials, role, active) VALUES (?,?,?,?,?,?,?,?,?,1)',
    );
    rows.forEach((r) => {
      const prev = byId.get(r.resource_id ?? '');
      ins.run(
        r.resource_id, r.name, r.category, r.legal_entity,
        r.email ?? null, r.home_department ?? null,
        prev?.title ?? null, prev?.credentials ?? null, prev?.role ?? 'pm',
      );
    });
  });
  tx();
}

export function findEmployeeByEmail(db: Database.Database, email: string): EmployeeRow | undefined {
  return db
    .prepare(`SELECT ${EMP_FIELDS} FROM employee WHERE lower(email)=lower(?) LIMIT 1`)
    .get(email) as EmployeeRow | undefined;
}

/** Match the local part of an email (before the @) against employee.email. */
export function findEmployeeByEmailPrefix(db: Database.Database, prefix: string): EmployeeRow | undefined {
  return db
    .prepare(
      `SELECT ${EMP_FIELDS} FROM employee WHERE lower(substr(email, 1, instr(email,'@')-1))=lower(?) LIMIT 1`,
    )
    .get(prefix) as EmployeeRow | undefined;
}

// ── Rate entries (extended 4-tier lookup) ──────────────────────────────────
//
// Rate lookup priority (most specific → least specific):
//   1. (category, resource_id)   — employee override of a specific category
//   2. ('',       resource_id)   — per-employee flat rate
//   3. (category, NULL)          — standard category rate
//   4. ('',       NULL)          — flat rate for the whole rate_table
// Within a tier, the newest effective_date wins.

export interface RateRow {
  id?: number;
  legal_entity: string;
  rate_table: string;
  category: string;
  resource_id: string | null;
  price: number;
  effective_date: string | null;
  end_date: string | null;
}

export function listRates(
  db: Database.Database,
  filters: { legal_entity?: string; rate_table?: string } = {},
): RateRow[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filters.legal_entity) { where.push('legal_entity=?'); args.push(filters.legal_entity); }
  if (filters.rate_table)   { where.push('rate_table=?');   args.push(filters.rate_table); }
  const sql = `SELECT id, legal_entity, rate_table, category, resource_id, price, effective_date, end_date FROM rate_entry ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY legal_entity, rate_table, category, resource_id`;
  return db.prepare(sql).all(...args) as RateRow[];
}

export function listRateTablesForEntity(db: Database.Database, legalEntity: string): string[] {
  const rows = db
    .prepare('SELECT DISTINCT rate_table FROM rate_entry WHERE legal_entity=? ORDER BY rate_table')
    .all(legalEntity) as Array<{ rate_table: string }>;
  return rows.map((r) => r.rate_table);
}

export function lookupRate(
  db: Database.Database,
  legalEntity: string,
  rateTable: string,
  category: string,
  resourceId?: string | null,
): number | null {
  const cat = category ?? '';
  const rid = resourceId ?? null;
  const sql = `
    SELECT price, priority FROM (
      SELECT price, 1 AS priority, effective_date FROM rate_entry
        WHERE legal_entity=? AND rate_table=? AND category=? AND resource_id=?
      UNION ALL
      SELECT price, 2, effective_date FROM rate_entry
        WHERE legal_entity=? AND rate_table=? AND category='' AND resource_id=?
      UNION ALL
      SELECT price, 3, effective_date FROM rate_entry
        WHERE legal_entity=? AND rate_table=? AND category=? AND resource_id IS NULL
      UNION ALL
      SELECT price, 4, effective_date FROM rate_entry
        WHERE legal_entity=? AND rate_table=? AND category='' AND resource_id IS NULL
    )
    ORDER BY priority, effective_date DESC
    LIMIT 1`;
  const row = db.prepare(sql).get(
    legalEntity, rateTable, cat, rid ?? '',
    legalEntity, rateTable, rid ?? '',
    legalEntity, rateTable, cat,
    legalEntity, rateTable,
  ) as { price: number } | undefined;
  return row?.price ?? null;
}

export function listRateCategories(db: Database.Database, legalEntity?: string): string[] {
  if (legalEntity) {
    const rows = db
      .prepare("SELECT DISTINCT category FROM rate_entry WHERE legal_entity=? AND category<>'' ORDER BY category")
      .all(legalEntity) as Array<{ category: string }>;
    return rows.map((r) => r.category);
  }
  const rows = db
    .prepare("SELECT DISTINCT category FROM rate_entry WHERE category<>'' ORDER BY category")
    .all() as Array<{ category: string }>;
  return rows.map((r) => r.category);
}

export function upsertRate(db: Database.Database, row: RateRow): number {
  const rid = row.resource_id ?? null;
  if (row.id) {
    db.prepare(
      'UPDATE rate_entry SET legal_entity=?, rate_table=?, category=?, resource_id=?, price=?, effective_date=?, end_date=? WHERE id=?',
    ).run(
      row.legal_entity, row.rate_table, row.category ?? '', rid,
      row.price, row.effective_date, row.end_date, row.id,
    );
    return row.id;
  }
  return db
    .prepare(
      'INSERT INTO rate_entry(legal_entity, rate_table, category, resource_id, price, effective_date, end_date) VALUES (?,?,?,?,?,?,?)',
    )
    .run(
      row.legal_entity, row.rate_table, row.category ?? '', rid,
      row.price, row.effective_date, row.end_date,
    ).lastInsertRowid as number;
}

export function deleteRate(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM rate_entry WHERE id=?').run(id);
}

export function bulkReplaceRates(db: Database.Database, rows: Array<Omit<RateRow, 'id'>>): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM rate_entry').run();
    const ins = db.prepare(
      'INSERT INTO rate_entry(legal_entity, rate_table, category, resource_id, price, effective_date, end_date) VALUES (?,?,?,?,?,?,?)',
    );
    rows.forEach((r) =>
      ins.run(
        (r.legal_entity || '').toUpperCase(), r.rate_table, r.category ?? '',
        r.resource_id ?? null, r.price, r.effective_date, r.end_date,
      ),
    );
  });
  tx();
}

// ── Phase templates ────────────────────────────────────────────────────────
//
// A "template" is a named bundle of phase rows scoped to (legal_entity,
// department). The Initialize Project modal picks templates by context.

export interface TemplatePhaseRow {
  id: number;
  legal_entity: string;
  department: string;
  template: string;
  phase_name: string;
  rate_table: string;
  sort_order: number;
}

export function listTemplatePhases(
  db: Database.Database,
  filters: { legal_entity?: string; department?: string; template?: string } = {},
): TemplatePhaseRow[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filters.legal_entity) { where.push('legal_entity=?'); args.push(filters.legal_entity); }
  if (filters.department)   { where.push('department=?');   args.push(filters.department); }
  if (filters.template)     { where.push('template=?');     args.push(filters.template); }
  const sql = `SELECT id, legal_entity, department, template, phase_name, rate_table, sort_order FROM template_phase ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY legal_entity, department, template, sort_order`;
  return db.prepare(sql).all(...args) as TemplatePhaseRow[];
}

/** Distinct template names available for a (legal_entity, department) pair. */
export function listTemplatesForContext(
  db: Database.Database,
  legalEntity: string,
  department: string,
): string[] {
  const rows = db
    .prepare(
      'SELECT DISTINCT template FROM template_phase WHERE legal_entity=? AND department=? ORDER BY template',
    )
    .all(legalEntity, department) as Array<{ template: string }>;
  return rows.map((r) => r.template);
}

export function upsertTemplatePhase(
  db: Database.Database,
  row: Omit<TemplatePhaseRow, 'id'> & { id?: number },
): number {
  if (row.id) {
    db.prepare(
      'UPDATE template_phase SET legal_entity=?, department=?, template=?, phase_name=?, rate_table=?, sort_order=? WHERE id=?',
    ).run(
      row.legal_entity, row.department, row.template, row.phase_name,
      row.rate_table, row.sort_order, row.id,
    );
    return row.id;
  }
  return db
    .prepare(
      'INSERT INTO template_phase(legal_entity, department, template, phase_name, rate_table, sort_order) VALUES (?,?,?,?,?,?)',
    )
    .run(
      row.legal_entity, row.department, row.template, row.phase_name,
      row.rate_table, row.sort_order,
    ).lastInsertRowid as number;
}

export function deleteTemplatePhase(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM template_phase WHERE id=?').run(id);
}

export function bulkReplaceTemplatePhases(
  db: Database.Database,
  rows: Array<Omit<TemplatePhaseRow, 'id'>>,
): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM template_phase').run();
    const ins = db.prepare(
      'INSERT INTO template_phase(legal_entity, department, template, phase_name, rate_table, sort_order) VALUES (?,?,?,?,?,?)',
    );
    rows.forEach((r) =>
      ins.run(
        r.legal_entity, r.department, r.template, r.phase_name,
        r.rate_table, r.sort_order,
      ),
    );
  });
  tx();
}
