// Project (post-Won) DB queries.
//
// One project row per Won proposal, joined via proposal_id (UNIQUE FK).
// Header fields (legal_entity, department, PM, iCore id, etc.) live as
// columns on `project`; the editable PM body (phases + resources) lives
// in `payload_json` so its shape can evolve without ALTER TABLE.
//
// All renderer-facing IPC takes the proposal NAME (not id) since QuickQuote's
// renderer addresses proposals by name everywhere. We translate name → id
// internally so the renderer never has to know about DB ids.

import type Database from 'better-sqlite3';

// Local type mirrors of src/types/domain.ts — kept in lock-step with the
// renderer-side definitions. The Electron tsconfig has rootDir=electron/, so
// reaching into src/ at compile time isn't allowed.

type ISODate = string;
type ID = number;
type ProjectType = string;
type PhaseType = 'labor' | 'expenses';
type BillingType = 'fixed' | 'tm';
type ResourceStatus = 'Not Started' | 'In-process' | 'Completed' | 'On-hold';

export interface ProjectTask {
  task_no: number;
  name: string;
  category: string;
  hours: number;
  rate_override?: number | null;
  rate_baseline?: number | null;
  rate_override_by_email?: string | null;
  rate_override_by_name?: string | null;
  rate_override_at?: string | null;
}

export interface ProjectExpense {
  description: string;
  category: string;
  quantity: number;
  amount: number;
  markup_pct: number;
}

export interface ProjectPhase {
  phase_no: number;
  name: string;
  rate_table: string;
  project_type: ProjectType;
  due_date: ISODate | null;
  scope_text?: string;
  billing_type?: BillingType;
  phase_type?: PhaseType;
  notes?: string;
  target_budget?: number | null;
  tasks: ProjectTask[];
  expenses: ProjectExpense[];
}

export interface ResourceAssignment {
  phase_no: number;
  task_no: number;
  resource_name: string;
  hours: number;
  bill_rate: number;
  scheduled_start: ISODate | null;
  status: ResourceStatus;
  comments: string | null;
  rate_baseline?: number | null;
  rate_override_by_email?: string | null;
  rate_override_by_name?: string | null;
  rate_override_at?: string | null;
}

export interface ProjectPayload {
  phases: ProjectPhase[];
  resources: ResourceAssignment[];
}

