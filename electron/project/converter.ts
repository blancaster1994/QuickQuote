// Section → Phase converter.
//
// Runs at Send time (LIFECYCLE_SEND_AND_INITIALIZE) to materialize the
// project's phases from the proposal's sections / bid items. The proposal's
// sections become phases 1:1; their labor and tasks split into the phase's
// `labor[]` (category × hours, cost budget) and `tasks[]` (name-only work
// items for iCore / ClickUp tracking).
//
// Field mapping:
//   Section.title    → Phase.name
//   Section.scope    → Phase.scope_text
//   Section.billing  → Phase.project_type ('fixed' → 'FF', 'tm' → 'T&M')
//   Section.fee      → Phase.target_budget (frozen contract reference)
//   Section.labor[]  → Phase.labor[]      (LaborRow → ProjectLabor)
//   Section.tasks[]  → Phase.tasks[]      (SectionTask → ProjectTask, name only)
//   Section.expenses[] → Phase.expenses[] (ExpenseRow → ProjectExpense)

import type {
  ProjectExpense, ProjectLabor, ProjectPhase, ProjectTask,
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

interface SectionTask {
  id: string;
  name: string;
  sort_order: number;
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
  tasks?: SectionTask[];
}

/** Convert a proposal's sections into project phases. Phase numbering
 *  starts at 1; rate_table defaults to '' (header rate_table fills in
 *  later if the user picks an override at Send time). */
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
    billing_type: s.billing,
    notes: s.notes || '',
    target_budget: typeof s.fee === 'number' ? s.fee : null,
    labor:    (s.labor    || []).map(laborToProjectLabor),
    tasks:    [...(s.tasks ?? [])]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(sectionTaskToProjectTask),
    expenses: (s.expenses || []).map(expenseToProjectExpense),
  }));
}

function billingToProjectType(b: Section['billing']): ProjectPhase['project_type'] {
  return b === 'tm' ? 'T&M' : 'FF';
}

function laborToProjectLabor(row: LaborRow, idx: number): ProjectLabor {
  return {
    labor_no: idx + 1,
    category: row.category || '',
    hours: Number(row.hrs) || 0,
    employee: row.employee || null,
    rate_override: typeof row.rate === 'number' && row.rate > 0 ? row.rate : null,
    rate_baseline: null,
    rate_override_by_email: null,
    rate_override_by_name: null,
    rate_override_at: null,
  };
}

function sectionTaskToProjectTask(t: SectionTask, idx: number): ProjectTask {
  return {
    task_no: idx + 1,
    name: t.name || `Task ${idx + 1}`,
  };
}

function expenseToProjectExpense(row: ExpenseRow): ProjectExpense {
  return {
    description: row.item || '',
    category:    '',
    quantity:    Number(row.qty) || 0,
    amount:      Number(row.unitCost) || 0,
    markup_pct:  Number(row.markup) || 0,
  };
}
