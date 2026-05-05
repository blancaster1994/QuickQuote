// Slide-out Lookups admin panel — opens from the left over the main content
// area when the user clicks Sidebar > Lookups.
//
// Layout: a `position: fixed` overlay anchored at left:200 top:48 (matching
// the sidebar width and topbar height) so the sidebar and topbar stay
// interactive while the panel is open. A 180px vertical sub-tab rail
// occupies the left edge of the panel; the active sub-tab body fills the
// remainder.
//
// Animation: backdrop + panel are mounted lazily on first open and then
// stay mounted forever. Visibility is driven by `transform` (translateX
// −100% → 0) + `opacity` transitions. Sub-tab state survives close so
// reopen lands the user back where they were.
//
// Esc key + backdrop click both close the panel.

import { useEffect, useState, type Dispatch } from 'react';
import type { EditorAction, EditorState } from '../../state/editorReducer';
import type { LookupsTab } from '../../types/domain';

import NameListEditor from './NameListEditor';
import MarkupEditor from './MarkupEditor';
import PhaseTaskEditor from './PhaseTaskEditor';
import TemplateEditor from './TemplateEditor';
import EmployeeEditor from './EmployeeEditor';
import RateEditor from './RateEditor';
import ClickUpSettings from './ClickUpSettings';
import './lookups.css';

interface LookupsPanelProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}

const TABS: Array<{ key: LookupsTab; label: string }> = [
  { key: 'basic',             label: 'Basic Lists' },
  { key: 'phases-tasks',      label: 'Phases & Tasks' },
  { key: 'templates',         label: 'Templates' },
  { key: 'employees',         label: 'Employees' },
  { key: 'rates',             label: 'Rates' },
  { key: 'legal-departments', label: 'Legal & Departments' },
  { key: 'clickup',           label: 'ClickUp' },
];

