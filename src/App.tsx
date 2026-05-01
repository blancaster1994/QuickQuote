// QuickQuote root component. Direct port of QuickProp/ui/app.jsx.
// Owns EditorState via the reducer and handles:
//   · bootstrap on mount
//   · identity gate (FirstRunIdentity until a user is picked)
//   · view routing (Editor | Dashboard) — kept on state.view for now;
//     a future polish step can promote this to react-router-dom routes
//     without changing component contracts.
//   · autosave (800ms debounce) with version-prompt for frozen proposals
//   · keyboard shortcuts (Ctrl+G generate, Ctrl+Shift+G format picker,
//     Ctrl+D toggle dashboard)
//   · generate flow (DOCX / PDF) with reuse-detection feedback
//   · duplicate proposal with collision-free name picker

import {
  useCallback, useEffect, useMemo, useReducer, useRef, useState,
  type Dispatch,
} from 'react';
import { reducer, initialState } from './state/editorReducer';
import type { EditorAction, EditorState } from './state/editorReducer';
import { calcProposal } from './lib/calc';
import { getStatus, isFrozen, STATUS_LABELS } from './lib/lifecycle';
import type { Bootstrap, GeneratedFormat, Identity, Proposal, ViewingVersion } from './types/domain';

import TopBar from './components/TopBar';
import HeaderCard from './components/HeaderCard';
import BidItemTabs from './components/BidItemTabs';
import SectionEditor from './components/SectionEditor';
import DocPreview from './components/DocPreview';
import Dashboard from './components/Dashboard';
import {
  ActivityTimeline, FirstRunIdentity, Modal, ModalActions, StatusActionBar,
} from './components/StatusComponents';

