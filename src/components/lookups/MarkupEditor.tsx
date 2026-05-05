// Markup percentages editor. Direct port of PM Quoting App's MarkupEditor.
// `formatPct` is inlined here because QuickQuote's lib/calc.ts doesn't
// export it (PM had it; QQ proposals format inline elsewhere).

import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../ui';
import type { MarkupPct } from '../../types/domain';

interface MarkupEditorProps {
  disabled?: boolean;
}

export default function MarkupEditor({ disabled }: MarkupEditorProps = {}) {
  const [items, setItems] = useState<MarkupPct[]>([]);
  const [newValue, setNewValue] = useState('');
  const [pendingDelete, setPendingDelete] = useState<MarkupPct | null>(null);

  async function refresh() { setItems(await window.api.markup.list()); }
  useEffect(() => { void refresh(); }, []);

  async function add() {
    const v = parseFloat(newValue);
    if (isNaN(v)) return;
    // Accept "15" (treated as 15%) or "0.15".
    await window.api.markup.add(v > 1 ? v / 100 : v);
    setNewValue('');
    void refresh();
  }

  async function performDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    await window.api.markup.remove(id);
    void refresh();
  }

  return (
    <div className="card">
      <h3>Markup Percentages</h3>
      <table>
        <thead>
          <tr><th>%</th><th style={{ width: 40 }}></th></tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id}>
              <td>{formatPct(item.value)}</td>
              <td>
                <button className="delete-x" onClick={() => setPendingDelete(item)} aria-label="Delete" disabled={disabled}>&times;</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <input
          placeholder="New markup (e.g. 15 or 0.15)..."
          value={newValue}
          disabled={disabled}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !disabled) void add(); }}
          style={{ flex: 1 }}
        />
        <button className="primary" onClick={() => void add()} disabled={disabled}>Add</button>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete markup?"
        body={<>Remove the <strong>{pendingDelete ? formatPct(pendingDelete.value) : ''}</strong> markup?</>}
        confirmLabel="Delete"
        confirmKind="loss"
        onConfirm={() => void performDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}
