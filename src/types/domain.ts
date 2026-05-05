// QuickQuote domain types — full shapes ported from QuickProp v3.1.1.
//
// Source of truth: QuickProp/ui/state/store.js (state shape) and
// QuickProp/quickprop/api.py (bootstrap shape). These types must stay
// byte-compatible with the JSON Python emits, since QuickQuote will read
// QuickProp's existing projects/*.json files at import time (Step 11).

// ── union literal types ─────────────────────────────────────────────────────

export type ProposalStatus =
  | 'draft'
  | 'sent'
  | 'won'
  | 'lost'
  | 'archived';

export type LostReason =
  | 'price'
  | 'scope_mismatch'
  | 'timing'
  | 'competitor'
  | 'no_decision';

export type BillingType = 'fixed' | 'tm';

export type GeneratedFormat = 'docx' | 'pdf';

export type VersionStatus = 'draft' | 'final';

export type RateTableName = 'consulting' | 'structural';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type EditorView = 'editor' | 'dashboard';

/** Editor sub-mode: which side of a won proposal we're looking at. */
export type EditorMode = 'proposal' | 'project';

/** Active sub-tab within the slide-out lookups admin panel. */
export type LookupsTab =
  | 'basic'
  | 'phases-tasks'
  | 'templates'
  | 'employees'
  | 'rates'
  | 'legal-departments'
  | 'clickup';

/** Capability the renderer might want to gate. QuickQuote is single-user and
 *  canDo() returns true for every value today, but keeping the union lets a
 *  future multi-user rollout add the role matrix without touching call sites. */
export type Permission =
  | 'view'
  | 'edit'
  | 'mark_sent'
  | 'mark_won'
  | 'mark_lost'
  | 'mark_archived'
  | 'reopen'
  | 'reassign'
  | 'add_note'
  | 'follow_up'
  | 'send_to_clickup'
  | 'manage';

/** Filter row for the native open-file dialog. Mirrors Electron's
 *  FileFilter shape. Used by window.api.dialog.openFile for XLSX import. */
export interface DialogFileFilter {
  name: string;
  extensions: string[];
}

/** Result of a successful native open-file dialog: the file is read on the
 *  main process and base64-encoded so the renderer can hand it to xlsx
 *  without a second IPC round-trip. Null when the user cancels. */
export type DialogOpenFileResult = { filePath: string; base64: string } | null;

/** Resource assignment status — drives the colored pill in resource tables. */
export type ResourceStatus = 'Not Started' | 'In-process' | 'Completed' | 'On-hold';

/** ActivityEntry.action — list mirrors QuickProp/quickprop/activity.py. */
export type ActivityAction =
  | 'mark_sent'
  | 'mark_won'
  | 'mark_lost'
  | 'mark_archived'
  | 'reopen'
  | 'reassign'
  | 'note'
  | 'follow_up'
  | 'create_version'
  | 'finalize_version'
  | 'generate_docx'
  | 'generate_pdf';

// ── primitives ──────────────────────────────────────────────────────────────

/** Minimal user reference — appears in lifecycle.owner, activity.user, etc. */
export interface UserRef {
  email: string;
  name: string;
}

// ── proposal body ───────────────────────────────────────────────────────────

export interface LaborRow {
  category: string;
  employee: string;
  hrs: number;
  rate: number;
}

export interface ExpenseRow {
  item: string;
  qty: number;
  unit: string;
  unitCost: number;
  markup: number;
}

export interface Section {
  id: string;
  title: string;
  scope: string;
  /** Optional "what's NOT covered" list. Rendered in the proposal as a
   *  paragraph prefixed with "Scope specifically excluded: " under the
   *  scope of work. Empty string ⇒ no exclusions block emitted. */
  exclusions: string;
  billing: BillingType;
  fee: number;
  notes: string;
  labor: LaborRow[];
  expenses: ExpenseRow[];
}

// ── lifecycle ───────────────────────────────────────────────────────────────

export interface ActivityEntry {
  timestamp: string;
  user: UserRef;
  action: ActivityAction;
  from?: ProposalStatus | null;
  to?: ProposalStatus | null;
  note?: string;
  meta?: Record<string, unknown>;
}

export interface VersionRecord {
  version: number;
  label: string;
  snapshot_at: string;
  snapshot_by: UserRef;
  status_at_snapshot: ProposalStatus;
  proposal: Proposal;
  files?: Array<{ path: string; kind: GeneratedFormat }>;
  note?: string;
}

/** Subset of VersionRecord stored on EditorState while viewing a snapshot. */
export interface ViewingVersion {
  version: number;
  label: string;
  snapshot_at: string;
  snapshot_by: UserRef;
  status_at_snapshot: ProposalStatus;
}

export interface LifecycleMetadata {
  created_at: string;
  sent_date: string | null;
  won_date: string | null;
  lost_date: string | null;
  lost_reason: LostReason | null;
  lost_notes: string | null;
  iCore_project_id: string | null;
  follow_up_at: string | null;
}

