// Proposal CRUD + per-engineer templates + composite bootstrap.
//
// Storage model: each proposal is one row in `proposal` (denormalized header
// columns for fast list/dashboard queries) plus one row in `proposal_version`
// holding the full v3 EditorState payload as JSON. Snapshots from versioning
// stay nested inside the payload's lifecycle.versions[] array — same as
// QuickProp's on-disk shape. This keeps the importer (Step 11) a verbatim
// copy and matches the renderer's expected return shapes.
//
// Loose typing on proposal/actor: payloads round-trip as opaque JSON, so
// strong types here add friction without much value. The renderer-side
// surface in src/types/api.d.ts carries the typed shapes.

import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';

export type { Database };

// ── types we use enough to bother spelling ──────────────────────────────────

export type ProposalStatus = 'draft' | 'sent' | 'won' | 'lost' | 'archived';

export interface Actor {
  email: string;
  name: string;
}

// Status set used here matches activity.ts's ALLOWED + projects.STATUSES in
// QuickProp. Re-stating instead of importing to avoid a cycle.
const STATUSES: readonly ProposalStatus[] = ['draft', 'sent', 'won', 'lost', 'archived'];
const RETIRED_STATUS_MAP: Record<string, ProposalStatus> = { under_review: 'sent' };

// ── lifecycle backfill ──────────────────────────────────────────────────────

function utcNowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function defaultLifecycle(owner: Actor | null = null): any {
  return {
    status:        'draft',
    owner:         owner || { email: '', name: '' },
    collaborators: [],
    activity:      [],
    versions:      [],
    last_generations: {},
    metadata: {
      created_at:       utcNowIso(),
      sent_date:        null,
      won_date:         null,
      lost_date:        null,
      lost_reason:      null,
      lost_notes:       null,
      iCore_project_id: null,
      follow_up_at:     null,
    },
  };
}

/**
 * Backfill a proposal with a valid lifecycle block. Mirrors QuickProp's
 * projects._ensure_lifecycle: idempotent, fills missing keys, maps retired
 * status names forward, and uses fallbackOwner when owner.email is empty.
 * Mutates in place AND returns the proposal.
 */
export function ensureLifecycle(proposal: any, fallbackOwner: Actor | null = null): any {
  let lc = proposal?.lifecycle;
  if (!lc || typeof lc !== 'object') {
    lc = defaultLifecycle(fallbackOwner);
  } else {
    const dflt = defaultLifecycle(fallbackOwner);
    for (const [k, v] of Object.entries(dflt)) {
      if (k === 'metadata') {
        const md = (lc as any).metadata || {};
        for (const [mk, mv] of Object.entries(v as any)) {
          if (!(mk in md)) md[mk] = mv;
        }
        (lc as any).metadata = md;
      } else if (!(k in lc)) {
        (lc as any)[k] = v;
      }
    }
    if (!(lc as any).owner?.email && fallbackOwner) (lc as any).owner = fallbackOwner;
    const cur = (lc as any).status;
    if (cur in RETIRED_STATUS_MAP) (lc as any).status = RETIRED_STATUS_MAP[cur];
    else if (!STATUSES.includes(cur)) (lc as any).status = 'draft';
  }
  proposal.lifecycle = lc;
  return proposal;
}

/**
 * SHA-256 over a proposal's content fields (excluding lifecycle). Drives the
 * reuse-detection short-circuit in proposal/generate.ts (Step 7) — when this
 * hash matches the last-generated file's hash, we skip regeneration.
 *
 * Mirror of QuickProp's projects.proposal_content_hash. Must stay byte-stable
 * across saves so a no-op re-save doesn't bust the cache.
 */
export function proposalContentHash(proposal: any): string {
  const content: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(proposal || {})) {
    if (k !== 'lifecycle') content[k] = v;
  }
  // sort_keys=True equivalent: stringify with sorted top-level keys.
  // Matches QuickProp's Python json.dumps(..., sort_keys=True). Nested objects
  // are serialized in insertion order both sides, so this is acceptable until
  // we have a regression — see the plan's R7.
  const blob = JSON.stringify(content, Object.keys(content).sort());
  return createHash('sha256').update(blob, 'utf-8').digest('hex');
}

