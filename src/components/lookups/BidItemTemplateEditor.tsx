// Bid Item Template admin editor.
//
// Scoped per (legal_entity, department). Each template holds an ordered list
// of phases; each phase holds an ordered list of name-only tasks. Templates
// are applied in the proposal editor — see BidItemTemplatePicker.

import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '../ui';
import type { BidItemTemplate } from '../../types/domain';

interface BidItemTemplateEditorProps {
  disabled?: boolean;
}

export default function BidItemTemplateEditor({ disabled }: BidItemTemplateEditorProps = {}) {
  const [legalEntities, setLegalEntities] = useState<string[]>([]);
  const [departments,   setDepartments]   = useState<string[]>([]);
  const [legalEntity,   setLegalEntity]   = useState<string>('');
  const [department,    setDepartment]    = useState<string>('');
  const [templateNames, setTemplateNames] = useState<string[]>([]);
  const [activeName,    setActiveName]    = useState<string>('');
  const [working,       setWorking]       = useState<BidItemTemplate | null>(null);
  const [activePhaseIdx, setActivePhaseIdx] = useState<number>(0);
  const [pendingDelete, setPendingDelete]   = useState<string | null>(null);
  const [dirty,         setDirty]         = useState(false);

  // Bootstrap legal entity + department options once.
  useEffect(() => {
    void window.api.lookups.list('legal_entity').then(rs => {
      const names = rs.map(r => r.name);
      setLegalEntities(names);
      setLegalEntity((prev) => prev || names[0] || '');
    });
    void window.api.lookups.list('department').then(rs => {
      const names = rs.map(r => r.name);
      setDepartments(names);
      setDepartment((prev) => prev || names[0] || '');
    });
  }, []);

  // List templates for the current scope.
  async function refreshNames() {
    if (!legalEntity || !department) {
      setTemplateNames([]);
      setActiveName('');
      setWorking(null);
      return;
    }
    const names = await window.api.bidItemTemplates.list(legalEntity, department);
    setTemplateNames(names);
    setActiveName((prev) => names.includes(prev) ? prev : names[0] || '');
  }
  useEffect(() => { void refreshNames(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [legalEntity, department]);

  // Load the selected template.
  useEffect(() => {
    if (!activeName || !legalEntity || !department) {
      setWorking(null);
      setActivePhaseIdx(0);
      setDirty(false);
      return;
    }
    void window.api.bidItemTemplates.get(legalEntity, department, activeName).then((t) => {
      setWorking(t || { legal_entity: legalEntity, department, name: activeName, phases: [] });
      setActivePhaseIdx(0);
      setDirty(false);
    });
  }, [activeName, legalEntity, department]);

  const activePhase = useMemo(() => {
    if (!working?.phases?.length) return null;
    return working.phases[Math.min(activePhaseIdx, working.phases.length - 1)] ?? null;
  }, [working, activePhaseIdx]);

  function patchWorking(next: BidItemTemplate) {
    setWorking(next);
    setDirty(true);
  }

  async function addTemplate() {
    if (disabled || !legalEntity || !department) return;
    const baseName = 'New Template';
    let name = baseName;
    let n = 2;
    while (templateNames.includes(name)) name = `${baseName} ${n++}`;
    const fresh: BidItemTemplate = {
      legal_entity: legalEntity,
      department,
      name,
      phases: [],
    };
    await window.api.bidItemTemplates.save(fresh);
    await refreshNames();
    setActiveName(name);
  }

  async function saveWorking() {
    if (!working) return;
    // Normalize sort_order from array index before saving.
    const normalized: BidItemTemplate = {
      ...working,
      phases: working.phases.map((p, pi) => ({
        ...p,
        sort_order: pi,
        tasks: p.tasks.map((t, ti) => ({ ...t, sort_order: ti })),
      })),
    };
    await window.api.bidItemTemplates.save(normalized);
    setDirty(false);
    await refreshNames();
  }

  async function performDeleteTemplate() {
    if (!pendingDelete || !legalEntity || !department) return;
    const name = pendingDelete;
    setPendingDelete(null);
    await window.api.bidItemTemplates.remove(legalEntity, department, name);
    setActiveName('');
    setWorking(null);
    await refreshNames();
  }

  // ── Phase / task mutations on `working` ───────────────────────────────────
  function addPhase() {
    if (!working) return;
    const phases = [...working.phases, {
      phase_name: 'New Phase',
      sort_order: working.phases.length,
      tasks: [],
    }];
    patchWorking({ ...working, phases });
    setActivePhaseIdx(phases.length - 1);
  }
  function updatePhase(idx: number, patch: Partial<{ phase_name: string }>) {
    if (!working) return;
    const phases = working.phases.map((p, i) => i === idx ? { ...p, ...patch } : p);
    patchWorking({ ...working, phases });
  }
  function removePhase(idx: number) {
    if (!working) return;
    const phases = working.phases.filter((_, i) => i !== idx);
    patchWorking({ ...working, phases });
    setActivePhaseIdx(Math.max(0, Math.min(idx, phases.length - 1)));
  }
  function movePhase(idx: number, dir: -1 | 1) {
    if (!working) return;
    const target = idx + dir;
    if (target < 0 || target >= working.phases.length) return;
    const phases = working.phases.slice();
    [phases[idx], phases[target]] = [phases[target], phases[idx]];
    patchWorking({ ...working, phases });
    setActivePhaseIdx(target);
  }

  function addTask() {
    if (!working || !activePhase) return;
    const phases = working.phases.map((p, i) =>
      i === activePhaseIdx
        ? { ...p, tasks: [...p.tasks, { name: 'New Task', sort_order: p.tasks.length }] }
        : p,
    );
    patchWorking({ ...working, phases });
  }
  function updateTask(taskIdx: number, name: string) {
    if (!working) return;
    const phases = working.phases.map((p, i) => {
      if (i !== activePhaseIdx) return p;
      const tasks = p.tasks.map((t, ti) => ti === taskIdx ? { ...t, name } : t);
      return { ...p, tasks };
    });
    patchWorking({ ...working, phases });
  }
  function removeTask(taskIdx: number) {
    if (!working) return;
    const phases = working.phases.map((p, i) => {
      if (i !== activePhaseIdx) return p;
      return { ...p, tasks: p.tasks.filter((_, ti) => ti !== taskIdx) };
    });
    patchWorking({ ...working, phases });
  }
  function moveTask(taskIdx: number, dir: -1 | 1) {
    if (!working) return;
    const phases = working.phases.map((p, i) => {
      if (i !== activePhaseIdx) return p;
      const target = taskIdx + dir;
      if (target < 0 || target >= p.tasks.length) return p;
      const tasks = p.tasks.slice();
      [tasks[taskIdx], tasks[target]] = [tasks[target], tasks[taskIdx]];
      return { ...p, tasks };
    });
    patchWorking({ ...working, phases });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* Scope filters */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <Field label="Legal entity">
          <select value={legalEntity} onChange={(e) => setLegalEntity(e.target.value)} disabled={disabled} style={selectStyle}>
            {legalEntities.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="Department">
          <select value={department} onChange={(e) => setDepartment(e.target.value)} disabled={disabled} style={selectStyle}>
            {departments.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <div style={{ flex: 1 }} />
        {!disabled && (
          <button onClick={() => void addTemplate()} style={primaryButton}>+ New template</button>
        )}
      </div>

      {/* Three-pane body */}
      <div style={{
        display: 'grid', gridTemplateColumns: '220px 220px 1fr', gap: 12,
        flex: 1, minHeight: 360,
      }}>
        {/* Templates list */}
        <Pane label="Templates">
          {templateNames.length === 0 ? (
            <Empty>No templates yet for this scope.</Empty>
          ) : (
            templateNames.map((n) => (
              <ListRow
                key={n}
                active={n === activeName}
                onClick={() => setActiveName(n)}
                onDelete={!disabled ? () => setPendingDelete(n) : undefined}>
                {n}
              </ListRow>
            ))
          )}
        </Pane>

        {/* Phases list */}
        <Pane
          label="Phases"
          actions={!disabled && working ? (
            <button style={miniButton} onClick={addPhase}>+ Phase</button>
          ) : null}>
          {!working ? (
            <Empty>Pick a template.</Empty>
          ) : working.phases.length === 0 ? (
            <Empty>No phases yet. Click "+ Phase" above.</Empty>
          ) : (
            working.phases.map((p, idx) => (
              <ListRow
                key={idx}
                active={idx === activePhaseIdx}
                onClick={() => setActivePhaseIdx(idx)}
                onUp={!disabled ? () => movePhase(idx, -1) : undefined}
                onDown={!disabled ? () => movePhase(idx, 1) : undefined}
                onDelete={!disabled ? () => removePhase(idx) : undefined}>
                <input
                  value={p.phase_name}
                  disabled={disabled}
                  onChange={(e) => updatePhase(idx, { phase_name: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  style={rowInputStyle}
                />
              </ListRow>
            ))
          )}
        </Pane>

        {/* Tasks for active phase */}
        <Pane
          label={activePhase ? `Tasks · ${activePhase.phase_name || '(unnamed)'}` : 'Tasks'}
          actions={!disabled && activePhase ? (
            <button style={miniButton} onClick={addTask}>+ Task</button>
          ) : null}>
          {!activePhase ? (
            <Empty>Pick a phase to edit its tasks.</Empty>
          ) : activePhase.tasks.length === 0 ? (
            <Empty>No tasks yet. Click "+ Task" above.</Empty>
          ) : (
            activePhase.tasks.map((t, idx) => (
              <ListRow
                key={idx}
                onUp={!disabled ? () => moveTask(idx, -1) : undefined}
                onDown={!disabled ? () => moveTask(idx, 1) : undefined}
                onDelete={!disabled ? () => removeTask(idx) : undefined}>
                <input
                  value={t.name}
                  disabled={disabled}
                  onChange={(e) => updateTask(idx, e.target.value)}
                  style={rowInputStyle}
                />
              </ListRow>
            ))
          )}
        </Pane>
      </div>

      {/* Save / dirty indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, fontSize: 11.5, color: dirty ? 'var(--action-warn)' : 'var(--muted)' }}>
          {dirty ? 'Unsaved changes' : ' '}
        </div>
        {!disabled && working && (
          <button
            onClick={() => void saveWorking()}
            disabled={!dirty}
            style={{ ...primaryButton, opacity: dirty ? 1 : 0.5 }}>
            Save template
          </button>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete template?"
        body={<>Remove <strong>{pendingDelete}</strong>? All phases and tasks in this template will be lost.</>}
        confirmLabel="Delete"
        confirmKind="loss"
        onConfirm={() => void performDeleteTemplate()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

// ── Layout primitives ───────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{
        fontSize: 10.5, letterSpacing: 0.4, fontWeight: 600,
        color: 'var(--muted)', textTransform: 'uppercase',
      }}>{label}</span>
      {children}
    </div>
  );
}

function Pane({ label, actions, children }: {
  label: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: 'var(--surface)',
      border: '1px solid var(--hair)', borderRadius: 8,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', borderBottom: '1px solid var(--hair)',
        background: 'var(--canvas)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)', letterSpacing: 0.3 }}>{label}</span>
        <div style={{ flex: 1 }} />
        {actions}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 4 }}>{children}</div>
    </div>
  );
}

function ListRow({ active, onClick, onDelete, onUp, onDown, children }: {
  active?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
  onUp?: () => void;
  onDown?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 6px',
        background: active ? 'var(--accent-soft, #eef2ff)' : 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        borderRadius: 4,
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {onUp && <RowButton onClick={(e) => { e.stopPropagation(); onUp(); }} aria-label="Move up">↑</RowButton>}
      {onDown && <RowButton onClick={(e) => { e.stopPropagation(); onDown(); }} aria-label="Move down">↓</RowButton>}
      {onDelete && <RowButton onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Delete">×</RowButton>}
    </div>
  );
}

function RowButton({ children, onClick, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button onClick={onClick} {...rest}
      style={{
        width: 22, height: 22, padding: 0, borderRadius: 4,
        background: 'transparent', color: 'var(--muted)',
        border: '1px solid transparent', cursor: 'pointer',
        fontSize: 13, lineHeight: 1,
      }}>{children}</button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 8px', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
      {children}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  height: 30, padding: '0 8px',
  border: '1px solid var(--hair)', borderRadius: 5,
  fontSize: 12.5, fontFamily: 'var(--sans)',
  background: 'var(--surface)', color: 'var(--ink)',
  minWidth: 160,
};

const rowInputStyle: React.CSSProperties = {
  width: '100%', height: 26, padding: '0 6px',
  border: '1px solid transparent', borderRadius: 4,
  fontSize: 12, fontFamily: 'var(--sans)',
  background: 'transparent', color: 'var(--ink)',
  outline: 'none',
};

const primaryButton: React.CSSProperties = {
  height: 30, padding: '0 12px',
  background: 'var(--navy-deep)', color: '#fff',
  border: 'none', borderRadius: 6,
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'var(--sans)',
};

const miniButton: React.CSSProperties = {
  height: 24, padding: '0 8px',
  background: 'var(--surface)', color: 'var(--body)',
  border: '1px solid var(--hair)', borderRadius: 5,
  fontSize: 11, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'var(--sans)',
};
