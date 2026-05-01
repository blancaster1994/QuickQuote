// Dashboard view — pipeline stats strip, status kanban, filterable list.
// Direct port of QuickProp's Dashboard.jsx. Reads from window.api.dashboard.get();
// clicking any proposal opens it in the editor.

import { useCallback, useEffect, useState, type Dispatch } from 'react';
import { Modal, ModalActions, StatusBadge } from './StatusComponents';
import { STATUSES, STATUS_LABELS } from '../lib/lifecycle';
import type { ProposalStatus } from '../types/domain';
import type { EditorAction, EditorState } from '../state/editorReducer';

interface DashboardData {
  stats: {
    pipeline_value: number;
    active_count: number;
    draft_count: number;
    draft_value: number;
    stale_count: number;
    won_count: number;
    lost_count: number;
    won_in_window: number;
    lost_in_window: number;
    won_value_window: number;
    lost_value_window: number;
    win_rate: number | null;
    reason_counts: Record<string, number>;
  };
  pipeline: Record<string, DashboardRow[]>;
  rows: DashboardRow[];
  settings: {
    stale_days: number;
    win_rate_window_days: number;
    owner_email: string;
  };
}

interface DashboardRow {
  name: string;
  client: string;
  date: string;
  status: ProposalStatus;
  value: number;
  owner: string;
  sent_date: string | null;
  won_date: string | null;
  lost_date: string | null;
  lost_reason: string | null;
  last_activity_at: string | null;
  age_days: number | null;
  stale: boolean;
  rateTable: string;
  follow_up_at: string | null;
  can_delete: boolean;
}

interface DashboardProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  onOpenProposal: (name: string) => void;
  refreshKey?: number;
}