type VersionPromptState = null | 'pending' | 'dismissed';

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [bridgeErr, setBridgeErr] = useState<string | null>(null);
  const [dashboardRefresh, setDashboardRefresh] = useState(0);
  const [generating, setGenerating] = useState<GeneratedFormat | null>(null);
  const [versionPrompt, setVersionPrompt] = useState<VersionPromptState>(null);

  // Bootstrap on mount — config + current identity in one IPC call.
  useEffect(() => {
    void (async () => {
      try {
        const boot = (await window.api.app.bootstrap()) as Bootstrap;
        dispatch({ type: 'SET_BOOTSTRAP', payload: boot });
        if (boot.identity) dispatch({ type: 'SET_IDENTITY', identity: boot.identity });
      } catch (e: any) {
        setBridgeErr(String(e?.message || String(e)));
      }
    })();
  }, []);

  // Latest-proposal ref so the autosave timeout uses the current state at
  // fire time, not at scheduling time.
  const proposalRef = useRef<Proposal>(state.proposal);
  proposalRef.current = state.proposal;

  // Keep latest projectName + lastFormat in refs so the keyboard-shortcut
  // handler doesn't have to re-bind on every dispatch.
  const lastFormatRef = useRef<GeneratedFormat>(state.lastFormat);
  lastFormatRef.current = state.lastFormat;

  // Reload the project list (keeps the dashboard / sidebar in sync).
  const reloadProjects = useCallback(async () => {
    try {
      const names = (await window.api.proposals.list()) as string[];
      const current = state.bootstrap;
      if (current) {
        dispatch({
          type: 'SET_BOOTSTRAP',
          payload: { ...current, projects: names },
        });
      }
      setDashboardRefresh((k) => k + 1);
    } catch (e) {
      console.error('reloadProjects', e);
    }
  }, [state.bootstrap]);

  // Autosave — 800ms debounce. Skipped while:
  //   - the project hasn't been named yet (no filename to save under)
  //   - the user is viewing a historical snapshot (read-only)
  //   - the proposal is frozen and the version prompt hasn't been resolved
  useEffect(() => {
    if (state.autosaveStatus !== 'idle') return;
    if (!state.proposal.name?.trim()) return;
    if (state.viewingVersion) return;
    if (isFrozen(state.proposal) && versionPrompt !== 'dismissed') {
      if (versionPrompt === null) setVersionPrompt('pending');
      return;
    }
    const handle = window.setTimeout(async () => {
      dispatch({ type: 'AUTOSAVE_START' });
      try {
        const priorName = state.projectName;
        const currentName = (proposalRef.current.name || '').trim();
        const renameFrom = priorName && priorName !== currentName ? priorName : null;
        const res = (await window.api.proposals.save(proposalRef.current, renameFrom)) as {
          ok: boolean; name: string; proposal: { lifecycle?: any };
        };
        dispatch({ type: 'AUTOSAVE_OK', name: res.name });
        if (res.proposal?.lifecycle) {
          dispatch({ type: 'REPLACE_LIFECYCLE', lifecycle: res.proposal.lifecycle });
        }
        if (renameFrom) await reloadProjects();
      } catch (e: any) {
        dispatch({ type: 'AUTOSAVE_ERR', error: String(e?.message || String(e)) });
      }
    }, 800);
    return () => window.clearTimeout(handle);
  }, [state.proposal, state.autosaveStatus, versionPrompt, state.viewingVersion, state.projectName, reloadProjects]);

  // Reset the version prompt when switching proposals.
  useEffect(() => { setVersionPrompt(null); }, [state.projectName]);

  const handleSelectProject = useCallback(async (name: string) => {
    try {
      const p = (await window.api.proposals.load(name)) as Proposal;
      dispatch({ type: 'LOAD_PROPOSAL', payload: p });
      dispatch({ type: 'SET_VIEW', view: 'editor' });
    } catch (e: any) {
      console.error('proposals.load failed', e);
      alert(`Couldn't load "${name}": ${e?.message || String(e)}`);
    }
  }, []);

  const handleNewProject = useCallback(() => {
    dispatch({ type: 'NEW_PROPOSAL' });
    dispatch({ type: 'SET_VIEW', view: 'editor' });
  }, []);

  // Duplicate the current proposal: clone content with a fresh lifecycle and
  // a "Copy of …" name that doesn't collide with anything in the project list.
  const handleDuplicate = useCallback(() => {
    const src = state.proposal;
    if (!src.name?.trim()) {
      alert('Save the current proposal first before duplicating it.');
      return;
    }
    const existing = new Set(state.bootstrap?.projects || []);
    let candidate = `Copy of ${src.name}`;
    if (existing.has(candidate)) {
      for (let i = 2; i < 1000; i++) {
        const next = `Copy of ${src.name} (${i})`;
        if (!existing.has(next)) { candidate = next; break; }
      }
    }
    dispatch({ type: 'DUPLICATE_PROPOSAL', newName: candidate });
    dispatch({ type: 'SET_VIEW', view: 'editor' });
  }, [state.proposal, state.bootstrap]);

  const handleGenerate = useCallback(async (format: GeneratedFormat) => {
    if (state.viewingVersion) {
      alert(`You're viewing ${state.viewingVersion.label} (read-only). Return to the working version before generating.`);
      return;
    }
    const proposal = state.proposal;
    if (!proposal.name?.trim()) {
      alert('Give the proposal a project name before generating.');
      return;
    }
    if (generating) return;
    setGenerating(format);
    try {
      const result: any = format === 'pdf'
        ? await window.api.generate.pdf(proposal, '')
        : await window.api.generate.docx(proposal);
      if (!result?.ok) {
        throw new Error(result?.error || 'Generator returned no result');
      }
      // A fresh (non-reused) generation is a new milestone. If the user edits
      // afterward, re-arm the version prompt so the next save asks again.
      if (!result.reused && isFrozen(state.proposal)) {
        setVersionPrompt(null);
      }
      const verb = result.reused ? 'Already generated' : 'Generated';
      const note = result.reused
        ? `${verb} ${result.filename}\n\nThis file matches the current proposal — no changes since the last generation, so no new copy was made.\n\nOpen it now?`
        : `${verb} ${result.filename}\n\nOpen it now?`;
      const open = confirm(note);
      if (open && result.path) {
        await window.api.os.openFile(result.path);
      }
    } catch (e: any) {
      console.error('Generate failed', e);
      alert(`Generate failed: ${e?.message || String(e)}`);
    } finally {
      setGenerating(null);
    }
  }, [state.proposal, generating, state.viewingVersion]);

  // Keyboard shortcuts: Ctrl/⌘+G generate (last format), Ctrl/⌘+Shift+G
  // format picker, Ctrl/⌘+D toggle dashboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && !e.shiftKey && key === 'g') {
        e.preventDefault();
        void handleGenerate(lastFormatRef.current);
      } else if (mod && e.shiftKey && key === 'g') {
        e.preventDefault();
        dispatch({ type: 'SET_GEN_MENU', open: !state.genMenuOpen });
      } else if (mod && !e.shiftKey && key === 'd') {
        e.preventDefault();
        dispatch({ type: 'SET_VIEW', view: state.view === 'editor' ? 'dashboard' : 'editor' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleGenerate, state.genMenuOpen, state.view]);

  if (bridgeErr) return <ErrorScreen message={bridgeErr} />;
  if (!state.bootstrap) return <LoadingScreen />;

  // Identity gate: until the user picks themselves from the allowed list, we
  // render nothing but the picker. All other UI is downstream of attribution.
  if (!state.identity) {
    return (
      <FirstRunIdentity
        allowed={state.bootstrap.allowed_users || []}
        onPicked={(id: Identity) => dispatch({ type: 'SET_IDENTITY', identity: id })}
      />
    );
  }

  return (
    <div style={{
      width: '100%', height: '100vh', background: 'var(--canvas)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <TopBar
        state={state}
        dispatch={dispatch}
        onNewProject={handleNewProject}
        onDuplicateProject={handleDuplicate}
        onGenerate={handleGenerate}
        generating={generating}
        onReloadProjects={reloadProjects}
      />

      <ImportBanner state={state} onAfterImport={reloadProjects} />

      {state.view === 'dashboard' ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Dashboard
            state={state}
            dispatch={dispatch}
            onOpenProposal={handleSelectProject}
            refreshKey={dashboardRefresh}
          />
        </div>
      ) : (
        <EditorLayout state={state} dispatch={dispatch} onReload={reloadProjects} />
      )}

      {versionPrompt === 'pending' && state.projectName && (
        <VersionPromptModal
          proposal={state.proposal}
          onSnapshot={async () => {
            try {
              const res = (await window.api.versions.create(
                state.projectName!,
                'Snapshot created because the proposal was edited after sending.',
              )) as { proposal: { lifecycle: any } };
              dispatch({ type: 'REPLACE_LIFECYCLE', lifecycle: res.proposal.lifecycle });
              setVersionPrompt('dismissed');
            } catch (e: any) {
              alert(`Create version failed: ${e?.message || String(e)}`);
            }
          }}
          onContinueWithoutVersioning={() => setVersionPrompt('dismissed')}
        />
      )}
    </div>
  );
}

interface EditorLayoutProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  onReload: () => Promise<void>;
}

