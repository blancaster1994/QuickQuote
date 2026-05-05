// Segmented control "Proposal | Project" — toggles state.editorMode.
// When `locked` is set (proposal not yet Won + initialized), the Project tab
// is rendered as a disabled affordance with a tooltip explaining when it'll
// unlock — discoverability beats minimalism here.

import type { Dispatch } from 'react';
import type { EditorAction } from '../../state/editorReducer';
import type { EditorMode } from '../../types/domain';

interface ProjectModeToggleProps {
  mode: EditorMode;
  dispatch: Dispatch<EditorAction>;
  /** When true, the Project tab is greyed and clicking it does nothing. */
  locked?: boolean;
  /** Tooltip text shown when locked. */
  lockedHint?: string;
}

export default function ProjectModeToggle({ mode, dispatch, locked, lockedHint }: ProjectModeToggleProps) {
  const items: Array<{ id: EditorMode; label: string }> = [
    { id: 'proposal', label: 'Proposal' },
    { id: 'project',  label: 'Project' },
  ];
  return (
    <div style={{
      display: 'inline-flex', background: 'var(--canvas-deep)',
      borderRadius: 7, padding: 3,
    }}>
      {items.map(it => {
        const active = mode === it.id;
        const isLocked = !!locked && it.id === 'project';
        return (
          <button key={it.id}
            type="button"
            onClick={() => {
              if (isLocked) return;
              dispatch({ type: 'SET_EDITOR_MODE', mode: it.id });
            }}
            disabled={isLocked}
            aria-disabled={isLocked || undefined}
            title={isLocked ? (lockedHint || 'Available after the proposal is marked Won and initialized') : undefined}
            style={{
              padding: '5px 14px', border: 'none',
              background: active ? 'var(--surface)' : 'transparent',
              color:      active ? 'var(--ink)'    : (isLocked ? 'var(--subtle)' : 'var(--muted)'),
              borderRadius: 5, fontSize: 11.5, fontWeight: 600,
              cursor: isLocked ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--sans)',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
              opacity: isLocked ? 0.7 : 1,
            }}>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