export default function Dashboard({ state, onOpenProposal, refreshKey }: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<{ status: string; search: string }>({ status: 'all', search: '' });
  const [ownerFilter, setOwnerFilter] = useState<string>(state.identity?.email || 'all');

  const reload = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const d = (await window.api.dashboard.get({
        stale_days: state.staleDays,
        win_rate_window_days: state.winRateWindowDays,
        owner_email: ownerFilter,
      })) as DashboardData;
      setData(d);
    } catch (e: any) {
      setErr(String(e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }, [state.staleDays, state.winRateWindowDays, ownerFilter]);

  useEffect(() => { reload(); }, [reload, refreshKey]);

  if (err) {
    return <div style={{ padding: 28, color: 'var(--red)', fontSize: 13 }}>Dashboard error: {err}</div>;
  }
  if (!data) {
    return <div style={{ padding: 28, color: 'var(--muted)', fontSize: 13 }}>Loading pipeline…</div>;
  }

  const filteredRows = data.rows.filter((r) => {
    if (filter.status !== 'all' && r.status !== filter.status) return false;
    const q = filter.search.trim().toLowerCase();
    if (q && !(
      (r.name || '').toLowerCase().includes(q) ||
      (r.client || '').toLowerCase().includes(q) ||
      (r.owner || '').toLowerCase().includes(q)
    )) return false;
    return true;
  });

  const allowed = state.bootstrap?.allowed_users || [];
  const myEmail = state.identity?.email;
  const pms = [...allowed].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const showingAll = ownerFilter === 'all';
  const scopeLabel = showingAll
    ? 'All proposals'
    : (allowed.find((u) => u.email === ownerFilter)?.name || ownerFilter);

  return (
    <div style={{ padding: '18px 26px 40px', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Pipeline</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {scopeLabel} · {data.rows.length} total · {data.stats.active_count} active
          </div>
        </div>
        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 10.5, letterSpacing: 0.6, color: 'var(--muted)',
            fontWeight: 600, textTransform: 'uppercase',
          }}>Project manager</span>
          <select value={showingAll ? '' : ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            disabled={showingAll}
            style={{
              height: 30, border: '1px solid var(--hair)', borderRadius: 6,
              padding: '0 8px', fontSize: 12.5, fontFamily: 'var(--sans)',
              background: showingAll ? 'var(--canvas)' : 'var(--surface)',
              color: showingAll ? 'var(--muted)' : 'var(--ink)',
              cursor: showingAll ? 'not-allowed' : 'pointer',
            }}>
            {showingAll && <option value="">— Showing all —</option>}
            {pms.map((u) => (
              <option key={u.email} value={u.email}>{u.name}</option>
            ))}
          </select>

          <button
            onClick={() => setOwnerFilter(showingAll ? (myEmail || '') : 'all')}
            title={showingAll ? 'Switch back to a single project manager' : 'Show every proposal across all PMs'}
            style={{
              height: 30, padding: '0 12px', borderRadius: 6,
              border: showingAll ? '1px solid var(--navy-deep)' : '1px solid var(--hair)',
              background: showingAll ? 'var(--navy-tint)' : 'var(--surface)',
              color: showingAll ? 'var(--navy-deep)' : 'var(--body)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--sans)',
            }}>
            {showingAll ? '✓ All' : 'All'}
          </button>
        </div>

        <button onClick={reload} disabled={loading}
          style={{
            height: 30, padding: '0 12px', borderRadius: 6,
            border: '1px solid var(--hair)', background: 'var(--surface)',
            color: 'var(--body)', fontSize: 12, fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer', fontFamily: 'var(--sans)',
          }}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <StatsStrip stats={data.stats} settings={data.settings} />

      <PipelineBoard pipeline={data.pipeline} onOpen={onOpenProposal} />

      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>All proposals</div>
          <div style={{ flex: 1 }} />
          <input value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search name, client, PM…"
            style={{
              width: 240, height: 30, border: '1px solid var(--hair)',
              borderRadius: 6, padding: '0 10px', fontSize: 12.5,
              fontFamily: 'var(--sans)', background: 'var(--surface)',
              outline: 'none',
            }}
          />
          <select value={filter.status}
            onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
            style={{
              height: 30, border: '1px solid var(--hair)', borderRadius: 6,
              padding: '0 8px', fontSize: 12.5, fontFamily: 'var(--sans)',
              background: 'var(--surface)',
            }}>
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <ProposalList rows={filteredRows} onOpen={onOpenProposal} onDeleted={() => reload()} />
      </div>
    </div>
  );
}

interface StatsStripProps {
  stats: DashboardData['stats'];
  settings: DashboardData['settings'];
}

function StatsStrip({ stats, settings }: StatsStripProps) {
  const winRateText = stats.win_rate == null
    ? '—'
    : `${Math.round(stats.win_rate * 100)}%`;
  const draftCount = stats.draft_count || 0;
  const cards = [
    {
      label: 'Active pipeline', value: localFmt$(stats.pipeline_value),
      sub: `${stats.active_count} sent · ${draftCount} draft${draftCount === 1 ? '' : 's'} in flight`,
    },
    {
      label: `Win rate (${settings.win_rate_window_days}d)`, value: winRateText,
      sub: `${stats.won_in_window} won · ${stats.lost_in_window} lost`,
    },
    {
      label: 'Needs follow-up', value: String(stats.stale_count),
      sub: `sent > ${settings.stale_days} days ago, no activity`,
      kind: stats.stale_count > 0 ? 'warn' : null,
    },
    {
      label: 'Won value (window)', value: localFmt$(stats.won_value_window),
      sub: `lost ${localFmt$(stats.lost_value_window)}`,
    },
  ];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
      gap: 12, marginBottom: 18,
    }}>
      {cards.map((c) => (
        <div key={c.label} style={{
          padding: 14, background: 'var(--surface)',
          border: `1px solid ${c.kind === 'warn' ? '#F3C98A' : 'var(--hair)'}`,
          borderRadius: 10,
        }}>
          <div style={{
            fontSize: 10.5, letterSpacing: 0.6,
            color: 'var(--muted)', fontWeight: 600,
            textTransform: 'uppercase',
          }}>
            {c.label}
          </div>
          <div style={{
            fontSize: 22, fontWeight: 800, color: 'var(--ink)',
            marginTop: 4, fontVariantNumeric: 'tabular-nums',
          }}>
            {c.value}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            {c.sub}
          </div>
        </div>
      ))}
    </div>
  );
}