export default function LookupsPanel({ state, dispatch }: LookupsPanelProps) {
  const { lookupsOpen, lookupsTab, identity } = state;

  // Lazy-mount: don't pay for the editors' IPC calls until the user opens
  // the panel for the first time. Once mounted, stay in DOM.
  const [hasMounted, setHasMounted] = useState(lookupsOpen);
  useEffect(() => {
    if (lookupsOpen && !hasMounted) setHasMounted(true);
  }, [lookupsOpen, hasMounted]);

  // Read-only by default — every editor child receives disabled={!editing}.
  // Resets to read-only every time the panel closes so a stray click can't
  // damage data after walking away.
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!lookupsOpen) setEditing(false); }, [lookupsOpen]);

  // Esc closes the panel.
  useEffect(() => {
    if (!lookupsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dispatch({ type: 'SET_LOOKUPS_OPEN', open: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lookupsOpen, dispatch]);

  if (!hasMounted) return null;

  const closed = !lookupsOpen;

  return (
    // Wrapper covers main-content area (right of sidebar, below topbar) and
    // CLIPS its children. Without overflow:hidden the panel — anchored at
    // left:0 inside this wrapper, transformed translateX(-100%) when closed —
    // would render its body behind the sidebar's right edge and visibly
    // cover the sidebar's text. The clip means the panel disappears as it
    // slides past the wrapper's left edge.
    <div style={{
      position: 'fixed',
      left: 200, top: 48, right: 0, bottom: 0,
      overflow: 'hidden',
      pointerEvents: 'none',                              // children opt in
      zIndex: 40,
    }}>
      {/* Backdrop — fills the wrapper. */}
      <div
        onClick={() => dispatch({ type: 'SET_LOOKUPS_OPEN', open: false })}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(15,25,40,0.32)',
          opacity: closed ? 0 : 1,
          pointerEvents: closed ? 'none' : 'auto',
          transition: 'opacity 200ms ease-out',
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Lookups admin"
        style={{
          position: 'absolute',
          left: 0, top: 0,
          width: 'min(80vw, 1280px)',
          height: '100%',
          background: 'var(--surface)',
          borderRight: '1px solid var(--hair)',
          boxShadow: '4px 0 16px rgba(15,25,40,0.10)',
          transform: closed ? 'translateX(-100%)' : 'translateX(0)',
          transition: 'transform 200ms ease-out',
          pointerEvents: closed ? 'none' : 'auto',
          display: 'grid',
          gridTemplateColumns: '180px 1fr',
        }}
      >
        {/* Sub-tab rail (vertical) */}
        <nav style={{
          background: 'var(--canvas)',
          borderRight: '1px solid var(--hair)',
          padding: '14px 8px',
          display: 'flex', flexDirection: 'column', gap: 2,
          overflow: 'auto',
        }}>
          <div style={{
            fontSize: 'var(--label-size, 12px)',
            fontWeight: 700, color: 'var(--label-color, var(--muted))',
            textTransform: 'uppercase', letterSpacing: 'var(--label-letter-spacing, 0.4px)',
            padding: '4px 12px 8px',
          }}>Lookups</div>
          {TABS.map(t => {
            const active = t.key === lookupsTab;
            return (
              <button
                key={t.key}
                onClick={() => dispatch({ type: 'SET_LOOKUPS_TAB', tab: t.key })}
                aria-current={active ? 'page' : undefined}
                style={{
                  height: 32, padding: '0 12px',
                  background: active ? 'var(--navy-tint)' : 'transparent',
                  color: active ? 'var(--navy-deep)' : 'var(--body)',
                  border: 'none', borderRadius: 6,
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  cursor: 'pointer', textAlign: 'left',
                  fontFamily: 'var(--sans)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                <span style={{ flex: 1 }}>{t.label}</span>
                {active && (
                  <span aria-hidden="true" title="Reopens here next time"
                    style={{
                      fontSize: 9, color: 'var(--navy-deep)', opacity: 0.55,
                      letterSpacing: 0,
                    }}>↻</span>
                )}
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          <div style={{
            fontSize: 10.5, color: 'var(--muted)',
            padding: '8px 12px 0', lineHeight: 1.4,
            borderTop: '1px solid var(--hair)', marginTop: 8,
          }}>
            Lookups remembers your last tab — reopen to land back here.
          </div>
        </nav>

        {/* Active tab body */}
        <div className="lookups-body" style={{
          padding: '18px 22px',
          overflow: 'auto',
          background: 'var(--canvas)',
        }}>
          <TabHeader tab={lookupsTab}
            editing={editing}
            onToggleEdit={() => setEditing(e => !e)}
            onClose={() => dispatch({ type: 'SET_LOOKUPS_OPEN', open: false })} />
          <TabBody tab={lookupsTab} identity={identity} disabled={!editing} />
        </div>
      </div>
    </div>
  );
}

function TabHeader({ tab, editing, onToggleEdit, onClose }: {
  tab: LookupsTab;
  editing: boolean;
  onToggleEdit: () => void;
  onClose: () => void;
}) {
  const label = TABS.find(t => t.key === tab)?.label ?? tab;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      marginBottom: 14,
    }}>
      <h2 style={{
        margin: 0, fontFamily: 'var(--sans)', fontSize: 18,
        fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.2,
      }}>
        {label}
      </h2>
      <div style={{ flex: 1 }} />
      <button onClick={onToggleEdit}
        title={editing
          ? 'Click to lock these fields again'
          : 'Click to edit these fields'}
        style={{
          height: 28, padding: '0 12px', borderRadius: 14,
          background: editing ? 'var(--navy-deep)' : 'var(--canvas)',
          color: editing ? '#fff' : 'var(--body)',
          border: `1px solid ${editing ? 'var(--navy-deep)' : 'var(--hair)'}`,
          cursor: 'pointer',
          fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--sans)',
          letterSpacing: 0.2,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
        <span aria-hidden>{editing ? '✏' : '🔒'}</span>
        {editing ? 'Editing — Done' : 'Read-only — Edit'}
      </button>
      <button onClick={onClose}
        aria-label="Close panel (Esc)"
        style={{
          width: 28, height: 28, padding: 0, borderRadius: 6,
          background: 'transparent', color: 'var(--muted)',
          border: '1px solid var(--hair)', cursor: 'pointer',
          fontSize: 14, lineHeight: 1, fontFamily: 'var(--sans)',
        }}>
        &times;
      </button>
    </div>
  );
}

function TabBody({ tab, identity, disabled }: {
  tab: LookupsTab;
  identity: EditorState['identity'];
  disabled: boolean;
}) {
  switch (tab) {
    case 'basic':
      return (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
        }}>
          <NameListEditor table="rate_table"       label="Rate Tables"         disabled={disabled} />
          <NameListEditor table="project_type"     label="Project Types"       disabled={disabled} />
          <NameListEditor table="expense_category" label="Expense Categories"  disabled={disabled} />
          <MarkupEditor disabled={disabled} />
        </div>
      );
    case 'phases-tasks':
      return <PhaseTaskEditor disabled={disabled} />;
    case 'templates':
      return <TemplateEditor disabled={disabled} />;
    case 'employees':
      return <EmployeeEditor disabled={disabled} />;
    case 'rates':
      return <RateEditor disabled={disabled} />;
    case 'legal-departments':
      return (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
        }}>
          <NameListEditor table="legal_entity" label="Legal Entities" disabled={disabled} />
          <NameListEditor table="department"   label="Departments"    disabled={disabled} />
        </div>
      );
    case 'clickup':
      return <ClickUpSettings identity={identity} disabled={disabled} />;
  }
}
