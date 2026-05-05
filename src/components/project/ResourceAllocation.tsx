// Resource allocation table for a single phase. Shows assigned employees,
// their hours, bill_rate (with override audit), scheduled start, status,
// notes. "+ Assign" picks an employee from the canonical list and seeds the
// row with a category lookup as the bill_rate baseline.

import { useEffect, useMemo, useState, type Dispatch } from 'react';
import EmployeeAvatar from './EmployeeAvatar';
import BillRateCell from './BillRateCell';
import type { EmployeeRow, Identity, Project, ProjectPhase, ResourceAssignment, ResourceStatus } from '../../types/domain';
import type { ProjectEditorAction } from '../../state/projectReducer';
import { fmt$ } from '../../lib/formatting';

const STATUSES: ResourceStatus[] = ['Not Started', 'In-process', 'Completed', 'On-hold'];

const STATUS_COLORS: Record<ResourceStatus, { bg: string; fg: string }> = {
  'Not Started': { bg: '#ECEDF0', fg: '#6B7382' },
  'In-process':  { bg: '#EAF0F7', fg: '#17416F' },
  'Completed':   { bg: '#E2F0E8', fg: '#2F6B5A' },
  'On-hold':     { bg: '#FDF3E3', fg: '#8A5A1A' },
};

interface ResourceAllocationProps {
  project: Project;
  phase: ProjectPhase;
  phaseIndex: number;
  identity: Identity | null;
  dispatch: Dispatch<ProjectEditorAction>;
  disabled?: boolean;
}

