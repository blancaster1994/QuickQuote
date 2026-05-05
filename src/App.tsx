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
import type { Bootstrap, GeneratedFormat, Identity, Project, Proposal, ViewingVersion } from './types/domain';

import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import HeaderCard from './components/HeaderCard';
import BidItemTabs from './components/BidItemTabs';
import SectionEditor from './components/SectionEditor';
import DocPreview from './components/DocPreview';
import Dashboard from './components/Dashboard';
import { LookupsPanel } from './components/lookups';
import { ProjectEditor, ProjectModeToggle } from './components/project';
import {
  ActivityTimeline, FirstRunIdentity, Modal, ModalActions, StatusActionBar,
} from './components/StatusComponents';

type VersionPromptState = null | 'pending' | 'dismissed';

interface PostGeneratePrompt {
  filename: string;
  path: string;
  reused: boolean;
  format: GeneratedFormat;
  copied: boolean;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [bridgeErr, setBridgeErr] = useState<string | null>(null);
  const [dashboardRefresh, setDashboardRefresh] = useState(0);
  const [generating, setGenerating] = useState<GeneratedFormat | null>(null);
  const [versionPrompt, setVersionPrompt] = useState<VersionPromptState>(null);
  const [postGenerate, setPostGenerate] = useState<PostGeneratePrompt | null>(null);

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
      // If this proposal has been initialized as a Project (post-Won),
      // load that record too so editorMode flips and the project view
      // is available. Stage 5 renders the project body.
      try {
        const proj = (await window.api.project.getByProposalName(name)) as Project | null;
        if (proj) dispatch({ type: 'LOAD_PROJECT', project: proj });
      } catch (e) {
        console.warn('project.getByProposalName failed', e);
      }
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
      if (result.path) {
        // PDFs go straight into emails most of the time, so auto-copy the
        // file to the clipboard — the user can immediately Ctrl+V it into
        // an Outlook/Gmail attachment area. DOCX files don't get this
        // treatment (they're typically opened locally first).
        let copied = false;
        if (format === 'pdf') {
          try {
            await window.api.os.copyFileToClipboard(result.path);
            copied = true;
          } catch (e) {
            console.warn('copyFileToClipboard failed', e);
          }
        }
        setPostGenerate({
          filename: result.filename,
          path: result.path,
          reused: !!result.reused,
          format,
          copied,
        });
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
      display: 'grid',
      gridTemplateRows: '48px auto 1fr',
      gridTemplateColumns: '200px 1fr',
      overflow: 'hidden',
    }}>
      {/* Row 1, full width: TopBar */}
      <div style={{ gridRow: '1', gridColumn: '1 / span 2', minHeight: 0 }}>
        <TopBar
          state={state}
          dispatch={dispatch}
          onNewProject={handleNewProject}
          onDuplicateProject={handleDuplicate}
          onGenerate={handleGenerate}
          generating={generating}
          onReloadProjects={reloadProjects}
        />
      </div>

      {/* Rows 2-3, col 1: Sidebar (spans the import banner row + main row) */}
      <div style={{ gridRow: '2 / span 2', gridColumn: '1', minHeight: 0 }}>
        <Sidebar state={state} dispatch={dispatch} />
      </div>

      {/* Row 2, col 2: optional import banner */}
      <div style={{ gridRow: '2', gridColumn: '2', minHeight: 0 }}>
        <ImportBanner state={state} onAfterImport={reloadProjects} />
      </div>

      {/* Row 3, col 2: main content (Dashboard or EditorLayout) */}
      <div style={{
        gridRow: '3', gridColumn: '2',
        minHeight: 0, display: 'flex', flexDirection: 'column',
      }}>
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
      </div>

      {postGenerate && (
        <PostGenerateDialog
          prompt={postGenerate}
          onClose={() => setPostGenerate(null)}
          onMarkCopied={() => setPostGenerate((p) => p ? { ...p, copied: true } : p)}
        />
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

      {/* Slide-out Lookups admin panel — position:fixed, lazy-mounted on
          first open, then stays in DOM. Renders nothing until lookupsOpen
          first goes true. */}
      <LookupsPanel state={state} dispatch={dispatch} />
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
  const inProjectMode = state.editorMode === 'project' && !!state.project;
  // Hide DocPreview in project mode — its content is for proposals only.
  // The TopBar Preview toggle stays visible but is rendered disabled by
  // TopBar.tsx so we don't need to gate it twice here.
  const showPreview = state.previewOpen && !inProjectMode;
  return (
    <div style={{
      flex: 1, display: 'grid',
      gridTemplateColumns: showPreview ? '1fr 680px' : '1fr',
      minHeight: 0, transition: 'grid-template-columns .2s ease',
    }}>
      <div style={{ overflow: 'auto', background: 'var(--canvas)' }}>
        {viewing && (
          <div style={{ padding: '20px 26px 0' }}>
            <ViewingSnapshotBanner viewing={viewing} dispatch={dispatch} />
          </div>
        )}

        {inProjectMode && state.project ? (
          // Project mode — phase editor + resource allocation. Read-only when
          // viewing a snapshot, same belt-and-suspenders pattern as proposal.
          <div style={viewing
            ? { pointerEvents: 'none', opacity: 0.78, userSelect: 'text' }
            : undefined}
            aria-readonly={!!viewing}>
            <div style={{ padding: '20px 26px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
              <ProjectModeToggle mode={state.editorMode} dispatch={dispatch} />
              <StatusActionBar state={state} dispatch={dispatch}
                onReload={onReload} onDeleted={onReload} />
            </div>
            <ProjectEditor project={state.project} identity={state.identity} outerDispatch={dispatch} />
          </div>
        ) : (
          // Proposal mode — original sell-phase editor.
          <div style={viewing
            ? { pointerEvents: 'none', opacity: 0.78, userSelect: 'text' }
            : undefined}
            aria-readonly={!!viewing}>
            <div style={{ padding: '20px 26px 0' }}>
              {/* Mode toggle only when this proposal has a project. Lets the
                  user flip back to the project view from proposal mode. */}
              {state.project && (
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                  <ProjectModeToggle mode={state.editorMode} dispatch={dispatch} />
                </div>
              )}
              {state.project && (
                <ProjectAvailableBanner dispatch={dispatch} />
              )}
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
        )}
      </div>

      {showPreview && <PreviewColumn state={state} />}
    </div>
  );
}

function ProjectAvailableBanner({ dispatch }: { dispatch: Dispatch<EditorAction> }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', marginBottom: 14,
      background: 'var(--navy-tint)', border: '1px solid var(--hair)',
      borderRadius: 8,
    }}>
      <div style={{ flex: 1, fontSize: 12.5, color: 'var(--navy-deep)' }}>
        This proposal was won and is now tracked as a project. Switch to
        Project view to edit phases and resources.
      </div>
      <button onClick={() => dispatch({ type: 'SET_EDITOR_MODE', mode: 'project' })}
        style={{
          height: 28, padding: '0 12px',
          background: 'var(--navy-deep)', color: '#fff',
          border: 'none', borderRadius: 6,
          fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'var(--sans)',
        }}>
        Open project
      </button>
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
      background: 'var(--status-draft-bg)', border: '1px solid #F3CFA8', borderRadius: 8,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%', background: 'var(--status-draft-fg)',
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
          background: 'var(--status-draft-fg)', color: '#fff', border: 'none',
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

interface PostGenerateDialogProps {
  prompt: PostGeneratePrompt;
  onClose: () => void;
  onMarkCopied: () => void;
}

function PostGenerateDialog({ prompt, onClose, onMarkCopied }: PostGenerateDialogProps) {
  const isPdf = prompt.format === 'pdf';
  const title = prompt.reused ? 'Already generated' : 'Generated';
  const folder = prompt.path.replace(/[\\/][^\\/]*$/, '');

  async function open() {
    onClose();
    try { await window.api.os.openFile(prompt.path); }
    catch (e: any) { alert(`Couldn't open file: ${e?.message || String(e)}`); }
  }
  async function reveal() {
    try { await window.api.os.revealInExplorer(prompt.path); }
    catch (e: any) { alert(`Couldn't open folder: ${e?.message || String(e)}`); }
  }
  async function copyFile() {
    try {
      await window.api.os.copyFileToClipboard(prompt.path);
      onMarkCopied();
    } catch (e: any) {
      alert(`Couldn't copy to clipboard: ${e?.message || String(e)}`);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ fontSize: 13, color: 'var(--body)', lineHeight: 1.5 }}>
        <div><strong>{prompt.filename}</strong></div>
        <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12.5 }}>
          {prompt.reused
            ? 'This file matches the current proposal — no changes since the last generation, so no new copy was made.'
            : 'Saved to your Generated Proposals folder.'}
        </div>
        {isPdf && prompt.copied && (
          <div style={{
            marginTop: 10, padding: '8px 10px', borderRadius: 6,
            background: 'var(--navy-tint)', color: 'var(--navy-deep)',
            fontSize: 12, fontWeight: 600,
          }}>
            ✓ The PDF is on your clipboard — paste (Ctrl+V) into your email to attach.
          </div>
        )}
        <div style={{
          marginTop: 10, fontSize: 11, color: 'var(--muted)',
          fontFamily: 'var(--sans)', wordBreak: 'break-all',
        }}>
          {folder}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        <button onClick={onClose} style={ghostBtn}>Close</button>
        {isPdf && (
          <button onClick={() => void copyFile()} style={ghostBtn}
            title="Place the file on the clipboard so you can paste it into an email as an attachment.">
            {prompt.copied ? 'Copy again' : 'Copy file'}
          </button>
        )}
        <button onClick={() => void reveal()} style={ghostBtn}
          title="Show the file in File Explorer.">
          Open folder
        </button>
        <button onClick={() => void open()} style={primaryBtn}>
          Open
        </button>
      </div>
    </Modal>
  );
}

const ghostBtn = {
  height: 30, padding: '0 12px', borderRadius: 6,
  background: 'transparent', color: 'var(--body)',
  border: '1px solid var(--hair)',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--sans)',
} as const;

const primaryBtn = {
  height: 30, padding: '0 12px', borderRadius: 6,
  background: 'var(--navy-deep)', color: '#fff', border: 'none',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--sans)',
} as const;
