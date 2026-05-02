// Phase body editor — header fields + tasks table.
//
// Header fields: name, due_date, project_type (FF/T&M), rate_table,
// scope_text (multi-line), notes (single line).
// Tasks: per-row category (text), hours (number), rate (RateCell with
// override audit), Add Task button + per-row × delete.
//
// Rate lookup: when a task has a non-empty category, fetch the standard
// rate via window.api.rates.lookup(legal_entity, rate_table, category,
// resource_id?) and pass it to RateCell as the categoryRate prop. The
// component caches the lookup per (rateTable, category) so re-renders
// don't re-fire IPC.

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import RateCell from './RateCell';
import { ConfirmDialog } from '../ui';
import type { Identity, Project, ProjectPhase } from '../../types/domain';
import type { ProjectEditorAction } from '../../state/projectReducer';
import { fmt$ } from '../../lib/formatting';

interface PhaseEditorProps {
  project: Project;
  phase: ProjectPhase;
  phaseIndex: number;
  identity: Identity | null;
  rateTables: string[];
  dispatch: Dispatch<ProjectEditorAction>;
  disabled?: boolean;
}

export default function PhaseEditor({
  project, phase, phaseIndex, identity, rateTables, dispatch, disabled,
}: PhaseEditorProps) {
  // Category-rate cache. Keyed by `${rate_table}||${category}`. Filled lazily
  // on demand; clears when the rate table changes.
  const [rateMap, setRateMap] = useState<Map<string, number>>(new Map());
  const inflight = useRef<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const lookupCategoryRate = useCallback(async (rateTable: string, category: string) => {
    const key = `${rateTable}||${category}`;
    if (rateMap.has(key)) return;
    if (inflight.current.has(key)) return;
    if (!rateTable || !category) return;
    inflight.current.add(key);
    try {
      const v = await window.api.rates.lookup(project.legal_entity, rateTable, category, null);
      setRateMap(m => new Map(m).set(key, Number(v) || 0));
    } catch (e) {
      console.warn('rates.lookup failed', e);
    } finally {
      inflight.current.delete(key);
    }
  }, [rateMap, project.legal_entity]);

  // Trigger lookups for any visible task whose category we don't have yet.
  useEffect(() => {
    for (const t of phase.tasks) {
      if (t.category) void lookupCategoryRate(phase.rate_table, t.category);
    }
  }, [phase.tasks, phase.rate_table, lookupCategoryRate]);

  function rateFor(category: string): number {
    return rateMap.get(`${phase.rate_table}||${category}`) ?? 0;
  }

  const taskBudget = useMemo(() => phase.tasks.reduce((sum, t) => {
    const rate = (t.rate_override != null && Number.isFinite(t.rate_override))
      ? Number(t.rate_override)
      : rateFor(t.category);
    return sum + (Number(t.hours) || 0) * rate;
  }, 0), [phase.tasks, rateMap]);

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--hair)',
      borderRadius: 8, padding: 16, marginTop: 14,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Field label="Phase name">
            <input
              value={phase.name}
              disabled={disabled}
              onChange={(e) => dispatch({ type: 'UPDATE_PHASE', index: phaseIndex, patch: { name: e.target.value } })}
              style={inputStyle}
            />
          </Field>
        </div>
        <div style={{ width: 160, flexShrink: 0 }}>
          <Field label="Due date">
            <input
              type="date"
              value={phase.due_date ?? ''}
              disabled={disabled}
              onChange={(e) => dispatch({ type: 'UPDATE_PHASE', index: phaseIndex, patch: { due_date: e.target.value || null } })}
              style={inputStyle}
            />
          </Field>
        </div>
        <div style={{ width: 110, flexShrink: 0 }}>
          <Field label="Project type">
            <select
              value={phase.project_type || 'FF'}
              disabled={disabled}
              onChange={(e) => dispatch({ type: 'UPDATE_PHASE', index: phaseIndex, patch: { project_type: e.target.value } })}
              style={inputStyle}>
              <option value="FF">FF</option>
              <option value="T&M">T&M</option>
            </select>
          </Field>
        </div>
        <div style={{ width: 160, flexShrink: 0 }}>
          <Field label="Rate table">
            <select
              value={phase.rate_table}
              disabled={disabled}
              onChange={(e) => {
                dispatch({ type: 'UPDATE_PHASE', index: phaseIndex, patch: { rate_table: e.target.value } });
                setRateMap(new Map());                       // invalidate cache
              }}
              style={inputStyle}>
              <option value="">—</option>
              {rateTables.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        </div>
        {!disabled && (
          <button
            onClick={() => setConfirmDelete(true)}
            title="Delete this phase"
            style={{
              alignSelf: 'flex-end', height: 30, padding: '0 12px',
              background: 'transparent', color: 'var(--action-danger)',
              border: '1px solid var(--action-danger-edge)', borderRadius: 6,
              fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--sans)',
            }}>
            Delete phase
          </button>
        )}
        <ConfirmDialog
          open={confirmDelete}
          title="Delete phase?"
          body={<>Remove <strong>{phase.name || 'this phase'}</strong>? Its tasks, hours, and rates will be lost.</>}
          confirmLabel="Delete"
          confirmKind="loss"
          onConfirm={() => {
            setConfirmDelete(false);
            dispatch({ type: 'REMOVE_PHASE', index: phaseIndex });
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      </div>

      {/* Scope of Work + internal notes */}
      <Field label="Scope of work (drives the proposal docx)">
        <textarea
          value={phase.scope_text ?? ''}
          disabled={disabled}
          placeholder="Describe the work this phase covers…"
          onChange={(e) => dispatch({ type: 'UPDATE_PHASE', index: phaseIndex, patch: { scope_text: e.target.value } })}
          style={{
            ...inputStyle, height: 'auto', minHeight: 70, padding: 8, resize: 'vertical',
            fontFamily: 'var(--sans)',
          }}
        />
      </Field>
      <Field label="Internal notes (not exported)">
        <input
          value={phase.notes ?? ''}
          disabled={disabled}
          placeholder="Anything to remember internally about this phase"
          onChange={(e) => dispatch({ type: 'UPDATE_PHASE', index: phaseIndex, patch: { notes: e.target.value } })}
          style={inputStyle}
        />
      </Field>

      {/* Tasks */}
      <div style={{
        display: 'flex', alignItems: 'center', marginTop: 16, marginBottom: 8, gap: 12,
      }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
          Tasks
        </h4>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          {phase.tasks.length} task{phase.tasks.length === 1 ? '' : 's'} · budget {fmt$(taskBudget)}
        </span>
        <div style={{ flex: 1 }} />
        {!disabled && (
          <button
            onClick={() => dispatch({ type: 'ADD_TASK', phaseIndex })}
            style={{
              height: 26, padding: '0 10px',
              background: 'var(--surface)', color: 'var(--body)',
              border: '1px solid var(--hair)', borderRadius: 5,
              fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--sans)',
            }}>
            + Add task
          </button>
        )}
      </div>

      {phase.tasks.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>
          No tasks yet. {disabled ? '' : 'Click "+ Add task" to start.'}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{
              background: 'var(--canvas)', textAlign: 'left',
              fontSize: 10.5, color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: 0.4,
            }}>
              <th style={{ padding: '6px 8px', width: 40 }}>#</th>
              <th style={{ padding: '6px 8px' }}>Name</th>
              <th style={{ padding: '6px 8px', width: 200 }}>Category</th>
              <th style={{ padding: '6px 8px', width: 80, textAlign: 'right' }}>Hours</th>
              <th style={{ padding: '6px 8px', width: 110, textAlign: 'right' }}>Rate</th>
              <th style={{ padding: '6px 8px', width: 110, textAlign: 'right' }}>Budget</th>
              {!disabled && <th style={{ width: 36 }}></th>}
            </tr>
          </thead>
          <tbody>
            {phase.tasks.map((t, ti) => {
              const cRate = rateFor(t.category);
              const eff = (t.rate_override != null && Number.isFinite(t.rate_override))
                ? Number(t.rate_override) : cRate;
              const budget = (Number(t.hours) || 0) * eff;
              return (
                <tr key={ti} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '6px 8px', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {t.task_no}
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <input value={t.name} disabled={disabled}
                      onChange={(e) => dispatch({ type: 'UPDATE_TASK', phaseIndex, taskIndex: ti, patch: { name: e.target.value } })}
                      style={cellInputStyle}
                    />
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <input value={t.category} disabled={disabled}
                      placeholder="e.g. Senior Engineer"
                      onChange={(e) => dispatch({ type: 'UPDATE_TASK', phaseIndex, taskIndex: ti, patch: { category: e.target.value } })}
                      style={cellInputStyle}
                    />
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                    <input type="number" value={t.hours} disabled={disabled}
                      step="0.25" min={0}
                      onChange={(e) => dispatch({ type: 'UPDATE_TASK', phaseIndex, taskIndex: ti, patch: { hours: parseFloat(e.target.value) || 0 } })}
                      style={{ ...cellInputStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                    />
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <RateCell
                      task={t}
                      categoryRate={cRate}
                      disabled={disabled}
                      currentUser={identity ? { email: identity.email, name: identity.name } : null}
                      onChange={(patch) => dispatch({ type: 'UPDATE_TASK', phaseIndex, taskIndex: ti, patch })}
                    />
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {fmt$(budget)}
                  </td>
                  {!disabled && (
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                      <button onClick={() => dispatch({ type: 'REMOVE_TASK', phaseIndex, taskIndex: ti })}
                        title="Delete task"
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

const inputStyle: React.CSSProperties = {
  width: '100%', height: 30, padding: '0 8px',
  border: '1px solid var(--hair)', borderRadius: 5,
  fontSize: 12.5, fontFamily: 'var(--sans)',
  background: 'var(--surface)', color: 'var(--ink)',
  outline: 'none',
};

const cellInputStyle: React.CSSProperties = {
  ...inputStyle,
  height: 26, padding: '0 6px', fontSize: 12,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        fontSize: 10.5, letterSpacing: 0.4, fontWeight: 600,
        color: 'var(--muted)', textTransform: 'uppercase',
        marginBottom: 4,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}
