// Status transitions + activity log mutations. Pure functions over a proposal
// dict — they mutate `proposal.lifecycle` in place and return the proposal.
// Persistence is the caller's responsibility (use queries.mutateAndSave).
//
// Mirror of QuickProp/quickprop/activity.py.

import { ensureLifecycle, type Actor, type ProposalStatus } from '../db/queries';

// ── constants ───────────────────────────────────────────────────────────────

export const STATUSES: readonly ProposalStatus[] = [
  'draft', 'sent', 'won', 'lost', 'archived',
] as const;

export const LOST_REASONS: readonly string[] = [
  'price', 'scope_mismatch', 'timing', 'competitor', 'no_decision',
] as const;

export const FROZEN_STATUSES: readonly ProposalStatus[] = ['sent', 'won', 'lost'] as const;
export const TERMINAL_STATUSES: readonly ProposalStatus[] = ['won', 'lost', 'archived'] as const;

// Allowed transitions keyed by current status. Mirrors activity.py's _ALLOWED.
const ALLOWED: Record<ProposalStatus, Set<ProposalStatus>> = {
  draft:    new Set<ProposalStatus>(['sent', 'archived']),
  sent:     new Set<ProposalStatus>(['won', 'lost', 'archived']),
  won:      new Set<ProposalStatus>(['archived']),
  lost:     new Set<ProposalStatus>(['archived']),
  archived: new Set<ProposalStatus>(['draft']),
};

// ── helpers ─────────────────────────────────────────────────────────────────

function utcNowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

interface ActivityLogArgs {
  actor: Actor;
  action: string;
  from: ProposalStatus | null;
  to: ProposalStatus | null;
  note?: string;
  meta?: Record<string, unknown> | null;
}

function log(proposal: any, args: ActivityLogArgs): any {
  const lc = proposal.lifecycle;
  const entry = {
    timestamp: utcNowIso(),
    user:      { email: args.actor.email || '', name: args.actor.name || '' },
    action:    args.action,
    from:      args.from,
    to:        args.to,
    note:      args.note || '',
    meta:      args.meta || {},
  };
  if (!Array.isArray(lc.activity)) lc.activity = [];
  lc.activity.push(entry);
  return entry;
}

export function canTransition(current: ProposalStatus, target: ProposalStatus): boolean {
  if (current === target) return false;
  return ALLOWED[current]?.has(target) ?? false;
}

export function isFrozen(proposal: any): boolean {
  const lc = proposal?.lifecycle || {};
  return FROZEN_STATUSES.includes(lc.status);
}

// ── transitions ─────────────────────────────────────────────────────────────

export function markSent(proposal: any, actor: Actor, note = ''): any {
  ensureLifecycle(proposal, actor);
  const lc = proposal.lifecycle;
  const current: ProposalStatus = lc.status;
  if (!canTransition(current, 'sent')) {
    throw new Error(`Can't mark a ${current} proposal as sent.`);
  }
  lc.status = 'sent';
  lc.metadata.sent_date = utcNowIso();
  log(proposal, { actor, action: 'mark_sent', from: current, to: 'sent', note });
  return proposal;
}

export function markWon(
  proposal: any,
  actor: Actor,
  note = '',
  icoreProjectId: string | null = null,
): any {
  ensureLifecycle(proposal, actor);
  const lc = proposal.lifecycle;
  const current: ProposalStatus = lc.status;
  if (!canTransition(current, 'won')) {
    throw new Error(`Can't mark a ${current} proposal as won.`);
  }
  lc.status = 'won';
  lc.metadata.won_date = utcNowIso();
  if (icoreProjectId) lc.metadata.iCore_project_id = icoreProjectId;
  log(proposal, {
    actor, action: 'mark_won', from: current, to: 'won', note,
    meta: icoreProjectId ? { iCore_project_id: icoreProjectId } : null,
  });
  return proposal;
}

export function markLost(proposal: any, actor: Actor, reason: string, note = ''): any {
  if (!LOST_REASONS.includes(reason)) {
    throw new Error(`Unknown lost reason '${reason}'. Expected one of: ${LOST_REASONS.join(', ')}`);
  }
  ensureLifecycle(proposal, actor);
  const lc = proposal.lifecycle;
  const current: ProposalStatus = lc.status;
  if (!canTransition(current, 'lost')) {
    throw new Error(`Can't mark a ${current} proposal as lost.`);
  }
  lc.status = 'lost';
  lc.metadata.lost_date = utcNowIso();
  lc.metadata.lost_reason = reason;
  lc.metadata.lost_notes = note || null;
  log(proposal, { actor, action: 'mark_lost', from: current, to: 'lost', note, meta: { reason } });
  return proposal;
}

export function markArchived(proposal: any, actor: Actor, note = ''): any {
  ensureLifecycle(proposal, actor);
  const lc = proposal.lifecycle;
  const current: ProposalStatus = lc.status;
  if (current === 'archived') return proposal;
  lc.status = 'archived';
  log(proposal, { actor, action: 'mark_archived', from: current, to: 'archived', note });
  return proposal;
}

export function reopen(proposal: any, actor: Actor, note = ''): any {
  ensureLifecycle(proposal, actor);
  const lc = proposal.lifecycle;
  const current: ProposalStatus = lc.status;
  if (!TERMINAL_STATUSES.includes(current)) {
    throw new Error(`Only terminal proposals can be reopened (current: ${current}).`);
  }
  const priorMeta = {
    won_date:    lc.metadata.won_date,
    lost_date:   lc.metadata.lost_date,
    lost_reason: lc.metadata.lost_reason,
    lost_notes:  lc.metadata.lost_notes,
  };
  lc.status = 'draft';
  lc.metadata.won_date = null;
  lc.metadata.lost_date = null;
  lc.metadata.lost_reason = null;
  lc.metadata.lost_notes = null;
  log(proposal, {
    actor, action: 'reopen', from: current, to: 'draft', note,
    meta: { prior: priorMeta },
  });
  return proposal;
}

export function addNote(proposal: any, actor: Actor, note: string): any {
  if (!note || !note.trim()) throw new Error('Note text is required.');
  ensureLifecycle(proposal, actor);
  log(proposal, { actor, action: 'note', from: null, to: null, note: note.trim() });
  return proposal;
}

export function reassign(
  proposal: any,
  actor: Actor,
  newPm: { email: string; name?: string },
  note = '',
): any {
  if (!newPm || !newPm.email) throw new Error('New PM must include an email.');
  ensureLifecycle(proposal, actor);
  const lc = proposal.lifecycle;
  const old = { ...(lc.owner || { email: '', name: '' }) };
  if ((old.email || '').toLowerCase() === newPm.email.toLowerCase()) {
    return proposal; // no-op reassignment
  }
  lc.owner = { email: newPm.email, name: newPm.name || '' };
  log(proposal, {
    actor, action: 'reassign', from: null, to: null, note,
    meta: { from_pm: old, to_pm: lc.owner },
  });
  return proposal;
}

export function setFollowUp(
  proposal: any,
  actor: Actor,
  whenIso: string | null,
  note = '',
): any {
  ensureLifecycle(proposal, actor);
  const lc = proposal.lifecycle;
  lc.metadata.follow_up_at = whenIso;
  log(proposal, {
    actor, action: 'follow_up', from: null, to: null, note,
    meta: { follow_up_at: whenIso },
  });
  return proposal;
}
