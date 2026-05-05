// Persistent left navigation rail. 200px wide.
//
// Top: a "Jump to…" button with a ⌘K hint that opens the global command
// palette (CommandPalette.tsx) — fuzzy-searches every project, proposal,
// and high-value action so the rail stays clean even at 500 projects.
//
// Below the search button:
//   • Home          — Dashboard view
//   • Projects      — Editor view (current proposal/project)
//   • People & rates — opens Lookups → Employees subtab
//   • Templates     — opens Lookups → Templates subtab
//
// Footer: existing UserMenu (sign-in identity + switch user).

import { useState, type Dispatch } from 'react';
import type { EditorAction, EditorState } from '../state/editorReducer';
import type { LookupsTab } from '../types/domain';

interface SidebarProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  onOpenCommandPalette: () => void;
}

/** Opaque key for the active-highlight logic — derived from EditorState. */
type ActiveKey = 'home' | 'projects' | 'people' | 'templates' | null;

function activeKeyFor(state: EditorState): ActiveKey {
  if (state.lookupsOpen) {
    if (state.lookupsTab === 'employees' || state.lookupsTab === 'rates') return 'people';
    if (state.lookupsTab === 'templates') return 'templates';
    return null;
  }
  return state.view === 'dashboard' ? 'home' : 'projects';
}

export default function Sidebar({ state, dispatch, onOpenCommandPalette }: SidebarProps) {
  const active = activeKeyFor(state);

  function goView(v: 'dashboard' | 'editor') {
    if (state.lookupsOpen) dispatch({ type: 'SET_LOOKUPS_OPEN', open: false });
    dispatch({ type: 'SET_VIEW', view: v });
  }

  function goLookups(tab: LookupsTab) {
    // Toggle: clicking the active tab again closes the panel; otherwise
    // open + switch tab.
    if (state.lookupsOpen && state.lookupsTab === tab) {
      dispatch({ type: 'SET_LOOKUPS_OPEN', open: false });
    } else {
      dispatch({ type: 'SET_LOOKUPS_TAB', tab });
      dispatch({ type: 'SET_LOOKUPS_OPEN', open: true });
    }
  }

  return (
    <nav style={{
      width: 200, height: '100%', flexShrink: 0,
      background: 'var(--surface)', borderRight: '1px solid var(--hair)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--sans)',
    }}>
      <div style={{
        padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        <JumpToButton onClick={onOpenCommandPalette} />
      </div>

      <div style={{ flex: 1, padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <NavItem
          active={active === 'home'}
          onClick={() => goView('dashboard')}
          label="Home"
          icon={<HomeIcon active={active === 'home'} />}
        />
        <NavItem
          active={active === 'projects'}
          onClick={() => goView('editor')}
          label="Projects"
          icon={<ProjectsIcon active={active === 'projects'} />}
        />
        <NavItem
          active={active === 'people'}
          onClick={() => goLookups('employees')}
          label="People & rates"
          icon={<PeopleIcon active={active === 'people'} />}
        />
        <NavItem
          active={active === 'templates'}
          onClick={() => goLookups('templates')}
          label="Templates"
          icon={<TemplatesIcon active={active === 'templates'} />}
        />
      </div>

      <UserMenu state={state} />
    </nav>
  );
}

interface JumpToButtonProps { onClick: () => void; }

function JumpToButton({ onClick }: JumpToButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Search projects, proposals, and actions (⌘K)"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', height: 32, padding: '0 10px',
        background: 'var(--canvas-deep)',
        color: 'var(--muted)',
        border: '1px solid var(--hair-strong)',
        borderRadius: 6, cursor: 'pointer', textAlign: 'left',
        fontFamily: 'var(--sans)',
      }}>
      <SearchIcon />
      <span style={{ flex: 1, fontSize: 11.5, color: 'var(--muted)' }}>Jump to…</span>
      <Kbd>⌘K</Kbd>
    </button>
  );
}

interface NavItemProps {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}

function NavItem({ active, onClick, label, icon }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', height: 32, padding: '0 10px',
        background: active ? 'var(--navy-tint)' : 'transparent',
        color: active ? 'var(--navy-deep)' : 'var(--body)',
        border: 'none', borderRadius: 6,
        fontSize: 12.5, fontWeight: active ? 700 : 500,
        cursor: 'pointer', textAlign: 'left',
        fontFamily: 'var(--sans)',
      }}>
      <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center' }}>{icon}</span>
      {label}
    </button>
  );
}

