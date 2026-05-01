// Renderer-facing typing for `window.api`. Mirrors the structure exposed by
// electron/preload.ts; keeps return types and complex-payload types stronger
// than the bridge layer, since renderer code is what reads them.
//
// Step 3 leaves payload shapes loose (most are `unknown` until Step 4 ports
// the domain types from QuickProp's reducer). Tighten in Step 4.

import type {
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
  LegalEntity,
  LostReason,
  MarkupPct,
  PhaseDef,
  Project,
  ProjectHeader,
  ProjectPayload,
  ProjectTypeDef,
  RateEntry,
  RateTable,
  TaskDef,
  TemplatePhase,
} from './domain';

/** Header fields the user fills in `InitializeProjectModal`. */
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

/** Payload for `window.api.project.initialize`. Bundles the proposal name,
 *  the header, and the optional template overlay so the IPC is one call. */
interface ProjectInitializePayload {
  proposalName: string;
  header: ProjectInitializeHeader;
  /** When set, overlay the named phase template on top of (or instead of)
   *  the auto-converted sections. */
  template?: { name: string; mode: 'append' | 'replace' } | null;
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

  /** Phase templates (legal_entity + department-scoped bundles). */
  templates: {
    list(filters?: { legal_entity?: string; department?: string; template?: string }): Promise<TemplatePhase[]>;
    listForContext(legalEntity: string, department: string): Promise<string[]>;
    save(row: Omit<TemplatePhase, 'id'> & { id?: number }): Promise<number>;
    remove(id: number): Promise<{ ok: true }>;
    importBulk(rows: Array<Omit<TemplatePhase, 'id'>>): Promise<{ ok: true; count: number }>;
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
