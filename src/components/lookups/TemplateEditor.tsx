// Phase template editor. Direct port of PM Quoting App's TemplateEditor.
// Imports XLSX for the bulk-import flow; the file picker is fronted by
// `window.api.dialog.openFile` (added in Stage 2).

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { ConfirmDialog } from '../ui';
import type { TemplatePhase } from '../../types/domain';

type PendingImport = { rows: Array<Omit<TemplatePhase, 'id'>>; filePath: string };

// Department normalization: iCore exports use slightly different spellings
// than QuickQuote's canonical department list.
const DEPT_NORMALIZE: Record<string, string> = {
  'Architectural': 'Architecture',
  'Curtain Wall':  'Curtainwall',
  'Foundation':    'Foundations',
  'Frame':         'Framing',
  'Inspection':    'Inspections',
};

interface TemplateEditorProps {
  disabled?: boolean;
}

export default function TemplateEditor({ disabled }: TemplateEditorProps = {}) {
  const [rows, setRows] = useState<TemplatePhase[]>([]);
  const [legalEntities, setLegalEntities] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [rateTables, setRateTables] = useState<string[]>([]);
  const [filterLE, setFilterLE] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterTmpl, setFilterTmpl] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TemplatePhase | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);

  async function refresh() {
    const filters: any = {};
    if (filterLE)   filters.legal_entity = filterLE;
    if (filterDept) filters.department   = filterDept;
    if (filterTmpl) filters.template     = filterTmpl;
    setRows(await window.api.templates.list(filters));
  }

  useEffect(() => {
    void window.api.lookups.list('legal_entity').then(rs => setLegalEntities(rs.map(r => r.name)));
    void window.api.lookups.list('department').then(rs => setDepartments(rs.map(r => r.name)));
    void window.api.lookups.list('rate_table').then(rs => setRateTables(rs.map(r => r.name)));
  }, []);
  useEffect(() => { void refresh(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [filterLE, filterDept, filterTmpl]);

  async function save(r: TemplatePhase, patch: Partial<TemplatePhase>) {
    await window.api.templates.save({ ...r, ...patch });
    void refresh();
  }
  async function performDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    await window.api.templates.remove(id);
    void refresh();
  }
  async function addBlank() {
    await window.api.templates.save({
      legal_entity: filterLE   || legalEntities[0] || 'CES',
      department:   filterDept || departments[0]   || 'Consulting',
      template:     filterTmpl || 'New Template',
      phase_name:   'New Phase',
      rate_table:   rateTables[0] || 'Standard',
      sort_order:   rows.length,
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

    const counters: Record<string, number> = {};
    const mapped = json.map(r => {
      const deptRaw     = String(r['Department']  ?? r['department']   ?? '').trim();
      const dept        = DEPT_NORMALIZE[deptRaw] ?? deptRaw;
      const template    = String(r['Template']    ?? r['template']     ?? '').trim();
      const projectName = String(r['ProjectName'] ?? r['project_name'] ?? '').trim();
      const phase_name  = projectName.includes(':') ? projectName.split(':', 2)[1].trim() : projectName;
      const rate_table  = String(r['RateTable']   ?? r['rate_table']   ?? '').trim();
      const legal_entity = String(r['LegalEntity'] ?? r['legal_entity'] ?? '').trim().toUpperCase();
      if (!dept || !template || !phase_name || !rate_table || !legal_entity) return null;
      const key = `${legal_entity}||${dept}||${template}`;
      const sort_order = counters[key] ?? 0;
      counters[key] = sort_order + 1;
      return { legal_entity, department: dept, template, phase_name, rate_table, sort_order };
    }).filter(Boolean) as Array<Omit<TemplatePhase, 'id'>>;

    if (!mapped.length) {
      setImportMsg('No rows found. Expected columns: Department, Template, ProjectName ("Template: PhaseName"), RateTable, LegalEntity.');
      return;
    }
    setPendingImport({ rows: mapped, filePath: res.filePath });
  }

  async function performImport() {
    if (!pendingImport) return;
    const { rows: mapped, filePath } = pendingImport;
    setPendingImport(null);
    await window.api.templates.importBulk(mapped);
    setImportMsg(`Imported ${mapped.length} template phases from ${filePath}`);
    void refresh();
  }

  return (
    <div className="card">
      <h3>Project Templates</h3>
      <p className="muted">
        Maps of (Legal Entity → Department → Template → Phase → Rate Table). Used to pre-populate phases when a project is initialized with a selected template.
      </p>
      <div className="toolbar">
        <label>Legal Entity:</label>
        <select value={filterLE} onChange={(e) => setFilterLE(e.target.value)} style={{ width: 160 }}>
          <option value="">(all)</option>
          {legalEntities.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <label>Department:</label>
        <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} style={{ width: 180 }}>
          <option value="">(all)</option>
          {departments.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <label>Template:</label>
        <input placeholder="filter..." value={filterTmpl} onChange={(e) => setFilterTmpl(e.target.value)} style={{ width: 220 }} />
        <div className="spacer" />
        <button onClick={() => void addBlank()} disabled={disabled}>+ Add Row</button>
        <button className="primary" onClick={() => void importFile()} disabled={disabled}>Import iCore File…</button>
      </div>
      {importMsg && <div className="success">{importMsg}</div>}
      <div style={{ maxHeight: 500, overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Legal Entity</th><th>Department</th><th>Template</th>
              <th>Phase Name</th><th>Rate Table</th>
              <th className="num" style={{ width: 60 }}>Order</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>
                  <select defaultValue={r.legal_entity} disabled={disabled} onChange={(e) => void save(r, { legal_entity: e.target.value })}>
                    {legalEntities.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </td>
                <td>
                  <select defaultValue={r.department} disabled={disabled} onChange={(e) => void save(r, { department: e.target.value })}>
                    {departments.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </td>
                <td><input defaultValue={r.template} disabled={disabled} onBlur={(e) => void save(r, { template: e.target.value })} /></td>
                <td><input defaultValue={r.phase_name} disabled={disabled} onBlur={(e) => void save(r, { phase_name: e.target.value })} /></td>
                <td>
                  <select defaultValue={r.rate_table} disabled={disabled} onChange={(e) => void save(r, { rate_table: e.target.value })}>
                    {rateTables.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </td>
                <td className="num"><input type="number" defaultValue={r.sort_order} disabled={disabled} onBlur={(e) => void save(r, { sort_order: parseInt(e.target.value) || 0 })} /></td>
                <td><button className="delete-x" onClick={() => setPendingDelete(r)} disabled={disabled}>&times;</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>{rows.length} rows</div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete template phase?"
        body={pendingDelete && (
          <>
            Remove the <strong>{pendingDelete.phase_name}</strong> phase from the
            {' '}<strong>{pendingDelete.template}</strong> template ({pendingDelete.legal_entity} / {pendingDelete.department})?
          </>
        )}
        confirmLabel="Delete"
        confirmKind="loss"
        onConfirm={() => void performDelete()}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmDialog
        open={!!pendingImport}
        title="Replace all template rows?"
        body={<>Replace all <strong>{rows.length}</strong> existing template rows with <strong>{pendingImport?.rows.length ?? 0}</strong> imported rows?</>}
        confirmLabel="Replace"
        confirmKind="loss"
        onConfirm={() => void performImport()}
        onCancel={() => setPendingImport(null)}
      />
    </div>
  );
}
