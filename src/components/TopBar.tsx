// Top bar — ported from QuickProp's TopBar.jsx; trimmed in Stage 2 when the
// Sidebar took over view switching and user-identity. Now: logo + breadcrumb
// + status pill, New / Duplicate / VersionSwitcher, autosave pill, Preview
// toggle, split Generate button. (View switcher and identity menu live in
// Sidebar.tsx.)

import { type Dispatch } from 'react';
import { StatusBadge, VersionSwitcher } from './StatusComponents';
import { getStatus } from '../lib/lifecycle';
import type { GeneratedFormat } from '../types/domain';
import type { EditorAction, EditorState } from '../state/editorReducer';

interface TopBarProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  onNewProject: () => void;
  onDuplicateProject: () => void;
  onGenerate: (format: GeneratedFormat) => void;
  generating: GeneratedFormat | null;
  onReloadProjects?: () => void;
}

export default function TopBar({
  state, dispatch, onNewProject, onDuplicateProject,
  onGenerate, generating, onReloadProjects,
}: TopBarProps) {
  const { proposal, previewOpen, genMenuOpen, lastFormat, autosaveStatus, bootstrap, view } = state;
  const status = getStatus(proposal);
  const appVersion = bootstrap?.app_version || '';

  return (
    <div style={{
      height: 48, background: 'var(--surface)', borderBottom: '1px solid var(--hair)',
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 14, flexShrink: 0,
    }}>
      {/* Brand + breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 28, background: 'var(--navy-deep)', borderRadius: 6,
          display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 900,
          fontSize: 10.5, letterSpacing: 0.2,
        }}>CES</div>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 3,
          fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 700,
          color: 'var(--ink)', letterSpacing: -0.5, lineHeight: 1,
        }}>
          <span style={{ fontStyle: 'italic' }}>Quick</span>
          <span style={{ color: 'var(--navy-deep)', fontWeight: 800, fontStyle: 'normal' }}>Quote</span>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 500,
            color: 'var(--subtle)', marginLeft: 4, letterSpacing: 0.5, alignSelf: 'center',
          }}>v{appVersion}</span>
        </div>
        <div style={{ color: 'var(--subtle)', fontSize: 11 }}>/</div>
        <div style={{
          fontSize: 13, fontWeight: 700, color: 'var(--ink)', maxWidth: 320,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {proposal.name || 'Untitled Proposal'}
        </div>
        <StatusBadge status={status} size="sm" />
      </div>

      <div style={{ flex: 1 }} />

      <button onClick={onNewProject}
        title="Start a new proposal (clears the editor)"
        style={pillButton(false)}>
        <span style={{ fontSize: 13, lineHeight: 1, marginRight: 4 }}>+</span>
        New
      </button>

      <button onClick={onDuplicateProject} disabled={!state.projectName}
        title={state.projectName
          ? 'Duplicate this proposal — creates a fresh draft with the same content'
          : 'Save the current proposal first to enable duplicate'}
        style={pillButton(!state.projectName)}>
        <span style={{ fontSize: 12, lineHeight: 1, marginRight: 4 }}>⧉</span>
        Duplicate
      </button>

      <TextButton disabled>Templates</TextButton>

      {state.projectName && view === 'editor' && (
        <VersionSwitcher state={state} dispatch={dispatch} onReload={onReloadProjects} />
      )}

      <div style={{ width: 1, height: 20, background: 'var(--hair)' }} />

      <AutosavePill status={autosaveStatus} />

      {/* Preview toggle */}
      <button onClick={() => dispatch({ type: 'TOGGLE_PREVIEW' })}
        title={previewOpen ? 'Hide document preview' : 'Show document preview'}
        style={{
          height: 30, padding: '0 12px',
          background: previewOpen ? 'var(--navy-tint)' : 'transparent',
          color: previewOpen ? 'var(--navy-deep)' : 'var(--body)',
          border: `1px solid ${previewOpen ? 'transparent' : 'var(--hair)'}`,
          borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'var(--sans)', display: 'flex', alignItems: 'center', gap: 7,
        }}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="1.5" width="12" height="11" rx="1.2"
            stroke={previewOpen ? 'var(--navy-deep)' : 'var(--muted)'} strokeWidth="1.2" />
          <line x1="8.5" y1="1.5" x2="8.5" y2="12.5"
            stroke={previewOpen ? 'var(--navy-deep)' : 'var(--muted)'} strokeWidth="1.2" />
          {previewOpen && <rect x="9" y="2" width="3.5" height="10" fill="var(--navy-deep)" opacity="0.18" />}
        </svg>
        Preview
      </button>

      {/* Split Generate button */}
      <SplitGenerate
        lastFormat={lastFormat} menuOpen={genMenuOpen} generating={generating}
        onPrimary={() => onGenerate(lastFormat)}
        onToggleMenu={() => dispatch({ type: 'SET_GEN_MENU', open: !genMenuOpen })}
        onCloseMenu={() => dispatch({ type: 'SET_GEN_MENU', open: false })}
        onPickFormat={(fmt) => { dispatch({ type: 'SET_LAST_FORMAT', format: fmt }); onGenerate(fmt); }}
      />
    </div>
  );
}

