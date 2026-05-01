// Top-level shell for the project editor. Owns the local projectReducer +
// 800ms autosave; renders header card, mode toggle, phase tabs, and the
// active phase's body (PhaseEditor + ResourceAllocation).
//
// Sync model: outer EditorState carries `state.project` for callers that
// only need to know "is this a project?" — but the editable copy lives in
// the local reducer here. On autosave success we both sync local state
// (LOAD_FRESH) and notify the outer dispatcher (LOAD_PROJECT) so any
// caller reading state.project sees the current values.

import { useEffect, useMemo, useReducer, useState, type Dispatch } from 'react';
import { initialProjectState, projectReducer } from '../../state/projectReducer';
import PhaseTabs from './PhaseTabs';
import PhaseEditor from './PhaseEditor';
import ResourceAllocation from './ResourceAllocation';
import type { EditorAction } from '../../state/editorReducer';
import type { AutosaveStatus, Identity, Project } from '../../types/domain';
import { fmt$ } from '../../lib/formatting';

interface ProjectEditorProps {
  /** Project from outer state. We seed local reducer state from this on
   *  mount and on identity-of-project change (e.g. user switched proposals). */
  project: Project;
  identity: Identity | null;
  /** Outer dispatch — used to push autosave results back so the outer
   *  state.project tracks the latest server snapshot. */
  outerDispatch: Dispatch<EditorAction>;
}

export default function ProjectEditor({ project, identity, outerDispatch }: ProjectEditorProps) {
  const [state, dispatch] = useReducer(projectReducer, project, initialProjectState);

  // Re-seed when the OUTER project changes identity (different proposal /
  // freshly-initialized project). project.id is stable for a given project
  // row, so use it as the dependency.
  useEffect(() => {
    if (state.project.id !== project.id) {
      dispatch({ type: 'LOAD_FRESH', project });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // 800ms debounced autosave. Fires only when status === 'idle'. The reducer
  // flips status to 'idle' on any payload mutation; we flip it to 'saving'
  // on AUTOSAVE_START and back to 'saved' on AUTOSAVE_OK.
  useEffect(() => {
    if (state.autosaveStatus !== 'idle') return;
    const id = state.project.id;
    const handle = window.setTimeout(async () => {
      dispatch({ type: 'AUTOSAVE_START' });
      try {
        const fresh = await window.api.project.savePayload(id, state.project.payload);
        if (fresh) {
          dispatch({ type: 'AUTOSAVE_OK', project: fresh });
          outerDispatch({ type: 'LOAD_PROJECT', project: fresh });
        }
      } catch (e: any) {
        dispatch({ type: 'AUTOSAVE_ERR', error: String(e?.message || String(e)) });
      }
    }, 800);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.project.payload, state.autosaveStatus]);

  // Rate tables for the rate-table dropdown in PhaseEditor. We fetch once
  // and pass through; PhaseEditor doesn't need to know about the IPC.
  const [rateTables, setRateTables] = useState<string[]>([]);
  useEffect(() => {
    void window.api.lookups.list('rate_table')
      .then(rs => setRateTables(rs.map(r => r.name)))
      .catch(() => setRateTables([]));
  }, []);

  // Per-phase budget rollup — sum of task hours × effective rate. We don't
  // have per-task category rates fetched at this level, so the budget here
  // is just hours × rate_override (when set) — close enough for the tab
  // strip; PhaseEditor renders its own precise number with rate-map lookup.
  const budgets = useMemo(() => state.project.payload.phases.map(p => {
    let sum = 0;
    for (const t of p.tasks) {
      const r = (t.rate_override != null && Number.isFinite(t.rate_override))
        ? Number(t.rate_override) : 0;
      sum += (Number(t.hours) || 0) * r;
    }
    return sum;
  }), [state.project.payload.phases]);

  const activeIndex = state.activePhaseIndex;
  const activePhase = state.project.payload.phases[activeIndex];

  return (
    <div style={{ padding: '20px 26px' }}>
      <ProjectHeaderCard project={state.project} autosaveStatus={state.autosaveStatus} autosaveError={state.autosaveError} />

      <PhaseTabs
        phases={state.project.payload.phases}
        activeIndex={activeIndex}
        budgets={budgets}
        dispatch={dispatch}
      />

      {activePhase ? (
        <>
          <PhaseEditor
            project={state.project}
            phase={activePhase}
            phaseIndex={activeIndex}
            identity={identity}
            rateTables={rateTables}
            dispatch={dispatch}
          />
          <ResourceAllocation
            project={state.project}
            phase={activePhase}
            phaseIndex={activeIndex}
            identity={identity}
            dispatch={dispatch}
          />
        </>
      ) : (
        <div style={{
          marginTop: 14, padding: 18, fontSize: 13, color: 'var(--muted)',
          background: 'var(--surface)', border: '1px solid var(--hair)',
          borderRadius: 8,
        }}>
          No phases yet. Click <strong>+</strong> in the tab strip above to add one.
        </div>
      )}
    </div>
  );
}

interface ProjectHeaderCardProps {
  project: Project;
  autosaveStatus: AutosaveStatus;
  autosaveError: string | null;
}

function ProjectHeaderCard({ project, autosaveStatus, autosaveError }: ProjectHeaderCardProps) {
  const totalBudget = useMemo(() => {
    let sum = 0;
    for (const p of project.payload.phases) {
      for (const t of p.tasks) {
        const r = (t.rate_override != null && Number.isFinite(t.rate_override))
          ? Number(t.rate_override) : 0;
        sum += (Number(t.hours) || 0) * r;
      }
      for (const r of project.payload.resources) {
        if (r.phase_no !== p.phase_no) continue;
        sum += (Number(r.hours) || 0) * (Number(r.bill_rate) || 0);
      }
    }
    return sum;
  }, [project.payload]);

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--hair)',
      borderRadius: 8, padding: 14,
      display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>
          {project.name}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
          {project.legal_entity} · {project.department}
          {project.icore_project_id && <> · iCore {project.icore_project_id}</>}
          {project.current_pm_name && <> · PM {project.current_pm_name}</>}
        </div>
      </div>
      <Stat label="Phases"   value={String(project.payload.phases.length)} />
      <Stat label="Budget"   value={fmt$(totalBudget)} />
      <AutosavePill status={autosaveStatus} error={autosaveError} />
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

function AutosavePill({ status, error }: { status: AutosaveStatus; error: string | null }) {
  const map = {
    idle:   { text: 'Edited',     color: 'var(--muted)', dot: 'var(--subtle)' },
    saving: { text: 'Saving…',    color: 'var(--muted)', dot: 'var(--amber)' },
    saved:  { text: 'Autosaved',  color: 'var(--muted)', dot: 'var(--green)' },
    error:  { text: error || 'Save error', color: 'var(--red)', dot: 'var(--red)' },
  } as const;
  const s = map[status] || map.idle;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: s.color }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot }} />
      {s.text}
    </div>
  );
}
