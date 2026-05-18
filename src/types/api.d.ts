// Renderer-facing typing for `window.api`. Mirrors the structure exposed by
// electron/preload.ts; keeps return types and complex-payload types stronger
// than the bridge layer, since renderer code is what reads them.
//
// Step 3 leaves payload shapes loose (most are `unknown` until Step 4 ports
// the domain types from QuickProp's reducer). Tighten in Step 4.

import type {
  BidItemTemplate,
  ClickUpConfigPatch,
  ClickUpExecuteDecisions,
  ClickUpLink,
  ClickUpPhaseLink,
  ClickUpPreflightResult,
  ClickUpSendResult,
  ClickUpStatus,
  ClickUpTestResult,
  Department,
  DialogFileFilter,
  DialogOpenFileResult,
  EmployeeRow,
  ExpenseCategoryDef,
  GenerateResult,
  IcoreAccount,
  IcoreConfigPatch,
  IcoreStatus,
  IcoreTestResult,
  LegalEntity,
  LostReason,
  MarkupPct,
  PhaseDef,
  Project,
  ProjectHeader,
  ProjectPayload,
  ProjectTypeDef,
  Proposal,
  RateEntry,
  RateTable,
  TaskDef,
} from './domain';

/** Header fields for the fallback `project.initialize` call (legacy data
 *  rescue). New code uses `lifecycle.sendAndInitialize` which derives these
 *  from the proposal itself. */
interface ProjectInitializeHeader {
  legal_entity: string;
  department: string;
  rate_table?: string | null;
  project_type?: string | null;
  phase_template?: string | null;
  icore_project_id?: string | null;
  current_pm_email?: string | null;
  current_pm_name?: string | null;
}

interface ProjectInitializePayload {
  proposalName: string;
  header: ProjectInitializeHeader;
}

/** Payload for `lifecycle.sendAndInitialize` — runs Mark Sent + creates the
 *  project in one transaction. legal_entity and department come from the
 *  proposal itself (set in the header card before clicking Send). */
interface SendAndInitializePayload {
  proposalName: string;
  /** Override the proposal's rateTable for the new project (optional). */
  rateTableOverride?: string | null;
  /** Optional iCore project ID, alphanumeric + `_` / `-`. */
  icoreProjectId?: string | null;
  /** Optional note attached to the Mark Sent activity entry. */
  note?: string;
}

interface SendAndInitializeResult {
  proposal: Proposal;
  project: Project;
}

interface MarkWonAndSyncPayload {
  proposalName: string;
  icoreProjectId: string;
}

interface MarkWonAndSyncResult {
  proposal: Proposal;
  project: Project | null;
}

interface ProjectListFilters {
  pm_email?: string;
  legal_entity?: string;
  department?: string;
  status?: 'active' | 'archived' | 'all';
}

/** PM-mode lookups keyed by table name. Used by `window.api.lookups.*`. */
type NameTable =
  | 'legal_entity'
  | 'department'
  | 'rate_table'
  | 'project_type'
  | 'expense_category';

/** Row shape returned by `lookups.list(table)` — the union of all simple
 *  name-list rows. Each variant has `{ id, name }` so callers don't need to
 *  branch on table. */
type LookupNameRow = LegalEntity | Department | RateTable | ProjectTypeDef | ExpenseCategoryDef;

export interface QuickQuoteApi {
  app: {
    /** One-shot mount call (QuickProp v3 `get_bootstrap`). */
    bootstrap(): Promise<unknown>;
    /** One-time importer from QuickProp v3. `sourceDir` defaults to
     *  `C:\Users\blancaster\dev\QuickProp\`. Idempotent. */
    importFromQuickProp(sourceDir?: string): Promise<{
      ok: boolean;
      alreadyImported: boolean;
      proposalsImported: number;
      clientTemplatesImported: number;
      projectTemplatesImported: number;
      identityCopied: boolean;
      skipped: string[];
      sourceDir: string;
    }>;
  };

  identity: {
    get(): Promise<unknown | null>;
    set(email: string): Promise<unknown>;
    clear(): Promise<{ ok: true }>;
    listAllowed(): Promise<unknown[]>;
  };