function EditorLayout({ state, dispatch, onReload }: EditorLayoutProps) {
  const viewing = state.viewingVersion;
  return (
    <div style={{
      flex: 1, display: 'grid',
      gridTemplateColumns: state.previewOpen ? '1fr 680px' : '1fr',
      minHeight: 0, transition: 'grid-template-columns .2s ease',
    }}>
      <div style={{ overflow: 'auto', padding: '20px 26px', background: 'var(--canvas)' }}>
        {viewing && <ViewingSnapshotBanner viewing={viewing} dispatch={dispatch} />}

        {/* Wrapper applies pointer-events: none + opacity when viewing a
            snapshot so the editor area is visually and functionally read-only.
            Belt-and-suspenders: the reducer also drops content-mutation
            actions when viewingVersion is set. */}
        <div style={viewing
          ? { pointerEvents: 'none', opacity: 0.78, userSelect: 'text' }
          : undefined}
          aria-readonly={!!viewing}>
          <StatusActionBar state={state} dispatch={dispatch}
            onReload={onReload} onDeleted={onReload} />
          {state.activityOpen && (
            <div style={{ marginBottom: 14 }}>
              <ActivityTimeline proposal={state.proposal} />
            </div>
          )}
          <HeaderCard proposal={state.proposal} dispatch={dispatch}
            bootstrap={state.bootstrap} />
          <SectionsRegion state={state} dispatch={dispatch} />
        </div>
      </div>

      {state.previewOpen && <PreviewColumn state={state} />}
    </div>
  );
}

interface ViewingSnapshotBannerProps {
  viewing: ViewingVersion;
  dispatch: Dispatch<EditorAction>;
}

function ViewingSnapshotBanner({ viewing, dispatch }: ViewingSnapshotBannerProps) {
  const when = (() => {
    const d = new Date(viewing.snapshot_at);
    return isNaN(d.getTime()) ? viewing.snapshot_at : d.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  })();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', marginBottom: 14,
      background: '#FDF3E3', border: '1px solid #F3CFA8', borderRadius: 8,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%', background: '#8A5A1A',
        color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0,
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4Z" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#5A3A0A' }}>
          Viewing {viewing.label} — read only
        </div>
        <div style={{ fontSize: 11.5, color: '#7A5A2A', marginTop: 1 }}>
          Snapshot from {when}
          {viewing.snapshot_by?.name && <> · by {viewing.snapshot_by.name}</>}
          . Edits, generation, and status actions are disabled while viewing.
        </div>
      </div>
      <button onClick={() => dispatch({ type: 'RETURN_TO_LIVE' })}
        style={{
          height: 30, padding: '0 14px', borderRadius: 6,
          background: '#8A5A1A', color: '#fff', border: 'none',
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'var(--sans)', flexShrink: 0,
        }}>
        Return to working version
      </button>
    </div>
  );
}

interface VersionPromptModalProps {
  proposal: Proposal;
  onSnapshot: () => void;
  onContinueWithoutVersioning: () => void;
}

