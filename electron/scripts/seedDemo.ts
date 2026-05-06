// One-shot demo data seeder.
//
// Run via `npm run seed:demo` while the QuickQuote app is closed (DB lock).
// Inserts ~15 demo proposals across draft / sent / won / lost, attaches full
// project payloads (phases + tasks + resources) to the Won ones, and removes
// duplicate "New Proposed Residence (N)" entries while preserving the bare
// original and any "PCU support"-style projects.
//
// Idempotent: every demo proposal is tagged with iCore_project_id starting
// with DEMO_ICORE_PREFIX, so re-running skips entries it already created.

import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import BetterSqlite3 from 'better-sqlite3';
import { migrate } from '../db/schema';
import {
  seedIfEmpty, seedLookupsIfEmpty, seedTemplatesIfMissing,
  resolveSeedPath, resolveLookupsSeedPath,
} from '../db/seed';
import * as Q from '../db/queries';
import * as Project from '../project/queries';
import * as Lookups from '../db/lookups';
import * as activity from '../lifecycle/activity';
import * as identity from '../identity/identity';
import {
  DEMO_PROPOSALS, DEMO_ICORE_PREFIX,
  type DemoProposal, type ResourceTemplate, type ResourceStatus,
} from './demoData';

// ── time helpers ────────────────────────────────────────────────────────────

function utcNowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function todayDateOnly(): string {
  return dateOnly(utcNowIso());
}

function dateOnlyDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── employee pool (for round-robin assignment) ──────────────────────────────

interface EmployeeRow { id: number; name: string; category: string }

class EmployeePool {
  private byCategory = new Map<string, string[]>();
  private cursors = new Map<string, number>();
  private allNames: string[] = [];
  private fallbackCursor = 0;

  constructor(rows: EmployeeRow[]) {
    for (const r of rows) {
      const cat = (r.category || '').trim();
      if (!cat) continue;
      if (!this.byCategory.has(cat)) this.byCategory.set(cat, []);
      this.byCategory.get(cat)!.push(r.name);
      this.allNames.push(r.name);
    }
  }

  pick(category: string): string {
    const pool = this.byCategory.get(category);
    if (pool && pool.length > 0) {
      const idx = (this.cursors.get(category) ?? 0) % pool.length;
      this.cursors.set(category, idx + 1);
      return pool[idx];
    }
    // No exact match — round-robin through all employees so demo data has at
    // least a real name attached. The category is still recorded on the task.
    if (this.allNames.length === 0) return 'Unassigned';
    const name = this.allNames[this.fallbackCursor % this.allNames.length];
    this.fallbackCursor++;
    return name;
  }

  size(): number { return this.allNames.length; }
}

// ── rate cache ──────────────────────────────────────────────────────────────

class RateCache {
  private cache = new Map<string, number>();
  constructor(
    private db: BetterSqlite3.Database,
    private legalEntity: string,
    private rateTable: string,
  ) {}

  rateFor(category: string): number {
    const key = `${this.legalEntity}|${this.rateTable}|${category}`;
    const cached = this.cache.get(key);
    if (cached != null) return cached;
    let price = Lookups.lookupRate(this.db, this.legalEntity, this.rateTable, category, null);
    if (price == null) price = FALLBACK_RATES[category] ?? 150;
    this.cache.set(key, price);
    return price;
  }
}

// Last-resort fallback rates if both v2 lookup and v1 mapping miss. Used only
// when the demo's rate categories don't exist in the user's DB at all.
const FALLBACK_RATES: Record<string, number> = {
  'Principal':            350,
  'Engineer V':           210,
  'Senior Engineer V':    210,
  'Engineer IV':          195,
  'Engineer III':         185,
  'Engineer II':          165,
  'Engineer I':           145,
  'EIT IV':               140,
  'EIT III':              130,
  'EIT II':               120,
  'EIT I':                110,
  'CAD Tech VI':          145,
  'CAD Tech V':           135,
  'CAD Tech IV':          125,
  'CAD Tech III':         115,
  'CAD Tech II':          105,
  'CAD Tech I':            95,
  'Senior Consultant V':  200,
  'Lead Consultant III':  160,
  'Inspector V':          160,
  'Inspector IV':         150,
  'Inspector III':        140,
  'Inspector II':         130,
  'Inspector I':          120,
  'Clerical':              85,
};

// ── proposal construction ───────────────────────────────────────────────────

function buildSections(def: DemoProposal): any[] {
  return def.sections.map((s, i) => ({
    id:          `s_${i + 1}_${Math.random().toString(36).slice(2, 8)}`,
    title:       s.title,
    scope:       s.scope,
    exclusions:  '',
    billing:     'fixed' as const,
    fee:         s.fee,
    notes:       '',
    labor:       [] as any[],
    expenses:    [] as any[],
  }));
}

