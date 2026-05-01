// Segmented control "Proposal | Project" — toggles state.editorMode.
// Only useful once a proposal has been Won + initialized as a project; the
// caller is responsible for not rendering it earlier.

import type { Dispatch } from 'react';
import type { EditorAction } from '../../state/editorReducer';
import type { EditorMode } from '../../types/domain';

interface ProjectModeToggleProps {
  mode: EditorMode;
  dispatch: Dispatch<EditorAction>;
}

export default function ProjectModeToggle({ mode, dispatch }: ProjectModeToggleProps) {
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
        return (
          <button key={it.id}
            onClick={() => dispatch({ type: 'SET_EDITOR_MODE', mode: it.id })}
            style={{
              padding: '5px 14px', border: 'none',
              background: active ? 'var(--surface)' : 'transparent',
              color:      active ? 'var(--ink)'    : 'var(--muted)',
              borderRadius: 5, fontSize: 11.5, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--sans)',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
            }}>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
