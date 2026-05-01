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
    <>
      {/* Backdrop — covers main only, not sidebar / topbar. */}
      <div
        onClick={() => dispatch({ type: 'SET_LOOKUPS_OPEN', open: false })}
        style={{
          position: 'fixed',
          left: 200, top: 48, right: 0, bottom: 0,
          background: 'rgba(15,25,40,0.32)',
          opacity: closed ? 0 : 1,
          pointerEvents: closed ? 'none' : 'auto',
          transition: 'opacity 200ms ease-out',
          zIndex: 40,
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Lookups admin"
        style={{
          position: 'fixed',
          left: 200, top: 48,
          width: 'min(80vw, 1280px)',
          height: 'calc(100vh - 48px)',
          background: 'var(--surface)',
          borderRight: '1px solid var(--hair)',
          boxShadow: '4px 0 16px rgba(15,25,40,0.10)',
          transform: closed ? 'translateX(-100%)' : 'translateX(0)',
          transition: 'transform 200ms ease-out',
          zIndex: 41,
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
            fontSize: 10.5, fontWeight: 700, color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: 0.4,
            padding: '4px 12px 8px',
          }}>Lookups</div>
          {TABS.map(t => {
            const active = t.key === lookupsTab;
            return (
              <button
                key={t.key}
                onClick={() => dispatch({ type: 'SET_LOOKUPS_TAB', tab: t.key })}
                style={{
                  height: 32, padding: '0 12px',
                  background: active ? 'var(--navy-tint)' : 'transparent',
                  color: active ? 'var(--navy-deep)' : 'var(--body)',
                  border: 'none', borderRadius: 6,
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  cursor: 'pointer', textAlign: 'left',
                  fontFamily: 'var(--sans)',
                }}>
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Active tab body */}
        <div className="lookups-body" style={{
          padding: '18px 22px',
          overflow: 'auto',
          background: 'var(--canvas)',
        }}>
          <TabHeader tab={lookupsTab}
            onClose={() => dispatch({ type: 'SET_LOOKUPS_OPEN', open: false })} />
          <TabBody tab={lookupsTab} identity={identity} />
        </div>
      </div>
    </>
  );
}

function TabHeader({ tab, onClose }: { tab: LookupsTab; onClose: () => void }) {
  const label = TABS.find(t => t.key === tab)?.label ?? tab;
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      marginBottom: 14,
    }}>
      <h2 style={{
        margin: 0, fontFamily: 'var(--sans)', fontSize: 18,
        fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.2,
      }}>
        {label}
      </h2>
      <div style={{ flex: 1 }} />
      <button onClick={onClose}
        title="Close panel (Esc)"
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

function TabBody({ tab, identity }: { tab: LookupsTab; identity: EditorState['identity'] }) {
  switch (tab) {
    case 'basic':
      return (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
        }}>
          <NameListEditor table="rate_table"       label="Rate Tables" />
          <NameListEditor table="project_type"     label="Project Types" />
          <NameListEditor table="expense_category" label="Expense Categories" />
          <MarkupEditor />
        </div>
      );
    case 'phases-tasks':
      return <PhaseTaskEditor />;
    case 'templates':
      return <TemplateEditor />;
    case 'employees':
      return <EmployeeEditor />;
    case 'rates':
      return <RateEditor />;
    case 'legal-departments':
      return (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
        }}>
          <NameListEditor table="legal_entity" label="Legal Entities" />
          <NameListEditor table="department"   label="Departments" />
        </div>
      );
    case 'clickup':
      return <ClickUpSettings identity={identity} />;
  }
}
