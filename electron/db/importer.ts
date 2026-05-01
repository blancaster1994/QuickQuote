// One-time importer from QuickProp v3.x to QuickQuote.
//
// Reads QuickProp's on-disk data (projects/*.json, client_templates/<email>/*.json,
// project_templates/<email>/*.json) and the per-user identity file at
// %APPDATA%\QuickProp\identity.json, then inserts everything into QuickQuote's
// SQLite DB and copies the identity file to %APPDATA%\QuickQuote\identity.json.
//
// Idempotent: gated on `schema_meta.imported_from_quickprop`. Re-running is a
// no-op once the marker row exists. To force a re-run (e.g. after a partial
// import), delete that row.
//
// Skipped for now (Step 11 doesn't require it):
//   - Linking existing Generated Proposals/<Project>/*.docx|pdf into
//     proposal_file rows. The reuse-detection in proposal/generate.ts would
//     skip the first regenerate; instead, the user gets one fresh generation
//     per imported proposal. Acceptable trade-off; loose end is documented in
//     the plan.

import { app } from 'electron';
import BetterSqlite3 from 'better-sqlite3';
import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import * as Q from './queries';

export interface ImportResult {
  ok: boolean;
  alreadyImported: boolean;
  proposalsImported: number;
  clientTemplatesImported: number;
  projectTemplatesImported: number;
  identityCopied: boolean;
  skipped: string[];
  sourceDir: string;
}

export function defaultQuickPropSourceDir(): string {
  // The conventional location on Bryce's machine. Other users can override
  // via the IPC arg.
  return path.join('C:', 'Users', 'blancaster', 'dev', 'QuickProp');
}

function isImported(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'imported_from_quickprop'")
    .get() as { value: string } | undefined;
  return !!row;
}

function markImported(db: Database.Database): void {
  db.prepare(
    "INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('imported_from_quickprop', ?)",
  ).run(new Date().toISOString());
}

/**
 * v1/v2 → v3 forward migration. QuickProp's projects.py already does this
 * on read; QuickQuote's importer applies the same migration so old project
 * files (rare on Bryce's machine but possible) come through cleanly.
 */
function legacyToV3(data: any): any {
  if (data?.proposal && typeof data.proposal === 'object') return data.proposal;
  // Older shape: {values: {...}, scope_sections: [...]}
  const values = data?.values || {};
  const sections = (data?.scope_sections || [{
    title: values.scope_title || '',
    scope: values.scope_of_work || '',
    fee: values.fee || 0,
  }]).map((s: any, i: number) => ({
    id: `s${i + 1}`,
    title: s?.title || '',
    scope: s?.scope || '',
    billing: s?.billing_type || 'fixed',
    fee: parseFloat(String(s?.fee || 0).replace(/[^0-9.]/g, '')) || 0,
    notes: s?.notes || '',
    labor: [],
    expenses: [],
  }));
  return {
    date:               values.date || '',
    name:               values.project_name || data?.name || '',
    address:            values.project_address || '',
    cityStateZip:       values.project_city_state_zip || '',
    client:             values.client_name || '',
    contact:            values.client_contact || '',
    clientAddress:      values.client_address || '',
    clientCityStateZip: values.client_city_state_zip || values.client_city || '',
    rateTable:          values.use_structural ? 'structural' : 'consulting',
    sections,
  };
}

function importIdentity(): boolean {
  const appData = process.env.APPDATA;
  if (!appData) return false;
  const src = path.join(appData, 'QuickProp', 'identity.json');
  const dstDir = app.getPath('userData');
  const dst = path.join(dstDir, 'identity.json');

  if (!fs.existsSync(src)) return false;
  if (fs.existsSync(dst)) return false; // never clobber an identity already set in QuickQuote

  fs.mkdirSync(dstDir, { recursive: true });
  fs.copyFileSync(src, dst);
  return true;
}

function importProposals(db: Database.Database, sourceDir: string, skipped: string[]): number {
  const projectsDir = path.join(sourceDir, 'projects');
  if (!fs.existsSync(projectsDir)) return 0;
  let count = 0;
  for (const file of fs.readdirSync(projectsDir)) {
    if (!file.endsWith('.json')) continue;
    const fullPath = path.join(projectsDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      const proposal = legacyToV3(data);
      if (!proposal?.name?.trim()) {
        skipped.push(`${file}: empty proposal.name`);
        continue;
      }
      Q.saveProposal(db, proposal, null);
      count++;
    } catch (e: any) {
      skipped.push(`${file}: ${e?.message || String(e)}`);
    }
  }
  return count;
}