  clientTemplates: {
    list(): Promise<string[]>;
    load(name: string): Promise<unknown>;
    save(name: string, fields: unknown): Promise<unknown>;
    remove(name: string): Promise<unknown>;
  };

  projectTemplates: {
    list(): Promise<string[]>;
    load(name: string): Promise<unknown>;
    save(name: string, sections: unknown[]): Promise<unknown>;
    remove(name: string): Promise<unknown>;
  };

  proposals: {
    list(): Promise<string[]>;
    load(name: string): Promise<unknown>;
    /** `renameFrom` is the prior on-disk name when renaming. */
    save(proposal: unknown, renameFrom?: string | null): Promise<{ ok: boolean; name: string; proposal: unknown }>;
    remove(name: string): Promise<{ ok: true }>;
  };

  lifecycle: {
    markSent(name: string, note?: string): Promise<unknown>;
    markWon(name: string, note?: string, icoreProjectId?: string | null): Promise<unknown>;
    markLost(name: string, reason: LostReason, note?: string): Promise<unknown>;
    markArchived(name: string, note?: string): Promise<unknown>;
    reopen(name: string, note?: string): Promise<unknown>;
    addNote(name: string, note: string): Promise<unknown>;
    reassign(name: string, newPmEmail: string, note?: string): Promise<unknown>;
    setFollowUp(name: string, whenIso: string | null, note?: string): Promise<unknown>;
    /** Mark Sent + initialize the project in one transaction. */
    sendAndInitialize(payload: SendAndInitializePayload): Promise<SendAndInitializeResult>;
    /** Mark Won + stamp the iCore project ID on the project row. */
    markWonAndSync(payload: MarkWonAndSyncPayload): Promise<MarkWonAndSyncResult>;
  };

  versions: {
    create(name: string, note?: string): Promise<{ version: unknown; proposal: unknown }>;
    list(name: string): Promise<unknown[]>;
    load(name: string, version: number): Promise<unknown | null>;
  };

  dashboard: {
    get(opts?: { stale_days?: number; win_rate_window_days?: number; owner_email?: string }): Promise<unknown>;
  };

  generate: {
    docx(proposal: unknown): Promise<GenerateResult>;
    pdf(proposal: unknown, previewHtml?: string): Promise<GenerateResult>;
  };

  os: {
    openFile(path: string): Promise<{ ok: true }>;
    revealInExplorer(path: string): Promise<{ ok: true }>;
    /** Windows-only: place the file on the system clipboard as a file
     *  reference so Ctrl+V in Outlook/Gmail/Explorer attaches/pastes it. */
    copyFileToClipboard(path: string): Promise<{ ok: true }>;
  };

  // ── PM-mode admin (Stage 2) ─────────────────────────────────────────────

  /** Native open-file dialog. Returns `{ filePath, base64 }` so the renderer
   *  can hand bytes to xlsx without a second IPC round-trip. `null` = user
   *  cancelled. */
  dialog: {
    openFile(filters?: DialogFileFilter[]): Promise<DialogOpenFileResult>;
  };

  /** Simple name-list CRUD. `table` is one of the five name-list tables. */
  lookups: {
    list(table: NameTable): Promise<LookupNameRow[]>;
    add(table: NameTable, name: string): Promise<number>;
    update(table: NameTable, id: number, name: string): Promise<{ ok: true }>;
    remove(table: NameTable, id: number): Promise<{ ok: true }>;
  };

  /** Markup percentages (numeric value list). */
  markup: {
    list(): Promise<MarkupPct[]>;
    add(value: number): Promise<number>;
    update(id: number, value: number): Promise<{ ok: true }>;
    remove(id: number): Promise<{ ok: true }>;
  };

  /** Department-scoped phase taxonomy. */
  phases: {
    list(department?: string): Promise<PhaseDef[]>;
    save(row: { id?: number; department: string; name: string; sort_order: number }): Promise<number>;
    remove(id: number): Promise<{ ok: true }>;
  };

  /** (department, phase)-scoped task taxonomy. */
  tasks: {
    list(department?: string, phase?: string): Promise<TaskDef[]>;
    save(row: { id?: number; department: string; phase: string; name: string; sort_order: number }): Promise<number>;
    remove(id: number): Promise<{ ok: true }>;
  };

