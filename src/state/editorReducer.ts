// EditorState + reducer — typed port of QuickProp/ui/state/store.js.
//
// Logic is preserved verbatim; only types are added. The 34 actions become a
// discriminated union so dispatch sites get full inference and exhaustive
// switch-case checking.

import type {
  AutosaveStatus,
  Bootstrap,
  EditorMode,
  EditorView,
  ExpenseRow,
  GeneratedFormat,
  Identity,
  LaborRow,
  Lifecycle,
  LookupsTab,
  Project,
  Proposal,
  ProjectTemplateRecord,
  ClientTemplateRecord,
  Section,
  ViewingVersion,
  VersionRecord,
} from '../types/domain';

// ── empty / default shapes ──────────────────────────────────────────────────

export function emptySection(n = 1): Section {
  return {
    id:       `s${n}`,
    title:    '',
    scope:    '',
    billing:  'fixed',
    fee:      0,
    notes:    '',
    labor:    [],
    expenses: [],
  };
}

export function emptyLifecycle(): Lifecycle {
  return {
    status:        'draft',
    owner:         { email: '', name: '' },
    collaborators: [],
    activity:      [],
    versions:      [],
    metadata: {
      created_at:       new Date().toISOString(),
      sent_date:        null,
      won_date:         null,
      lost_date:        null,
      lost_reason:      null,
      lost_notes:       null,
      iCore_project_id: null,
      follow_up_at:     null,
    },
  };
}

export function emptyProposal(): Proposal {
  return {
    date: new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    }),
    name:               '',
    address:            '',
    cityStateZip:       '',
    client:             '',
    contact:            '',
    clientAddress:      '',
    clientCityStateZip: '',
    rateTable:          'consulting',
    sections:           [emptySection(1)],
    lifecycle:          emptyLifecycle(),
  };
}

// ── state ───────────────────────────────────────────────────────────────────

export interface EditorState {
  proposal: Proposal;
  activeSection: string;
  feeBuilderOpen: boolean;
  previewOpen: boolean;
  genMenuOpen: boolean;
  lastFormat: GeneratedFormat;
  autosaveStatus: AutosaveStatus;
  autosaveError: string | null;
  bootstrap: Bootstrap | null;
  /** The name the file is saved under, null until first save. */
  projectName: string | null;
  view: EditorView;
  identity: Identity | null;
  activityOpen: boolean;
  staleDays: number;
  winRateWindowDays: number;
  /** Non-null while viewing a historical snapshot; pauses content edits and
   *  autosave. liveProposalCache holds the working proposal so returning is
   *  instant. */
  viewingVersion: ViewingVersion | null;
  liveProposalCache: Proposal | null;
  /** Slide-out Lookups admin panel — open/closed flag and the active sub-tab.
   *  Sidebar's Lookups button toggles `lookupsOpen`; `lookupsTab` survives
   *  panel close so reopening restores where the user left off. */
  lookupsOpen: boolean;
  lookupsTab: LookupsTab;
  /** Editor view mode. 'proposal' is the existing sell-phase editor;
   *  'project' is the post-Won PM editor (Stage 5 fills the body).
   *  LOAD_PROPOSAL flips this to 'project' iff a project row exists for
   *  the loaded proposal. */
  editorMode: EditorMode;
  /** Loaded project row for the current proposal, or null when the proposal
   *  hasn't been initialized as a project yet. */
  project: Project | null;
}

export function initialState(): EditorState {
  const proposal = emptyProposal();
  return {
    proposal,
    activeSection:     proposal.sections[0].id,
    feeBuilderOpen:    true,
    previewOpen:       true,
    genMenuOpen:       false,
    lastFormat:        'docx',
    autosaveStatus:    'idle',
    autosaveError:     null,
    bootstrap:         null,
    projectName:       null,
    view:              'editor',
    identity:          null,
    activityOpen:      false,
    staleDays:         14,
    winRateWindowDays: 90,
    viewingVersion:    null,
    liveProposalCache: null,
    lookupsOpen:       false,
    lookupsTab:        'basic',
    editorMode:        'proposal',
    project:           null,
  };
}

// ── actions ─────────────────────────────────────────────────────────────────

/** Discriminated union of every action accepted by the reducer. Dispatch
 *  sites typecheck against this. */