export interface GenerationRecord {
  hash: string;
  path: string;
  generated_at: string;
}

export interface Lifecycle {
  status: ProposalStatus;
  owner: UserRef;
  collaborators: UserRef[];
  activity: ActivityEntry[];
  versions: VersionRecord[];
  metadata: LifecycleMetadata;
  /** Set by Step 7's reuse-detection. Keyed by format. */
  last_generations?: Partial<Record<GeneratedFormat, GenerationRecord>>;
}

// ── proposal ────────────────────────────────────────────────────────────────

export interface Proposal {
  date: string;
  name: string;
  address: string;
  cityStateZip: string;
  client: string;
  contact: string;
  clientAddress: string;
  clientCityStateZip: string;
  rateTable: RateTableName;
  sections: Section[];
  lifecycle: Lifecycle;
}

// ── bootstrap (from JsApi.get_bootstrap) ───────────────────────────────────

export interface EmployeeRecord {
  name: string;
  category: string;
  rate: number;
  initials: string;
  color: string;
}

export interface ExpenseLinePreset {
  name: string;
  qty_unit: string;
  default_rate: number;
  rate_unit: string;
}

export interface AllowedUser {
  email: string;
  name: string;
  credentials: string;
  title: string;
  signer_name: string;
  role: string;
}

export interface Identity {
  email: string;
  name: string;
  credentials?: string;
  title?: string;
  signer_name?: string;
  role?: string;
  permissions?: string[];
}

export interface LostReasonOption {
  value: LostReason;
  label: string;
}

/** Per-engineer template summary returned by JsApi.list_*_templates. */
export interface ClientTemplateRecord {
  client?: string;
  contact?: string;
  clientAddress?: string;
  clientCityStateZip?: string;
}

export interface ProjectTemplateRecord {
  sections: Array<{ title: string; scope: string }>;
}

export interface Bootstrap {
  app_version: string;
  employees: EmployeeRecord[];
  consulting_rates: Record<string, number>;
  structural_rates: Record<string, number>;
  category_mapping: Record<string, string>;
  rate_categories: string[];
  expense_lines: ExpenseLinePreset[];
  projects: string[];
  identity: Identity | null;
  allowed_users: AllowedUser[];
  statuses: ProposalStatus[];
  lost_reasons: LostReasonOption[];
  client_templates: string[];
  project_templates: string[];
}

// ── generation result envelope ─────────────────────────────────────────────

export interface GenerateResult {
  ok: boolean;
  reused?: boolean;
  path?: string;
  filename?: string;
  format?: GeneratedFormat;
  error?: string;
}

// ── PM-mode types (added in Stage 1) ───────────────────────────────────────
//
// The "PM mode" surfaces ported from PM Quoting App. These types power the
// post-Won workflow: phases, tasks, resource allocation, ClickUp sync, and
// the lookups admin panel. They're additive — none of the proposal/section
// shapes above changed.

/** ISO date string, YYYY-MM-DD. */
export type ISODate = string;

/** Numeric primary key for lookup rows. */
export type ID = number;

// Lookups (name lists + simple value lists).

export interface LegalEntity { id: ID; name: string }
export interface Department { id: ID; name: string }
export interface RateTable { id: ID; name: string }
export interface ProjectTypeDef { id: ID; name: string }
export interface MarkupPct { id: ID; value: number }
export interface ExpenseCategoryDef { id: ID; name: string }

/** Department-scoped phase taxonomy. */
export interface PhaseDef {
  id: ID;
  department: string;
  name: string;
  sort_order: number;
}

/** (department, phase)-scoped task taxonomy. */
export interface TaskDef {
  id: ID;
  department: string;
  phase: string;
  name: string;
  sort_order: number;
}

/** A single phase-row of a phase template. (legal_entity, department, template)
 *  is the addressing tuple; multiple rows make up one named template. */
export interface TemplatePhase {
  id: ID;
  legal_entity: string;
  department: string;
  template: string;
  phase_name: string;
  rate_table: string;
  sort_order: number;
}

/** Employee row as stored in the (extended) `employee` table — used for
 *  resource allocation, PM picker, and rate lookups. Distinct from
 *  `EmployeeRecord` above (which is the bootstrap shape for proposal labor). */
export interface EmployeeRow {
  id: ID;
  resource_id: string | null;
  name: string;
  category: string | null;
  legal_entity: string | null;
  email: string | null;
  home_department: string | null;
  title: string | null;
  credentials: string | null;
  role: string;
  active: 0 | 1;
}

/** Rate entry row for the 4-tier lookup
 *  (legal_entity → rate_table → category → resource_id). */
export interface RateEntry {
  id: ID;
  legal_entity: string;
  rate_table: string;
  category: string;
  resource_id: string | null;
  price: number;
  effective_date: ISODate | null;
  end_date: ISODate | null;
}

// Project mode body shapes — phases, tasks, expenses, resources.

/** "FF" (fixed fee) or "T&M" (time & materials) — the canonical strings.
 *  `projectTypeIsTM()` parses any value; new code should write 'FF' or 'T&M'. */
