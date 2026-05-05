// Internal reducer for the project editor (<ProjectEditor>).
//
// Mirrors the pattern in PM Quoting App's QuoteEditor — local state lives in
// a useReducer scoped to the editor component, autosaves via debounce to
// `window.api.project.savePayload`. On save success we sync the outer
// EditorState with `dispatch({ type: 'LOAD_PROJECT', project })` so anything
// reading state.project (e.g. the dashboard refresh, ClickUp send button)
// sees the fresh row.

import type {
  AutosaveStatus, Project, ProjectExpense, ProjectHeader, ProjectPhase,
  ProjectTask, ResourceAssignment,
} from '../types/domain';

// ── state ───────────────────────────────────────────────────────────────────

export interface ProjectEditorState {
  project: Project;
  /** -1 means "all phases" (only used by some legacy views; default 0). */
  activePhaseIndex: number;
  autosaveStatus: AutosaveStatus;
  autosaveError: string | null;
}

export function initialProjectState(project: Project): ProjectEditorState {
  return {
    project,
    activePhaseIndex: 0,
    autosaveStatus: 'saved',
    autosaveError: null,
  };
}

// ── actions ─────────────────────────────────────────────────────────────────

export type ProjectEditorAction =
  /** Replace the whole project (autosave success / external reload). */
  | { type: 'LOAD_FRESH'; project: Project }
  /** Patch one or more header columns. */
  | { type: 'SET_HEADER'; patch: Partial<ProjectHeader> }
  | { type: 'SET_ACTIVE_PHASE'; index: number }

  | { type: 'ADD_PHASE' }
  | { type: 'REMOVE_PHASE'; index: number }
  | { type: 'REORDER_PHASES'; fromIndex: number; toIndex: number }
  | { type: 'UPDATE_PHASE'; index: number; patch: Partial<ProjectPhase> }

  | { type: 'ADD_TASK'; phaseIndex: number }
  | { type: 'UPDATE_TASK'; phaseIndex: number; taskIndex: number; patch: Partial<ProjectTask> }
  | { type: 'REMOVE_TASK'; phaseIndex: number; taskIndex: number }
  | { type: 'REORDER_TASKS'; phaseIndex: number; fromIndex: number; toIndex: number }

  | { type: 'ADD_EXPENSE'; phaseIndex: number }
  | { type: 'UPDATE_EXPENSE'; phaseIndex: number; expenseIndex: number; patch: Partial<ProjectExpense> }
  | { type: 'REMOVE_EXPENSE'; phaseIndex: number; expenseIndex: number }

  | { type: 'ADD_RESOURCE'; phaseIndex: number; assignment: ResourceAssignment }
  | { type: 'UPDATE_RESOURCE'; index: number; patch: Partial<ResourceAssignment> }
  | { type: 'REMOVE_RESOURCE'; index: number }

  | { type: 'AUTOSAVE_START' }
  | { type: 'AUTOSAVE_OK'; project: Project }
  | { type: 'AUTOSAVE_ERR'; error: string };

// ── reducer ─────────────────────────────────────────────────────────────────

/** Action types whose result is a payload (phases or resources) change.
 *  These flip autosaveStatus to 'idle' so the debounce kicks in.
 *  Header-only changes use a separate save (project.updateHeader) handled
 *  by callers, so they don't enter this set. */
const PAYLOAD_MUTATIONS = new Set<ProjectEditorAction['type']>([
  'ADD_PHASE', 'REMOVE_PHASE', 'UPDATE_PHASE', 'REORDER_PHASES',
  'ADD_TASK', 'UPDATE_TASK', 'REMOVE_TASK', 'REORDER_TASKS',
  'ADD_EXPENSE', 'UPDATE_EXPENSE', 'REMOVE_EXPENSE',
  'ADD_RESOURCE', 'UPDATE_RESOURCE', 'REMOVE_RESOURCE',
]);

export function projectReducer(
  state: ProjectEditorState,
  action: ProjectEditorAction,
): ProjectEditorState {
  const next = step(state, action);
  if (next === state) return state;
  if (PAYLOAD_MUTATIONS.has(action.type) && state.autosaveStatus !== 'saving') {
    return { ...next, autosaveStatus: 'idle', autosaveError: null };
  }
  return next;
}