/**
 * Pure check: is this proposal deletable? Mirrors QuickProp's
 * projects.can_delete — Draft AND no non-note activity. Closes the
 * archive→reopen→delete bypass.
 */
export function canDelete(proposal: any): boolean {
  const lc = proposal?.lifecycle || {};
  if ((lc.status || 'draft') !== 'draft') return false;
  for (const e of (lc.activity || [])) {
    if (e?.action !== 'note') return false;
  }
  return true;
}

// ── header denormalization ──────────────────────────────────────────────────

interface HeaderRow {
  status: string;
  rate_table: string;
  owner_email: string | null;
  owner_name: string | null;
  sent_date: string | null;
  won_date: string | null;
  lost_date: string | null;
  lost_reason: string | null;
  lost_notes: string | null;
  follow_up_at: string | null;
  icore_project_id: string | null;
  client_name: string | null;
  client_contact: string | null;
  client_address: string | null;
  client_city_state_zip: string | null;
  project_address: string | null;
  project_city_state_zip: string | null;
  proposal_date: string | null;
}

function extractHeaders(proposal: any): HeaderRow {
  const lc = proposal?.lifecycle || {};
  const md = lc.metadata || {};
  const owner = lc.owner || {};
  return {
    status:                 lc.status || 'draft',
    rate_table:             proposal?.rateTable || 'consulting',
    owner_email:            owner.email || null,
    owner_name:             owner.name || null,
    sent_date:              md.sent_date || null,
    won_date:               md.won_date || null,
    lost_date:              md.lost_date || null,
    lost_reason:            md.lost_reason || null,
    lost_notes:             md.lost_notes || null,
    follow_up_at:           md.follow_up_at || null,
    icore_project_id:       md.iCore_project_id || null,
    client_name:            proposal?.client || null,
    client_contact:         proposal?.contact || null,
    client_address:         proposal?.clientAddress || null,
    client_city_state_zip:  proposal?.clientCityStateZip || null,
    project_address:        proposal?.address || null,
    project_city_state_zip: proposal?.cityStateZip || null,
    proposal_date:          proposal?.date || null,
  };
}

// ── proposal CRUD ───────────────────────────────────────────────────────────

interface ProposalRow {
  id: number;
  name: string;
  current_version_id: number | null;
}

function findByName(db: Database.Database, name: string): ProposalRow | undefined {
  return db.prepare(
    'SELECT id, name, current_version_id FROM proposal WHERE name = ?',
  ).get(name) as ProposalRow | undefined;
}

export function listProposals(db: Database.Database): string[] {
  const rows = db.prepare('SELECT name FROM proposal ORDER BY name ASC').all() as { name: string }[];
  return rows.map(r => r.name);
}

export function loadProposal(db: Database.Database, name: string): any {
  const row = findByName(db, name);
  if (!row || !row.current_version_id) {
    throw new Error(`Proposal not found: ${name}`);
  }
  const ver = db.prepare(
    'SELECT payload_json FROM proposal_version WHERE id = ?',
  ).get(row.current_version_id) as { payload_json: string } | undefined;
  if (!ver) throw new Error(`Version not found for proposal: ${name}`);
  const proposal = JSON.parse(ver.payload_json);
  ensureLifecycle(proposal);
  return proposal;
}

/**
 * Save a proposal. Mirrors QuickProp's projects.save_proposal:
 *  - actor: {email, name} used as default owner on first save (optional)
 *  - renameFrom: prior on-disk name when renamed in this edit session
 *
 * Returns {ok, name, proposal} — the proposal echoed back so the caller can
 * pick up server-side fills (e.g. owner-on-first-save, lifecycle backfills).
 */
