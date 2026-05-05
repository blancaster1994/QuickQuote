// Employees editor. Direct port of PM Quoting App's EmployeeEditor — XLSX
// import + per-row inline editing + role dropdown.

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { ConfirmDialog } from '../ui';
import type { EmployeeRow } from '../../types/domain';

const ROLES = ['admin', 'pm', 'accounting', 'viewer'] as const;

type PendingImport = { rows: Array<Omit<EmployeeRow, 'id' | 'active'>>; filePath: string };

const DEPT_NORMALIZE: Record<string, string> = {
  'Architectural': 'Architecture',
  'Curtain Wall':  'Curtainwall',
  'Foundation':    'Foundations',
  'Frame':         'Framing',
  'Inspection':    'Inspections',
};

interface EmployeeEditorProps {
  disabled?: boolean;
}

export default function EmployeeEditor({ disabled }: EmployeeEditorProps = {}) {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [filter, setFilter] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EmployeeRow | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);

  async function refresh() {
    setRows(await window.api.employees.list(false));
  }
  useEffect(() => { void refresh(); }, []);

  async function save(r: EmployeeRow, patch: Partial<EmployeeRow>) {
    await window.api.employees.save({ ...r, ...patch });
    void refresh();
  }
  async function performDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    await window.api.employees.remove(id);
    void refresh();
  }
  async function addBlank() {
    await window.api.employees.save({
      resource_id: null, name: 'New Employee', category: null,
      legal_entity: null, email: null, home_department: null,
      title: null, credentials: null, role: 'pm', active: 1,
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
    const mapped = json.map(r => {
      const rawHomeDept = r['EmployeeHomeDepartment'] ?? r['Home department'] ?? r['home_department'] ?? null;
      const normalized  = rawHomeDept
        ? (DEPT_NORMALIZE[String(rawHomeDept).trim()] ?? String(rawHomeDept).trim())
        : null;
      return {
        resource_id: r['Resource ID'] ?? r['PersonnelNumber'] ?? r['resource_id'] ?? null,
        name:        r['Resource name'] ?? r['Name'] ?? r['name'] ?? '',
        category:    r['Category'] ?? r['category'] ?? null,
        legal_entity: r['Resource legal entity'] ?? r['Legal entity'] ?? r['legal_entity'] ?? null,
        email:       r['PrimaryContactEmail'] ?? r['Email'] ?? r['email'] ?? null,
        home_department: normalized === 'NA' ? null : normalized,
        title:       null,
        credentials: null,
        role:        'pm',
      };
    }).filter(r => r.name);

    if (!mapped.length) {
      setImportMsg('No rows found. Expected a sheet with columns like "Resource name" / "Name", and optionally "Resource ID" / "PersonnelNumber", "Category", "Resource legal entity", "PrimaryContactEmail", "EmployeeHomeDepartment".');
      return;
    }
    setPendingImport({ rows: mapped, filePath: res.filePath });
  }

  async function performImport() {
    if (!pendingImport) return;
    const { rows: mapped, filePath } = pendingImport;
    setPendingImport(null);
    await window.api.employees.importBulk(mapped);
    setImportMsg(`Imported ${mapped.length} employees from ${filePath}`);
    void refresh();
  }

  const filtered = rows.filter(r =>
    !filter
    || r.name.toLowerCase().includes(filter.toLowerCase())
    || (r.category ?? '').toLowerCase().includes(filter.toLowerCase())
    || (r.email ?? '').toLowerCase().includes(filter.toLowerCase())
    || (r.home_department ?? '').toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="card">
      <h3>Employees</h3>
      <div className="toolbar">
        <input
          placeholder="Filter by name, category, email, or home dept..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1, maxWidth: 360 }}
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
              <th>Resource ID</th><th>Name</th><th>Category</th><th>Legal Entity</th>
              <th>Email</th><th>Home Dept</th><th>Title</th><th>Credentials</th>
              <th>Role</th><th>Active</th><th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id}>
                <td><input defaultValue={r.resource_id ?? ''} disabled={disabled} onBlur={(e) => void save(r, { resource_id: e.target.value || null })} /></td>
                <td><input defaultValue={r.name} disabled={disabled} onBlur={(e) => void save(r, { name: e.target.value })} /></td>
                <td><input defaultValue={r.category ?? ''} disabled={disabled} onBlur={(e) => void save(r, { category: e.target.value || null })} /></td>
                <td><input defaultValue={r.legal_entity ?? ''} disabled={disabled} onBlur={(e) => void save(r, { legal_entity: e.target.value || null })} /></td>
                <td><input defaultValue={r.email ?? ''} disabled={disabled} onBlur={(e) => void save(r, { email: e.target.value || null })} /></td>
                <td><input defaultValue={r.home_department ?? ''} disabled={disabled} onBlur={(e) => void save(r, { home_department: e.target.value || null })} /></td>
                <td><input defaultValue={r.title ?? ''} placeholder="VP of Engineering" disabled={disabled} onBlur={(e) => void save(r, { title: e.target.value || null })} /></td>
                <td><input defaultValue={r.credentials ?? ''} placeholder="P.E., S.E." disabled={disabled} onBlur={(e) => void save(r, { credentials: e.target.value || null })} /></td>
                <td>
                  <select defaultValue={r.role || 'pm'} disabled={disabled} onChange={(e) => void save(r, { role: e.target.value })}>
                    {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!r.active}
                    disabled={disabled}
                    onChange={(e) => void save(r, { active: e.target.checked ? 1 : 0 })}
                  />
                </td>
                <td><button className="delete-x" onClick={() => setPendingDelete(r)} disabled={disabled}>&times;</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>{filtered.length} of {rows.length}</div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete employee?"
        body={<>Remove <strong>{pendingDelete?.name || 'this employee'}</strong> from the employee list?</>}
        confirmLabel="Delete"
        confirmKind="loss"
        onConfirm={() => void performDelete()}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmDialog
        open={!!pendingImport}
        title="Replace all employees?"
        body={<>Replace all <strong>{rows.length}</strong> existing employees with <strong>{pendingImport?.rows.length ?? 0}</strong> imported rows?</>}
        confirmLabel="Replace"
        confirmKind="loss"
        onConfirm={() => void performImport()}
        onCancel={() => setPendingImport(null)}
      />
    </div>
  );
}