function PipelineBoard({ pipeline, onOpen }: { pipeline: Record<string, DashboardRow[]>; onOpen: (name: string) => void }) {
  const columns: ProposalStatus[] = ['draft', 'sent', 'won', 'lost'];
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columns.length}, minmax(180px, 1fr))`,
      gap: 12,
    }}>
      {columns.map((s) => {
        const rows = pipeline[s] || [];
        const total = rows.reduce((a, r) => a + (Number(r.value) || 0), 0);
        return (
          <div key={s} style={{
            background: 'var(--surface)', border: '1px solid var(--hair)',
            borderRadius: 10, padding: 10, minHeight: 140,
            display: 'flex', flexDirection: 'column',
            maxHeight: 360,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
              flexShrink: 0,
            }}>
              <StatusBadge status={s} size="sm" />
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {rows.length} · {localFmt$(total)}
              </div>
            </div>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 7,
              overflowY: 'auto', flex: 1, minHeight: 0,
              marginRight: -4, paddingRight: 4,
            }}>
              {rows.map((r) => (
                <button key={r.name} onClick={() => onOpen(r.name)}
                  style={{
                    display: 'block', textAlign: 'left', width: '100%',
                    padding: '8px 10px', borderRadius: 7,
                    background: 'var(--canvas)', border: '1px solid var(--line)',
                    cursor: 'pointer', fontFamily: 'var(--sans)',
                  }}>
                  <div style={{
                    fontSize: 12.5, fontWeight: 600, color: 'var(--ink)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {r.name || '(untitled)'}
                  </div>
                  <div style={{
                    fontSize: 11, color: 'var(--muted)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {r.client || '—'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink)' }}>
                      {localFmt$(r.value)}
                    </span>
                    {r.stale && (
                      <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 8,
                        background: '#FDE4C4', color: '#8A5A1A', fontWeight: 700,
                      }}>Stale</span>
                    )}
                  </div>
                </button>
              ))}
              {rows.length === 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--subtle)', padding: 6 }}>
                  (empty)
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface ProposalListProps {
  rows: DashboardRow[];
  onOpen: (name: string) => void;
  onDeleted: (name: string) => void;
}

function ProposalList({ rows, onOpen, onDeleted }: ProposalListProps) {
  const [confirming, setConfirming] = useState<DashboardRow | null>(null);

  if (rows.length === 0) {
    return (
      <div style={{
        padding: 20, fontSize: 12.5, color: 'var(--muted)',
        background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 8,
      }}>
        No proposals match that filter.
      </div>
    );
  }
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--hair)',
      borderRadius: 8, overflow: 'hidden',
    }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse', fontSize: 12.5,
        fontFamily: 'var(--sans)',
      }}>
        <thead>
          <tr style={{
            background: 'var(--canvas)', textAlign: 'left',
            color: 'var(--muted)', fontSize: 10.5,
            letterSpacing: 0.6, textTransform: 'uppercase',
          }}>
            <th style={{ padding: '8px 10px' }}>Name</th>
            <th style={{ padding: '8px 10px' }}>Client</th>
            <th style={{ padding: '8px 10px' }}>Status</th>
            <th style={{ padding: '8px 10px', textAlign: 'right' }}>Value</th>
            <th style={{ padding: '8px 10px' }}>Project Manager</th>
            <th style={{ padding: '8px 10px', textAlign: 'right' }}>Age</th>
            <th style={{ padding: '8px 10px', width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} style={{
              borderTop: '1px solid var(--line)',
              background: r.stale ? '#FFFBF1' : 'transparent',
            }}>
              <td onClick={() => onOpen(r.name)}
                style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }}>
                {r.name || '(untitled)'}
              </td>
              <td onClick={() => onOpen(r.name)}
                style={{ padding: '8px 10px', color: 'var(--body)', cursor: 'pointer' }}>{r.client || '—'}</td>
              <td onClick={() => onOpen(r.name)} style={{ padding: '8px 10px', cursor: 'pointer' }}>
                <StatusBadge status={r.status} size="sm" />
              </td>
              <td onClick={() => onOpen(r.name)}
                style={{
                  padding: '8px 10px', textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums', cursor: 'pointer',
                }}>
                {localFmt$(r.value)}
              </td>
              <td onClick={() => onOpen(r.name)}
                style={{ padding: '8px 10px', color: 'var(--body)', cursor: 'pointer' }}>{r.owner || '—'}</td>
              <td onClick={() => onOpen(r.name)}
                style={{
                  padding: '8px 10px', textAlign: 'right', color: 'var(--muted)', cursor: 'pointer',
                }}>
                {r.age_days == null ? '—' : `${r.age_days}d`}
              </td>
              <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                {r.can_delete && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirming(r); }}
                    title="Delete this proposal"
                    style={{
                      width: 24, height: 24, padding: 0, borderRadius: 4,
                      background: 'transparent', border: '1px solid transparent',
                      color: '#B8322F', cursor: 'pointer',
                      display: 'grid', placeItems: 'center',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#FBECEB';
                      e.currentTarget.style.borderColor = '#F3CFCC';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                      <path d="M2 3.5h10M5.5 3.5V2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1.5M3.5 3.5v8a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-8"
                        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {confirming && (
        <Modal title="Delete proposal?" onClose={() => setConfirming(null)}>
          <div style={{ fontSize: 13, color: 'var(--body)', lineHeight: 1.5 }}>
            Permanently remove <strong>{confirming.name}</strong>? This can't be undone.
          </div>
          <ModalActions
            onCancel={() => setConfirming(null)}
            onConfirm={async () => {
              const name = confirming.name;
              setConfirming(null);
              try {
                await window.api.proposals.remove(name);
                onDeleted(name);
              } catch (e: any) {
                alert(`Delete failed: ${e?.message || String(e)}`);
              }
            }}
            confirmLabel="Delete" confirmKind="loss" />
        </Modal>
      )}
    </div>
  );
}

function localFmt$(n: number): string {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