function buildProposal(def: DemoProposal, icoreId: string): any {
  return {
    date:               dateOnlyDaysFromNow(-def.proposalAgeDays),
    name:               def.name,
    address:            def.projectAddress,
    cityStateZip:       def.projectCityStateZip,
    client:             def.client,
    contact:            def.contact,
    clientAddress:      def.clientAddress,
    clientCityStateZip: def.clientCityStateZip,
    rateTable:          def.rateTable,
    sections:           buildSections(def),
    // ensureLifecycle (called by saveProposal) backfills the rest. We pre-tag
    // the iCore id so it's persisted on the very first INSERT, which is what
    // our idempotency check reads.
    lifecycle: {
      status: 'draft',
      owner:  { email: '', name: '' },
      collaborators: [],
      activity: [],
      versions: [],
      last_generations: {},
      metadata: {
        created_at:       isoDaysAgo(def.proposalAgeDays),
        sent_date:        null,
        won_date:         null,
        lost_date:        null,
        lost_reason:      null,
        lost_notes:       null,
        iCore_project_id: icoreId,
        follow_up_at:     null,
      },
    },
  };
}

// ── lifecycle backdating ────────────────────────────────────────────────────
//
// activity.markSent / markWon / markLost stamp `now` for the metadata date
// and the activity entry's timestamp. For demo realism (so the dashboard's
// stale-followup logic and won-pipeline charts have plausible spread), we
// override those timestamps after the mutation.

function backdateLastActivity(proposal: any, isoTimestamp: string): void {
  const lc = proposal?.lifecycle;
  if (!lc?.activity?.length) return;
  lc.activity[lc.activity.length - 1].timestamp = isoTimestamp;
}

// ── project payload construction ────────────────────────────────────────────

function buildProjectPayload(
  def: DemoProposal,
  pool: EmployeePool,
  db: BetterSqlite3.Database,
): { phases: Project.ProjectPhase[]; resources: Project.ResourceAssignment[] } {
  const won = def.won;
  if (!won) throw new Error(`Demo "${def.name}" missing 'won' spec`);

  const rates = new RateCache(db, won.legalEntity, won.rateTable);

  const phases: Project.ProjectPhase[] = [];
  const resources: Project.ResourceAssignment[] = [];

  won.phases.forEach((phaseDef, phaseIdx) => {
    const phaseNo = phaseIdx + 1;
    const tasks: Project.ProjectTask[] = [];

    phaseDef.tasks.forEach((taskDef, taskIdx) => {
      const taskNo = taskIdx + 1;
      // Sum hours from this task's resources for the task header. The
      // renderer recomputes amounts from resources, so the displayed dollar
      // value comes out of the resource rows; this hours number is just for
      // the task header column.
      const taskHours = taskDef.resources.reduce((acc, r) => acc + r.hours, 0);
      tasks.push({
        task_no:  taskNo,
        name:     taskDef.name,
        category: taskDef.category,
        hours:    taskHours,
      });

      taskDef.resources.forEach((r: ResourceTemplate) => {
        const rate = rates.rateFor(r.category);
        const resourceName = pool.pick(r.category);
        resources.push({
          phase_no:        phaseNo,
          task_no:         taskNo,
          resource_name:   resourceName,
          hours:           r.hours,
          bill_rate:       rate,
          scheduled_start: r.scheduledOffsetDays == null ? null : dateOnlyDaysFromNow(r.scheduledOffsetDays),
          status:          r.status,
          comments:        r.comments ?? null,
        });
      });
    });

    phases.push({
      phase_no:      phaseNo,
      name:          phaseDef.name,
      rate_table:    phaseDef.rateTable,
      project_type:  phaseDef.projectType,
      due_date:      dateOnlyDaysFromNow(phaseDef.dueOffsetDays),
      scope_text:    phaseDef.scope,
      target_budget: phaseDef.targetBudget,
      tasks,
      expenses:      [],
    });
  });

  return { phases, resources };
}

// ── dedup pass ──────────────────────────────────────────────────────────────

const ORIGINAL_NAME = 'New Proposed Residence';
// Matches "New Proposed Residence (1)", "New Proposed Residence (12)", etc.
const DUPE_PATTERN = /^New Proposed Residence \((\d+)\)\s*$/;

interface DedupResult {
  originalKept: boolean;
  deletedNames: string[];
  candidatesIfNoOriginal: string[];
}