export default function ResourceAllocation({
  project, phase, phaseIndex, identity, dispatch, disabled,
}: ResourceAllocationProps) {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Cache: rate by `${rate_table}||${category}||${resource_id}` (resource_id
  // empty for category-only). Filled lazily.
  const [rateMap, setRateMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    void window.api.employees.list(true).then(setEmployees).catch(() => setEmployees([]));
  }, []);

  // Filter to assignments belonging to THIS phase. The reducer state holds a
  // flat resources[] keyed by phase_no; we slice per phase here.
  const myResources = useMemo(() => {
    const out: Array<{ idx: number; r: ResourceAssignment }> = [];
    project.payload.resources.forEach((r, idx) => {
      if (r.phase_no === phase.phase_no) out.push({ idx, r });
    });
    return out;
  }, [project.payload.resources, phase.phase_no]);

  async function lookup(category: string, resourceId: string | null): Promise<number> {
    const key = `${phase.rate_table}||${category}||${resourceId ?? ''}`;
    const cached = rateMap.get(key);
    if (cached != null) return cached;
    try {
      const v = await window.api.rates.lookup(project.legal_entity, phase.rate_table, category, resourceId);
      const num = Number(v) || 0;
      setRateMap(m => new Map(m).set(key, num));
      return num;
    } catch (e) {
      console.warn('rates.lookup failed', e);
      return 0;
    }
  }

  async function pickEmployee(emp: EmployeeRow) {
    setPickerOpen(false);
    setSearch('');
    const cat = emp.category || '';
    const rid = emp.resource_id || null;
    const billRate = await lookup(cat, rid);
    const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const assignment: ResourceAssignment = {
      phase_no: phase.phase_no,
      task_no: 0,
      resource_name: emp.name,
      hours: 0,
      bill_rate: billRate,
      rate_baseline: billRate,
      rate_override_by_email: null,
      rate_override_by_name: null,
      rate_override_at: null,
      scheduled_start: null,
      status: 'Not Started',
      comments: null,
    };
    void nowIso;
    dispatch({ type: 'ADD_RESOURCE', phaseIndex, assignment });
  }

  const totalHrs = myResources.reduce((s, { r }) => s + (Number(r.hours) || 0), 0);
  const totalAmt = myResources.reduce((s, { r }) => s + (Number(r.hours) || 0) * (Number(r.bill_rate) || 0), 0);

  const filteredEmployees = employees.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.name?.toLowerCase().includes(q))
      || (e.category?.toLowerCase().includes(q) ?? false)
      || (e.email?.toLowerCase().includes(q) ?? false);
  });

  const u = identity ? { email: identity.email, name: identity.name } : null;

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--hair)',
      borderRadius: 8, padding: 16, marginTop: 14,
    }}>
      {/* Rollup row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
          Resource allocation
        </h4>
        <Stat label="Assigned" value={String(myResources.length)} />
        <Stat label="Hours"    value={totalHrs.toLocaleString('en-US', { maximumFractionDigits: 1 })} />
        <Stat label="Total"    value={fmt$(totalAmt)} />
        <div style={{ flex: 1 }} />
        {!disabled && (
          <button
            onClick={() => setPickerOpen((o) => !o)}
            style={{
              height: 28, padding: '0 12px',
              background: 'var(--navy-deep)', color: '#fff',
              border: 'none', borderRadius: 5,
              fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'var(--sans)',
            }}>
            + Assign
          </button>
        )}
      </div>

      {pickerOpen && (
        <div style={{
          position: 'relative', marginBottom: 10,
          background: 'var(--canvas)', border: '1px solid var(--hair)',
          borderRadius: 6, padding: 8,
        }}>
          <input
            autoFocus
            value={search}
            placeholder="Search by name, category, or email…"
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', height: 28, padding: '0 8px',
              border: '1px solid var(--hair)', borderRadius: 5,
              fontSize: 12, fontFamily: 'var(--sans)',
              background: 'var(--surface)',
            }}
          />
          <div style={{
            marginTop: 8, maxHeight: 240, overflow: 'auto',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            {filteredEmployees.length === 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--muted)', padding: 6 }}>
                No matching employees. Add them in Lookups → Employees.
              </div>
            )}
            {filteredEmployees.slice(0, 50).map(e => (
              <button key={e.id} onClick={() => void pickEmployee(e)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 8px', borderRadius: 5,
                  background: 'transparent', color: 'var(--ink)',
                  border: '1px solid transparent', cursor: 'pointer',
                  fontFamily: 'var(--sans)', textAlign: 'left',
                }}
                onMouseEnter={ev => ev.currentTarget.style.background = 'var(--navy-tint)'}
                onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
              >
                <EmployeeAvatar name={e.name} size={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12.5, fontWeight: 600, color: 'var(--ink)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{e.name}</div>
                  <div style={{
                    fontSize: 11, color: 'var(--muted)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{e.category || '—'} · {e.email || ''}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {myResources.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>
          No resources assigned. {disabled ? '' : 'Click "+ Assign" to pick an employee.'}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{
              background: 'var(--canvas)', textAlign: 'left',
              fontSize: 10.5, color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: 0.4,
            }}>
              <th style={{ padding: '6px 8px' }}>Resource</th>
              <th style={{ padding: '6px 8px', width: 80, textAlign: 'right' }}>Hrs</th>
              <th style={{ padding: '6px 8px', width: 120, textAlign: 'right' }}>Bill rate</th>
              <th style={{ padding: '6px 8px', width: 110, textAlign: 'right' }}>Amount</th>
              <th style={{ padding: '6px 8px', width: 140 }}>Scheduled</th>
              <th style={{ padding: '6px 8px', width: 130 }}>Status</th>
              <th style={{ padding: '6px 8px' }}>Notes</th>
              {!disabled && <th style={{ width: 36 }}></th>}
            </tr>
          </thead>
          <tbody>
            {myResources.map(({ idx, r }) => {
              const lookupKey = `${phase.rate_table}||${''}||${''}`;
              void lookupKey;
              // For BillRateCell we want the *current* category lookup so the
              // override comparison is meaningful. Since assignments don't
              // store category directly, fall back to baseline for the
              // comparison target — same effect.
              const lookupRate = r.rate_baseline ?? r.bill_rate;
              const amount = (Number(r.hours) || 0) * (Number(r.bill_rate) || 0);
              const statusColors = STATUS_COLORS[r.status] || STATUS_COLORS['Not Started'];
              return (
                <tr key={idx} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '6px 8px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <EmployeeAvatar name={r.resource_name} size={22} />
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{r.resource_name}</span>
                    </span>
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                    <input type="number" min={0} step="0.25" value={r.hours} disabled={disabled}
                      onChange={(e) => dispatch({ type: 'UPDATE_RESOURCE', index: idx, patch: { hours: parseFloat(e.target.value) || 0 } })}
                      style={{ ...cellInputStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                    />
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <BillRateCell
                      assignment={r}
                      lookupRate={lookupRate}
                      disabled={disabled}
                      currentUser={u}
                      onChange={(patch) => dispatch({ type: 'UPDATE_RESOURCE', index: idx, patch })}
                    />
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {fmt$(amount)}
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <input type="date" value={r.scheduled_start ?? ''} disabled={disabled}
                      onChange={(e) => dispatch({ type: 'UPDATE_RESOURCE', index: idx, patch: { scheduled_start: e.target.value || null } })}
                      style={cellInputStyle}
                    />
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <select value={r.status} disabled={disabled}
                      onChange={(e) => dispatch({ type: 'UPDATE_RESOURCE', index: idx, patch: { status: e.target.value as ResourceStatus } })}
                      style={{
                        ...cellInputStyle,
                        background: statusColors.bg,
                        color: statusColors.fg,
                        fontWeight: 600,
                      }}>
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <input value={r.comments ?? ''} disabled={disabled}
                      onChange={(e) => dispatch({ type: 'UPDATE_RESOURCE', index: idx, patch: { comments: e.target.value || null } })}
                      style={cellInputStyle}
                    />
                  </td>
                  {!disabled && (
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                      <button onClick={() => dispatch({ type: 'REMOVE_RESOURCE', index: idx })}
                        aria-label="Remove assignment"
                        style={{
                          width: 22, height: 22, padding: 0, borderRadius: 4,
                          background: 'transparent', color: 'var(--muted)',
                          border: '1px solid transparent', cursor: 'pointer',
                          fontSize: 13, lineHeight: 1,
                        }}>×</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{
        fontSize: 10.5, letterSpacing: 0.4, fontWeight: 600,
        color: 'var(--muted)', textTransform: 'uppercase',
      }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

const cellInputStyle: React.CSSProperties = {
  width: '100%', height: 26, padding: '0 6px',
  border: '1px solid var(--hair)', borderRadius: 4,
  fontSize: 12, fontFamily: 'var(--sans)',
  background: 'var(--surface)', color: 'var(--ink)',
  outline: 'none',
};
