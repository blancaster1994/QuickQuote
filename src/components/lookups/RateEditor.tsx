// Rate table editor. Direct port of PM Quoting App's RateEditor with two
// adjustments:
//   1. The two `invalidateRateMap()` call sites are dropped — QuickQuote
//      doesn't have a rate-map cache yet (it lands with the project editor in
//      Stage 5). The TODO markers below remind future-us to wire it.
//   2. `Rate` row shape is imported from QuickQuote's domain types as
//      `RateEntry` so the editor uses the same shape as the IPC return.

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { ConfirmDialog } from '../ui';
import type { RateEntry } from '../../types/domain';

type PendingImport = { rows: Array<Omit<RateEntry, 'id'>>; filePath: string };

interface RateEditorProps {
  disabled?: boolean;
}

export default function RateEditor({ disabled }: RateEditorProps = {}) {
  const [rows, setRows] = useState<RateEntry[]>([]);
  const [rateTables, setRateTables] = useState<string[]>([]);
  const [legalEntities, setLegalEntities] = useState<string[]>([]);
  const [selectedLE, setSelectedLE] = useState<string>('');
  const [selectedRT, setSelectedRT] = useState<string>('');
  const [filter, setFilter] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RateEntry | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);

  async function refresh() {
    const filters: any = {};
    if (selectedLE) filters.legal_entity = selectedLE;
    if (selectedRT) filters.rate_table   = selectedRT;
    setRows(await window.api.rates.list(filters));
    // TODO(stage5): invalidate rateMap once the project editor's cache lands.
  }
  useEffect(() => {
    void window.api.lookups.list('rate_table').then(rs => setRateTables(rs.map(r => r.name)));
    void window.api.lookups.list('legal_entity').then(rs => setLegalEntities(rs.map(r => r.name)));
  }, []);
  useEffect(() => { void refresh(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [selectedLE, selectedRT]);

  async function save(r: RateEntry, patch: Partial<RateEntry>) {
    await window.api.rates.save({ ...r, ...patch });
    void refresh();
  }
  async function performDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    await window.api.rates.remove(id);
    void refresh();
  }
  async function addBlank() {
    await window.api.rates.save({
      legal_entity:   selectedLE || legalEntities[0] || 'CES',
      rate_table:     selectedRT || rateTables[0]    || 'Standard',
      category:       'New Category',
      resource_id:    null,
      price:          0,
      effective_date: null,
      end_date:       null,
    });
    void refresh();
  }

  async function importFile() {
    const res = await window.api.dialog.openFile([
      { name: 'Spreadsheet/CSV', extensions: ['xlsx', 'xls', 'xlsm', 'csv'] },
    ]);
    if (!res) return;
    const bytes = Uint8Array.from(atob(res.base64), c => c.charCodeAt(0));
    const wb = XLSX.read(bytes, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const json = XLSX.utils.sheet_to_json<any>(wb.Sheets[sheetName], { raw: false, defval: null });
    const mapped = json.map(r => ({
      legal_entity: String(r['Company'] ?? r['Legal entity'] ?? r['legal_entity'] ?? '').toUpperCase(),
      rate_table:   r['Price group'] ?? r['Rate Table'] ?? r['rate_table'] ?? null,
      category:     String(r['Category'] ?? r['category'] ?? '').trim(),
      resource_id:  (() => {
        const v = r['Resource ID'] ?? r['resource_id'];
        return v ? String(v).trim() : null;
      })(),
      price:          parseFloat(r['Pricing'] ?? r['Price'] ?? r['price'] ?? '0') || 0,
      effective_date: normalizeDate(r['Effective date'] ?? r['effective_date']),
      end_date:       normalizeDate(r['End date'] ?? r['end_date']),
    })).filter(r => r.legal_entity && r.rate_table && (r.category || r.resource_id)) as Array<Omit<RateEntry, 'id'>>;

    if (!mapped.length) {
      setImportMsg('No rows found. Expected columns like "Company", "Price group", "Category" and/or "Resource ID", "Pricing".');
      return;
    }
    setPendingImport({ rows: mapped, filePath: res.filePath });
  }

  async function performImport() {
    if (!pendingImport) return;
    const { rows: mapped, filePath } = pendingImport;
    setPendingImport(null);
    await window.api.rates.importBulk(mapped);
    setImportMsg(`Imported ${mapped.length} rates from ${filePath}`);
    // TODO(stage5): invalidate rateMap once the project editor's cache lands.
    void refresh();
  }

  const filtered = rows.filter(r =>
    !filter
    || r.category.toLowerCase().includes(filter.toLowerCase())
    || (r.resource_id ?? '').toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="card">
      <h3>Rate Table</h3>
      <p className="muted">
        Lookup priority: (category + resource) → (resource-only flat) → (category only) → (rate-table flat). Leave Category blank for a flat rate; set Resource ID to override for one employee. Rows with a <strong>Rate Key</strong> instead of Category are legacy QuickProp imports — they still resolve via the employee category mapping. Filtering by Legal Entity also includes blank-entity rows so legacy rates stay visible.
      </p>
      <div className="toolbar">
        <label>Legal Entity:</label>
        <select value={selectedLE} onChange={(e) => setSelectedLE(e.target.value)} style={{ width: 160 }}>
          <option value="">(all)</option>
          {legalEntities.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <label>Rate Table:</label>
        <select value={selectedRT} onChange={(e) => setSelectedRT(e.target.value)} style={{ width: 180 }}>
          <option value="">(all)</option>
          {rateTables.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <input
          placeholder="Filter by category or resource id..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1, maxWidth: 280 }}
        />
        <div className="spacer" />
        <button onClick={() => void addBlank()} disabled={disabled}>+ Add Row</button>
        <button className="primary" onClick={() => void importFile()} disabled={disabled}>Import from File…</button>
      </div>
      {importMsg && <div className="success">{importMsg}</div>}
      <div style={{ maxHeight: 500, overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Legal Entity</th><th>Rate Table</th><th>Category</th><th>Rate Key</th><th>Resource ID</th>
              <th className="num">Price</th><th>Effective</th><th>End</th><th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const isLegacy = !r.category && !!r.rate_key;
              return (
                <tr key={r.id} style={isLegacy ? { background: '#FFFBEB' } : undefined}>
                  <td>
                    <select defaultValue={r.legal_entity} disabled={disabled} onChange={(e) => void save(r, { legal_entity: e.target.value })}>
                      {/* Allow blank legal_entity for legacy/global rates so the dropdown
                          can render the value imported rows actually carry. */}
                      <option value="">(any/legacy)</option>
                      {legalEntities.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </td>
                  <td>
                    <select defaultValue={r.rate_table} disabled={disabled} onChange={(e) => void save(r, { rate_table: e.target.value })}>
                      {/* Include the row's actual value even if it's not in the
                          rate_table lookup list (e.g. lowercase 'structural' from v1
                          imports vs 'Structural' in the lookup). Otherwise it would
                          render blank and a blur would clobber the data. */}
                      {!rateTables.some(n => n.toLowerCase() === r.rate_table.toLowerCase()) && r.rate_table && (
                        <option value={r.rate_table}>{r.rate_table} (legacy)</option>
                      )}
                      {rateTables.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </td>
                  <td>
                    <input
                      defaultValue={r.category}
                      placeholder={isLegacy ? '(uses rate key →)' : '(flat)'}
                      disabled={disabled}
                      onBlur={(e) => void save(r, { category: e.target.value })}
                      title={isLegacy
                        ? 'Legacy QuickProp row — resolves via Rate Key + category_mapping. Type a category here to migrate it to v2.'
                        : (r.category === '' ? 'No category — applies as a flat rate' : '')}
                    />
                  </td>
                  <td>
                    <input
                      defaultValue={r.rate_key ?? ''}
                      placeholder="—"
                      readOnly
                      title={isLegacy
                        ? `Legacy lookup key. Bill rates pull via category_mapping[employee.category] → ${r.rate_key}.`
                        : 'Read-only — only legacy v1 rows use rate_key.'}
                      style={{ background: 'var(--canvas)', color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 11 }}
                    />
                  </td>
                  <td>
                    <input
                      defaultValue={r.resource_id ?? ''}
                      placeholder="(any employee)"
                      disabled={disabled}
                      onBlur={(e) => void save(r, { resource_id: e.target.value.trim() || null })}
                    />
                  </td>
                  <td className="num"><input type="number" step="0.01" defaultValue={r.price} disabled={disabled} onBlur={(e) => void save(r, { price: parseFloat(e.target.value) || 0 })} /></td>
                  <td><input type="date" defaultValue={r.effective_date ?? ''} disabled={disabled} onBlur={(e) => void save(r, { effective_date: e.target.value || null })} /></td>
                  <td><input type="date" defaultValue={r.end_date ?? ''} disabled={disabled} onBlur={(e) => void save(r, { end_date: e.target.value || null })} /></td>
                  <td><button className="delete-x" onClick={() => setPendingDelete(r)} disabled={disabled}>&times;</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>{filtered.length} of {rows.length}</div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete rate?"
        body={pendingDelete && (
          <>
            Remove the <strong>{pendingDelete.legal_entity} / {pendingDelete.rate_table}</strong> rate
            {pendingDelete.category ? <> for <strong>{pendingDelete.category}</strong></> : ' (flat)'}
            {pendingDelete.resource_id ? <> ({pendingDelete.resource_id})</> : null}?
          </>
        )}
        confirmLabel="Delete"
        confirmKind="loss"
        onConfirm={() => void performDelete()}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmDialog
        open={!!pendingImport}
        title="Replace all rates?"
        body={<>Replace all <strong>{rows.length}</strong> existing rates with <strong>{pendingImport?.rows.length ?? 0}</strong> imported rows?</>}
        confirmLabel="Replace"
        confirmKind="loss"
        onConfirm={() => void performImport()}
        onCancel={() => setPendingImport(null)}
      />
    </div>
  );
}

function normalizeDate(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch { return null; }
}