export function saveProposal(
  db: Database.Database,
  proposal: any,
  actor: Actor | null = null,
  renameFrom: string | null = null,
): { ok: true; name: string; proposal: any } {
  const name = (proposal?.name || '').trim();
  if (!name) throw new Error('proposal.name is required');

  ensureLifecycle(proposal, actor);
  const headers = extractHeaders(proposal);
  const payloadJson = JSON.stringify(proposal);

  const tx = db.transaction(() => {
    // Resolve the row we're saving onto: prefer renameFrom if provided.
    let row = renameFrom ? findByName(db, renameFrom) : findByName(db, name);
    if (!row) {
      // First save — INSERT proposal + version.
      const insP = db.prepare(`
        INSERT INTO proposal (
          name, status, rate_table,
          owner_email, owner_name,
          created_by_email, created_by_name,
          last_modified_by_email, last_modified_by_name, last_modified_at,
          sent_date, won_date, lost_date, lost_reason, lost_notes,
          follow_up_at, icore_project_id,
          client_name, client_contact, client_address, client_city_state_zip,
          project_address, project_city_state_zip, proposal_date,
          updated_at
        ) VALUES (
          ?, ?, ?,
          ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          datetime('now')
        )
      `);
      const result = insP.run(
        name, headers.status, headers.rate_table,
        headers.owner_email, headers.owner_name,
        actor?.email || null, actor?.name || null,
        actor?.email || null, actor?.name || null, utcNowIso(),
        headers.sent_date, headers.won_date, headers.lost_date,
        headers.lost_reason, headers.lost_notes,
        headers.follow_up_at, headers.icore_project_id,
        headers.client_name, headers.client_contact,
        headers.client_address, headers.client_city_state_zip,
        headers.project_address, headers.project_city_state_zip,
        headers.proposal_date,
      );
      const proposalId = Number(result.lastInsertRowid);

      const insV = db.prepare(`
        INSERT INTO proposal_version (
          proposal_id, version_label, status, payload_json,
          created_by_email, created_by_name
        ) VALUES (?, 'v1', 'draft', ?, ?, ?)
      `);
      const verRes = insV.run(proposalId, payloadJson, actor?.email || null, actor?.name || null);
      const versionId = Number(verRes.lastInsertRowid);

      db.prepare('UPDATE proposal SET current_version_id = ? WHERE id = ?')
        .run(versionId, proposalId);
    } else {
      // Existing — handle rename, then update headers + payload.
      if (renameFrom && renameFrom !== name) {
        // Reject if the new name collides with another proposal.
        const collision = findByName(db, name);
        if (collision && collision.id !== row.id) {
          throw new Error(`Cannot rename to "${name}": another proposal already has that name.`);
        }
      }
      db.prepare(`
        UPDATE proposal SET
          name = ?,
          status = ?, rate_table = ?,
          owner_email = ?, owner_name = ?,
          last_modified_by_email = ?, last_modified_by_name = ?, last_modified_at = ?,
          sent_date = ?, won_date = ?, lost_date = ?,
          lost_reason = ?, lost_notes = ?,
          follow_up_at = ?, icore_project_id = ?,
          client_name = ?, client_contact = ?,
          client_address = ?, client_city_state_zip = ?,
          project_address = ?, project_city_state_zip = ?,
          proposal_date = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        name,
        headers.status, headers.rate_table,
        headers.owner_email, headers.owner_name,
        actor?.email || null, actor?.name || null, utcNowIso(),
        headers.sent_date, headers.won_date, headers.lost_date,
        headers.lost_reason, headers.lost_notes,
        headers.follow_up_at, headers.icore_project_id,
        headers.client_name, headers.client_contact,
        headers.client_address, headers.client_city_state_zip,
        headers.project_address, headers.project_city_state_zip,
        headers.proposal_date,
        row.id,
      );

      if (row.current_version_id) {
        db.prepare(`
          UPDATE proposal_version SET
            payload_json = ?,
            last_modified_by_email = ?,
            last_modified_by_name = ?,
            last_modified_at = ?
          WHERE id = ?
        `).run(payloadJson, actor?.email || null, actor?.name || null, utcNowIso(), row.current_version_id);
      } else {
        // Old row missing its version (shouldn't happen post-fix). Create one.
        const insV = db.prepare(`
          INSERT INTO proposal_version (proposal_id, version_label, status, payload_json)
          VALUES (?, 'v1', 'draft', ?)
        `);
        const verRes = insV.run(row.id, payloadJson);
        db.prepare('UPDATE proposal SET current_version_id = ? WHERE id = ?')
          .run(Number(verRes.lastInsertRowid), row.id);
      }
    }
  });
  tx();

  return { ok: true, name, proposal };
}

/**
 * Delete a proposal. Mirrors QuickProp's projects.delete_project — gated by
 * canDelete unless `force` is set. Throws PermissionError-equivalent on
 * non-deletable proposals.
 */
export function deleteProposal(db: Database.Database, name: string, force = false): void {
  const row = findByName(db, name);
  if (!row) return; // already gone

  if (!force) {
    try {
      const proposal = loadProposal(db, name);
      if (!canDelete(proposal)) {
        const status = proposal.lifecycle?.status || 'draft';
        const msg = status !== 'draft'
          ? `Can't delete a ${status} proposal — its history is preserved. Only un-sent drafts are deletable.`
          : "Can't delete this proposal — it has prior lifecycle activity (it was sent at some point). Reopened drafts retain their history and aren't deletable.";
        throw new Error(msg);
      }
    } catch (e: any) {
      // If load failed (corrupt JSON), fall through and delete it as cleanup.
      if (e?.message?.startsWith("Can't delete")) throw e;
    }
  }

  // ON DELETE CASCADE handles proposal_version + activity + file rows.
  db.prepare('DELETE FROM proposal WHERE id = ?').run(row.id);
}

/**
 * Load every proposal as v3 — used by the dashboard. Malformed entries are
 * skipped with a console warning rather than crashing the dashboard.
 */
export function loadAllProposals(db: Database.Database): any[] {
  const out: any[] = [];
  for (const name of listProposals(db)) {
    try {
      out.push(loadProposal(db, name));
    } catch (e) {
      console.warn(`[quickquote] skipping unreadable proposal '${name}':`, e);
    }
  }
  return out;
}

// ── lifecycle mutate-and-save helper ────────────────────────────────────────

/**
 * Load → mutate via fn → save. Mirrors QuickProp's JsApi._mutate. Returns
 * the saved proposal. Used by every lifecycle.* function in main.ts.
 */
export function mutateAndSave(
  db: Database.Database,
  name: string,
  actor: Actor,
  fn: (proposal: any, actor: Actor) => void,
): any {
  const proposal = loadProposal(db, name);
  fn(proposal, actor);
  const saved = saveProposal(db, proposal, actor);
  return saved.proposal;
}

// ── client templates ────────────────────────────────────────────────────────

const CLIENT_TEMPLATE_FIELDS = ['client', 'contact', 'clientAddress', 'clientCityStateZip'] as const;

export function listClientTemplates(db: Database.Database, actorEmail: string): string[] {
  const owner = (actorEmail || '').toLowerCase();
  const rows = db.prepare(
    'SELECT name FROM client_template WHERE owner_email = ? ORDER BY name ASC',
  ).all(owner) as { name: string }[];
  return rows.map(r => r.name);
}

export function loadClientTemplate(db: Database.Database, actorEmail: string, name: string): any {
  const owner = (actorEmail || '').toLowerCase();
  const row = db.prepare(
    'SELECT name, client, contact, client_address, client_city_state_zip FROM client_template WHERE owner_email = ? AND name = ?',
  ).get(owner, name) as any;
  if (!row) throw new Error(`Client template not found: ${name}`);
  return {
    name: row.name,
    client:             row.client || '',
    contact:            row.contact || '',
    clientAddress:      row.client_address || '',
    clientCityStateZip: row.client_city_state_zip || '',
  };
}

export function saveClientTemplate(
  db: Database.Database,
  actorEmail: string,
  name: string,
  fields: any,
): { ok: true; name: string } {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('template name is required');
  const owner = (actorEmail || '').toLowerCase();
  const f = fields || {};
  db.prepare(`
    INSERT INTO client_template (owner_email, name, client, contact, client_address, client_city_state_zip)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_email, name) DO UPDATE SET
      client = excluded.client,
      contact = excluded.contact,
      client_address = excluded.client_address,
      client_city_state_zip = excluded.client_city_state_zip,
      updated_at = datetime('now')
  `).run(
    owner, trimmed,
    f.client || '', f.contact || '',
    f.clientAddress || '', f.clientCityStateZip || '',
  );
  return { ok: true, name: trimmed };
}

export function deleteClientTemplate(
  db: Database.Database,
  actorEmail: string,
  name: string,
): { ok: true } {
  const owner = (actorEmail || '').toLowerCase();
  db.prepare('DELETE FROM client_template WHERE owner_email = ? AND name = ?').run(owner, name);
  return { ok: true };
}

// ── project (scope) templates ───────────────────────────────────────────────

export function listProjectTemplates(db: Database.Database, actorEmail: string): string[] {
  const owner = (actorEmail || '').toLowerCase();
  const rows = db.prepare(
    'SELECT name FROM project_template WHERE owner_email = ? ORDER BY name ASC',
  ).all(owner) as { name: string }[];
  return rows.map(r => r.name);
}

export function loadProjectTemplate(db: Database.Database, actorEmail: string, name: string): any {
  const owner = (actorEmail || '').toLowerCase();
  const row = db.prepare(
    'SELECT name, sections_json FROM project_template WHERE owner_email = ? AND name = ?',
  ).get(owner, name) as { name: string; sections_json: string } | undefined;
  if (!row) throw new Error(`Project template not found: ${name}`);
  let sections: Array<{ title: string; scope: string }>;
  try {
    const parsed = JSON.parse(row.sections_json);
    sections = Array.isArray(parsed)
      ? parsed.map((s: any) => ({ title: String(s?.title || ''), scope: String(s?.scope || '') }))
      : [];
  } catch {
    sections = [];
  }
  if (sections.length === 0) sections = [{ title: '', scope: '' }];
  return { name: row.name, sections };
}

export function saveProjectTemplate(
  db: Database.Database,
  actorEmail: string,
  name: string,
  sections: any[],
): { ok: true; name: string } {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('template name is required');
  const pairs = (sections || [])
    .filter((s: any) => s && typeof s === 'object')
    .map((s: any) => ({ title: String(s.title || ''), scope: String(s.scope || '') }));
  if (pairs.length === 0) throw new Error('at least one bid item is required to save a template');
  const owner = (actorEmail || '').toLowerCase();
  db.prepare(`
    INSERT INTO project_template (owner_email, name, sections_json)
    VALUES (?, ?, ?)
    ON CONFLICT(owner_email, name) DO UPDATE SET
      sections_json = excluded.sections_json,
      updated_at = datetime('now')
  `).run(owner, trimmed, JSON.stringify(pairs));
  return { ok: true, name: trimmed };
}

export function deleteProjectTemplate(
  db: Database.Database,
  actorEmail: string,
  name: string,
): { ok: true } {
  const owner = (actorEmail || '').toLowerCase();
  db.prepare('DELETE FROM project_template WHERE owner_email = ? AND name = ?').run(owner, name);
  return { ok: true };
}

// ── lookup-table reads (for getBootstrap) ───────────────────────────────────

const AVATAR_PALETTE = [
  '#17416F', '#5A7CA8', '#7A6A52', '#2F6B5A', '#8A5A7A', '#8A5A2A',
  '#4A6A8A', '#3F5A7A', '#5A8A7A', '#7A4A5A', '#4A7A8A', '#6A4A8A',
  '#8A7A4A', '#4A8A6A', '#7A8A4A', '#8A4A7A', '#4A5A8A', '#8A6A4A',
  '#6A8A4A', '#5A4A8A', '#4A8A8A', '#8A5A4A', '#4A8A5A', '#8A4A5A',
  '#5A7A4A', '#7A5A4A', '#4A7A5A', '#7A4A8A', '#5A8A4A', '#8A4A4A',
  '#4A4A8A', '#8A7A7A',
];

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(name: string): string {
  const h = createHash('md5').update(name, 'utf-8').digest('hex');
  const idx = parseInt(h, 16) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx];
}