function VersionPromptModal({ proposal, onSnapshot, onContinueWithoutVersioning }: VersionPromptModalProps) {
  const status = getStatus(proposal);
  return (
    <Modal title={`Editing a ${STATUS_LABELS[status] || status} proposal`}
      onClose={onContinueWithoutVersioning}>
      <div style={{ fontSize: 13, color: 'var(--body)', lineHeight: 1.5 }}>
        This proposal has already been sent. If the edits are meaningful enough that
        a revised proposal will go out, snapshot the current state as a new version
        first — that preserves the generated .docx/.pdf in version history and keeps
        an audit trail.
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
        Minor typo fixes and internal cleanups? It's fine to skip versioning.
      </div>
      <ModalActions onCancel={onContinueWithoutVersioning} onConfirm={onSnapshot}
        confirmLabel="Snapshot as new version" confirmKind="primary" />
    </Modal>
  );
}

function PreviewColumn({ state }: { state: EditorState }) {
  const { totals, sum } = useMemo(() => calcProposal(state.proposal), [state.proposal]);
  return (
    <div style={{
      borderLeft: '1px solid var(--hair)', background: 'var(--canvas-deep)',
      overflow: 'auto', display: 'flex', justifyContent: 'center',
      padding: '18px 22px',
    }}>
      <DocPreview proposal={state.proposal} totals={totals} sum={sum}
        activeSection={state.activeSection} />
    </div>
  );
}

function SectionsRegion({ state, dispatch }: { state: EditorState; dispatch: Dispatch<EditorAction> }) {
  const { totals } = useMemo(() => calcProposal(state.proposal), [state.proposal]);
  const section = state.proposal.sections.find((s) => s.id === state.activeSection)
                ?? state.proposal.sections[0];
  const total = totals.find((t) => t.id === section.id)
              ?? { id: section.id, fee: section.fee, labor: 0, expenses: 0, grand: 0 };

  return (
    <>
      <BidItemTabs sections={state.proposal.sections} totals={totals}
        activeSection={state.activeSection} dispatch={dispatch} />
      <SectionEditor section={section} total={total} state={state} dispatch={dispatch} />
    </>
  );
}

interface ImportBannerProps {
  state: EditorState;
  onAfterImport: () => Promise<void>;
}

function ImportBanner({ state, onAfterImport }: ImportBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ proposals: number; clientTpls: number; projectTpls: number; identity: boolean } | null>(null);

  // Only show when the DB is empty + identity is set + the user hasn't
  // dismissed it. The IPC call is gated by schema_meta.imported_from_quickprop
  // on the main side, so a refresh after a successful import won't re-show
  // this even without the local dismissed flag.
  const hasProposals = (state.bootstrap?.projects.length || 0) > 0;
  if (hasProposals || dismissed || result) return null;

  async function runImport() {
    setBusy(true);
    try {
      const r: any = await window.api.app.importFromQuickProp();
      if (!r.ok) {
        alert(`Import did not complete:\n\n${r.skipped.join('\n')}`);
        return;
      }
      if (r.alreadyImported) {
        alert('Already imported from QuickProp on a previous run. Nothing to do.');
        setDismissed(true);
        return;
      }
      setResult({
        proposals:   r.proposalsImported,
        clientTpls:  r.clientTemplatesImported,
        projectTpls: r.projectTemplatesImported,
        identity:    r.identityCopied,
      });
      await onAfterImport();
    } catch (e: any) {
      alert(`Import failed: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px', background: 'var(--navy-tint)',
      borderBottom: '1px solid var(--hair)', flexShrink: 0,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--navy-deep)' }}>
          Import from QuickProp?
        </div>
        <div style={{ fontSize: 11, color: 'var(--body)', marginTop: 1 }}>
          QuickQuote has no proposals yet. Pull every proposal, client + project type
          template, and your saved identity over from your QuickProp v3 install.
          Runs once; safe to re-launch afterward.
        </div>
      </div>
      <button onClick={() => setDismissed(true)} disabled={busy}
        style={{
          height: 28, padding: '0 10px', borderRadius: 6,
          background: 'transparent', color: 'var(--muted)',
          border: '1px solid var(--hair)', fontSize: 11.5, fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer', fontFamily: 'var(--sans)',
        }}>
        Skip
      </button>
      <button onClick={runImport} disabled={busy}
        style={{
          height: 28, padding: '0 14px', borderRadius: 6,
          background: 'var(--navy-deep)', color: '#fff', border: 'none',
          fontSize: 11.5, fontWeight: 700,
          cursor: busy ? 'wait' : 'pointer', fontFamily: 'var(--sans)',
        }}>
        {busy ? 'Importing…' : 'Import now'}
      </button>
    </div>
  );
}

function LoadingScreen() {
  return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading bootstrap…</div>;
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div style={{ padding: 40 }}>
      <div style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>Bridge error</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{message}</div>
    </div>
  );
}
