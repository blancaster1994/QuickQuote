// Section → Phase converter and phase-template applier.
//
// Used by InitializeProjectModal at Mark-Won time to seed the new project's
// phases array from the proposal's existing sections, and to optionally
// overlay or replace those phases with a chosen phase template.
//
// Field mapping (Architecture decision #2 in the master plan):
//   Section.title    → Phase.name
//   Section.scope    → Phase.scope_text
//   Section.billing  → Phase.project_type ('fixed' → 'FF', 'tm' → 'T&M')
//   Section.fee      → Phase.target_budget (frozen contract reference)
//   Section.labor[]  → Phase.tasks[]      (LaborRow → ProjectTask)
//   Section.expenses[] → Phase.expenses[] (ExpenseRow → ProjectExpense)
//
// The renderer's existing v3 EditorState shape stays untouched; converter
// runs at the boundary so the proposal blob and the project payload can
// evolve independently afterward.

// Re-uses the project types from queries.ts (locally defined to satisfy
// electron tsconfig's rootDir restriction). Section/LaborRow/ExpenseRow
// shapes are mirrored here verbatim from src/types/domain.ts — kept in
// lock-step with the renderer.
import type {
  ProjectExpense, ProjectPhase, ProjectTask,
} from './queries';

type BillingType = 'fixed' | 'tm';

interface LaborRow {
  category: string;
  employee: string;
  hrs: number;
  rate: number;
}

interface ExpenseRow {
  item: string;
  qty: number;
  unit: string;
  unitCost: number;
  markup: number;
}

interface Section {
  id: string;
  title: string;
  scope: string;
  billing: BillingType;
  fee: number;
  notes: string;
  labor: LaborRow[];
  expenses: ExpenseRow[];
}

/** Subset of TemplatePhase used by the converter. The full row also has
 *  legal_entity / department / template fields used by the IPC layer; this
 *  module only needs the phase fields. */
export interface TemplatePhase {
  id: number;
  legal_entity: string;
  department: string;
  template: string;
  phase_name: string;
  rate_table: string;
  sort_order: number;
}

/** Convert a proposal's sections into project phases. The phase numbering
 *  starts at 1; rate_table defaults to '' (header rate_table fills in later
 *  if the user picks one in the modal). */
export function sectionsToPhases(
  sections: Section[],
  defaultRateTable = '',
): ProjectPhase[] {
  return sections.map((s, idx): ProjectPhase => ({
    phase_no: idx + 1,
    name:     s.title || `Phase ${idx + 1}`,
    rate_table: defaultRateTable,
    project_type: billingToProjectType(s.billing),
    due_date: null,
    scope_text: s.scope || '',
    billing_type: s.billing,                   // back-compat — old code reads this
    notes: s.notes || '',
    target_budget: typeof s.fee === 'number' ? s.fee : null,
    tasks:    (s.labor    || []).map(laborToTask),
    expenses: (s.expenses || []).map(expenseToProjectExpense),
  }));
}

function billingToProjectType(b: Section['billing']): ProjectPhase['project_type'] {
  return b === 'tm' ? 'T&M' : 'FF';
}

function laborToTask(row: LaborRow, idx: number): ProjectTask {
  return {
    task_no: idx + 1,
    // LaborRow has no separate task name — category doubles as the label.
    name:     row.category || `Task ${idx + 1}`,
    category: row.category || '',
    hours:    Number(row.hrs) || 0,
    rate_override: typeof row.rate === 'number' && row.rate > 0 ? row.rate : null,
    rate_baseline: null,                       // filled in Stage 5 when the
                                               // resource cell looks up the
                                               // rate map
  };
}

function expenseToProjectExpense(row: ExpenseRow): ProjectExpense {
  return {
    description: row.item || '',
    category:    '',                           // ExpenseRow has no category;
                                               // user fills later in project
                                               // editor
    quantity:    Number(row.qty) || 0,
    amount:      Number(row.unitCost) || 0,
    markup_pct:  Number(row.markup) || 0,
  };
}

/** Apply a phase template (rows from `template_phase`) to an existing list
 *  of phases.
 *
 *  - mode='replace' : drop the auto-converted phases, use the template's
 *    phases verbatim. The user's per-section scope and labor are gone.
 *  - mode='append'  : keep the auto-converted phases, append the template's
 *    phases at the end (renumbered). Useful when the template represents
 *    a "post-deliverable" set of phases like internal review / closeout.
 *
 *  defaultRateTable substitutes whenever a template row's rate_table is
 *  empty — without it, those phases ship with rate_table='' and the
 *  resource-allocation lookup misses every category. */
export function applyPhaseTemplate(
  phases: ProjectPhase[],
  template: TemplatePhase[],
  mode: 'append' | 'replace',
  defaultRateTable = '',
): ProjectPhase[] {
  const tplPhases: ProjectPhase[] = [...template]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t, idx): ProjectPhase => ({
      phase_no: idx + 1,
      name:     t.phase_name,
      rate_table: t.rate_table || defaultRateTable,
      project_type: 'FF',                      // template rows don't carry
                                               // billing type; default FF
                                               // (user can flip per-phase
                                               // in the editor)
      due_date: null,
      scope_text: '',
      tasks: [],
      expenses: [],
      target_budget: null,
    }));

  if (mode === 'replace' || phases.length === 0) {
    return renumber(tplPhases);
  }
  // append
  return renumber([...phases, ...tplPhases]);
}

function renumber(phases: ProjectPhase[]): ProjectPhase[] {
  return phases.map((p, idx) => ({ ...p, phase_no: idx + 1 }));
}
