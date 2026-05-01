// ClickUp sync orchestrator. Two-phase: preflight() returns a plan describing
// what will happen; execute() runs it with user-confirmed phaseDecisions.
// Splitting them lets the renderer show a dedup modal before any writes hit
// ClickUp.
//
// Hierarchy mapping (per the user's spec):
//   workspace = configured in clickup_config (one workspace per QuickQuote install)
//   space     = department  (Curtainwall / Structural / Architectural / Consulting)
//   folder    = client_name
//   list      = project.name
//   task      = phase
//
// Project-ified port of PM Quoting App's electron/clickup/sync.ts. The PM
// version also creates subtasks for individual task lines + expense lines and
// has fuzzy-match dedup ("did you mean…" candidate picker) and admin-task
// creation when the PM is missing from the workspace. Those flourishes are
// deferred — Stage 6 covers the core flow: phase → ClickUp task with
// hash-based change detection on re-send.

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import * as CU from '../db/clickup';
import * as Project from '../project/queries';
import { ClickUpApi, ClickUpApiError } from './api';

export type FolderAction = 'reuse' | 'create';
export type ListAction = 'reuse' | 'create';
export type PhaseAction = 'create' | 'update' | 'skip';

export interface PreflightPlan {
  ok: true;
  legal_entity: string;
  department: string;
  workspace: { id: string; name: string };
  space: { id: string; name: string };
  folder: { id: string | null; name: string; action: FolderAction };
  list:   { id: string | null; name: string; action: ListAction; url?: string | null };
  phases: Array<{
    phase_index: number;
    phase_name: string;
    existing_task_id: string | null;
    existing_task_url: string | null;
    last_synced_at: string | null;
    payload_changed: boolean;
    default_action: PhaseAction;
  }>;
  warnings: string[];
}

export interface PreflightError {
  ok: false;
  error: string;
}

export interface ExecuteDecisions {
  phases: Array<{ phase_index: number; action: PhaseAction }>;
}

export interface ExecuteResult {
  ok: true;
  list_id: string;
  list_url: string | null;
  phases_synced: number;
  phases_skipped: number;
  warnings: string[];
}

// ── helpers ────────────────────────────────────────────────────────────────

