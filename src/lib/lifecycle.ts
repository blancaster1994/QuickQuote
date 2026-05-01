// Lifecycle constants + small helpers. Mirrors QuickProp's
// quickprop/activity.py constants and the JS-side helpers in
// QuickProp/ui/state/store.js.

import type { LostReason, LostReasonOption, Proposal, ProposalStatus } from '../types/domain';

export const STATUSES: readonly ProposalStatus[] = [
  'draft', 'sent', 'won', 'lost', 'archived',
] as const;

/** Statuses that require a version-snapshot prompt before further edits. */
export const FROZEN_STATUSES: readonly ProposalStatus[] = ['sent', 'won', 'lost'] as const;

/** Statuses you can't progress out of without explicit reopen/archive. */
export const TERMINAL_STATUSES: readonly ProposalStatus[] = ['won', 'lost', 'archived'] as const;

export const LOST_REASONS: readonly LostReasonOption[] = [
  { value: 'price',          label: 'Price' },
  { value: 'scope_mismatch', label: 'Scope / Offering Mismatch' },
  { value: 'timing',         label: 'Timing' },
  { value: 'competitor',     label: 'Competitor' },
  { value: 'no_decision',    label: 'No Decision' },
] as const;

export const STATUS_LABELS: Readonly<Record<ProposalStatus, string>> = {
  draft:    'Draft',
  sent:     'Sent',
  won:      'Won',
  lost:     'Lost',
  archived: 'Archived',
};

export function getStatus(p: Proposal | null | undefined): ProposalStatus {
  return (p && p.lifecycle && p.lifecycle.status) || 'draft';
}

export function isFrozen(p: Proposal | null | undefined): boolean {
  return FROZEN_STATUSES.includes(getStatus(p));
}

/** Mirror of quickprop.projects.can_delete: deletable only when currently
 *  Draft AND no prior lifecycle activity beyond plain notes. Blocks the
 *  archive → reopen → delete bypass. */
export function canDelete(p: Proposal | null | undefined): boolean {
  if (getStatus(p) !== 'draft') return false;
  const activity = (p && p.lifecycle && p.lifecycle.activity) || [];
  return activity.every((e) => e.action === 'note');
}

// Re-export these so callers can `import { LostReason } from '../lib/lifecycle'`
// without reaching into types/. Convenience only.
export type { LostReason };
