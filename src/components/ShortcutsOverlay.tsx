// Keyboard shortcuts reference. Surfaces the bindings that App.tsx wires up
// (Ctrl+G, Ctrl+Shift+G, Ctrl+D, Esc, ?) in one discoverable place.
//
// Triggered by `?` key (or Shift+/) when no input/textarea is focused. Esc
// closes — same convention as the Lookups panel.

import { useEffect } from 'react';
import { Modal } from './ui';

interface ShortcutsOverlayProps {
  onClose: () => void;
}

interface Shortcut {
  keys: string[];          // visual key chips (e.g. ['Ctrl', 'G'])
  label: string;
  hint?: string;
}

const SHORTCUTS: Shortcut[] = [
  {
    keys: ['Ctrl', 'G'],
    label: 'Generate proposal',
    hint: 'Uses the last picked format (DOCX or PDF).',
  },
  {
    keys: ['Ctrl', 'Shift', 'G'],
    label: 'Open generate menu',
    hint: 'Pick a format before generating.',
  },
  {
    keys: ['Ctrl', 'D'],
    label: 'Toggle Dashboard / Editor',
  },
  {
    keys: ['Esc'],
    label: 'Close panel or modal',
    hint: 'Lookups panel, modals, dropdowns.',
  },
  {
    keys: ['?'],
    label: 'Show this overlay',
  },
];

export default function ShortcutsOverlay({ onClose }: ShortcutsOverlayProps) {
  // Re-Esc closes; Modal already handles backdrop click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <div style={{ fontSize: 12.5, color: 'var(--body)', marginBottom: 12 }}>
        On macOS, ⌘ works in place of Ctrl.
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 16, rowGap: 10,
        alignItems: 'baseline',
      }}>
        {SHORTCUTS.map((s, i) => (
          <Row key={i} shortcut={s} />
        ))}
      </div>
    </Modal>
  );
}

function Row({ shortcut }: { shortcut: Shortcut }) {
  return (
    <>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {shortcut.keys.map((k, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {i > 0 && <span style={{ color: 'var(--muted)', margin: '0 2px' }}>+</span>}
            <kbd style={{
              display: 'inline-block', padding: '2px 7px',
              fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 600,
              color: 'var(--ink)',
              background: 'var(--canvas)',
              border: '1px solid var(--hair)',
              borderRadius: 4,
              boxShadow: 'inset 0 -1px 0 var(--hair)',
              minWidth: 22, textAlign: 'center',
            }}>{k}</kbd>
          </span>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{shortcut.label}</div>
        {shortcut.hint && (
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
            {shortcut.hint}
          </div>
        )}
      </div>
    </>
  );
}