function dedupNewProposedResidence(db: BetterSqlite3.Database): DedupResult {
  const allNames = Q.listProposals(db);
  const original = allNames.find(n => n === ORIGINAL_NAME);
  const dupes = allNames.filter(n => DUPE_PATTERN.test(n));

  if (!original) {
    return {
      originalKept: false,
      deletedNames: [],
      candidatesIfNoOriginal: dupes,
    };
  }

  const deleted: string[] = [];
  for (const name of dupes) {
    Q.deleteProposal(db, name, /* force */ true);
    deleted.push(name);
  }

  return { originalKept: true, deletedNames: deleted, candidatesIfNoOriginal: [] };
}

// ── actor resolution ────────────────────────────────────────────────────────

function resolveActor(db: BetterSqlite3.Database): { email: string; name: string } {
  const ident = identity.loadIdentity(db);
  if (ident) return { email: ident.email, name: ident.name };

  // Fall back to the first admin in allowed_user. If somehow there's none,
  // synthesize a demo actor — the proposals will still be valid, just owned
  // by an entry that isn't in allowed_user.
  const row = db.prepare(
    "SELECT email, name FROM allowed_user WHERE active = 1 AND role = 'admin' ORDER BY name LIMIT 1",
  ).get() as { email: string; name: string } | undefined;
  if (row) return { email: row.email, name: row.name };

  return { email: 'demo-seed@quickquote.local', name: 'Demo Seed' };
}

// ── existing-proposal check ─────────────────────────────────────────────────

interface ExistingCheck { exists: boolean; isDemo: boolean }

function checkExisting(db: BetterSqlite3.Database, name: string): ExistingCheck {
  const row = db.prepare('SELECT icore_project_id FROM proposal WHERE name = ?').get(name) as
    { icore_project_id: string | null } | undefined;
  if (!row) return { exists: false, isDemo: false };
  const tag = row.icore_project_id || '';
  return { exists: true, isDemo: tag.startsWith(DEMO_ICORE_PREFIX) };
}

// ── per-proposal seeding ────────────────────────────────────────────────────

function seedOne(
  db: BetterSqlite3.Database,
  def: DemoProposal,
  index: number,
  actor: { email: string; name: string },
  pool: EmployeePool,
): { status: 'inserted' | 'skipped-demo' | 'skipped-collision'; note?: string } {
  const existing = checkExisting(db, def.name);
  if (existing.exists && existing.isDemo) {
    return { status: 'skipped-demo' };
  }
  if (existing.exists) {
    return { status: 'skipped-collision', note: 'name collides with non-demo proposal' };
  }

  const icoreId = `${DEMO_ICORE_PREFIX}${String(1000 + index).padStart(4, '0')}`;
  const proposal = buildProposal(def, icoreId);

  // 1. Initial save (status: draft)
  Q.saveProposal(db, proposal, actor);

  if (def.targetStatus === 'draft') {
    return { status: 'inserted', note: 'draft' };
  }

  // 2. markSent — required intermediate state for sent/won/lost
  const sentAge = def.sentAgeDays ?? Math.max(1, def.proposalAgeDays - 1);
  const sentIso = isoDaysAgo(sentAge);
  {
    const p = Q.loadProposal(db, def.name);
    activity.markSent(p, actor, '');
    p.lifecycle.metadata.sent_date = sentIso;
    backdateLastActivity(p, sentIso);
    Q.saveProposal(db, p, actor);
  }

  if (def.targetStatus === 'sent') {
    return { status: 'inserted', note: `sent ${sentAge}d ago` };
  }

  if (def.targetStatus === 'won') {
    const wonAge = Math.max(0, sentAge - 5);
    const wonIso = isoDaysAgo(wonAge);
    {
      const p = Q.loadProposal(db, def.name);
      activity.markWon(p, actor, '', icoreId);
      p.lifecycle.metadata.won_date = wonIso;
      backdateLastActivity(p, wonIso);
      Q.saveProposal(db, p, actor);
    }

    // 3. Initialize the project record with phases, tasks, resources
    const payload = buildProjectPayload(def, pool, db);
    Project.initializeProject(
      db,
      def.name,
      {
        legal_entity:    def.won!.legalEntity,
        department:      def.won!.department,
        rate_table:      def.won!.rateTable,
        project_type:    def.won!.projectType,
        icore_project_id: icoreId,
        current_pm_email: actor.email,
        current_pm_name:  actor.name,
      },
      payload,
      actor,
    );
    return { status: 'inserted', note: `won ${wonAge}d ago, ${payload.phases.length} phases / ${payload.resources.length} resources` };
  }

  if (def.targetStatus === 'lost') {
    const lostAge = Math.max(0, sentAge - 7);
    const lostIso = isoDaysAgo(lostAge);
    {
      const p = Q.loadProposal(db, def.name);
      activity.markLost(p, actor, def.lostReason!, def.lostNotes ?? '');
      p.lifecycle.metadata.lost_date = lostIso;
      backdateLastActivity(p, lostIso);
      Q.saveProposal(db, p, actor);
    }
    return { status: 'inserted', note: `lost ${lostAge}d ago — ${def.lostReason}` };
  }

  return { status: 'inserted' };
}