interface BootstrapInput {
  identity: any | null;
}

const LOST_REASONS_OPTIONS = [
  { value: 'price',          label: 'Price' },
  { value: 'scope_mismatch', label: 'Scope / Offering Mismatch' },
  { value: 'timing',         label: 'Timing' },
  { value: 'competitor',     label: 'Competitor' },
  { value: 'no_decision',    label: 'No Decision' },
];

/**
 * One-shot bootstrap composite. Mirrors QuickProp's JsApi.get_bootstrap —
 * everything the renderer needs to render its first frame, in one call.
 *
 * `identity` is loaded by the caller (electron/identity/identity.ts) since
 * it depends on the userData path which is only available from main.
 */
export function getBootstrap(db: Database.Database, input: BootstrapInput): any {
  const employees = (db.prepare('SELECT name, category FROM employee WHERE active = 1 ORDER BY name ASC').all() as { name: string; category: string }[])
    .map((e) => {
      const mapping = db.prepare(
        'SELECT rate_key FROM category_mapping WHERE employee_category = ?',
      ).get(e.category) as { rate_key: string } | undefined;
      const rateKey = mapping?.rate_key || '';
      const rate = (rateKey
        ? (db.prepare(
            "SELECT price FROM rate_entry WHERE rate_key = ? AND rate_table = 'consulting' LIMIT 1",
          ).get(rateKey) as { price: number } | undefined)?.price ??
          (db.prepare(
            "SELECT price FROM rate_entry WHERE rate_key = ? AND rate_table = 'structural' LIMIT 1",
          ).get(rateKey) as { price: number } | undefined)?.price ?? 0
        : 0);
      return {
        name: e.name,
        category: e.category,
        rate,
        initials: initials(e.name),
        color: colorFor(e.name),
      };
    });

  const ratesFor = (table: string): Record<string, number> => {
    const rows = db.prepare(
      'SELECT rate_key, price FROM rate_entry WHERE rate_table = ?',
    ).all(table) as { rate_key: string; price: number }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.rate_key] = r.price;
    return out;
  };

  const consulting_rates = ratesFor('consulting');
  const structural_rates = ratesFor('structural');

  const category_mapping: Record<string, string> = {};
  for (const r of db.prepare('SELECT employee_category, rate_key FROM category_mapping').all() as { employee_category: string; rate_key: string }[]) {
    category_mapping[r.employee_category] = r.rate_key;
  }

  // Distinct rate categories across both tables, in insertion order
  // (consulting first, then any structural-only entries — matches QuickProp).
  const rate_categories: string[] = [];
  for (const k of Object.keys(consulting_rates)) rate_categories.push(k);
  for (const k of Object.keys(structural_rates)) {
    if (!rate_categories.includes(k)) rate_categories.push(k);
  }

  const expense_lines = (db.prepare(
    'SELECT display_name, qty_unit, default_rate, rate_unit FROM expense_line ORDER BY sort_order ASC, id ASC',
  ).all() as { display_name: string; qty_unit: string; default_rate: number; rate_unit: string }[])
    .map((e) => ({
      name: e.display_name,
      qty_unit: e.qty_unit,
      default_rate: e.default_rate,
      rate_unit: e.rate_unit,
    }));

  const allowed_users = (db.prepare(
    'SELECT email, name, credentials, title, signer_name, role FROM allowed_user WHERE active = 1 ORDER BY name ASC',
  ).all() as any[]).map((u) => ({
    email: u.email,
    name: u.name,
    credentials: u.credentials || '',
    title: u.title || '',
    signer_name: u.signer_name || (u.credentials ? `${u.name}, ${u.credentials}` : u.name),
    role: u.role || 'pm',
  }));

  const actorEmail = input.identity?.email || '';

  return {
    app_version: '1.0.0',
    employees,
    consulting_rates,
    structural_rates,
    category_mapping,
    rate_categories,
    expense_lines,
    projects: listProposals(db),
    identity: input.identity,
    allowed_users,
    statuses: ['draft', 'sent', 'won', 'lost', 'archived'] as ProposalStatus[],
    lost_reasons: LOST_REASONS_OPTIONS,
    client_templates: actorEmail ? listClientTemplates(db, actorEmail) : [],
    project_templates: actorEmail ? listProjectTemplates(db, actorEmail) : [],
  };
}