function step(state: ProjectEditorState, action: ProjectEditorAction): ProjectEditorState {
  switch (action.type) {
    case 'LOAD_FRESH':
      return {
        project: action.project,
        activePhaseIndex: clamp(state.activePhaseIndex, action.project.payload.phases.length),
        autosaveStatus: 'saved',
        autosaveError: null,
      };

    case 'SET_HEADER':
      return { ...state, project: { ...state.project, ...action.patch } };

    case 'SET_ACTIVE_PHASE':
      return { ...state, activePhaseIndex: clamp(action.index, state.project.payload.phases.length) };

    case 'ADD_PHASE': {
      const phases = state.project.payload.phases;
      const next: ProjectPhase = {
        phase_no: phases.length + 1,
        name: `Phase ${phases.length + 1}`,
        rate_table: state.project.rate_table || '',
        project_type: 'FF',
        due_date: null,
        scope_text: '',
        notes: '',
        target_budget: null,
        tasks: [],
        expenses: [],
      };
      return mergePayload(state, {
        phases: [...phases, next],
      }, { activePhaseIndex: phases.length });
    }

    case 'REMOVE_PHASE': {
      const phases = state.project.payload.phases.filter((_, i) => i !== action.index);
      // Resources reference phase_no; renumber phases and update resources.
      const renumbered = phases.map((p, i) => ({ ...p, phase_no: i + 1 }));
      const oldNo = state.project.payload.phases[action.index]?.phase_no;
      const resources = state.project.payload.resources
        .filter(r => r.phase_no !== oldNo)
        .map(r => {
          const newIdx = state.project.payload.phases.findIndex(p => p.phase_no === r.phase_no);
          if (newIdx === -1) return r;
          // After removal, indices > action.index shift down by 1.
          const adjusted = newIdx > action.index ? newIdx - 1 : newIdx;
          return { ...r, phase_no: adjusted + 1 };
        });
      const newActive = clamp(state.activePhaseIndex >= action.index
        ? state.activePhaseIndex - 1
        : state.activePhaseIndex, renumbered.length);
      return mergePayload(state, { phases: renumbered, resources }, { activePhaseIndex: newActive });
    }

    case 'UPDATE_PHASE': {
      const phases = state.project.payload.phases.map((p, i) =>
        i === action.index ? { ...p, ...action.patch } : p,
      );
      return mergePayload(state, { phases });
    }

    case 'REORDER_PHASES': {
      if (action.fromIndex === action.toIndex) return state;
      const original = state.project.payload.phases;
      if (action.fromIndex < 0 || action.fromIndex >= original.length) return state;
      if (action.toIndex < 0 || action.toIndex >= original.length) return state;
      // 1) Move the phase. phase_no values are still the OLD values here.
      const moved = original.slice();
      const [pulled] = moved.splice(action.fromIndex, 1);
      moved.splice(action.toIndex, 0, pulled);
      // 2) Map old phase_no → new phase_no based on new position, then renumber.
      const phaseNoMap = new Map<number, number>();
      moved.forEach((p, i) => { phaseNoMap.set(p.phase_no, i + 1); });
      const phases = moved.map((p, i) => ({ ...p, phase_no: i + 1 }));
      // 3) Resources reference phase by phase_no — translate.
      const resources = state.project.payload.resources.map((r) => ({
        ...r,
        phase_no: phaseNoMap.get(r.phase_no) ?? r.phase_no,
      }));
      // 4) Keep activePhaseIndex tracking the same logical phase if it moved.
      let newActive = state.activePhaseIndex;
      if (state.activePhaseIndex === action.fromIndex) {
        newActive = action.toIndex;
      } else {
        const lo = Math.min(action.fromIndex, action.toIndex);
        const hi = Math.max(action.fromIndex, action.toIndex);
        if (state.activePhaseIndex >= lo && state.activePhaseIndex <= hi) {
          newActive = state.activePhaseIndex + (action.fromIndex < action.toIndex ? -1 : 1);
        }
      }
      return mergePayload(state, { phases, resources }, { activePhaseIndex: newActive });
    }

    case 'ADD_TASK': {
      const phases = state.project.payload.phases.map((p, i) => {
        if (i !== action.phaseIndex) return p;
        const tasks = [...p.tasks, {
          task_no: p.tasks.length + 1,
          name: 'New task',
          category: '',
          hours: 0,
          rate_override: null,
          rate_baseline: null,
        }];
        return { ...p, tasks };
      });
      return mergePayload(state, { phases });
    }

    case 'UPDATE_TASK': {
      const phases = state.project.payload.phases.map((p, i) => {
        if (i !== action.phaseIndex) return p;
        const tasks = p.tasks.map((t, ti) =>
          ti === action.taskIndex ? { ...t, ...action.patch } : t,
        );
        return { ...p, tasks };
      });
      return mergePayload(state, { phases });
    }

    case 'REMOVE_TASK': {
      const phases = state.project.payload.phases.map((p, i) => {
        if (i !== action.phaseIndex) return p;
        const tasks = p.tasks
          .filter((_, ti) => ti !== action.taskIndex)
          .map((t, ti) => ({ ...t, task_no: ti + 1 }));
        return { ...p, tasks };
      });
      return mergePayload(state, { phases });
    }

    case 'REORDER_TASKS': {
      if (action.fromIndex === action.toIndex) return state;
      const phases = state.project.payload.phases.map((p, i) => {
        if (i !== action.phaseIndex) return p;
        if (action.fromIndex < 0 || action.fromIndex >= p.tasks.length) return p;
        if (action.toIndex < 0 || action.toIndex >= p.tasks.length) return p;
        const moved = p.tasks.slice();
        const [pulled] = moved.splice(action.fromIndex, 1);
        moved.splice(action.toIndex, 0, pulled);
        const tasks = moved.map((t, ti) => ({ ...t, task_no: ti + 1 }));
        return { ...p, tasks };
      });
      return mergePayload(state, { phases });
    }

    case 'ADD_EXPENSE': {
      const phases = state.project.payload.phases.map((p, i) => {
        if (i !== action.phaseIndex) return p;
        const expenses = [...p.expenses, {
          description: '', category: '', quantity: 1, amount: 0, markup_pct: 0,
        }];
        return { ...p, expenses };
      });
      return mergePayload(state, { phases });
    }

    case 'UPDATE_EXPENSE': {
      const phases = state.project.payload.phases.map((p, i) => {
        if (i !== action.phaseIndex) return p;
        const expenses = p.expenses.map((e, ei) =>
          ei === action.expenseIndex ? { ...e, ...action.patch } : e,
        );
        return { ...p, expenses };
      });
      return mergePayload(state, { phases });
    }

    case 'REMOVE_EXPENSE': {
      const phases = state.project.payload.phases.map((p, i) => {
        if (i !== action.phaseIndex) return p;
        const expenses = p.expenses.filter((_, ei) => ei !== action.expenseIndex);
        return { ...p, expenses };
      });
      return mergePayload(state, { phases });
    }

    case 'ADD_RESOURCE':
      return mergePayload(state, {
        resources: [...state.project.payload.resources, {
          ...action.assignment,
          phase_no: state.project.payload.phases[action.phaseIndex]?.phase_no ?? action.phaseIndex + 1,
        }],
      });

    case 'UPDATE_RESOURCE': {
      const resources = state.project.payload.resources.map((r, i) =>
        i === action.index ? { ...r, ...action.patch } : r,
      );
      return mergePayload(state, { resources });
    }

    case 'REMOVE_RESOURCE': {
      const resources = state.project.payload.resources.filter((_, i) => i !== action.index);
      return mergePayload(state, { resources });
    }

    case 'AUTOSAVE_START':
      return { ...state, autosaveStatus: 'saving' };

    case 'AUTOSAVE_OK':
      return {
        project: action.project,
        activePhaseIndex: clamp(state.activePhaseIndex, action.project.payload.phases.length),
        autosaveStatus: 'saved',
        autosaveError: null,
      };

    case 'AUTOSAVE_ERR':
      return { ...state, autosaveStatus: 'error', autosaveError: action.error };
  }
}

function mergePayload(
  state: ProjectEditorState,
  patch: Partial<Project['payload']>,
  extra: Partial<ProjectEditorState> = {},
): ProjectEditorState {
  return {
    ...state,
    project: {
      ...state.project,
      payload: { ...state.project.payload, ...patch },
    },
    ...extra,
  };
}

function clamp(index: number, length: number): number {
  if (length === 0) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}