function importTemplatesByOwner(
  db: Database.Database,
  baseDir: string,
  saveFn: (db: Database.Database, ownerEmail: string, name: string, payload: any) => unknown,
  skipped: string[],
  payloadFromJson: (data: any) => any,
): number {
  if (!fs.existsSync(baseDir)) return 0;
  let count = 0;
  for (const ownerEntry of fs.readdirSync(baseDir)) {
    const ownerDir = path.join(baseDir, ownerEntry);
    let stat: fs.Stats;
    try { stat = fs.statSync(ownerDir); } catch { continue; }
    if (!stat.isDirectory()) continue;

    // QuickProp's safe_name on emails leaves @ and . untouched (only \ / * ? : " < > | get
    // replaced with _). So in practice the folder name IS the engineer's email.
    const ownerEmail = ownerEntry;

    for (const file of fs.readdirSync(ownerDir)) {
      if (!file.endsWith('.json')) continue;
      const fullPath = path.join(ownerDir, file);
      const name = file.replace(/\.json$/, '');
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        const payload = payloadFromJson(data);
        saveFn(db, ownerEmail, name, payload);
        count++;
      } catch (e: any) {
        skipped.push(`${ownerEmail}/${file}: ${e?.message || String(e)}`);
      }
    }
  }
  return count;
}

export function importFromQuickProp(db: Database.Database, sourceDirArg?: string): ImportResult {
  const sourceDir = sourceDirArg || defaultQuickPropSourceDir();
  const result: ImportResult = {
    ok: true, alreadyImported: false,
    proposalsImported: 0,
    clientTemplatesImported: 0,
    projectTemplatesImported: 0,
    identityCopied: false,
    skipped: [],
    sourceDir,
  };

  if (isImported(db)) {
    result.alreadyImported = true;
    return result;
  }

  if (!fs.existsSync(sourceDir)) {
    result.ok = false;
    result.skipped.push(`Source directory not found: ${sourceDir}`);
    return result;
  }

  result.identityCopied = importIdentity();

  // Wrap the DB writes in a transaction so a mid-import crash doesn't leave a
  // half-imported state. The marker row goes inside the same transaction so a
  // partial write rolls back cleanly.
  const tx = db.transaction(() => {
    result.proposalsImported = importProposals(db, sourceDir, result.skipped);

    result.clientTemplatesImported = importTemplatesByOwner(
      db,
      path.join(sourceDir, 'client_templates'),
      (database, owner, name, payload) => Q.saveClientTemplate(database, owner, name, payload),
      result.skipped,
      (data) => ({
        client:             data?.client || '',
        contact:            data?.contact || '',
        clientAddress:      data?.clientAddress || '',
        clientCityStateZip: data?.clientCityStateZip || '',
      }),
    );

    result.projectTemplatesImported = importTemplatesByOwner(
      db,
      path.join(sourceDir, 'project_templates'),
      (database, owner, name, payload) => Q.saveProjectTemplate(database, owner, name, payload),
      result.skipped,
      (data) => Array.isArray(data?.sections) ? data.sections : [],
    );

    markImported(db);
  });

  try {
    tx();
  } catch (e: any) {
    result.ok = false;
    result.skipped.push(`Transaction failed: ${e?.message || String(e)}`);
  }

  return result;
}

// ── PM Quoting App importer (Stage 1) ──────────────────────────────────────
//
// One-shot pull of the v2 lookup data + employees + rates + phase templates
// from PM Quoting App's SQLite DB. Idempotent: gated on
// `schema_meta.imported_from_pmquoting`. Re-running is a no-op once the
// marker row exists. To force a re-run, delete the row.
//
// We open PM Quoting App's DB READ-ONLY so we never mutate the source. If
// PM Quoting App is currently running and the file is locked, the pull will
// fail with a clean error; the user is asked to close PM Quoting App first.

export interface PMImportResult {
  ok: boolean;
  alreadyImported: boolean;
  sourceDb: string;
  legalEntities: number;
  departments: number;
  rateTables: number;
  projectTypes: number;
  markupValues: number;
  expenseCategories: number;
  phaseDefs: number;
  taskDefs: number;
  templatePhases: number;
  employees: number;
  rates: number;
  skipped: string[];
}