export interface ProjectHeader {
  id: ID;
  proposal_id: ID;
  name: string;
  client_name: string | null;
  client_contact: string | null;
  client_address: string | null;
  client_city_state_zip: string | null;
  project_address: string | null;
  project_city_state_zip: string | null;
  legal_entity: string;
  department: string;
  rate_table: string | null;
  project_type: string | null;
  phase_template: string | null;
  icore_project_id: string | null;
  current_pm_email: string | null;
  current_pm_name: string | null;
  created_by_email: string | null;
  created_by_name: string | null;
  last_modified_by_email: string | null;
  last_modified_by_name: string | null;
  last_modified_at: string | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface Project extends ProjectHeader {
  payload: ProjectPayload;
}

// ── name → id helper ────────────────────────────────────────────────────────

interface ProposalRow { id: number; name: string }

function proposalIdByName(db: Database.Database, name: string): number {
  const row = db.prepare('SELECT id FROM proposal WHERE name = ?').get(name) as ProposalRow | undefined;
  if (!row) throw new Error(`Proposal not found: ${name}`);
  return row.id;
}

// ── row → typed conversion ──────────────────────────────────────────────────

interface ProjectRow {
  id: number;
  proposal_id: number;
  name: string;
  client_name: string | null;
  client_contact: string | null;
  client_address: string | null;
  client_city_state_zip: string | null;
  project_address: string | null;
  project_city_state_zip: string | null;
  legal_entity: string;
  department: string;
  rate_table: string | null;
  project_type: string | null;
  phase_template: string | null;
  icore_project_id: string | null;
  current_pm_email: string | null;
  current_pm_name: string | null;
  created_by_email: string | null;
  created_by_name: string | null;
  last_modified_by_email: string | null;
  last_modified_by_name: string | null;
  last_modified_at: string | null;
  status: 'active' | 'archived';
  payload_json: string;
  created_at: string;
  updated_at: string;
}

function rowToProject(row: ProjectRow): Project {
  let payload: ProjectPayload = { phases: [], resources: [] };
  try {
    const parsed = JSON.parse(row.payload_json) as ProjectPayload;
    if (parsed && Array.isArray(parsed.phases) && Array.isArray(parsed.resources)) {
      payload = parsed;
    }
  } catch {
    // Corrupt blob — fall back to empty. Should never happen since we always
    // write valid JSON, but defensive parse keeps a bad row from crashing the
    // editor. The user can re-save to overwrite.
  }
  const { payload_json, ...header } = row;
  void payload_json;
  return { ...header, payload };
}

// ── header construction ─────────────────────────────────────────────────────

/** Renderer-supplied header fields for project.initialize. The createdBy /
 *  modifiedBy stamps and id come from the actor + auto-id; payload comes from
 *  the converter; everything else is here. */
export interface InitializeHeaderInput {
  /** Required. From legal_entity lookup. */
  legal_entity: string;
  /** Required. From department lookup. */
  department: string;
  /** Optional rate-table override; defaults to the proposal's rateTable. */
  rate_table?: string | null;
  /** Optional project_type override (e.g. "FF" / "T&M") — usually inherited
   *  from individual phases, but the project header keeps a default. */
  project_type?: string | null;
  /** Name of the phase template chosen, if any (else null). */
  phase_template?: string | null;
  /** Optional iCore project ID (alphanumeric). */
  icore_project_id?: string | null;
  /** PM contact at initialization time. Defaults to the actor. */
  current_pm_email?: string | null;
  current_pm_name?: string | null;
}

export interface Actor { email: string; name: string }

// ── initialize ──────────────────────────────────────────────────────────────

/** Create the project row for a Won proposal. Throws if a project already
 *  exists for this proposal — callers should use getByProposalName first to
 *  detect that case and route to "open existing" UX instead. */
export function initializeProject(
  db: Database.Database,
  proposalName: string,
  header: InitializeHeaderInput,
  payload: ProjectPayload,
  actor: Actor,
): Project {
  if (!header.legal_entity?.trim()) throw new Error('legal_entity is required');
  if (!header.department?.trim())   throw new Error('department is required');

  const proposalId = proposalIdByName(db, proposalName);
  const existing = db.prepare('SELECT id FROM project WHERE proposal_id = ?').get(proposalId) as { id: number } | undefined;
  if (existing) {
    throw new Error(`Project already exists for proposal '${proposalName}' (id ${existing.id}).`);
  }

  // Pull denormalized client/address fields off the proposal so the project
  // row has them without an extra join. The renderer can edit them on the
  // project header later without touching the proposal.
  const proposalRow = db.prepare(`
    SELECT name, client_name, client_contact, client_address, client_city_state_zip,
           project_address, project_city_state_zip, rate_table
    FROM proposal WHERE id = ?
  `).get(proposalId) as {
    name: string;
    client_name: string | null;
    client_contact: string | null;
    client_address: string | null;
    client_city_state_zip: string | null;
    project_address: string | null;
    project_city_state_zip: string | null;
    rate_table: string | null;
  };

  const pmEmail = header.current_pm_email ?? actor.email;
  const pmName  = header.current_pm_name  ?? actor.name;

  const info = db.prepare(`
    INSERT INTO project (
      proposal_id, name,
      client_name, client_contact, client_address, client_city_state_zip,
      project_address, project_city_state_zip,
      legal_entity, department, rate_table, project_type, phase_template,
      icore_project_id,
      current_pm_email, current_pm_name,
      created_by_email, created_by_name,
      last_modified_by_email, last_modified_by_name, last_modified_at,
      status, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'active', ?)
  `).run(
    proposalId, proposalRow.name,
    proposalRow.client_name, proposalRow.client_contact,
    proposalRow.client_address, proposalRow.client_city_state_zip,
    proposalRow.project_address, proposalRow.project_city_state_zip,
    header.legal_entity.trim(),
    header.department.trim(),
    header.rate_table ?? proposalRow.rate_table ?? null,
    header.project_type ?? null,
    header.phase_template ?? null,
    (header.icore_project_id ?? null) || null,
    pmEmail, pmName,
    actor.email, actor.name,
    actor.email, actor.name,
    JSON.stringify(payload),
  );

  return getProject(db, Number(info.lastInsertRowid))!;
}

// ── get / list ──────────────────────────────────────────────────────────────

export function getProject(db: Database.Database, id: number): Project | null {
  const row = db.prepare('SELECT * FROM project WHERE id = ?').get(id) as ProjectRow | undefined;
  return row ? rowToProject(row) : null;
}

export function getProjectByProposalName(
  db: Database.Database,
  proposalName: string,
): Project | null {
  const row = db.prepare(`
    SELECT project.* FROM project
    JOIN proposal ON proposal.id = project.proposal_id
    WHERE proposal.name = ?
  `).get(proposalName) as ProjectRow | undefined;
  return row ? rowToProject(row) : null;
}

export interface ListProjectsFilters {
  pm_email?: string;
  legal_entity?: string;
  department?: string;
  status?: 'active' | 'archived' | 'all';
}

export function listProjects(
  db: Database.Database,
  filters: ListProjectsFilters = {},
): ProjectHeader[] {
  const where: string[] = [];
  const args: any[] = [];
  if (filters.pm_email)     { where.push('current_pm_email = ?'); args.push(filters.pm_email); }
  if (filters.legal_entity) { where.push('legal_entity = ?');     args.push(filters.legal_entity); }
  if (filters.department)   { where.push('department = ?');       args.push(filters.department); }
  if (filters.status && filters.status !== 'all') {
    where.push('status = ?'); args.push(filters.status);
  } else if (!filters.status) {
    where.push("status = 'active'");
  }
  const sql = `
    SELECT * FROM project
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY updated_at DESC
  `;
  const rows = db.prepare(sql).all(...args) as ProjectRow[];
  // Header-only — strip payload_json. Saves bandwidth on dashboards.
  return rows.map(r => {
    const { payload_json, ...header } = r;
    void payload_json;
    return header as ProjectHeader;
  });
}

// ── update ──────────────────────────────────────────────────────────────────

/** Header-only patch. Whitelisted columns; never touches payload_json. */
export function updateProjectHeader(
  db: Database.Database,
  id: number,
  patch: Partial<ProjectHeader>,
  actor: Actor,
): Project {
  const allowed: Array<keyof ProjectHeader> = [
    'name', 'client_name', 'client_contact',
    'client_address', 'client_city_state_zip',
    'project_address', 'project_city_state_zip',
    'legal_entity', 'department', 'rate_table',
    'project_type', 'phase_template',
    'icore_project_id', 'current_pm_email', 'current_pm_name',
    'status',
  ];
  const sets: string[] = [];
  const args: any[] = [];
  for (const k of allowed) {
    if (k in patch) {
      sets.push(`${k} = ?`);
      args.push((patch as any)[k]);
    }
  }
  if (sets.length === 0) {
    const cur = getProject(db, id);
    if (!cur) throw new Error(`Project not found: ${id}`);
    return cur;
  }
  sets.push('last_modified_by_email = ?', 'last_modified_by_name = ?', "last_modified_at = datetime('now')", "updated_at = datetime('now')");
  args.push(actor.email, actor.name, id);
  db.prepare(`UPDATE project SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  const next = getProject(db, id);
  if (!next) throw new Error(`Project not found after update: ${id}`);
  return next;
}

/** Replace the editable payload (phases + resources). Caller is responsible
 *  for shape validation; this just stringifies and stamps the modified-by
 *  fields. */
export function saveProjectPayload(
  db: Database.Database,
  id: number,
  payload: ProjectPayload,
  actor: Actor,
): Project {
  if (!payload || !Array.isArray(payload.phases) || !Array.isArray(payload.resources)) {
    throw new Error('payload must have shape { phases: [], resources: [] }');
  }
  db.prepare(`
    UPDATE project SET
      payload_json = ?,
      last_modified_by_email = ?, last_modified_by_name = ?,
      last_modified_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(JSON.stringify(payload), actor.email, actor.name, id);
  const next = getProject(db, id);
  if (!next) throw new Error(`Project not found after savePayload: ${id}`);
  return next;
}

/** Reassign the PM. Activity logging at this level is the project's own
 *  problem; the proposal-side lifecycle.reassign already covers the
 *  proposal's audit trail. */
export function reassignProjectPm(
  db: Database.Database,
  id: number,
  newEmail: string,
  newName: string,
  actor: Actor,
): Project {
  if (!newEmail.trim()) throw new Error('PM email is required');
  return updateProjectHeader(db, id, {
    current_pm_email: newEmail.trim(),
    current_pm_name:  newName.trim() || newEmail.trim(),
  }, actor);
}