// ── orchestrator ────────────────────────────────────────────────────────────

// Pin the app name so app.getPath('userData') resolves to the SAME folder the
// running QuickQuote app uses (%APPDATA%\QuickQuote\), not Electron's default
// %APPDATA%\Electron\ that would otherwise apply when this script is launched
// as a bare entry point with no package.json adjacency. Must be set before
// app.whenReady() resolves.
app.setName('QuickQuote');

// Project root, derived from this compiled file's location:
//   <root>/dist-electron/scripts/seedDemo.js  →  __dirname/../..
// Used in place of app.getAppPath() since launching electron with a direct
// file path leaves getAppPath() pointing at the script's directory.
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

async function main(): Promise<number> {
  await app.whenReady();

  const dbDir = app.getPath('userData');
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'quickquote.db');

  console.log(`[seed-demo] DB: ${dbPath}`);
  if (!fs.existsSync(dbPath)) {
    console.warn('[seed-demo] DB file does not exist yet — it will be created with full schema and seeded.');
  }

  let db: BetterSqlite3.Database;
  try {
    db = new BetterSqlite3(dbPath);
  } catch (err: any) {
    if (String(err?.message || '').includes('SQLITE_BUSY')) {
      console.error('[seed-demo] DB is locked — close the QuickQuote app first, then re-run.');
    } else {
      console.error('[seed-demo] failed to open DB:', err);
    }
    return 1;
  }

  try {
    migrate(db);
    seedIfEmpty(db, resolveSeedPath(PROJECT_ROOT));
    seedLookupsIfEmpty(db, resolveLookupsSeedPath(PROJECT_ROOT));
    seedTemplatesIfMissing(db, PROJECT_ROOT);

    // 1. Dedup
    const dedup = dedupNewProposedResidence(db);
    if (!dedup.originalKept) {
      if (dedup.candidatesIfNoOriginal.length > 0) {
        console.error(
          `[seed-demo] ABORT: no proposal named exactly "${ORIGINAL_NAME}" exists, but ` +
          `${dedup.candidatesIfNoOriginal.length} suffixed copies do:\n  - ` +
          dedup.candidatesIfNoOriginal.join('\n  - ') +
          '\nRename one of the suffixed copies to "New Proposed Residence" first, then re-run.',
        );
        return 2;
      } else {
        console.log('[seed-demo] No "New Proposed Residence" entries found at all — skipping dedup.');
      }
    } else if (dedup.deletedNames.length > 0) {
      console.log(`[seed-demo] dedup: kept "${ORIGINAL_NAME}", deleted ${dedup.deletedNames.length} duplicate(s):`);
      for (const n of dedup.deletedNames) console.log(`    - ${n}`);
    } else {
      console.log(`[seed-demo] dedup: kept "${ORIGINAL_NAME}" (no duplicates to remove).`);
    }

    // 2. Actor + employee pool
    const actor = resolveActor(db);
    console.log(`[seed-demo] actor: ${actor.name} <${actor.email}>`);

    const employees = db.prepare(
      'SELECT id, name, category FROM employee WHERE active = 1',
    ).all() as EmployeeRow[];
    const pool = new EmployeePool(employees);
    console.log(`[seed-demo] employee pool: ${pool.size()} active employees`);

    // 3. Insert demo proposals
    let inserted = 0, skippedDemo = 0, skippedCollision = 0, won = 0;
    DEMO_PROPOSALS.forEach((def, i) => {
      try {
        const result = seedOne(db, def, i, actor, pool);
        if (result.status === 'inserted') {
          inserted++;
          if (def.targetStatus === 'won') won++;
          console.log(`    ✓ ${def.name}${result.note ? ` — ${result.note}` : ''}`);
        } else if (result.status === 'skipped-demo') {
          skippedDemo++;
          console.log(`    · ${def.name} (already seeded)`);
        } else {
          skippedCollision++;
          console.log(`    ! ${def.name} (${result.note})`);
        }
      } catch (err: any) {
        console.error(`    ✗ ${def.name}: ${err?.message || err}`);
      }
    });

    console.log(
      `\n[seed-demo] done. inserted=${inserted} (won projects=${won}) ` +
      `skipped-demo=${skippedDemo} skipped-collision=${skippedCollision}`,
    );
    return 0;
  } finally {
    try { db.close(); } catch { /* best effort */ }
  }
}

main()
  .then((code) => app.exit(code))
  .catch((err) => {
    console.error('[seed-demo] FAILED:', err);
    app.exit(1);
  });
