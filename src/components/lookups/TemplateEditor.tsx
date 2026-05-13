// Phase template editor. Each template owns its phases; each phase owns its
// time-entry tasks (the buckets iCore presents when staff log hours against
// a project applied from this template).
//
// Layout: scope by (Legal Entity, Department) filters, then list each
// template under that scope as a card. Inside each card, phases are rows
// with a tasks textarea (one task per line) — saved on blur.
//
// The iCore XLSX import flow is preserved: it imports flat phase rows
// (no tasks) and bulk-replaces the table. Tasks for imported templates
// can be added afterwards in the editor.

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { ConfirmDialog } from '../ui';
import type { TemplatePhase } from '../../types/domain';

type PendingImport = { rows: Array<Omit<TemplatePhase, 'id' | 'tasks'>>; filePath: string };
type PendingTemplateDelete = { name: string; phaseCount: number };

// Department normalization for iCore XLSX import: source spelling varies.
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
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [pendingPhaseDelete, setPendingPhaseDelete] = useState<TemplatePhase | null>(null);
  const [pendingTemplateDelete, setPendingTemplateDelete] = useState<PendingTemplateDelete | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);

  async function refresh() {
    const filters: { legal_entity?: string; department?: string } = {};
    if (filterLE)   filters.legal_entity = filterLE;
    if (filterDept) filters.department   = filterDept;
    setRows(await window.api.templates.list(filters));
  }

  useEffect(() => {
    void window.api.lookups.list('legal_entity').then(rs => setLegalEntities(rs.map(r => r.name)));
    void window.api.lookups.list('department').then(rs => setDepartments(rs.map(r => r.name)));
    void window.api.lookups.list('rate_table').then(rs => setRateTables(rs.map(r => r.name)));
  }, []);
  useEffect(() => { void refresh(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [filterLE, filterDept]);

  // Group phases by template name for rendering. Order: insertion order from
  // the SELECT (which is by legal_entity, department, template, sort_order).
  const templates = useMemo(() => {
    const map = new Map<string, TemplatePhase[]>();
    for (const r of rows) {
      const arr = map.get(r.template) ?? [];
      arr.push(r);
      map.set(r.template, arr);
    }
    return Array.from(map.entries()).map(([name, phases]) => ({
      name,
      phases: phases.slice().sort((a, b) => a.sort_order - b.sort_order),
    }));
  }, [rows]);

  async function savePhase(r: TemplatePhase, patch: Partial<Omit<TemplatePhase, 'id'>>) {
    await window.api.templates.save({ ...r, ...patch });
    void refresh();
  }

  async function saveTasks(r: TemplatePhase, raw: string) {
    const tasks = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (tasks.length === r.tasks.length && tasks.every((t, i) => t === r.tasks[i])) return;
    await window.api.templates.save({ ...r, tasks });
    void refresh();
  }

  async function addBlankTemplate() {
    const le   = filterLE   || legalEntities[0] || 'CES';
    const dept = filterDept || departments[0]   || 'Consulting';
    // Pick a unique template name in the current scope.
    const usedNames = new Set(
      rows.filter(r => r.legal_entity === le && r.department === dept).map(r => r.template),
    );
    let name = 'New Template';
    let n = 1;
    while (usedNames.has(name)) { n += 1; name = `New Template ${n}`; }
    await window.api.templates.save({
      legal_entity: le,
      department:   dept,
      template:     name,
      phase_name:   'New Phase',
      rate_table:   rateTables[0] || '',
      sort_order:   0,
      tasks:        [],
    });
    void refresh();
  }

  async function addPhaseToTemplate(templateName: string, phases: TemplatePhase[]) {
    if (!phases.length) return;
    const first = phases[0];
    await window.api.templates.save({
      legal_entity: first.legal_entity,
      department:   first.department,
      template:     templateName,
      phase_name:   'New Phase',
      rate_table:   first.rate_table,
      sort_order:   phases.length,
      tasks:        [],
    });
    void refresh();
  }

  async function performPhaseDelete() {
    if (!pendingPhaseDelete) return;
    const id = pendingPhaseDelete.id;
    setPendingPhaseDelete(null);
    await window.api.templates.remove(id);
    void refresh();
  }

  async function renameTemplate(oldName: string, newName: string) {
    const next = newName.trim();
    if (!next || next === oldName) return;
    const inScope = rows.filter(r => r.template === oldName);
    for (const r of inScope) {
      await window.api.templates.save({ ...r, template: next });
    }
    void refresh();
  }

  async function performTemplateDelete() {
    if (!pendingTemplateDelete) return;
    const name = pendingTemplateDelete.name;
    setPendingTemplateDelete(null);
    const inScope = rows.filter(r => r.template === name);
    for (const r of inScope) {
      await window.api.templates.remove(r.id);
    }
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
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { raw: false, defval: null });

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
    }).filter(Boolean) as Array<Omit<TemplatePhase, 'id' | 'tasks'>>;

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
    setImportMsg(`Imported ${mapped.length} template phases from ${filePath}. Tasks were not in the import — add them per phase below.`);
    void refresh();
  }

  return (
    <div>
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
        <div className="spacer" />
        <button onClick={() => void addBlankTemplate()} disabled={disabled}>+ New Template</button>
        <button className="primary" onClick={() => void importFile()} disabled={disabled}>Import iCore File…</button>
      </div>
      {importMsg && <div className="success">{importMsg}</div>}
      <p className="muted" style={{ marginTop: 8 }}>
        Templates are bundles of phases scoped to (Legal Entity, Department). Each phase owns its tasks — the time-entry buckets staff pick when logging hours in iCore against a project applied from this template.
      </p>

      {templates.length === 0 && (
        <div className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>
          No templates in this scope. Click <strong>+ New Template</strong> above to start one.
        </div>
      )}

      {templates.map(({ name, phases }) => (
        <div key={name} className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input
              defaultValue={name}
              disabled={disabled}
              onBlur={(e) => void renameTemplate(name, e.target.value)}
              style={{ flex: 1, fontWeight: 700, fontSize: 14 }}
            />
            <span className="muted" style={{ fontSize: 11 }}>
              {phases[0]?.legal_entity} / {phases[0]?.department}
            </span>
            <button
              className="delete-x"
              title={`Delete template "${name}" and all its phases`}
              onClick={() => setPendingTemplateDelete({ name, phaseCount: phases.length })}
              disabled={disabled}
            >&times;</button>
          </div>

          <table>
            <thead>
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th>Phase Name</th>
                <th style={{ width: 160 }}>Rate Table</th>
                <th>Tasks (one per line)</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {phases.map((p, idx) => (
                <tr key={p.id}>
                  <td className="num">{idx + 1}</td>
                  <td>
                    <input
                      defaultValue={p.phase_name}
                      disabled={disabled}
                      onBlur={(e) => void savePhase(p, { phase_name: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      defaultValue={p.rate_table}
                      disabled={disabled}
                      onChange={(e) => void savePhase(p, { rate_table: e.target.value })}
                    >
                      {rateTables.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </td>
                  <td>
                    <textarea
                      defaultValue={p.tasks.join('\n')}
                      disabled={disabled}
                      placeholder="One task per line, e.g.&#10;Drafting&#10;Engineering"
                      rows={Math.max(2, p.tasks.length || 2)}
                      onBlur={(e) => void saveTasks(p, e.target.value)}
                      style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 12 }}
                    />
                  </td>
                  <td>
                    <button
                      className="delete-x"
                      title="Delete this phase"
                      onClick={() => setPendingPhaseDelete(p)}
                      disabled={disabled}
                    >&times;</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => void addPhaseToTemplate(name, phases)}
              disabled={disabled}
            >+ Add Phase</button>
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={!!pendingPhaseDelete}
        title="Delete phase?"
        body={pendingPhaseDelete && (
          <>
            Remove the <strong>{pendingPhaseDelete.phase_name}</strong> phase from the
            {' '}<strong>{pendingPhaseDelete.template}</strong> template? Its tasks will be deleted too.
          </>
        )}
        confirmLabel="Delete"
        confirmKind="loss"
        onConfirm={() => void performPhaseDelete()}
        onCancel={() => setPendingPhaseDelete(null)}
      />
      <ConfirmDialog
        open={!!pendingTemplateDelete}
        title="Delete template?"
        body={pendingTemplateDelete && (
          <>
            Remove the <strong>{pendingTemplateDelete.name}</strong> template and all{' '}
            <strong>{pendingTemplateDelete.phaseCount}</strong> phase{pendingTemplateDelete.phaseCount === 1 ? '' : 's'} under it (tasks included)?
          </>
        )}
        confirmLabel="Delete template"
        confirmKind="loss"
        onConfirm={() => void performTemplateDelete()}
        onCancel={() => setPendingTemplateDelete(null)}
      />
      <ConfirmDialog
        open={!!pendingImport}
        title="Replace all template rows?"
        body={<>Replace all <strong>{rows.length}</strong> existing template rows with <strong>{pendingImport?.rows.length ?? 0}</strong> imported rows? Existing tasks will be lost.</>}
        confirmLabel="Replace"
        confirmKind="loss"
        onConfirm={() => void performImport()}
        onCancel={() => setPendingImport(null)}
      />
    </div>
  );
}
