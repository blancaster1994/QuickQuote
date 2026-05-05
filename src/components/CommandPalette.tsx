// ⌘K command palette — search projects + actions.
//
// Replaces a long sidebar list. Stays clean even at 500 projects: type two
// characters and the right one floats to the top. Keyboard-driven:
//   ↑ / ↓     move
//   Enter     run highlighted result
//   Esc       close
//
// Sources of results:
//   • Projects — names from state.bootstrap.projects, fuzzy-substring match
//     on the typed query.
//   • Actions — fixed list of high-value commands (New proposal, Open
//     Lookups, Toggle dashboard). Always visible when query is empty;
//     filterable when query is typed.

import { useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import type { EditorAction, EditorState } from '../state/editorReducer';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  onSelectProject: (name: string) => void;
  onNewProposal: () => void;
}

interface PaletteItem {
  kind: 'project' | 'action';
  id: string;
  name: string;
  sub?: string;
  iconName: 'folder' | 'plus' | 'gear' | 'home';
  run: () => void;
}

export default function CommandPalette({
  open, onClose, state, dispatch, onSelectProject, onNewProposal,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset query + focus on open. We don't reset on close so the panel briefly
  // remains visually stable as it fades out.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    // Defer focus to next frame so the input exists in the DOM.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const projects = state.bootstrap?.projects || [];

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const matchedProjects: PaletteItem[] = projects
      .filter(name => !q || name.toLowerCase().includes(q))
      .slice(0, 12)
      .map(name => ({
        kind: 'project',
        id: `project:${name}`,
        name,
        sub: 'Project',
        iconName: 'folder',
        run: () => { onSelectProject(name); onClose(); },
      }));

    const allActions: PaletteItem[] = [
      {
        kind: 'action', id: 'action:new', name: 'New proposal',
        sub: 'Start a fresh proposal',
        iconName: 'plus',
        run: () => { onNewProposal(); onClose(); },
      },
      {
        kind: 'action', id: 'action:home', name: 'Go to dashboard',
        sub: 'Recent proposals · pipeline',
        iconName: 'home',
        run: () => { dispatch({ type: 'SET_VIEW', view: 'dashboard' }); onClose(); },
      },
      {
        kind: 'action', id: 'action:lookups', name: 'Open Lookups',
        sub: 'Employees · rates · templates · ClickUp',
        iconName: 'gear',
        run: () => { dispatch({ type: 'SET_LOOKUPS_OPEN', open: true }); onClose(); },
      },
    ];
    const matchedActions = allActions.filter(a => !q
      || a.name.toLowerCase().includes(q)
      || (a.sub || '').toLowerCase().includes(q));

    return [...matchedProjects, ...matchedActions];
  }, [projects, query, onSelectProject, onNewProposal, dispatch, onClose]);

  // Clamp the active index whenever results shrink.
  useEffect(() => {
    if (active >= items.length) setActive(Math.max(0, items.length - 1));
  }, [items.length, active]);

  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(i => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = items[active];
      if (it) it.run();
    }
  }

  if (!open) return null;

  // Group results into Projects + Actions for visual separation.
  const projectItems = items.filter(i => i.kind === 'project');
  const actionItems  = items.filter(i => i.kind === 'action');

  return (
    <div
      role="dialog"
      aria-label="Command palette"
      onKeyDown={onKey}
      style={{ position: 'fixed', inset: 0, zIndex: 100 }}
    >
      {/* Backdrop — dimmer pulled in from token canvas, light dim only. */}
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(15,25,40,0.28)',
      }} />

      <div style={{
        position: 'absolute', top: 80, left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(560px, calc(100vw - 32px))',
        background: 'var(--surface)',
        border: '1px solid var(--hair-strong)',
        borderRadius: 10,
        boxShadow: '0 20px 50px rgba(15,25,40,0.18)',
        overflow: 'hidden',
        fontFamily: 'var(--sans)',
      }}>
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid var(--hair)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <SearchGlyph />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            placeholder="Search projects, proposals, actions…"
            style={{
              border: 'none', background: 'transparent', outline: 'none',
              fontSize: 13, color: 'var(--ink)', flex: 1,
              fontFamily: 'var(--sans)',
            }}
          />
          <Kbd>esc</Kbd>
        </div>

        <div style={{ padding: 6, maxHeight: 'min(420px, 60vh)', overflow: 'auto' }}>
          {items.length === 0 && (
            <div style={{ padding: '14px 12px', fontSize: 12, color: 'var(--muted)' }}>
              No matches for "{query}".
            </div>
          )}

          {projectItems.length > 0 && (
            <SectionLabel>Projects</SectionLabel>
          )}
          {projectItems.map((it) => {
            const idx = items.indexOf(it);
            return (
              <CommandRow key={it.id} item={it} active={idx === active}
                onMouseEnter={() => setActive(idx)} onClick={() => it.run()} />
            );
          })}

          {actionItems.length > 0 && (
            <SectionLabel>Actions</SectionLabel>
          )}
          {actionItems.map((it) => {
            const idx = items.indexOf(it);
            return (
              <CommandRow key={it.id} item={it} active={idx === active}
                onMouseEnter={() => setActive(idx)} onClick={() => it.run()} />
            );
          })}
        </div>

        <div style={{
          padding: '8px 12px', borderTop: '1px solid var(--hair)',
          display: 'flex', alignItems: 'center', gap: 14,
          fontSize: 10.5, color: 'var(--muted)',
        }}>
          <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate</span>
          <span><Kbd>↵</Kbd> select</span>
          <span><Kbd>esc</Kbd> close</span>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '8px 10px 4px', fontSize: 9.5, fontWeight: 700,
      letterSpacing: 0.6, color: 'var(--muted)', textTransform: 'uppercase',
    }}>
      {children}
    </div>
  );
}

