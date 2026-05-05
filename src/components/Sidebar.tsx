// Persistent left navigation rail. 200px wide, two primary destinations
// (Dashboard, Editor = currently-open proposal) plus a user-identity menu
// in the footer. Lookups now lives in TopBar's gear icon — it's an admin
// surface, not a peer of the proposal pipeline.

import { useState, type Dispatch } from 'react';
import type { EditorAction, EditorState } from '../state/editorReducer';

interface SidebarProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}

export default function Sidebar({ state, dispatch }: SidebarProps) {
  const { view, lookupsOpen } = state;

  const activeKey: 'dashboard' | 'proposals' =
    view === 'dashboard' ? 'dashboard' : 'proposals';

  function go(key: 'dashboard' | 'proposals') {
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