function hashPhasePayload(phase: any): string {
  // Stable hash of fields that should trigger a re-sync when changed.
  // Excludes audit metadata (rate_override_at, etc.) — they don't change
  // what the ClickUp task should look like.
  const stable = {
    name: phase?.name ?? '',
    project_type: phase?.project_type ?? '',
    due_date: phase?.due_date ?? null,
    scope_text: phase?.scope_text ?? '',
    notes: phase?.notes ?? '',
    target_budget: phase?.target_budget ?? null,
    tasks: (phase?.tasks ?? []).map((t: any) => ({
      name: t.name, category: t.category,
      hours: t.hours, rate_override: t.rate_override ?? null,
    })),
    expenses: (phase?.expenses ?? []).map((e: any) => ({
      description: e.description, category: e.category,
      quantity: e.quantity, amount: e.amount, markup_pct: e.markup_pct,
    })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function nameKey(s: string): string {
  return (s || '').trim().toLowerCase();
}

function renderPhaseDescription(phase: any): string {
  const parts: string[] = [];
  if (phase.scope_text) parts.push(phase.scope_text);
  if (phase.notes)      parts.push('---', `Internal notes: ${phase.notes}`);
  if (phase.tasks?.length) {
    parts.push('---', '**Tasks**');
    for (const t of phase.tasks) {
      parts.push(`- ${t.name} (${t.category || '—'}) · ${t.hours || 0} h`);
    }
  }
  if (phase.expenses?.length) {
    parts.push('---', '**Expenses**');
    for (const e of phase.expenses) {
      parts.push(`- ${e.description || '—'} · qty ${e.quantity} × $${e.amount}`);
    }
  }
  return parts.join('\n');
}

function dueDateMs(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  const d = new Date(iso + 'T17:00:00Z');                 // 5pm UTC; not midnight (avoids prev-day display in ClickUp)
  if (isNaN(d.getTime())) return undefined;
  return d.getTime();
}

// ── connection probe ───────────────────────────────────────────────────────

export async function testConnection(db: Database.Database): Promise<
  | { ok: true; user: { id: number; email: string; username: string | null }; workspace_id: string | null }
  | { ok: false; error: string }
> {
  const cfg = CU.getClickUpConfig(db);
  if (!cfg.api_token) return { ok: false, error: 'No API token configured. Paste a Personal API Token in Lookups → ClickUp.' };
  const api = new ClickUpApi(cfg.api_token, cfg.workspace_id);
  try {
    const user = await api.getUser();
    if (cfg.workspace_id) {
      // Verify the configured workspace_id is one the token has access to.
      const workspaces = await api.listWorkspaces();
      const found = workspaces.find(w => w.id === cfg.workspace_id);
      if (!found) {
        return {
          ok: false,
          error: `Token doesn't have access to workspace ${cfg.workspace_id}. Available: ${workspaces.map(w => w.name).join(', ') || '(none)'}.`,
        };
      }
    }
    return { ok: true, user, workspace_id: cfg.workspace_id };
  } catch (e) {
    if (e instanceof ClickUpApiError) {
      return { ok: false, error: `${e.status === 401 ? 'Token rejected' : 'API error'}: ${e.message}` };
    }
    return { ok: false, error: String((e as any)?.message || e) };
  }
}

// ── preflight ──────────────────────────────────────────────────────────────

export async function preflight(
  db: Database.Database,
  args: { projectId: number },
): Promise<PreflightPlan | PreflightError> {
  const cfg = CU.getClickUpConfig(db);
  if (!cfg.api_token)    return { ok: false, error: 'ClickUp API token not configured.' };
  if (!cfg.enabled)      return { ok: false, error: 'ClickUp sync is disabled. Enable it in Lookups → ClickUp.' };
  if (!cfg.workspace_id) return { ok: false, error: 'No ClickUp workspace configured.' };

  const project = Project.getProject(db, args.projectId);
  if (!project) return { ok: false, error: `Project ${args.projectId} not found.` };

  const api = new ClickUpApi(cfg.api_token, cfg.workspace_id);
  const warnings: string[] = [];

  // Workspace name (for display).
  const workspaces = await api.listWorkspaces();
  const wsName = workspaces.find(w => w.id === cfg.workspace_id)?.name || cfg.workspace_id;

  // Resolve space by department (case-insensitive name match).
  const spaces = await api.listSpaces();
  const space = spaces.find(s => nameKey(s.name) === nameKey(project.department));
  if (!space) {
    return {
      ok: false,
      error: `No ClickUp space named "${project.department}" in workspace ${wsName}. Create it first or rename an existing space.`,
    };
  }

  // Resolve folder by client_name.
  const clientName = (project.client_name || '').trim();
  const existingLink = CU.getClickUpLink(db, project.id);

  let folder: PreflightPlan['folder'];
  if (!clientName) {
    return { ok: false, error: 'Project has no client name; cannot resolve folder. Set the client on the proposal first.' };
  }
  const folders = await api.listFolders(space.id);
  const matchedFolder = folders.find(f => nameKey(f.name) === nameKey(clientName));
  if (matchedFolder) {
    folder = { id: matchedFolder.id, name: matchedFolder.name, action: 'reuse' };
  } else {
    folder = { id: null, name: clientName, action: 'create' };
  }

  // Resolve list by project.name within the resolved folder.
  let list: PreflightPlan['list'];
  if (folder.id) {
    const lists = await api.listListsInFolder(folder.id);
    const matchedList = lists.find(l => nameKey(l.name) === nameKey(project.name));
    if (matchedList) {
      list = { id: matchedList.id, name: matchedList.name, action: 'reuse', url: matchedList.url ?? null };
    } else {
      list = { id: null, name: project.name, action: 'create', url: null };
    }
  } else {
    list = { id: null, name: project.name, action: 'create', url: null };
  }

  // Per-phase plan. Compare each phase's hash against the last-synced hash
  // recorded in project_clickup_phase_link. Unchanged phases default to skip.
  const phaseLinks = CU.listClickUpPhaseLinks(db, project.id);
  const linkByIdx = new Map<number, typeof phaseLinks[number]>();
  for (const pl of phaseLinks) linkByIdx.set(pl.phase_index, pl);

  const phases: PreflightPlan['phases'] = project.payload.phases.map((p, idx) => {
    const link = linkByIdx.get(idx);
    const newHash = hashPhasePayload(p);
    const oldHash = link?.payload_hash || null;
    const changed = !oldHash || oldHash !== newHash;
    let defaultAction: PhaseAction;
    if (!link) defaultAction = 'create';
    else if (changed) defaultAction = 'update';
    else defaultAction = 'skip';
    return {
      phase_index: idx,
      phase_name: p.name || `Phase ${idx + 1}`,
      existing_task_id: link?.task_id ?? null,
      existing_task_url: link?.task_url ?? null,
      last_synced_at: link?.last_synced_at ?? null,
      payload_changed: changed,
      default_action: defaultAction,
    };
  });

  // Sanity-check the existing link still points at the matched list (or warn).
  if (existingLink && list.id && existingLink.list_id !== list.id) {
    warnings.push(`This project was previously linked to list ${existingLink.list_id}; the matched list is ${list.id}. Sending will rewrite the link.`);
  }

  return {
    ok: true,
    legal_entity: project.legal_entity,
    department:   project.department,
    workspace: { id: cfg.workspace_id, name: wsName },
    space:     { id: space.id, name: space.name },
    folder,
    list,
    phases,
    warnings,
  };
}

// ── execute ────────────────────────────────────────────────────────────────

export async function execute(
  db: Database.Database,
  args: { projectId: number },
  decisions: ExecuteDecisions,
  actor: { email: string; name: string },
): Promise<ExecuteResult | { ok: false; error: string }> {
  const plan = await preflight(db, args);
  if (!plan.ok) return plan;

  const cfg = CU.getClickUpConfig(db);
  const api = new ClickUpApi(cfg.api_token!, cfg.workspace_id!);

  const project = Project.getProject(db, args.projectId);
  if (!project) return { ok: false, error: `Project ${args.projectId} not found.` };

  const warnings: string[] = [...plan.warnings];

  // 1. Folder: create if missing.
  let folderId = plan.folder.id;
  if (!folderId) {
    try {
      const created = await api.createFolder(plan.space.id, plan.folder.name);
      folderId = created.id;
    } catch (e: any) {
      return { ok: false, error: `Folder create failed: ${e?.message || String(e)}` };
    }
  }

  // 2. List: create if missing.
  let listId  = plan.list.id;
  let listUrl: string | null = plan.list.url ?? null;
  if (!listId) {
    try {
      const created = await api.createListInFolder(folderId, plan.list.name);
      listId  = created.id;
      listUrl = created.url ?? null;
    } catch (e: any) {
      return { ok: false, error: `List create failed: ${e?.message || String(e)}` };
    }
  }

  // 3. Upsert the project-level link row before writing tasks so a partial
  //    failure mid-loop still leaves the project tied to the right list.
  CU.upsertClickUpLink(db, {
    project_id: project.id,
    workspace_id: cfg.workspace_id!,
    space_id: plan.space.id,
    folder_id: folderId,
    list_id:  listId,
    list_url: listUrl,
    last_synced_by_email: actor.email,
    last_synced_by_name:  actor.name,
  });

  // 4. Per-phase work.
  const decisionByIdx = new Map<number, PhaseAction>();
  for (const d of decisions.phases) decisionByIdx.set(d.phase_index, d.action);

  let phasesSynced  = 0;
  let phasesSkipped = 0;

  for (const planPhase of plan.phases) {
    const action = decisionByIdx.get(planPhase.phase_index) ?? planPhase.default_action;
    if (action === 'skip') { phasesSkipped++; continue; }

    const phase = project.payload.phases[planPhase.phase_index];
    if (!phase) continue;

    const body = {
      name: phase.name || `Phase ${phase.phase_no}`,
      description: renderPhaseDescription(phase),
      due_date: dueDateMs(phase.due_date),
    };

    try {
      let taskId  = planPhase.existing_task_id;
      let taskUrl = planPhase.existing_task_url;
      if (action === 'update' && taskId) {
        await api.updateTask(taskId, { name: body.name, description: body.description, due_date: body.due_date ?? null });
      } else {
        const ref = await api.createTask(listId, body);
        taskId  = ref.id;
        taskUrl = ref.url;
      }
      const newHash = hashPhasePayload(phase);
      CU.upsertClickUpPhaseLink(db, {
        project_id: project.id,
        phase_index: planPhase.phase_index,
        phase_name: phase.name || `Phase ${phase.phase_no}`,
        task_id:  taskId!,
        task_url: taskUrl,
        payload_hash: newHash,
        subtask_ids_json: null,                  // subtasks deferred (PM polish)
        last_synced_by_email: actor.email,
        last_synced_by_name:  actor.name,
      });
      phasesSynced++;
    } catch (e: any) {
      warnings.push(`Phase "${phase.name}": ${e?.message || String(e)}`);
    }
  }

  return {
    ok: true,
    list_id: listId,
    list_url: listUrl,
    phases_synced: phasesSynced,
    phases_skipped: phasesSkipped,
    warnings,
  };
}

// ── link queries (re-export from db/clickup for IPC convenience) ───────────

export const getLink = CU.getClickUpLink;
export const listPhaseLinks = CU.listClickUpPhaseLinks;

export function unlink(db: Database.Database, projectId: number): void {
  CU.clearClickUpPhaseLinks(db, projectId);
  CU.deleteClickUpLink(db, projectId);
}