interface CommandRowProps {
  item: PaletteItem;
  active: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}

function CommandRow({ item, active, onMouseEnter, onClick }: CommandRowProps) {
  return (
    <div
      role="option"
      aria-selected={active}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 10px', borderRadius: 5,
        background: active ? 'var(--navy-tint)' : 'transparent',
        cursor: 'pointer',
      }}
    >
      <span style={{
        width: 18, height: 18, display: 'grid', placeItems: 'center',
        color: active ? 'var(--navy-deep)' : 'var(--muted)',
        flexShrink: 0,
      }}>
        <PaletteIcon name={item.iconName} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, fontWeight: active ? 700 : 500,
          color: active ? 'var(--navy-deep)' : 'var(--ink)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{item.name}</div>
        {item.sub && (
          <div style={{
            fontSize: 10.5, color: 'var(--muted)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{item.sub}</div>
        )}
      </div>
      {active && <Kbd>↵</Kbd>}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: 'var(--mono)', fontSize: 9,
      padding: '1px 4px', borderRadius: 3,
      background: 'var(--canvas-deep)', border: '1px solid var(--hair)',
      color: 'var(--muted)',
    }}>{children}</span>
  );
}

function SearchGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <circle cx="6" cy="6" r="4" stroke="var(--muted)" strokeWidth="1.4" />
      <path d="M9 9l3 3" stroke="var(--muted)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PaletteIcon({ name }: { name: PaletteItem['iconName'] }) {
  const stroke = 'currentColor';
  const sw = 1.4;
  if (name === 'folder') return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z"
        stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
    </svg>
  );
  if (name === 'plus') return (
    <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>+</span>
  );
  if (name === 'home') return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 7l6-4.5L14 7v6.5a.5.5 0 0 1-.5.5H10v-4H6v4H2.5a.5.5 0 0 1-.5-.5V7z"
        stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
    </svg>
  );
  // gear
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.2" stroke={stroke} strokeWidth={sw} />
      <path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4"
        stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}