export type EditorAction =
  | { type: 'SET_BOOTSTRAP'; payload: Bootstrap }
  | { type: 'LOAD_PROPOSAL'; payload: Proposal }
  | { type: 'NEW_PROPOSAL' }
  | { type: 'LOAD_VERSION_VIEW'; snapshot: VersionRecord }
  | { type: 'RETURN_TO_LIVE' }
  | { type: 'DUPLICATE_PROPOSAL'; newName: string }
  | { type: 'SET_FIELD'; field: keyof Proposal; value: Proposal[keyof Proposal] }
  | { type: 'SET_ACTIVE_SECTION'; id: string }
  | { type: 'UPDATE_SECTION'; id: string; patch: Partial<Section> }
  | { type: 'ADD_SECTION' }
  | { type: 'REMOVE_SECTION'; id: string }
  | { type: 'ADD_LABOR_ROW'; id: string }
  | { type: 'UPDATE_LABOR_ROW'; id: string; index: number; patch: Partial<LaborRow> }
  | { type: 'REMOVE_LABOR_ROW'; id: string; index: number }
  | { type: 'ADD_EXPENSE'; id: string }
  | { type: 'UPDATE_EXPENSE'; id: string; index: number; patch: Partial<ExpenseRow> }
  | { type: 'REMOVE_EXPENSE'; id: string; index: number }
  | { type: 'TOGGLE_FEE_BUILDER' }
  | { type: 'TOGGLE_PREVIEW' }
  | { type: 'SET_GEN_MENU'; open: boolean }
  | { type: 'SET_LAST_FORMAT'; format: GeneratedFormat }
  | { type: 'AUTOSAVE_START' }
  | { type: 'AUTOSAVE_OK'; name: string }
  | { type: 'AUTOSAVE_ERR'; error: string }
  | { type: 'SET_CLIENT_TEMPLATES'; templates: string[] }
  | { type: 'APPLY_CLIENT_TEMPLATE'; template: ClientTemplateRecord }
  | { type: 'SET_PROJECT_TEMPLATES'; templates: string[] }
  | { type: 'APPLY_PROJECT_TEMPLATE'; template: ProjectTemplateRecord }
  | { type: 'SET_VIEW'; view: EditorView }
  | { type: 'SET_IDENTITY'; identity: Identity | null }
  | { type: 'TOGGLE_ACTIVITY' }
  | { type: 'SET_ACTIVITY_OPEN'; open: boolean }
  | { type: 'REPLACE_LIFECYCLE'; lifecycle: Lifecycle }
  | { type: 'REPLACE_PROPOSAL'; proposal: Proposal }
  | { type: 'SET_LOOKUPS_OPEN'; open: boolean }
  | { type: 'SET_LOOKUPS_TAB'; tab: LookupsTab }
  | { type: 'SET_EDITOR_MODE'; mode: EditorMode }
  | { type: 'LOAD_PROJECT'; project: Project }
  | { type: 'CLEAR_PROJECT' };

/** Action types that mutate proposal *content* — dropped silently while
 *  viewing a snapshot so historical versions stay read-only. */
const CONTENT_MUTATIONS: ReadonlySet<EditorAction['type']> = new Set([
  'SET_FIELD', 'UPDATE_SECTION', 'ADD_SECTION', 'REMOVE_SECTION',
  'ADD_LABOR_ROW', 'UPDATE_LABOR_ROW', 'REMOVE_LABOR_ROW',
  'ADD_EXPENSE', 'UPDATE_EXPENSE', 'REMOVE_EXPENSE',
]);

// ── reducer ─────────────────────────────────────────────────────────────────

