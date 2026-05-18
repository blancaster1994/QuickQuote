// iCore (Dynamics 365 F&O) sync orchestrator.
//
// This module owns:
//   - testConnection() — config-shape validation + cached-token probe. When
//     the API client is wired up (slice 4 adds api.ts) it also calls
//     `/data/Companies?$top=1` to verify connectivity end-to-end.
//   - refreshClients() — TODO (slice 4): pull F&O CustomersV3 → upsert into
//     the local icore_client cache.
//   - preflight() / execute() — TODO (slice 5): two-phase send-to-iCore that
//     creates the project upstream and stamps the returned ID.
//
// Mirrors electron/clickup/sync.ts at the surface level so the renderer
// can wire both integrations the same way.

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  getIcoreConfig,
  setIcoreConfig,
  replaceIcoreClients,
  getIcoreClientByAccount,
  getIcoreLink,
  upsertIcoreLink,
  deleteIcoreLink,
  listIcorePhaseLinks,
  upsertIcorePhaseLink,
  clearIcorePhaseLinks,
} from '../db/icore';
import * as Project from '../project/queries';
import * as Auth from './auth';
import { IcoreApi, IcoreApiError, customerToCacheRow } from './api';

export type IcorePhaseAction = 'create' | 'update' | 'skip';

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const OPERATIONS_URL_RE = /^https:\/\/[^/]+\.operations\.dynamics\.com\/?$/;

export type IcoreTestResult =
  | { ok: true; mode: 'config-only' | 'token' | 'api'; message: string; account?: { username: string; name: string | null } }
  | { ok: false; error: string };

/**
 * Validate the saved iCore config + (when signed in) verify a token can be
 * acquired silently for the configured environment scope.
 *
 * Three terminal states:
 *   1. Config malformed/missing             → ok: false
 *   2. Config good, no cached account       → ok: true, mode: 'config-only'
 *   3. Config good + silent token acquired  → ok: true, mode: 'token'
 *
 * Live OData probe (mode: 'api') ships in slice 4 alongside api.ts.
 */
export async function testConnection(db: Database.Database): Promise<IcoreTestResult> {
  const cfg = getIcoreConfig(db);
  const missing: string[] = [];
  if (!cfg.tenant_id)       missing.push('Tenant ID');
  if (!cfg.client_id)       missing.push('Application (client) ID');
  if (!cfg.environment_url) missing.push('Environment URL');

  if (missing.length) {
    return {
      ok: false,
      error: `Missing required config: ${missing.join(', ')}. Fill these in before testing.`,
    };
  }
  if (cfg.tenant_id && !GUID_RE.test(cfg.tenant_id)) {
    return { ok: false, error: 'Tenant ID is not a valid GUID (expected 8-4-4-4-12 hex).' };
  }
  if (cfg.client_id && !GUID_RE.test(cfg.client_id)) {
    return { ok: false, error: 'Application (client) ID is not a valid GUID.' };
  }
  if (cfg.environment_url && !OPERATIONS_URL_RE.test(cfg.environment_url)) {
    return {
      ok: false,
      error: 'Environment URL should look like https://<env>.operations.dynamics.com (no trailing path).',
    };
  }

  // Try silent token acquisition. If no account is cached this errors out
  // and we return the friendlier "config-only" state with a hint to sign in.
  const account = await Auth.getAccount(db).catch(() => null);
  if (!account) {
    return {
      ok: true,
      mode: 'config-only',
      message: 'Config looks well-formed. Sign in to test token acquisition.',
    };
  }
  try {
    await Auth.acquireToken(db, { interactive: false });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }

  // Live OData probe: cheapest endpoint that exercises the auth path.
  // `/data/Companies?$top=1` returns the first company the user can see
  // (every F&O user belongs to at least one). A 200 here means token →
  // F&O round-trip is healthy end-to-end.
  try {
    const api = new IcoreApi(cfg.environment_url!, () => Auth.acquireToken(db, { interactive: false }));
    const companies = await api.listCompanies(1);
    return {
      ok: true,
      mode: 'api',
      message: `Signed in as ${account.username}; F&O reachable (${companies.length ? `first company: ${companies[0].DataArea}` : 'no companies visible'}).`,
      account: { username: account.username, name: account.name },
    };
  } catch (e: any) {
    if (e instanceof IcoreApiError) {
      return { ok: false, error: `F&O API ${e.status}${e.code ? ' / ' + e.code : ''}: ${e.message}` };
    }
    return { ok: false, error: e?.message ?? String(e) };
  }
}

