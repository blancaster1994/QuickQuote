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
import LockedBidItemsRow from './LockedBidItemsRow';
import ICoreBadge from './ICoreBadge';
import type { EditorAction } from '../../state/editorReducer';
import type { AutosaveStatus, Identity, Project, Proposal } from '../../types/domain';
import { fmt$ } from '../../lib/formatting';
import { calcProposal } from '../../lib/calc';
import { computePhaseAllocated, computeProjectAllocated } from '../../lib/projectTotals';
import { getStatus } from '../../lib/lifecycle';

interface ProjectEditorProps {
  /** Project from outer state. We seed local reducer state from this on
   *  mount and on identity-of-project change (e.g. user switched proposals). */
  project: Project;
  /** The originating proposal — needed for the locked Bid Items row and the
   *  Budgeted side of the Budget‑vs‑Allocated rollup. */
  proposal: Proposal;
  identity: Identity | null;
  /** Outer dispatch — used to push autosave results back so the outer
   *  state.project tracks the latest server snapshot. */
  outerDispatch: Dispatch<EditorAction>;
}

export default function ProjectEditor({ project, proposal, identity, outerDispatch }: ProjectEditorProps) {
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

  // Per-phase allocated rollup — Σ resource hrs × bill_rate per phase. Used
  // to render the dollar amount in each phase tab and in the header card's
  // overall comparison. Source of truth is resources (Issue 2).
  const phaseBudgets = useMemo(
    () => state.project.payload.phases.map(p =>
      computePhaseAllocated(state.project.payload.resources, p.phase_no)),
    [state.project.payload.phases, state.project.payload.resources],
  );

  const allocatedTotal = useMemo(
    () => computeProjectAllocated(state.project),
    [state.project],
  );

  const budgetedTotal = useMemo(() => calcProposal(proposal).sum, [proposal]);
  const proposalTotals = useMemo(() => calcProposal(proposal).totals, [proposal]);

  const activeIndex = state.activePhaseIndex;
  const activePhase = state.project.payload.phases[activeIndex];

  return (
    <div style={{ padding: '20px 26px' }}>
      <ProjectHeaderCard
        project={state.project}
        proposal={proposal}
        budgeted={budgetedTotal}
        allocated={allocatedTotal}
        autosaveStatus={state.autosaveStatus}
        autosaveError={state.autosaveError}
      />

      <LockedBidItemsRow sections={proposal.sections} totals={proposalTotals} />

      <ProjectPhasesLabelRow />

      <PhaseTabs
        phases={state.project.payload.phases}
        activeIndex={activeIndex}
        budgets={phaseBudgets}
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
  proposal: Proposal;
  budgeted: number;
  allocated: number;
  autosaveStatus: AutosaveStatus;
  autosaveError: string | null;
}

function ProjectHeaderCard({
  project, proposal, budgeted, allocated, autosaveStatus, autosaveError,
}: ProjectHeaderCardProps) {
  const variance = allocated - budgeted;
  const overBudget = variance > 0;
  const variancePct = budgeted > 0 ? (variance / budgeted) * 100 : 0;
  const won = getStatus(proposal) === 'won';

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--hair)',
      borderRadius: 8, padding: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>
              {project.name}
            </div>
            <AutosavePill status={autosaveStatus} error={autosaveError} />
          </div>
          <div style={{
            fontSize: 11.5, color: 'var(--muted)', marginTop: 4,
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          }}>
            <span>{project.legal_entity}</span>
            <span>·</span>
            <span>{project.department}</span>
            <span>·</span>
            <span>iCore</span>
            <ICoreBadge id={project.icore_project_id} locked={won} />
            {project.current_pm_name && <>
              <span>·</span>
              <span>PM {project.current_pm_name}</span>
            </>}
          </div>
        </div>
        <BudgetVsAllocatedStats
          phases={project.payload.phases.length}
          sections={proposal.sections.length}
          budgeted={budgeted}
          allocated={allocated}
          variance={variance}
          variancePct={variancePct}
          overBudget={overBudget}
        />
      </div>
      <BudgetBar budgeted={budgeted} allocated={allocated} />
    </div>
  );
}

interface BudgetVsAllocatedStatsProps {
  phases: number;
  sections: number;
  budgeted: number;
  allocated: number;
  variance: number;
  variancePct: number;
  overBudget: boolean;
}

function BudgetVsAllocatedStats({
  phases, sections, budgeted, allocated, variance, variancePct, overBudget,
}: BudgetVsAllocatedStatsProps) {
  const tone = overBudget ? 'danger' : 'win';
  const variancePrefix = variance >= 0 ? '+' : '−';
  const varianceLabel = `${variancePrefix}${fmt$(Math.abs(variance))}`;
  const pctLabel = `${Math.abs(variancePct).toFixed(1)}% ${overBudget ? 'over' : 'under'}`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <Stat label="Phases" value={String(phases)} />
      <div style={{ width: 1, height: 36, background: 'var(--hair)' }} />
      <Stat label="Budgeted (proposal)" value={fmt$(budgeted)}
        sub={`${sections} bid item${sections === 1 ? '' : 's'}`} />
      <Stat label="Allocated (project)" value={fmt$(allocated)} tone={tone}
        sub={budgeted === 0 ? undefined : (overBudget ? 'over' : 'tracking')} />
      <Stat label="Variance" value={varianceLabel} tone={tone}
        sub={budgeted === 0 ? '—' : pctLabel} />
    </div>
  );
}

function BudgetBar({ budgeted, allocated }: { budgeted: number; allocated: number }) {
  if (budgeted <= 0) return null;
  const pct = Math.min(100, (allocated / budgeted) * 100);
  const over = allocated > budgeted;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        position: 'relative', height: 8, borderRadius: 4,
        background: 'var(--canvas-deep)', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`,
          background: over ? 'var(--action-danger)' : 'var(--action-success)',
          transition: 'width .3s',
        }} />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 10.5, color: 'var(--muted)', marginTop: 4,
      }}>
        <span>{fmt$(0)}</span>
        <span className="tabular">{Math.round(pct)}% allocated</span>
        <span>{fmt$(budgeted)}</span>
      </div>
    </div>
  );
}

function ProjectPhasesLabelRow() {
  return (
    <div style={{
      background: 'var(--canvas)',
      border: '1px solid var(--hair)',
      borderTop: '1px dashed var(--hair-strong)',
      borderBottom: 'none',
      padding: '8px 12px 0',
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    }}>
      <span style={{
        fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6,
        color: 'var(--navy-deep)', textTransform: 'uppercase',
      }}>Project phases</span>
      <span style={{
        fontSize: 9.5, fontWeight: 600, color: 'var(--muted)',
        padding: '1px 6px', border: '1px solid var(--hair)', borderRadius: 9,
        letterSpacing: 0.4, background: 'var(--surface)',
      }}>
        How you're running the work
      </span>
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>
        Phases rarely match bid items 1:1 — that's expected
      </span>
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  tone?: 'ink' | 'win' | 'danger';
  sub?: string;
}

function Stat({ label, value, tone = 'ink', sub }: StatProps) {
  const colors: Record<NonNullable<StatProps['tone']>, string> = {
    ink:    'var(--ink)',
    win:    'var(--action-success)',
    danger: 'var(--action-danger)',
  };
  return (
    <div>
      <div style={{
        fontSize: 10.5, letterSpacing: 0.4, fontWeight: 600,
        color: 'var(--muted)', textTransform: 'uppercase',
      }}>{label}</div>
      <div className="tabular" style={{
        fontSize: 14, fontWeight: 700, color: colors[tone],
      }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 1 }}>{sub}</div>
      )}
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