export function reducer(state: EditorState, action: EditorAction): EditorState {
  // Read-only enforcement while viewing a snapshot. Belt-and-suspenders with
  // pointer-events:none on the editor wrapper.
  if (state.viewingVersion && CONTENT_MUTATIONS.has(action.type)) {
    return state;
  }

  switch (action.type) {
    case 'SET_BOOTSTRAP':
      return { ...state, bootstrap: action.payload };

    case 'LOAD_PROPOSAL':
      return {
        ...state,
        proposal:          action.payload,
        activeSection:     action.payload.sections[0]?.id || 's1',
        projectName:       action.payload.name || null,
        autosaveStatus:    'saved',
        viewingVersion:    null,
        liveProposalCache: null,
        // Clear stale project from a previously loaded proposal.
        // App.tsx will fetch the new project (if any) and dispatch
        // LOAD_PROJECT — until then, we default to proposal mode.
        project:           null,
        editorMode:        'proposal',
      };

    case 'NEW_PROPOSAL': {
      const p = emptyProposal();
      return {
        ...state,
        proposal:          p,
        activeSection:     p.sections[0].id,
        projectName:       null,
        autosaveStatus:    'idle',
        viewingVersion:    null,
        liveProposalCache: null,
        project:           null,
        editorMode:        'proposal',
      };
    }

    case 'LOAD_VERSION_VIEW': {
      const snap = action.snapshot;
      if (!snap || !snap.proposal) return state;
      return {
        ...state,
        liveProposalCache: state.proposal,
        proposal: {
          ...snap.proposal,
          lifecycle: state.proposal.lifecycle,
        },
        activeSection:  snap.proposal.sections?.[0]?.id || state.activeSection,
        autosaveStatus: 'saved',
        viewingVersion: {
          version:            snap.version,
          label:              snap.label,
          snapshot_at:        snap.snapshot_at,
          snapshot_by:        snap.snapshot_by,
          status_at_snapshot: snap.status_at_snapshot,
        },
      };
    }

    case 'RETURN_TO_LIVE': {
      if (!state.viewingVersion) return state;
      const live = state.liveProposalCache || state.proposal;
      return {
        ...state,
        proposal:          live,
        activeSection:     live.sections?.[0]?.id || state.activeSection,
        viewingVersion:    null,
        liveProposalCache: null,
        autosaveStatus:    'saved',
      };
    }

    case 'DUPLICATE_PROPOSAL': {
      // Source is always the live proposal, never a viewed snapshot.
      const src = state.liveProposalCache || state.proposal;
      const cloned: Proposal = JSON.parse(JSON.stringify({
        ...src,
        name: action.newName,
        // Reset the date so the duplicate isn't dated in the past.
        date: new Date().toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric',
        }),
      }));
      cloned.lifecycle = emptyLifecycle();
      return {
        ...state,
        proposal:          cloned,
        activeSection:     cloned.sections[0]?.id || 's1',
        projectName:       null,    // not yet on disk under new name
        autosaveStatus:    'idle',  // triggers a save once the user pauses
        viewingVersion:    null,
        liveProposalCache: null,
        project:           null,    // duplicate is a fresh proposal — no project
        editorMode:        'proposal',
      };
    }

    case 'SET_FIELD':
      return {
        ...state,
        proposal:       { ...state.proposal, [action.field]: action.value },
        autosaveStatus: 'idle',
      };

    case 'SET_ACTIVE_SECTION':
      return { ...state, activeSection: action.id };

    case 'UPDATE_SECTION': {
      const sections = state.proposal.sections.map((s) =>
        s.id === action.id ? { ...s, ...action.patch } : s,
      );
      return {
        ...state,
        proposal:       { ...state.proposal, sections },
        autosaveStatus: 'idle',
      };
    }

    case 'ADD_SECTION': {
      const n = state.proposal.sections.length + 1;
      const newSec = emptySection(n);
      return {
        ...state,
        proposal:       { ...state.proposal, sections: [...state.proposal.sections, newSec] },
        activeSection:  newSec.id,
        autosaveStatus: 'idle',
      };
    }

    case 'REMOVE_SECTION': {
      const remaining = state.proposal.sections.filter((s) => s.id !== action.id);
      if (remaining.length === 0) return state;  // never allow zero sections
      return {
        ...state,
        proposal:       { ...state.proposal, sections: remaining },
        activeSection:  remaining[0].id,
        autosaveStatus: 'idle',
      };
    }

    case 'ADD_LABOR_ROW': {
      const sections = state.proposal.sections.map((s) =>
        s.id === action.id
          ? { ...s, labor: [...s.labor, { category: '', employee: '', hrs: 0, rate: 0 }] }
          : s,
      );
      return { ...state, proposal: { ...state.proposal, sections }, autosaveStatus: 'idle' };
    }

    case 'UPDATE_LABOR_ROW': {
      const sections = state.proposal.sections.map((s) => {
        if (s.id !== action.id) return s;
        const labor = s.labor.map((r, i) =>
          i === action.index ? { ...r, ...action.patch } : r,
        );
        return { ...s, labor };
      });
      return { ...state, proposal: { ...state.proposal, sections }, autosaveStatus: 'idle' };
    }

    case 'REMOVE_LABOR_ROW': {
      const sections = state.proposal.sections.map((s) =>
        s.id === action.id
          ? { ...s, labor: s.labor.filter((_, i) => i !== action.index) }
          : s,
      );
      return { ...state, proposal: { ...state.proposal, sections }, autosaveStatus: 'idle' };
    }

    case 'ADD_EXPENSE': {
      const sections = state.proposal.sections.map((s) =>
        s.id === action.id
          ? { ...s, expenses: [...s.expenses, { item: '', qty: 0, unit: '', unitCost: 0, markup: 0 }] }
          : s,
      );
      return { ...state, proposal: { ...state.proposal, sections }, autosaveStatus: 'idle' };
    }

    case 'UPDATE_EXPENSE': {
      const sections = state.proposal.sections.map((s) => {
        if (s.id !== action.id) return s;
        const expenses = s.expenses.map((e, i) =>
          i === action.index ? { ...e, ...action.patch } : e,
        );
        return { ...s, expenses };
      });
      return { ...state, proposal: { ...state.proposal, sections }, autosaveStatus: 'idle' };
    }

    case 'REMOVE_EXPENSE': {
      const sections = state.proposal.sections.map((s) =>
        s.id === action.id
          ? { ...s, expenses: s.expenses.filter((_, i) => i !== action.index) }
          : s,
      );
      return { ...state, proposal: { ...state.proposal, sections }, autosaveStatus: 'idle' };
    }

    case 'TOGGLE_FEE_BUILDER':
      return { ...state, feeBuilderOpen: !state.feeBuilderOpen };

    case 'TOGGLE_PREVIEW':
      return { ...state, previewOpen: !state.previewOpen };

    case 'SET_GEN_MENU':
      return { ...state, genMenuOpen: action.open };

    case 'SET_LAST_FORMAT':
      return { ...state, lastFormat: action.format, genMenuOpen: false };

    case 'AUTOSAVE_START':
      return { ...state, autosaveStatus: 'saving', autosaveError: null };

    case 'AUTOSAVE_OK':
      return { ...state, autosaveStatus: 'saved', autosaveError: null, projectName: action.name };

    case 'AUTOSAVE_ERR':
      return { ...state, autosaveStatus: 'error', autosaveError: action.error };

    case 'SET_CLIENT_TEMPLATES':
      // Bootstrap is loaded before any template fetch fires, but TS doesn't
      // know that. Bail out cleanly instead of producing a partial Bootstrap.
      if (!state.bootstrap) return state;
      return {
        ...state,
        bootstrap: { ...state.bootstrap, client_templates: action.templates },
      };

    case 'APPLY_CLIENT_TEMPLATE': {
      const t = action.template || {};
      return {
        ...state,
        proposal: {
          ...state.proposal,
          client:             t.client             ?? state.proposal.client,
          contact:            t.contact            ?? state.proposal.contact,
          clientAddress:      t.clientAddress      ?? state.proposal.clientAddress,
          clientCityStateZip: t.clientCityStateZip ?? state.proposal.clientCityStateZip,
        },
        autosaveStatus: 'idle',
      };
    }

    case 'SET_PROJECT_TEMPLATES':
      if (!state.bootstrap) return state;
      return {
        ...state,
        bootstrap: { ...state.bootstrap, project_templates: action.templates },
      };

    case 'APPLY_PROJECT_TEMPLATE': {
      // Replace bid items with the template's title+scope pairs. Everything
      // else (billing, fee, labor, expenses, notes) gets default values —
      // these templates intentionally don't carry fee/calc data.
      const tplSections = (action.template?.sections) || [];
      const sections = tplSections.length
        ? tplSections.map((s, i) => ({
            ...emptySection(i + 1),
            title: s.title || '',
            scope: s.scope || '',
          }))
        : [emptySection(1)];
      return {
        ...state,
        proposal:       { ...state.proposal, sections },
        activeSection:  sections[0].id,
        autosaveStatus: 'idle',
      };
    }

    case 'SET_VIEW': {
      // Leaving the editor while viewing a snapshot — return to live so we
      // don't get stuck in read-only mode in another tab.
      if (state.viewingVersion && action.view !== 'editor') {
        const live = state.liveProposalCache || state.proposal;
        return {
          ...state,
          view:              action.view,
          proposal:          live,
          viewingVersion:    null,
          liveProposalCache: null,
        };
      }
      return { ...state, view: action.view };
    }

    case 'SET_IDENTITY':
      return { ...state, identity: action.identity };

    case 'TOGGLE_ACTIVITY':
      return { ...state, activityOpen: !state.activityOpen };

    case 'SET_ACTIVITY_OPEN':
      return { ...state, activityOpen: !!action.open };

    case 'REPLACE_LIFECYCLE':
      // Used after status/version API calls. Python returns the full saved
      // proposal; we merge its lifecycle back so the editor reflects it
      // without clobbering local edits to content fields.
      return {
        ...state,
        proposal: { ...state.proposal, lifecycle: action.lifecycle },
      };

    case 'REPLACE_PROPOSAL':
      return {
        ...state,
        proposal:       action.proposal,
        activeSection:  action.proposal.sections[0]?.id || state.activeSection,
        autosaveStatus: 'saved',
        projectName:    action.proposal.name || state.projectName,
      };

    case 'SET_LOOKUPS_OPEN':
      return { ...state, lookupsOpen: !!action.open };

    case 'SET_LOOKUPS_TAB':
      return { ...state, lookupsTab: action.tab };

    case 'SET_EDITOR_MODE':
      return { ...state, editorMode: action.mode };

    case 'LOAD_PROJECT':
      return { ...state, project: action.project, editorMode: 'project' };

    case 'CLEAR_PROJECT':
      return { ...state, project: null, editorMode: 'proposal' };
  }
}