// ── client cache refresh ─────────────────────────────────────────────────

export interface RefreshClientsResult {
  ok: true;
  upserted: number;
  deactivated: number;
  total: number;
  duration_ms: number;
}

/**
 * Pull every visible non-blocked customer from F&O and replace the local
 * `icore_client` cache transactionally. Updates
 * `icore_config.client_last_synced_at` on success so the interval timer
 * knows when the next sweep is due. Caller (IPC handler / interval timer)
 * is responsible for catching errors and presenting them.
 */
export async function refreshClients(
  db: Database.Database,
): Promise<RefreshClientsResult> {
  const cfg = getIcoreConfig(db);
  if (!cfg.environment_url) throw new Error('iCore environment URL not configured.');
  const api = new IcoreApi(cfg.environment_url, () => Auth.acquireToken(db, { interactive: false }));

  const start = Date.now();
  const customers = await api.listCustomers({ includeBlocked: false });
  const rows = customers.map(customerToCacheRow);
  const { upserted, deactivated } = replaceIcoreClients(db, rows);
  setIcoreConfig(db, { client_last_synced_at: new Date().toISOString() });
  return {
    ok: true,
    upserted,
    deactivated,
    total: rows.length,
    duration_ms: Date.now() - start,
  };
}

// ── background interval ──────────────────────────────────────────────────
//
// Single setInterval started from main.ts at app ready. Reads config each
// tick (so changes to interval_minutes take effect within a minute) and
// fires `refreshClients` when:
//   - sync is enabled,
//   - we have a cached account (silent refresh won't prompt),
//   - the last sync is older than the configured interval.

let intervalHandle: NodeJS.Timeout | null = null;

export function startBackgroundRefresh(db: Database.Database): void {
  if (intervalHandle) return;
  const tick = async () => {
    try {
      const cfg = getIcoreConfig(db);
      if (!cfg.enabled || !cfg.environment_url) return;
      const account = await Auth.getAccount(db).catch(() => null);
      if (!account) return;

      const intervalMs = Math.max(5, cfg.client_sync_interval_minutes) * 60_000;
      const lastMs = cfg.client_last_synced_at ? new Date(cfg.client_last_synced_at).getTime() : 0;
      if (Date.now() - lastMs < intervalMs) return;

      await refreshClients(db);
    } catch (e) {
      console.warn('[icore] background refresh failed:', e);
    }
  };
  // First tick after 30s so app startup doesn't compete with renderer
  // bootstrap; then once per minute.
  intervalHandle = setInterval(tick, 60_000);
  setTimeout(tick, 30_000);
}