export type ProjectType = string;

export type PhaseType = 'labor' | 'expenses';

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
  /** @deprecated kept for back-compat; new code writes project_type */
  billing_type?: BillingType;
  phase_type?: PhaseType;
  notes?: string;
  /** Frozen contract-value reference carried from the originating section's
   *  fee. Computed budget continues to be hours × rate; this is the "PM
   *  agreed $X" reference. */
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

/** The editable PM payload stored in `project.payload_json`. */
export interface ProjectPayload {
  phases: ProjectPhase[];
  resources: ResourceAssignment[];
}

/** Header fields on the `project` row. One-to-one with proposal via
 *  `proposal_id`. */
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

/** Header + payload — the full project record returned by IPC. */
export interface Project extends ProjectHeader {
  payload: ProjectPayload;
}

// ClickUp config + link record shapes (DB-row mirrors).

export interface ClickUpConfig {
  api_token: string | null;
  workspace_id: string | null;
  admin_requests_space_id: string | null;
  admin_requests_list_id: string | null;
  enabled: boolean;
  updated_at: string | null;
}

/** Sanitized config shape returned to the renderer — never carries the API
 *  token. The settings card only needs to know whether one is configured. */
export interface ClickUpStatus {
  configured: boolean;
  enabled: boolean;
  workspace_id: string | null;
  admin_requests_space_id: string | null;
  admin_requests_list_id: string | null;
  updated_at: string | null;
}

/** Patch payload for `clickup.setConfig`. `api_token` is write-only — the
 *  renderer can rotate it but never reads it back. */
export interface ClickUpConfigPatch {
  api_token?: string | null;
  enabled?: boolean;
  workspace_id?: string | null;
  admin_requests_space_id?: string | null;
  admin_requests_list_id?: string | null;
}

/** ClickUp connection-test result. Stage 6 returns the success variant when
 *  the token is valid AND the configured workspace_id is accessible. */
export type ClickUpTestResult =
  | { ok: true; user: { id: number; email: string; username: string | null }; workspace_id: string | null }
  | { ok: false; error: string };

// ── ClickUp sync (Stage 6) ────────────────────────────────────────────────

export type ClickUpFolderAction = 'reuse' | 'create';
export type ClickUpListAction   = 'reuse' | 'create';
export type ClickUpPhaseAction  = 'create' | 'update' | 'skip';

export interface ClickUpPreflightPlan {
  ok: true;
  legal_entity: string;
  department: string;
  workspace: { id: string; name: string };
  space: { id: string; name: string };
  folder: { id: string | null; name: string; action: ClickUpFolderAction };
  list:   { id: string | null; name: string; action: ClickUpListAction; url?: string | null };
  phases: Array<{
    phase_index: number;
    phase_name: string;
    existing_task_id: string | null;
    existing_task_url: string | null;
    last_synced_at: string | null;
    payload_changed: boolean;
    default_action: ClickUpPhaseAction;
  }>;
  warnings: string[];
}

export interface ClickUpPreflightError {
  ok: false;
  error: string;
}

export type ClickUpPreflightResult = ClickUpPreflightPlan | ClickUpPreflightError;

export interface ClickUpExecuteDecisions {
  phases: Array<{ phase_index: number; action: ClickUpPhaseAction }>;
}

export interface ClickUpExecuteResult {
  ok: true;
  list_id: string;
  list_url: string | null;
  phases_synced: number;
  phases_skipped: number;
  warnings: string[];
}

export type ClickUpSendResult = ClickUpExecuteResult | { ok: false; error: string };

export interface ClickUpLink {
  project_id: ID;
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

export interface ClickUpPhaseLink {
  id: ID;
  project_id: ID;
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

// ── PM-mode helpers ────────────────────────────────────────────────────────

/** Resolve the effective phase_type for any phase — explicit field if set,
 *  otherwise infer from legacy data. */
export function effectivePhaseType(p: Pick<ProjectPhase, 'phase_type' | 'name' | 'tasks' | 'expenses'>): PhaseType {
  if (p.phase_type === 'expenses' || p.phase_type === 'labor') return p.phase_type;
  if (/^expenses?$/i.test((p.name || '').trim())) return 'expenses';
  const nTasks = p.tasks?.length ?? 0;
  const nExp = p.expenses?.length ?? 0;
  if (nTasks === 0 && nExp > 0) return 'expenses';
  return 'labor';
}

export function isExpensePhase(p: Pick<ProjectPhase, 'phase_type' | 'name' | 'tasks' | 'expenses'>): boolean {
  return effectivePhaseType(p) === 'expenses';
}

/** Treat any project_type containing T&M / TM / TIME as time & materials.
 *  Older payloads may lack project_type entirely — fall back to billing_type. */
export function projectTypeIsTM(p: Pick<ProjectPhase, 'project_type' | 'billing_type'>): boolean {
  const pt = (p.project_type || '').trim();
  if (pt) return /t\s*&\s*m|^tm$|\btime\b/i.test(pt);
  return p.billing_type === 'tm';
}
