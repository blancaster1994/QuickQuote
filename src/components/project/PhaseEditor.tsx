// Phase body editor — header + labor + tasks + scope.
//
// Labor table: category × hours × rate. Drives the budget for the phase
// (category-level, not task-level).
// Tasks table: name only — these are the work items that flow to iCore /
// ClickUp. Multiple labor categories may be working on a single task, so
// tasks don't carry category or hours of their own.
// Per-task Amount is derived from resources whose task_no matches.

import { useMemo, useState, type Dispatch } from 'react';
import { ConfirmDialog } from '../ui';
import type { Identity, Project, ProjectPhase } from '../../types/domain';
import type { ProjectEditorAction } from '../../state/projectReducer';
import { fmt$ } from '../../lib/formatting';
import { computePhaseAllocated, computeTaskAmount } from '../../lib/projectTotals';

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
  project, phase, phaseIndex, identity: _identity, rateTables, dispatch, disabled,
}: PhaseEditorProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const phaseAllocated = useMemo(
    () => computePhaseAllocated(project.payload.resources, phase.phase_no),
    [project.payload.resources, phase.phase_no],
  );

  const labor = phase.labor ?? [];
  const tasks = phase.tasks ?? [];

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
          body={<>Remove <strong>{phase.name || 'this phase'}</strong>? Its labor, tasks, hours, and rates will be lost.</>}
          confirmLabel="Delete"
          confirmKind="loss"
          onConfirm={() => {
            setConfirmDelete(false);
            dispatch({ type: 'REMOVE_PHASE', index: phaseIndex });
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      </div>

      {/* Scope of Work — reference only in project mode. Edit it from the
          proposal sections; this just mirrors phase.scope_text for context. */}
      <Field label="Scope of work (reference — edit in proposal)">
        <div
          style={{
            ...inputStyle,
            height: 'auto', minHeight: 70, padding: 8,
            background: 'var(--canvas)', color: 'var(--body)',
            whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
            fontFamily: 'var(--sans)',
            cursor: 'default',
          }}>
          {phase.scope_text?.trim()
            ? phase.scope_text
            : <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                No scope captured for this phase.
              </span>}
        </div>
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

      {/* Labor — category × hours budget */}
      <div style={{
        display: 'flex', alignItems: 'center', marginTop: 16, marginBottom: 8, gap: 12,
      }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
          Labor
        </h4>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          {labor.length} categor{labor.length === 1 ? 'y' : 'ies'} budgeted
        </span>
        <div style={{ flex: 1 }} />
        {!disabled && (
          <button
            onClick={() => dispatch({ type: 'ADD_LABOR', phaseIndex })}
            style={{
              height: 26, padding: '0 10px',
              background: 'var(--surface)', color: 'var(--body)',
              border: '1px solid var(--hair)', borderRadius: 5,
              fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--sans)',
            }}>
            + Add labor
          </button>
        )}
      </div>

      {labor.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>
          No labor budgeted yet. {disabled ? '' : 'Click "+ Add labor" to budget a category.'}
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
              <th style={{ padding: '6px 8px' }}>Category</th>
              <th style={{ padding: '6px 8px', width: 100, textAlign: 'right' }}>Hours</th>
              <th style={{ padding: '6px 8px', width: 130, textAlign: 'right' }}>Rate</th>
              {!disabled && <th style={{ width: 36 }}></th>}
            </tr>
          </thead>
          <tbody>
            {labor.map((row, li) => (
              <tr key={li} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: '6px 8px', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {row.labor_no}
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <input value={row.category} disabled={disabled}
                    placeholder="e.g. Engineer III"
                    onChange={(e) => dispatch({ type: 'UPDATE_LABOR', phaseIndex, laborIndex: li, patch: { category: e.target.value } })}
                    style={cellInputStyle}
                  />
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                  <input type="number" min={0} step="0.5"
                    value={row.hours} disabled={disabled}
                    onChange={(e) => dispatch({ type: 'UPDATE_LABOR', phaseIndex, laborIndex: li, patch: { hours: Number(e.target.value) || 0 } })}
                    style={{ ...cellInputStyle, textAlign: 'right' }}
                  />
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                  <input type="number" min={0} step="0.01"
                    value={row.rate_override ?? ''}
                    placeholder="auto"
                    disabled={disabled}
                    onChange={(e) => {
                      const v = e.target.value === '' ? null : Number(e.target.value);
                      dispatch({ type: 'UPDATE_LABOR', phaseIndex, laborIndex: li, patch: { rate_override: v } });
                    }}
                    style={{ ...cellInputStyle, textAlign: 'right' }}
                  />
                </td>
                {!disabled && (
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                    <button onClick={() => dispatch({ type: 'REMOVE_LABOR', phaseIndex, laborIndex: li })}
                      aria-label="Delete labor row"
                      style={{
                        width: 22, height: 22, padding: 0, borderRadius: 4,
                        background: 'transparent', color: 'var(--muted)',
                        border: '1px solid transparent', cursor: 'pointer',
                        fontSize: 13, lineHeight: 1,
                      }}>×</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Tasks — name-only, for iCore / ClickUp tracking */}
      <div style={{
        display: 'flex', alignItems: 'center', marginTop: 16, marginBottom: 8, gap: 12,
      }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
          Tasks
        </h4>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          {tasks.length} task{tasks.length === 1 ? '' : 's'} · {fmt$(phaseAllocated)} allocated from resources
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

      {tasks.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>
          No tasks yet. {disabled ? '' : 'Click "+ Add task" to name a work item.'}
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
              <th style={{ padding: '6px 8px', width: 130, textAlign: 'right' }}>Allocated</th>
              {!disabled && <th style={{ width: 36 }}></th>}
            </tr>
          </thead>
          <tbody>
            {tasks.map((t, ti) => {
              const amount = computeTaskAmount(
                project.payload.resources, phase.phase_no, t.task_no,
              );
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
                  <td style={{
                    padding: '6px 8px', textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                  }}>
                    {amount > 0 ? (
                      fmt$(amount)
                    ) : (
                      <span title="Allocated is the sum of resources assigned to this task. Assign a resource below and pick this task."
                        style={{ color: 'var(--subtle)', fontWeight: 500 }}>
                        —
                      </span>
                    )}
                  </td>
                  {!disabled && (
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                      <button onClick={() => dispatch({ type: 'REMOVE_TASK', phaseIndex, taskIndex: ti })}
                        aria-label="Delete task"
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
