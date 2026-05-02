// Phase + task taxonomy editor. Direct port of PM Quoting App's
// PhaseTaskEditor. Phases and tasks are scoped to a chosen department.
//
// Known caveat: changing the dept dropdown re-fetches phases, but adding a
// department in the Basic Lists tab won't auto-refresh this dropdown until
// the user switches tabs back. Acceptable for Stage 2 — fix is one extra
// `useEffect` later.

import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../ui';
import type { PhaseDef, TaskDef } from '../../types/domain';

export default function PhaseTaskEditor() {
  const [departments, setDepartments] = useState<string[]>([]);
  const [dept, setDept] = useState<string>('');
  const [phases, setPhases] = useState<PhaseDef[]>([]);
  const [tasks, setTasks] = useState<TaskDef[]>([]);
  const [newPhase, setNewPhase] = useState('');
  const [newTaskPhase, setNewTaskPhase] = useState('');
  const [newTaskName, setNewTaskName] = useState('');
  const [pendingPhaseDelete, setPendingPhaseDelete] = useState<PhaseDef | null>(null);
  const [pendingTaskDelete, setPendingTaskDelete] = useState<TaskDef | null>(null);

  useEffect(() => {
    void window.api.lookups.list('department').then(rows => {
      const names = rows.map(r => r.name);
      setDepartments(names);
      if (names.length && !dept) setDept(names[0]);
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  async function refresh() {
    if (!dept) return;
    setPhases(await window.api.phases.list(dept));
    setTasks(await window.api.tasks.list(dept));
  }
  useEffect(() => { void refresh(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [dept]);

  async function addPhase() {
    if (!newPhase.trim() || !dept) return;
    await window.api.phases.save({ department: dept, name: newPhase.trim(), sort_order: phases.length });
    setNewPhase('');
    void refresh();
  }

  async function performPhaseDelete() {
    if (!pendingPhaseDelete) return;
    const id = pendingPhaseDelete.id;
    setPendingPhaseDelete(null);
    await window.api.phases.remove(id);
    void refresh();
  }

  async function renamePhase(id: number, oldName: string, newName: string) {
    if (!newName.trim() || newName === oldName) return;
    const p = phases.find(x => x.id === id);
    if (!p) return;
    await window.api.phases.save({ id, department: p.department, name: newName.trim(), sort_order: p.sort_order });
    void refresh();
  }

  async function addTask() {
    if (!newTaskPhase || !newTaskName.trim() || !dept) return;
    const siblings = tasks.filter(t => t.phase === newTaskPhase);
    await window.api.tasks.save({ department: dept, phase: newTaskPhase, name: newTaskName.trim(), sort_order: siblings.length });
    setNewTaskName('');
    void refresh();
  }

  async function renameTask(id: number, newName: string) {
    const t = tasks.find(x => x.id === id);
    if (!t || newName.trim() === t.name) return;
    await window.api.tasks.save({ id, department: t.department, phase: t.phase, name: newName.trim(), sort_order: t.sort_order });
    void refresh();
  }

  async function performTaskDelete() {
    if (!pendingTaskDelete) return;
    const id = pendingTaskDelete.id;
    setPendingTaskDelete(null);
    await window.api.tasks.remove(id);
    void refresh();
  }

  return (
    <div>
      <div className="toolbar">
        <label>Department:</label>
        <select value={dept} onChange={(e) => setDept(e.target.value)} style={{ width: 220 }}>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="card">
        <h3>Phases for {dept || '(no department)'}</h3>
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }}>Order</th>
              <th>Name</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {phases.map(p => (
              <tr key={p.id}>
                <td>{p.sort_order}</td>
                <td><input defaultValue={p.name} onBlur={(e) => void renamePhase(p.id, p.name, e.target.value)} /></td>
                <td><button className="delete-x" onClick={() => setPendingPhaseDelete(p)}>&times;</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <input
            placeholder="New phase..."
            value={newPhase}
            onChange={(e) => setNewPhase(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void addPhase(); }}
            style={{ flex: 1 }}
          />
          <button className="primary" onClick={() => void addPhase()} disabled={!dept}>Add Phase</button>
        </div>
      </div>

      <div className="card">
        <h3>Tasks</h3>
        {phases.map(p => {
          const phaseTasks = tasks.filter(t => t.phase === p.name);
          return (
            <div key={p.id} style={{ marginBottom: 16 }}>
              <h4>{p.name}</h4>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Order</th>
                    <th>Task</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {phaseTasks.map(t => (
                    <tr key={t.id}>
                      <td>{t.sort_order}</td>
                      <td><input defaultValue={t.name} onBlur={(e) => void renameTask(t.id, e.target.value)} /></td>
                      <td><button className="delete-x" onClick={() => setPendingTaskDelete(t)}>&times;</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={newTaskPhase} onChange={(e) => setNewTaskPhase(e.target.value)} style={{ width: 220 }}>
            <option value="">-- select phase --</option>
            {phases.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
          <input
            placeholder="New task..."
            value={newTaskName}
            onChange={(e) => setNewTaskName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void addTask(); }}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button className="primary" onClick={() => void addTask()} disabled={!dept || !newTaskPhase}>Add Task</button>
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingPhaseDelete}
        title="Delete phase?"
        body={<>Remove <strong>{pendingPhaseDelete?.name}</strong> from {dept}? Tasks in this phase will remain but will be orphaned.</>}
        confirmLabel="Delete"
        confirmKind="loss"
        onConfirm={() => void performPhaseDelete()}
        onCancel={() => setPendingPhaseDelete(null)}
      />
      <ConfirmDialog
        open={!!pendingTaskDelete}
        title="Delete task?"
        body={<>Remove the <strong>{pendingTaskDelete?.name}</strong> task from <strong>{pendingTaskDelete?.phase}</strong>?</>}
        confirmLabel="Delete"
        confirmKind="loss"
        onConfirm={() => void performTaskDelete()}
        onCancel={() => setPendingTaskDelete(null)}
      />
    </div>
  );
}
