// Persistent left navigation rail. 200px wide, three primary destinations
// (Dashboard, Editor = currently-open proposal, Lookups admin) plus a
// user-identity menu in the footer. Dashboard is the canonical "find a
// proposal" surface (search + filter + sort); the Editor link only opens
// whatever proposal is already loaded.
//
// Visual decisions:
//   · Active state is derived from (state.view, state.lookupsOpen) so the
//     three buttons are mutually exclusive in lit-up appearance.
//   · Clicking Lookups dispatches SET_LOOKUPS_OPEN(true) — it overlays the
//     main area, doesn't replace it. The active "Proposals/Dashboard" item
//     keeps its visual state under the panel so closing the panel feels
//     coherent.
//   · Clicking Dashboard or Proposals while lookups is open closes the panel
//     and switches view in one dispatch chain.
//   · Footer renders the identity popover (lifted from TopBar). Anchors above
//     the avatar so it doesn't fall off the bottom of the viewport.

import { useState, type Dispatch } from 'react';
import type { EditorAction, EditorState } from '../state/editorReducer';

interface SidebarProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}

export default function Sidebar({ state, dispatch }: SidebarProps) {
  const { view, lookupsOpen } = state;

  // Visual lit-up rule: Lookups wins when open; otherwise it follows view.
  const activeKey: 'dashboard' | 'proposals' | 'lookups' =
    lookupsOpen ? 'lookups' : (view === 'dashboard' ? 'dashboard' : 'proposals');

  function go(key: 'dashboard' | 'proposals' | 'lookups') {
    if (key === 'lookups') {
      dispatch({ type: 'SET_LOOKUPS_OPEN', open: !lookupsOpen });
      return;
    }
    if (lookupsOpen) dispatch({ type: 'SET_LOOKUPS_OPEN', open: false });
    dispatch({ type: 'SET_VIEW', view: key === 'dashboard' ? 'dashboard' : 'editor' });
  }

  return (
    <nav style={{
      width: 200, height: '100%', flexShrink: 0,
      background: 'var(--surface)', borderRight: '1px solid var(--hair)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--sans)',
    }}>
      <div style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <NavItem
          active={activeKey === 'dashboard'}
          onClick={() => go('dashboard')}
          label="Dashboard"
          icon={<DashboardIcon active={activeKey === 'dashboard'} />}
        />
        <NavItem
          active={activeKey === 'proposals'}
          onClick={() => go('proposals')}
          label="Editor"
          icon={<ProposalsIcon active={activeKey === 'proposals'} />}
        />
        <NavItem
          active={activeKey === 'lookups'}
          onClick={() => go('lookups')}
          label="Lookups"
          icon={<LookupsIcon active={activeKey === 'lookups'} />}
        />
      </div>

      <UserMenu state={state} />
    </nav>
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
        width: '100%', height: 36, padding: '0 12px',
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

function DashboardIcon({ active }: { active: boolean }) {
  const c = active ? 'var(--navy-deep)' : 'var(--muted)';
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="1.5" width="5" height="5" rx="1" stroke={c} strokeWidth="1.3" />
      <rect x="7.5" y="1.5" width="5" height="3" rx="1" stroke={c} strokeWidth="1.3" />
      <rect x="7.5" y="5.5" width="5" height="7" rx="1" stroke={c} strokeWidth="1.3" />
      <rect x="1.5" y="7.5" width="5" height="5" rx="1" stroke={c} strokeWidth="1.3" />
    </svg>
  );
}

function ProposalsIcon({ active }: { active: boolean }) {
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

function LookupsIcon({ active }: { active: boolean }) {
  const c = active ? 'var(--navy-deep)' : 'var(--muted)';
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="2.5" width="11" height="9" rx="1" stroke={c} strokeWidth="1.3" />
      <line x1="1.5" y1="5.5" x2="12.5" y2="5.5" stroke={c} strokeWidth="1.2" />
      <line x1="5.5" y1="2.5" x2="5.5" y2="11.5" stroke={c} strokeWidth="1.2" />
    </svg>
  );
}
