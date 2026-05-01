// Pure section / proposal fee math — instant local computation for the live
// preview. Mirrors quickprop.calc on the Python side; Python is authoritative
// at save and generate time.

import type { Proposal, Section } from '../types/domain';

export interface SectionTotals {
  labor: number;
  expenses: number;
  grand: number;
}

export function calcSection(s: Section): SectionTotals {
  const labor = (s.labor || []).reduce(
    (a, r) => a + (+r.hrs || 0) * (+r.rate || 0),
    0,
  );
  const expenses = (s.expenses || []).reduce(
    (a, e) => a + (+e.qty || 0) * (+e.unitCost || 0) * (1 + (+e.markup || 0) / 100),
    0,
  );
  return { labor, expenses, grand: labor + expenses };
}

export interface SectionTotalsRow extends SectionTotals {
  id: string;
  fee: number;
}

export interface ProposalTotals {
  totals: SectionTotalsRow[];
  /** Sum of `fee` across sections (NOT the calculated grand — what the
   *  document quotes is the user-entered fee per section). */
  sum: number;
}

export function calcProposal(p: Proposal): ProposalTotals {
  const totals: SectionTotalsRow[] = (p.sections || []).map((s) => ({
    id: s.id,
    fee: +s.fee || 0,
    ...calcSection(s),
  }));
  const sum = totals.reduce((a, t) => a + t.fee, 0);
  return { totals, sum };
}