export function stopBackgroundRefresh(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

// ── preflight / execute (send-to-iCore) ────────────────────────────────────
//
// Two-phase like ClickUp: preflight() inspects state and returns a plan;
// execute() runs the plan against F&O with per-phase decisions the user
// (or default heuristics) supplied. Splitting them lets the modal show
// what's going to happen before any POST hits F&O.

export interface IcorePreflightPlan {
  ok: true;
  project: { id: number; name: string };
  customer: {
    customer_account: string;
    data_area_id: string | null;
    name: string;
    cached: boolean;
  };
  existing: {
    icore_project_id: string | null;
    icore_project_guid: string | null;
  };
  phases: Array<{
    phase_index: number;
    phase_name: string;
    existing_task_guid: string | null;
    last_synced_at: string | null;
    payload_changed: boolean;
    default_action: IcorePhaseAction;
  }>;
  warnings: string[];
}

export interface IcorePreflightError {
  ok: false;
  error: string;
}

export type IcorePreflightResult = IcorePreflightPlan | IcorePreflightError;

export interface IcoreExecuteDecisions {
  phases: Array<{ phase_index: number; action: IcorePhaseAction }>;
}

export interface IcoreExecuteResult {
  ok: true;
  icore_project_id: string;
  icore_project_guid: string;
  phases_synced: number;
  phases_skipped: number;
  warnings: string[];
}

export type IcoreSendResult = IcoreExecuteResult | { ok: false; error: string };

function hashPhasePayload(phase: any): string {
  // Stable hash over fields we'd want a re-sync to capture. Excludes
  // audit-only metadata so a no-op resave doesn't invalidate the link.
  const stable = {
    name: phase?.name ?? '',
    project_type: phase?.project_type ?? '',
    due_date: phase?.due_date ?? null,
    scope_text: phase?.scope_text ?? '',
    notes: phase?.notes ?? '',
    target_budget: phase?.target_budget ?? null,
    labor: (phase?.labor ?? []).map((row: any) => ({
      category: row.category ?? '',
      hours: row.hours ?? 0,
      rate_override: row.rate_override ?? null,
    })),
    tasks: (phase?.tasks ?? []).map((t: any) => ({ name: t.name ?? '' })),
    expenses: (phase?.expenses ?? []).map((e: any) => ({
      description: e.description, category: e.category,
      quantity: e.quantity, amount: e.amount, markup_pct: e.markup_pct,
    })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

export async function preflight(
  db: Database.Database,
  args: { projectId: number },
): Promise<IcorePreflightResult> {
  const cfg = getIcoreConfig(db);
  if (!cfg.environment_url) return { ok: false, error: 'iCore environment URL not configured.' };
  if (!cfg.enabled)         return { ok: false, error: 'iCore sync is disabled in Lookups → iCore.' };

  const account = await Auth.getAccount(db);
  if (!account)             return { ok: false, error: 'Not signed in to iCore. Sign in from Lookups → iCore.' };

  const project = Project.getProject(db, args.projectId);
  if (!project)             return { ok: false, error: `Project ${args.projectId} not found.` };
  if (!project.icore_client_id) {
    return {
      ok: false,
      error: 'This project has no linked iCore customer. Set it on the proposal first (icore_client_id).',
    };
  }

  const warnings: string[] = [];

  // Look up the customer in the local cache. Not strictly required — F&O
  // will reject the create if the account doesn't exist — but it gives
  // the UI a friendlier name to display.
  const cached = getIcoreClientByAccount(db, project.icore_client_id, project.icore_data_area_id);
  const customer = {
    customer_account: project.icore_client_id,
    data_area_id:     project.icore_data_area_id ?? null,
    name:             cached?.name ?? project.icore_client_id,
    cached:           !!cached,
  };
  if (!cached) {
    warnings.push(`Customer ${project.icore_client_id} is not in the local cache — verify it exists in F&O before sending.`);
  }

  const existingLink = getIcoreLink(db, project.id);
  const phaseLinks = listIcorePhaseLinks(db, project.id);
  const linkByIdx = new Map<number, typeof phaseLinks[number]>();
  for (const pl of phaseLinks) linkByIdx.set(pl.phase_index, pl);

  const phases: IcorePreflightPlan['phases'] = project.payload.phases.map((p, idx) => {
    const link = linkByIdx.get(idx);
    const newHash = hashPhasePayload(p);
    const oldHash = link?.payload_hash || null;
    const changed = !oldHash || oldHash !== newHash;
    let defaultAction: IcorePhaseAction;
    if (!link)         defaultAction = 'create';
    else if (changed)  defaultAction = 'update';
    else               defaultAction = 'skip';
    return {
      phase_index: idx,
      phase_name: p.name || `Phase ${idx + 1}`,
      existing_task_guid: link?.icore_task_guid ?? null,
      last_synced_at: link?.last_synced_at ?? null,
      payload_changed: changed,
      default_action: defaultAction,
    };
  });

  // Sanity: if a link exists but for a different environment, warn —
  // sending will rewrite the link.
  if (existingLink && existingLink.environment_url !== cfg.environment_url) {
    warnings.push(`Project was previously synced to ${existingLink.environment_url}; sending now will retarget it to ${cfg.environment_url}.`);
  }

  return {
    ok: true,
    project:  { id: project.id, name: project.name },
    customer,
    existing: {
      icore_project_id:   existingLink?.icore_project_id ?? null,
      icore_project_guid: existingLink?.icore_project_guid ?? null,
    },
    phases,
    warnings,
  };
}

export async function execute(
  db: Database.Database,
  args: { projectId: number },
  decisions: IcoreExecuteDecisions,
  actor: { email: string; name: string },
): Promise<IcoreSendResult> {
  const plan = await preflight(db, args);
  if (!plan.ok) return plan;

  const cfg = getIcoreConfig(db);
  const api = new IcoreApi(cfg.environment_url!, () => Auth.acquireToken(db, { interactive: false }));

  const project = Project.getProject(db, args.projectId);
  if (!project) return { ok: false, error: `Project ${args.projectId} not found.` };
  const warnings: string[] = [...plan.warnings];

  // 1. Project: create if no link yet, otherwise reuse the existing one.
  let icoreProjectId   = plan.existing.icore_project_id;
  let icoreProjectGuid = plan.existing.icore_project_guid;
  const dataAreaId = plan.customer.data_area_id ?? '';

  if (!icoreProjectId) {
    if (!dataAreaId) {
      return { ok: false, error: 'Linked iCore customer is missing its dataAreaId (company). Refresh the client cache and re-link.' };
    }
    try {
      const created = await api.createProject({
        ProjectName: project.name,
        dataAreaId,
        CustomerAccount: plan.customer.customer_account,
      });
      icoreProjectId   = created.ProjectID;
      icoreProjectGuid = created.ProjectID;   // F&O uses ProjectID as the entity key; the "guid" column exists for parity with ClickUp's split id/guid.
    } catch (e) {
      if (e instanceof IcoreApiError) {
        return { ok: false, error: `Project create failed (F&O ${e.status}${e.code ? ' / ' + e.code : ''}): ${e.message}` };
      }
      return { ok: false, error: `Project create failed: ${(e as any)?.message ?? String(e)}` };
    }
  }

  // 2. Upsert the link before phase work so a partial failure mid-loop
  //    still leaves the project pointed at the right iCore record.
  upsertIcoreLink(db, {
    project_id: project.id,
    icore_project_guid: icoreProjectGuid!,
    icore_project_id:   icoreProjectId!,
    icore_customer_account: plan.customer.customer_account,
    environment_url:    cfg.environment_url!,
    last_synced_by_email: actor.email,
    last_synced_by_name:  actor.name,
  });

  // Also stamp the project header so the existing UI surfaces (e.g.
  // ICoreBadge) pick up the assigned ID without an extra IPC round-trip.
  try {
    Project.updateProjectHeader(db, project.id, { icore_project_id: icoreProjectId! }, actor);
  } catch (e) {
    warnings.push(`Project header stamp failed (non-fatal): ${(e as any)?.message ?? String(e)}`);
  }

  // 3. Per-phase work.
  const decisionByIdx = new Map<number, IcorePhaseAction>();
  for (const d of decisions.phases) decisionByIdx.set(d.phase_index, d.action);

  let phasesSynced  = 0;
  let phasesSkipped = 0;

  for (const planPhase of plan.phases) {
    const action = decisionByIdx.get(planPhase.phase_index) ?? planPhase.default_action;
    if (action === 'skip') { phasesSkipped++; continue; }

    const phase = project.payload.phases[planPhase.phase_index];
    if (!phase) continue;
    const phaseName = phase.name || `Phase ${phase.phase_no}`;

    try {
      let taskGuid = planPhase.existing_task_guid;
      if (action === 'create' || !taskGuid) {
        const created = await api.createProjectActivity({
          ProjectID: icoreProjectId!,
          dataAreaId,
          ActivityName: phaseName,
        });
        taskGuid = created.ActivityNumber;
      } else {
        // F&O's ProjectActivities entity uses a composite key; updates are
        // narrower than creates. For now we leave activity updates out of
        // scope (most edits in QuickQuote update budget/labor, not the
        // activity name itself) and just refresh the local payload hash so
        // we stop flagging the phase as changed. If renames need to push
        // upstream, add a PATCH /data/ProjectActivities(...) call here.
        warnings.push(`Phase "${phaseName}": activity update not implemented (kept existing F&O activity ${taskGuid}).`);
      }

      const newHash = hashPhasePayload(phase);
      upsertIcorePhaseLink(db, {
        project_id: project.id,
        phase_index: planPhase.phase_index,
        phase_name: phaseName,
        icore_task_guid: taskGuid!,
        payload_hash: newHash,
        last_synced_by_email: actor.email,
        last_synced_by_name:  actor.name,
      });
      phasesSynced++;
    } catch (e) {
      const msg = e instanceof IcoreApiError
        ? `F&O ${e.status}${e.code ? ' / ' + e.code : ''}: ${e.message}`
        : ((e as any)?.message ?? String(e));
      warnings.push(`Phase "${phaseName}": ${msg}`);
    }
  }

  return {
    ok: true,
    icore_project_id: icoreProjectId!,
    icore_project_guid: icoreProjectGuid!,
    phases_synced: phasesSynced,
    phases_skipped: phasesSkipped,
    warnings,
  };
}

// ── link queries / unlink ───────────────────────────────────────────────────

export { getIcoreLink as getLink, listIcorePhaseLinks as listPhaseLinks };

export function unlink(db: Database.Database, projectId: number): void {
  clearIcorePhaseLinks(db, projectId);
  deleteIcoreLink(db, projectId);
}
