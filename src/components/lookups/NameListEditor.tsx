// Generic editor for any of the simple name-list lookup tables.
// Direct port from PM Quoting App's NameListEditor — no logic changes.

import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../ui';

type NameTable = 'legal_entity' | 'rate_table' | 'project_type' | 'expense_category' | 'department';

interface NameListEditorProps {
  table: NameTable;
  label: string;
}

type NameRow = { id: number; name: string };

export default function NameListEditor({ table, label }: NameListEditorProps) {
  const [items, setItems] = useState<NameRow[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<NameRow | null>(null);

  async function refresh() {
    setItems(await window.api.lookups.list(table) as NameRow[]);
  }
  useEffect(() => { void refresh(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [table]);

  async function add() {
    if (!newName.trim()) return;
    try {
      await window.api.lookups.add(table, newName.trim());
      setNewName('');
      setError(null);
      void refresh();
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }

  async function update(id: number, name: string) {
    if (!name.trim()) return;
    await window.api.lookups.update(table, id, name.trim());
    void refresh();
  }

  async function performDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    await window.api.lookups.remove(table, id);
    void refresh();
  }

  return (
    <div className="card">
      <h3>{label}</h3>
      <table>
        <thead>
          <tr><th>Name</th><th style={{ width: 40 }}></th></tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id}>
              <td>
                <input
                  defaultValue={item.name}
                  onBlur={(e) => { if (e.target.value !== item.name) void update(item.id, e.target.value); }}
                />
              </td>
              <td>
                <button className="delete-x" onClick={() => setPendingDelete(item)} title="Delete">&times;</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <input
          placeholder={`New ${label.toLowerCase()}...`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
          style={{ flex: 1 }}
        />
        <button className="primary" onClick={() => void add()}>Add</button>
      </div>
      {error && <div className="error">{error}</div>}

      <ConfirmDialog
        open={!!pendingDelete}
        title={`Delete ${label.toLowerCase()}?`}
        body={<>Remove <strong>{pendingDelete?.name}</strong> from the {label.toLowerCase()} list?</>}
        confirmLabel="Delete"
        confirmKind="loss"
        onConfirm={() => void performDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