function TextButton({ children, onClick, disabled }: { children: any; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{
        height: 30, padding: '0 10px', background: 'transparent',
        color: disabled ? 'var(--subtle)' : 'var(--body)',
        border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500,
        cursor: disabled ? 'default' : 'pointer', fontFamily: 'var(--sans)',
      }}>
      {children}
    </button>
  );
}

function AutosavePill({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  const map = {
    idle:   { text: 'Edited',     color: 'var(--muted)', dot: 'var(--subtle)' },
    saving: { text: 'Saving…',    color: 'var(--muted)', dot: 'var(--amber)' },
    saved:  { text: 'Autosaved',  color: 'var(--muted)', dot: 'var(--green)' },
    error:  { text: 'Save error', color: 'var(--red)',   dot: 'var(--red)' },
  } as const;
  const s = map[status] || map.idle;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: s.color }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
      {s.text}
    </div>
  );
}

interface SplitGenerateProps {
  lastFormat: GeneratedFormat;
  menuOpen: boolean;
  generating: GeneratedFormat | null;
  onPrimary: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onPickFormat: (fmt: GeneratedFormat) => void;
}

function SplitGenerate({ lastFormat, menuOpen, generating, onPrimary, onToggleMenu, onCloseMenu, onPickFormat }: SplitGenerateProps) {
  const busy = !!generating;
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', borderRadius: 7,
      position: 'relative', opacity: busy ? 0.75 : 1,
    }}>
      <button type="button" onClick={onPrimary} disabled={busy} style={{
        height: 32, padding: '0 14px', background: 'var(--navy-deep)', color: '#fff',
        border: 'none', borderRadius: '7px 0 0 7px', fontSize: 12, fontWeight: 700,
        cursor: busy ? 'wait' : 'pointer', fontFamily: 'var(--sans)',
        display: 'flex', alignItems: 'center', gap: 8,
        borderRight: '1px solid rgba(255,255,255,0.18)',
      }}>
        {busy
          ? `Generating .${generating}…`
          : <>Generate .{lastFormat}<span style={{ fontSize: 10, opacity: 0.7 }}>⌘G</span></>}
      </button>
      <button type="button" onClick={onToggleMenu} aria-label="Choose format" disabled={busy}
        style={{
          height: 32, width: 26, padding: 0, background: 'var(--navy-deep)', color: '#fff',
          border: 'none', borderRadius: '0 7px 7px 0',
          cursor: busy ? 'wait' : 'pointer',
          display: 'grid', placeItems: 'center',
        }}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="#fff" strokeWidth="1.4"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {menuOpen && (
        <>
          <div onClick={onCloseMenu} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div style={{
            position: 'absolute', top: 36, right: 0, minWidth: 240, zIndex: 11,
            background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(15,25,40,0.12)', overflow: 'hidden',
          }}>
            <GenMenuItem format="docx" label="Word document" sub="Editable .docx from template"
              hotkey="⌘G" active={lastFormat === 'docx'}
              onClick={() => onPickFormat('docx')} />
            <GenMenuItem format="pdf" label="PDF" sub="Ready to send — rendered by Microsoft Word"
              hotkey="⌘⇧G" active={lastFormat === 'pdf'}
              onClick={() => onPickFormat('pdf')} />
            <div style={{
              padding: '8px 12px', borderTop: '1px solid var(--line)',
              background: 'var(--canvas)', fontSize: 10.5, color: 'var(--muted)',
            }}>
              Saves to <code style={{ fontFamily: 'var(--mono)', fontSize: 10.5 }}>Generated Proposals/</code>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function pillButton(disabled: boolean) {
  return {
    height: 30, padding: '0 12px',
    background: 'var(--surface)',
    color: disabled ? 'var(--subtle)' : 'var(--body)',
    border: '1px solid var(--hair)', borderRadius: 6,
    fontSize: 12, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--sans)',
    display: 'inline-flex', alignItems: 'center',
    opacity: disabled ? 0.55 : 1,
  };
}

interface GenMenuItemProps {
  format: GeneratedFormat;
  label: string;
  sub: string;
  hotkey: string;
  active: boolean;
  onClick: () => void;
}

function GenMenuItem({ format, label, sub, hotkey, active, onClick }: GenMenuItemProps) {
  const iconColor = format === 'pdf' ? '#B8322F' : 'var(--navy-deep)';
  const iconBg = format === 'pdf' ? '#FBECEB' : '#EAF0F7';
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
      padding: '10px 12px',
      background: active ? 'var(--canvas)' : 'transparent',
      border: 'none', borderBottom: '1px solid var(--line)',
      cursor: 'pointer', fontFamily: 'var(--sans)', textAlign: 'left',
    }}>
      <div style={{
        width: 28, height: 34, background: iconBg, borderRadius: 4,
        display: 'grid', placeItems: 'center',
        color: iconColor, fontSize: 9, fontWeight: 800, letterSpacing: 0.3,
      }}>{format === 'pdf' ? 'PDF' : 'DOC'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{sub}</div>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{hotkey}</div>
    </button>
  );
}
