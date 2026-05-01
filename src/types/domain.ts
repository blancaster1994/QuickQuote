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
