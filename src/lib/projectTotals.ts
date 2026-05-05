// Project-side rollups: Allocated $ from resources, per-task amount, and the
// Budgeted-vs-Allocated comparison surfaced in the project header card.
//
// Pairs with src/lib/calc.ts which owns the proposal (Budgeted) side.

import type { Project, ResourceAssignment } from '../types/domain';

/** Total allocated $ across the entire project — Σ resource hrs × bill_rate.
 *  Tasks no longer carry their own hours/rate; resources are the single
 *  source of truth (see Issue 2 in the design workshop). */
export function computeProjectAllocated(project: Project): number {
  let sum = 0;
  for (const r of project.payload.resources) {
    sum += (Number(r.hours) || 0) * (Number(r.bill_rate) || 0);
  }
  return sum;
}

/** Allocated $ for a single phase. */
export function computePhaseAllocated(
  resources: ResourceAssignment[],
  phase_no: number,
): number {
  let sum = 0;
  for (const r of resources) {
    if (r.phase_no !== phase_no) continue;
    sum += (Number(r.hours) || 0) * (Number(r.bill_rate) || 0);
  }
  return sum;
}

/** Allocated $ for a single task within a phase. Used in the redesigned task
 *  table where the Amount column is derived from assigned resources rather
 *  than a per-task hours×rate input. */
export function computeTaskAmount(
  resources: ResourceAssignment[],
  phase_no: number,
  task_no: number,
): number {
  let sum = 0;
  for (const r of resources) {
    if (r.phase_no !== phase_no) continue;
    if (r.task_no !== task_no) continue;
    sum += (Number(r.hours) || 0) * (Number(r.bill_rate) || 0);
  }
  return sum;
}