  /** Bid item templates — phases (with nested name-only tasks) scoped per
   *  (legal_entity, department). Applied in the proposal editor. */
  bidItemTemplates: {
    /** List template names for a (legal_entity, department) pair. */
    list(legalEntity: string, department: string): Promise<string[]>;
    /** Load a full template (phases + nested tasks). */
    get(legalEntity: string, department: string, name: string): Promise<BidItemTemplate | null>;
    /** Upsert a full template. Replaces all phase + task rows for the
     *  (legal_entity, department, name) tuple in one transaction. */
    save(template: BidItemTemplate): Promise<{ ok: true }>;
    remove(legalEntity: string, department: string, name: string): Promise<{ ok: true }>;
    rename(legalEntity: string, department: string, oldName: string, newName: string): Promise<{ ok: true }>;
  };

  /** Employees (extended). Used for resource allocation, PM picker, ClickUp. */
  employees: {
    list(activeOnly?: boolean): Promise<EmployeeRow[]>;
    save(row: Partial<EmployeeRow>): Promise<number>;
    remove(id: number): Promise<{ ok: true }>;
    importBulk(rows: Array<Omit<EmployeeRow, 'id' | 'active'>>): Promise<{ ok: true; count: number }>;
    findByEmail(email: string): Promise<EmployeeRow | null>;
  };

  /** Rates (4-tier lookup: legal_entity → rate_table → category → resource_id). */
  rates: {
    list(filters?: { legal_entity?: string; rate_table?: string }): Promise<RateEntry[]>;
    save(row: Partial<RateEntry>): Promise<number>;
    remove(id: number): Promise<{ ok: true }>;
    importBulk(rows: Array<Omit<RateEntry, 'id'>>): Promise<{ ok: true; count: number }>;
    lookup(legalEntity: string, rateTable: string, category: string, resourceId?: string | null): Promise<number | null>;
    categories(legalEntity?: string): Promise<string[]>;
    tablesForEntity(legalEntity: string): Promise<string[]>;
  };

  /** ClickUp settings + sync. `getConfig` returns a sanitized status
   *  (no api_token). preflight returns a plan describing what will happen;
   *  send executes user-confirmed phase decisions. */
  clickup: {
    getConfig(): Promise<ClickUpStatus>;
    setConfig(patch: ClickUpConfigPatch): Promise<ClickUpStatus>;
    testConnection(): Promise<ClickUpTestResult>;
    preflight(projectId: number): Promise<ClickUpPreflightResult>;
    send(projectId: number, decisions: ClickUpExecuteDecisions): Promise<ClickUpSendResult>;
    getLink(projectId: number): Promise<ClickUpLink | null>;
    listPhaseLinks(projectId: number): Promise<ClickUpPhaseLink[]>;
    unlink(projectId: number): Promise<{ ok: true }>;
  };

  /** iCore (Dynamics 365 F&O) settings, auth, and connection check.
   *  signIn opens a system-browser MSAL flow; testConnection validates
   *  the saved config and (when signed in) probes silent token
   *  acquisition. Live OData probes land alongside api.ts. */
  icore: {
    getConfig(): Promise<IcoreStatus>;
    setConfig(patch: IcoreConfigPatch): Promise<IcoreStatus>;
    testConnection(): Promise<IcoreTestResult>;
    signIn(): Promise<IcoreAccount>;
    signOut(): Promise<void>;
    getAccount(): Promise<IcoreAccount | null>;
  };

  /** Project mode (Stage 4). One row per Won proposal, joined via
   *  proposal_id. Renderer-facing IPC addresses by proposal name; main side
   *  translates to id. */
  project: {
    initialize(payload: ProjectInitializePayload): Promise<Project>;
    get(id: number): Promise<Project | null>;
    getByProposalName(proposalName: string): Promise<Project | null>;
    list(filters?: ProjectListFilters): Promise<ProjectHeader[]>;
    updateHeader(id: number, patch: Partial<ProjectHeader>): Promise<Project>;
    savePayload(id: number, payload: ProjectPayload): Promise<Project>;
    reassignPm(id: number, newEmail: string, newName: string): Promise<Project>;
  };
}

declare global {
  interface Window {
    api: QuickQuoteApi;
  }
}