/** Probe order for PM Quoting App's DB file. */
function defaultPMQuotingDbPath(): string {
  // Packaged app puts userData at %APPDATA%\PMQuotingApp\. Dev mode may use
  // %APPDATA%\Electron\. We try both, then fall back to the conventional
  // dev tree.
  const appData = process.env.APPDATA;
  const candidates: string[] = [];
  if (appData) {
    candidates.push(path.join(appData, 'PMQuotingApp', 'pm-quoting.db'));
    candidates.push(path.join(appData, 'PM Quoting App', 'pm-quoting.db'));
    candidates.push(path.join(appData, 'Electron', 'pm-quoting.db'));
  }
  candidates.push(
    path.join('C:', 'Users', 'blancaster', 'dev', 'PM Quoting App', 'PM-Quoting-app', 'PM-Quoting-app', 'pm-quoting.db'),
  );
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function isPMImported(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'imported_from_pmquoting'")
    .get() as { value: string } | undefined;
  return !!row;
}

function markPMImported(db: Database.Database): void {
  db.prepare(
    "INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('imported_from_pmquoting', ?)",
  ).run(new Date().toISOString());
}

interface NameRow { name: string }
interface MarkupRow { value: number }

interface PMEmployeeRow {
  resource_id: string | null;
  name: string;
  category: string | null;
  legal_entity: string | null;
  email: string | null;
  home_department: string | null;
  title: string | null;
  credentials: string | null;
  role: string;
  active: number;
}

interface PMRateRow {
  legal_entity: string;
  rate_table: string;
  category: string;
  resource_id: string | null;
  price: number;
  effective_date: string | null;
  end_date: string | null;
}

interface PMPhaseDefRow { department: string; name: string; sort_order: number }
interface PMTaskDefRow { department: string; phase: string; name: string; sort_order: number }
interface PMTemplatePhaseRow {
  legal_entity: string;
  department: string;
  template: string;
  phase_name: string;
  rate_table: string;
  sort_order: number;
}

export function importFromPMQuoting(
  db: Database.Database,
  sourceDbArg?: string,
): PMImportResult {
  const sourceDb = sourceDbArg || defaultPMQuotingDbPath();
  const result: PMImportResult = {
    ok: true,
    alreadyImported: false,
    sourceDb,
    legalEntities: 0,
    departments: 0,
    rateTables: 0,
    projectTypes: 0,
    markupValues: 0,
    expenseCategories: 0,
    phaseDefs: 0,
    taskDefs: 0,
    templatePhases: 0,
    employees: 0,
    rates: 0,
    skipped: [],
  };

  if (isPMImported(db)) {
    result.alreadyImported = true;
    return result;
  }

  if (!fs.existsSync(sourceDb)) {
    result.ok = false;
    result.skipped.push(`PM Quoting App DB not found at: ${sourceDb}`);
    return result;
  }

  let src: Database.Database;
  try {
    src = new BetterSqlite3(sourceDb, { readonly: true, fileMustExist: true });
  } catch (e: any) {
    result.ok = false;
    const msg = e?.message || String(e);
    if (/locked|busy/i.test(msg)) {
      result.skipped.push(
        `PM Quoting App DB is locked. Close the PM Quoting App and try again. (${msg})`,
      );
    } else {
      result.skipped.push(`Failed to open source DB: ${msg}`);
    }
    return result;
  }

  try {
    const tx = db.transaction(() => {
      // Simple name lists.
      const nameLists: Array<[string, string]> = [
        ['legal_entity', 'legalEntities'],
        ['department', 'departments'],
        ['rate_table', 'rateTables'],
        ['project_type', 'projectTypes'],
        ['expense_category', 'expenseCategories'],
      ];
      for (const [table, counterKey] of nameLists) {
        const rows = src
          .prepare(`SELECT name FROM ${table} ORDER BY name`)
          .all() as NameRow[];
        const ins = db.prepare(`INSERT OR IGNORE INTO ${table}(name) VALUES (?)`);
        rows.forEach((r) => {
          if (r.name) ins.run(r.name);
        });
        // Type-safe assignment via the result key map.
        (result as unknown as Record<string, number>)[counterKey] = rows.length;
      }

      // Markup values.
      const markups = src
        .prepare('SELECT value FROM markup_pct ORDER BY value')
        .all() as MarkupRow[];
      const insMk = db.prepare('INSERT OR IGNORE INTO markup_pct(value) VALUES (?)');
      markups.forEach((m) => insMk.run(m.value));
      result.markupValues = markups.length;

      // Phase + task defs.
      const phaseDefs = src
        .prepare('SELECT department, name, sort_order FROM phase_def ORDER BY department, sort_order')
        .all() as PMPhaseDefRow[];
      const insPhase = db.prepare(
        'INSERT OR IGNORE INTO phase_def(department, name, sort_order) VALUES (?,?,?)',
      );
      phaseDefs.forEach((p) => insPhase.run(p.department, p.name, p.sort_order));
      result.phaseDefs = phaseDefs.length;

      const taskDefs = src
        .prepare(
          'SELECT department, phase, name, sort_order FROM task_def ORDER BY department, phase, sort_order',
        )
        .all() as PMTaskDefRow[];
      const insTask = db.prepare(
        'INSERT OR IGNORE INTO task_def(department, phase, name, sort_order) VALUES (?,?,?,?)',
      );
      taskDefs.forEach((t) => insTask.run(t.department, t.phase, t.name, t.sort_order));
      result.taskDefs = taskDefs.length;

      // Template phases.
      const tplRows = src
        .prepare(
          'SELECT legal_entity, department, template, phase_name, rate_table, sort_order FROM template_phase ORDER BY legal_entity, department, template, sort_order',
        )
        .all() as PMTemplatePhaseRow[];
      const insTpl = db.prepare(
        'INSERT OR IGNORE INTO template_phase(legal_entity, department, template, phase_name, rate_table, sort_order) VALUES (?,?,?,?,?,?)',
      );
      tplRows.forEach((r) =>
        insTpl.run(r.legal_entity, r.department, r.template, r.phase_name, r.rate_table, r.sort_order),
      );
      result.templatePhases = tplRows.length;

      // Employees: reconcile by email when possible. Otherwise insert.
      const empRows = src
        .prepare(`
          SELECT resource_id, name, category, legal_entity, email, home_department,
                 title, credentials, role, active
          FROM employee
          ORDER BY name
        `)
        .all() as PMEmployeeRow[];
      const findByEmail = db.prepare(
        'SELECT id FROM employee WHERE lower(email)=lower(?) LIMIT 1',
      );
      const findByName = db.prepare(
        'SELECT id FROM employee WHERE lower(name)=lower(?) LIMIT 1',
      );
      const updateExisting = db.prepare(`
        UPDATE employee SET
          resource_id=COALESCE(?, resource_id),
          category=COALESCE(?, category),
          legal_entity=COALESCE(?, legal_entity),
          email=COALESCE(?, email),
          home_department=COALESCE(?, home_department),
          title=COALESCE(?, title),
          credentials=COALESCE(?, credentials),
          role=COALESCE(?, role),
          active=?
        WHERE id=?
      `);
      const insertEmp = db.prepare(`
        INSERT INTO employee(
          resource_id, name, category, legal_entity, email, home_department,
          title, credentials, role, active
        ) VALUES (?,?,?,?,?,?,?,?,?,?)
      `);
      let empCount = 0;
      empRows.forEach((e) => {
        if (!e.name) return;
        const matched = e.email
          ? (findByEmail.get(e.email) as { id: number } | undefined)
          : (findByName.get(e.name) as { id: number } | undefined);
        if (matched) {
          updateExisting.run(
            e.resource_id, e.category, e.legal_entity, e.email, e.home_department,
            e.title, e.credentials, e.role || null, e.active ?? 1, matched.id,
          );
        } else {
          insertEmp.run(
            e.resource_id, e.name, e.category, e.legal_entity, e.email, e.home_department,
            e.title, e.credentials, e.role || 'pm', e.active ?? 1,
          );
        }
        empCount++;
      });
      result.employees = empCount;

      // Rates: bulk insert. Use INSERT OR IGNORE on (legal_entity, rate_table,
      // category, resource_id, effective_date) — but since we don't have a
      // unique index on that tuple, dedup at the source query level.
      const rateRows = src
        .prepare(`
          SELECT legal_entity, rate_table, category, resource_id, price,
                 effective_date, end_date
          FROM rate_entry
          ORDER BY legal_entity, rate_table, category, resource_id, effective_date
        `)
        .all() as PMRateRow[];
      const insRate = db.prepare(`
        INSERT INTO rate_entry(
          legal_entity, rate_table, category, resource_id, price, effective_date, end_date
        ) VALUES (?,?,?,?,?,?,?)
      `);
      rateRows.forEach((r) =>
        insRate.run(
          r.legal_entity, r.rate_table, r.category ?? '', r.resource_id ?? null,
          r.price, r.effective_date, r.end_date,
        ),
      );
      result.rates = rateRows.length;

      markPMImported(db);
    });
    tx();
  } catch (e: any) {
    result.ok = false;
    result.skipped.push(`PM import transaction failed: ${e?.message || String(e)}`);
  } finally {
    try { src.close(); } catch { /* ignore */ }
  }

  return result;
}
