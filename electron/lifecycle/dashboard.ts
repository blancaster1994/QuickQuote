// Pipeline / dashboard aggregator. Mirror of QuickProp's
// quickprop/dashboard.py — pure computation over loadAllProposals.
//
// Fee math mirrors the JS side (calcProposal in src/lib/calc.ts) — the
// proposal's stated section fees are summed. Labor/expense line items exist
// for display only and don't change the headline fee.

import type Database from 'better-sqlite3';
import { canDelete, loadAllProposals } from '../db/queries';

export const DEFAULT_STALE_DAYS = 14;
export const DEFAULT_WIN_RATE_WINDOW_DAYS = 90;

const STATUSES = ['draft', 'sent', 'won', 'lost', 'archived'] as const;

function nowDate(): Date {
  return new Date();
}

function parseIso(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function proposalValue(p: any): number {
  let total = 0;
  for (const sec of p?.sections || []) {
    const v = Number(sec?.fee);
    if (Number.isFinite(v)) total += v;
  }
  return total;
}

function lastActivity(lc: any): Date | null {
  const activity = lc?.activity || [];
  if (activity.length === 0) {
    return parseIso(lc?.metadata?.created_at);
  }
  return parseIso(activity[activity.length - 1]?.timestamp);
}

function summarize(p: any, now: Date, staleDays: number): any {
  const lc = p?.lifecycle || {};
  const meta = lc.metadata || {};
  const status = lc.status || 'draft';
  const value = proposalValue(p);
  const sentAt = parseIso(meta.sent_date);
  const last = lastActivity(lc);
  const ageDays = last
    ? Math.floor((now.getTime() - last.getTime()) / 86_400_000)
    : null;
  const stale = !!(
    status === 'sent'
    && sentAt
    && (now.getTime() - sentAt.getTime()) > staleDays * 86_400_000
  );
  return {
    name:               p?.name || '',
    client:             p?.client || '',
    date:               p?.date || '',
    status,
    value,
    owner:              (lc.owner?.name) || (lc.owner?.email) || '',
    sent_date:          meta.sent_date || null,
    won_date:           meta.won_date || null,
    lost_date:          meta.lost_date || null,
    lost_reason:        meta.lost_reason || null,
    last_activity_at:   last ? last.toISOString() : null,
    age_days:           ageDays,
    stale,
    rateTable:          p?.rateTable || 'consulting',
    follow_up_at:       meta.follow_up_at || null,
    can_delete:         canDelete(p),
  };
}

export interface DashboardOptions {
  stale_days?: number;
  win_rate_window_days?: number;
  owner_email?: string;
}

export function buildDashboard(db: Database.Database, opts: DashboardOptions = {}): any {
  const staleDays = opts.stale_days ?? DEFAULT_STALE_DAYS;
  const winRateWindowDays = opts.win_rate_window_days ?? DEFAULT_WIN_RATE_WINDOW_DAYS;
  const ownerEmail = opts.owner_email;

  const now = nowDate();
  let allProps = loadAllProposals(db);

  if (ownerEmail && ownerEmail.toLowerCase() !== 'all') {
    const wanted = ownerEmail.trim().toLowerCase();
    allProps = allProps.filter((p) => {
      const email = ((p?.lifecycle?.owner?.email) || '').toLowerCase();
      return email === wanted;
    });
  }

  const rows = allProps.map((p) => summarize(p, now, staleDays));

  const pipeline: Record<string, any[]> = {};
  for (const s of STATUSES) pipeline[s] = [];
  for (const r of rows) {
    const bucket = pipeline[r.status] || (pipeline[r.status] = []);
    bucket.push(r);
  }

  const sentRows = rows.filter((r) => r.status === 'sent');
  const draftRows = rows.filter((r) => r.status === 'draft');
  const pipelineValue = sentRows.reduce((a, r) => a + r.value, 0);
  const staleCount = sentRows.filter((r) => r.stale).length;
  const draftValue = draftRows.reduce((a, r) => a + r.value, 0);

  const windowStartMs = now.getTime() - winRateWindowDays * 86_400_000;
  const wonInWindow = rows.filter((r) =>
    r.status === 'won' &&
    ((parseIso(r.won_date)?.getTime() ?? now.getTime()) >= windowStartMs),
  );
  const lostInWindow = rows.filter((r) =>
    r.status === 'lost' &&
    ((parseIso(r.lost_date)?.getTime() ?? now.getTime()) >= windowStartMs),
  );
  const decided = wonInWindow.length + lostInWindow.length;
  const winRate = decided > 0 ? wonInWindow.length / decided : null;
  const wonValue = wonInWindow.reduce((a, r) => a + r.value, 0);
  const lostValue = lostInWindow.reduce((a, r) => a + r.value, 0);

  const reasonCounts: Record<string, number> = {};
  for (const r of lostInWindow) {
    const key = r.lost_reason || 'unspecified';
    reasonCounts[key] = (reasonCounts[key] || 0) + 1;
  }

  return {
    stats: {
      pipeline_value:    pipelineValue,
      active_count:      sentRows.length,
      draft_count:       draftRows.length,
      draft_value:       draftValue,
      stale_count:       staleCount,
      won_count:         rows.filter((r) => r.status === 'won').length,
      lost_count:        rows.filter((r) => r.status === 'lost').length,
      won_in_window:     wonInWindow.length,
      lost_in_window:    lostInWindow.length,
      won_value_window:  wonValue,
      lost_value_window: lostValue,
      win_rate:          winRate,
      reason_counts:     reasonCounts,
    },
    pipeline,
    rows,
    settings: {
      stale_days:           staleDays,
      win_rate_window_days: winRateWindowDays,
      owner_email:          ownerEmail || 'all',
    },
  };
}