function UserMenu({ state }: { state: EditorState }) {
  const [open, setOpen] = useState(false);
  const id = state.identity;
  if (!id) return null;
  return (
    <div style={{
      position: 'relative',
      borderTop: '1px solid var(--hair)',
      padding: 10,
    }}>
      <button onClick={() => setOpen((o) => !o)}
        title={`${id.name} · ${id.email}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', padding: '6px 8px',
          background: 'transparent', color: 'var(--body)',
          border: 'none', borderRadius: 6, cursor: 'pointer',
          fontFamily: 'var(--sans)', textAlign: 'left',
        }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'var(--navy-deep)', color: '#fff',
          display: 'grid', placeItems: 'center',
          fontSize: 10.5, fontWeight: 800, flexShrink: 0,
        }}>
          {initials(id.name || id.email)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: 'var(--ink)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {id.name}
          </div>
          <div style={{
            fontSize: 10.5, color: 'var(--muted)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {id.email}
          </div>
        </div>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
          <div style={{
            position: 'absolute', bottom: 50, left: 10, right: 10, zIndex: 51,
            background: 'var(--surface)', border: '1px solid var(--hair)',
            borderRadius: 8, padding: 10,
            boxShadow: '0 8px 24px rgba(15,25,40,0.12)',
          }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
              {id.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{id.email}</div>
            {id.role && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Role: <strong>{id.role}</strong>
              </div>
            )}
            <button onClick={async () => {
              await window.api.identity.clear();
              window.location.reload();
            }}
              style={{
                width: '100%', marginTop: 10, height: 28,
                background: 'var(--canvas)', color: 'var(--body)',
                border: '1px solid var(--hair)', borderRadius: 6,
                fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'var(--sans)',
              }}>
              Switch user
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function initials(s: string): string {
  if (!s) return '—';
  const parts = String(s).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── icons ──────────────────────────────────────────────────────────────────

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600,
      padding: '1px 4px', borderRadius: 3,
      background: 'var(--surface)', border: '1px solid var(--hair)',
      color: 'var(--muted)',
    }}>{children}</span>
  );
}

function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="5" cy="5" r="3.5" stroke="var(--muted)" strokeWidth="1.3" />
      <path d="M7.7 7.7l2 2" stroke="var(--muted)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  const c = active ? 'var(--navy-deep)' : 'var(--muted)';
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 7l6-4.5L14 7v6.5a.5.5 0 0 1-.5.5H10v-4H6v4H2.5a.5.5 0 0 1-.5-.5V7z"
        stroke={c} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function ProjectsIcon({ active }: { active: boolean }) {
  const c = active ? 'var(--navy-deep)' : 'var(--muted)';
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2.5 1.5h6l3 3v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z"
        stroke={c} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8.5 1.5v3h3" stroke={c} strokeWidth="1.3" strokeLinejoin="round" />
      <line x1="4.5" y1="7.5" x2="9.5" y2="7.5" stroke={c} strokeWidth="1.2" />
      <line x1="4.5" y1="9.5" x2="9.5" y2="9.5" stroke={c} strokeWidth="1.2" />
      <line x1="4.5" y1="11.5" x2="7.5" y2="11.5" stroke={c} strokeWidth="1.2" />
    </svg>
  );
}

function PeopleIcon({ active }: { active: boolean }) {
  const c = active ? 'var(--navy-deep)' : 'var(--muted)';
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="6" r="2.3" stroke={c} strokeWidth="1.4" />
      <path d="M2 13c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5"
        stroke={c} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M11 4.5a2 2 0 1 1 0 3M14 12.5c-.2-1.4-1.2-2.4-2.5-2.8"
        stroke={c} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function TemplatesIcon({ active }: { active: boolean }) {
  const c = active ? 'var(--navy-deep)' : 'var(--muted)';
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M4 2h6l3 3v8.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5z"
        stroke={c} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10 2v3h3" stroke={c} strokeWidth="1.4" />
      <path d="M5 8.5h6M5 11h4" stroke={c} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
