// InitializeProjectModal — opens when the user clicks Mark Won on a sent
// proposal. Collects the project's identity (legal entity, department,
// optional rate table + phase template + iCore project ID), runs Mark
// Won + project.initialize as a paired flow, and returns the new Project
// to the caller for state.
//
// If the proposal already has a project (e.g. user reopened a Won proposal
// then re-marked it Sent and clicked Mark Won again), the modal swaps to
// "Open existing" read-only mode. The Continue button preserves the
// existing project payload but still runs markWon when the proposal isn't
// already in Won status, so lifecycle state stays in sync.

import { useEffect, useState } from 'react';
import { Modal, ModalActions } from './StatusComponents';
import { FieldLabel } from './shared';
import type { Project, Proposal } from '../types/domain';

interface InitializeProjectModalProps {
  proposal: Proposal;
  onClose: () => void;
  /** Called after a successful create OR when the user opens an existing
   *  project. Caller dispatches LOAD_PROJECT with the result and reloads
   *  the proposal so its lifecycle reflects "won" status. */
  onCommitted: (project: Project) => void;
}

export default function InitializeProjectModal({
  proposal, onClose, onCommitted,
}: InitializeProjectModalProps) {
  const [legalEntities, setLegalEntities] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [rateTables, setRateTables] = useState<string[]>([]);
  const [templates, setTemplates] = useState<string[]>([]);

  const [legalEntity, setLegalEntity] = useState('');
  const [department, setDepartment] = useState('');
  const [rateTable, setRateTable] = useState<string>('');
  const [template, setTemplate] = useState<string>('');               // '' = none
  const [templateMode, setTemplateMode] = useState<'append' | 'replace'>('append');
  const [icoreId, setIcoreId] = useState(
    proposal.lifecycle?.metadata?.iCore_project_id || '',
  );

  const [existing, setExisting] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Bootstrap lookups + detect existing project on mount.
  useEffect(() => {
    void (async () => {
      try {
        const [le, dept, rt, ex] = await Promise.all([
          window.api.lookups.list('legal_entity'),
          window.api.lookups.list('department'),
          window.api.lookups.list('rate_table'),
          proposal.name ? window.api.project.getByProposalName(proposal.name) : Promise.resolve(null),
        ]);
        setLegalEntities(le.map(r => r.name));
        setDepartments(dept.map(r => r.name));
        setRateTables(rt.map(r => r.name));
        if (ex) {
          setExisting(ex);
          setLegalEntity(ex.legal_entity);
          setDepartment(ex.department);
          setRateTable(ex.rate_table || '');
          setTemplate(ex.phase_template || '');
          setIcoreId(ex.icore_project_id || '');
        } else {
          // Sensible defaults for a fresh project: rateTable from the proposal.
          setRateTable(proposal.rateTable || '');
        }
      } catch (e: any) {
        setErr(`Failed to load lookups: ${e?.message || String(e)}`);
      } finally {
        setLoaded(true);
      }
    })();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  // When (legalEntity, department) is set, fetch the matching template names.
  useEffect(() => {
    if (!legalEntity || !department) { setTemplates([]); return; }
    void window.api.templates
      .listForContext(legalEntity, department)
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, [legalEntity, department]);

  const icoreValid = !icoreId.trim() || /^[A-Za-z0-9_-]+$/.test(icoreId.trim());
  const canSubmit = !existing
    && !!legalEntity
    && !!department
    && icoreValid
    && !busy;

  async function submit() {
    if (!canSubmit) return;
    if (!proposal.name?.trim()) {
      setErr('Save the proposal first (give it a name) before initializing.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      // 1. Mark the proposal Won (flips status, writes activity, stamps
      //    iCore on the lifecycle.metadata for back-compat).
      await window.api.lifecycle.markWon(
        proposal.name,
        '',
        icoreId.trim() || null,
      );
      // 2. Create the project row. Auto-converts sections → phases inside
      //    the IPC handler (see electron/main.ts PROJECT_INITIALIZE).
      const project = (await window.api.project.initialize({
        proposalName: proposal.name,
        header: {
          legal_entity:     legalEntity,
          department:       department,
          rate_table:       rateTable || null,
          phase_template:   template || null,
          icore_project_id: icoreId.trim() || null,
        },
        template: template ? { name: template, mode: templateMode } : null,
      })) as Project;
      onCommitted(project);
    } catch (e: any) {
      setErr(`Initialize failed: ${e?.message || String(e)}`);
      setBusy(false);
    }
  }

  async function continueExisting() {
    if (!existing) return;
    if (!proposal.name?.trim()) {
      setErr('Save the proposal first (give it a name) before continuing.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      // If the proposal isn't already Won (user reopened a Won project then
      // re-marked it Sent), re-run markWon now so lifecycle status matches
      // the existing project. The project payload — phases, resources,
      // ClickUp links — is preserved untouched; we only flip status.
      const currentStatus = proposal.lifecycle?.status;
      if (currentStatus === 'sent') {
        await window.api.lifecycle.markWon(
          proposal.name,
          '',
          existing.icore_project_id || null,
        );
      }
      onCommitted(existing);
    } catch (e: any) {
      setErr(`Mark Won failed: ${e?.message || String(e)}`);
      setBusy(false);
    }
  }

  return (
    <Modal title={existing ? 'Open existing project' : 'Initialize project'} onClose={onClose}>
      {!loaded && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</div>}

      {loaded && existing && (
        <div style={{ fontSize: 12.5, color: 'var(--body)', marginBottom: 14 }}>
          {proposal.lifecycle?.status === 'won'
            ? `This proposal is already Won and initialized as a project. Opening continues to the project view — your phases, resources, and ClickUp links are preserved. Cancel to leave the proposal where it is.`
            : `This proposal was previously marked Won and still has its project (phases, resources, ClickUp links). Continuing will mark it Won again and open the project — your existing project work is preserved. Cancel to leave the proposal in ${proposal.lifecycle?.status ?? 'its current'} state.`}
        </div>
      )}

      {loaded && !existing && (
        <div style={{ fontSize: 12.5, color: 'var(--body)', marginBottom: 14 }}>
          Marking <strong>{proposal.name || '(untitled)'}</strong> as Won. Pick the
          legal entity and department this work belongs to. Phases will be auto-seeded
          from the proposal's existing sections; pick a template to overlay or replace
          them.
        </div>
      )}

      {loaded && (
        <>
          <FieldLabel>Legal entity *</FieldLabel>
          <select
            value={legalEntity}
            onChange={(e) => setLegalEntity(e.target.value)}
            disabled={!!existing}
            style={fieldStyle}>
            <option value="">— Select —</option>
            {legalEntities.map(n => <option key={n} value={n}>{n}</option>)}
          </select>

          <FieldLabel>Department *</FieldLabel>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            disabled={!!existing}
            style={fieldStyle}>
            <option value="">— Select —</option>
            {departments.map(n => <option key={n} value={n}>{n}</option>)}
          </select>

          <FieldLabel>Rate table</FieldLabel>
          <select
            value={rateTable}
            onChange={(e) => setRateTable(e.target.value)}
            disabled={!!existing}
            style={fieldStyle}>
            <option value="">— Use proposal's ({proposal.rateTable || '—'}) —</option>
            {rateTables.map(n => <option key={n} value={n}>{n}</option>)}
          </select>

          <FieldLabel>Phase template</FieldLabel>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            disabled={!!existing}
            style={fieldStyle}>
            <option value="">(none — keep current sections as phases)</option>
            {templates.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {template && !existing && (
            <div style={{ marginTop: 6, marginBottom: 12 }}>
              <RadioRow
                label="Append template phases after the auto-converted ones"
                value="append"
                checked={templateMode === 'append'}
                onPick={() => setTemplateMode('append')}
              />
              <RadioRow
                label="Replace auto-converted phases with the template"
                value="replace"
                checked={templateMode === 'replace'}
                onPick={() => setTemplateMode('replace')}
              />
            </div>
          )}

          <FieldLabel>iCore project ID</FieldLabel>
          <input
            value={icoreId}
            onChange={(e) => setIcoreId(e.target.value)}
            placeholder="e.g. C-2026-0042"
            disabled={!!existing}
            style={fieldStyle}
          />
          {!icoreValid && (
            <div style={{ fontSize: 11.5, color: 'var(--action-danger)', marginTop: 4 }}>
              iCore IDs are alphanumeric (letters, digits, "-" or "_").
            </div>
          )}
        </>
      )}

      {err && (
        <div style={{
          marginTop: 12, padding: '8px 10px',
          background: 'var(--action-danger-tint)', border: '1px solid var(--action-danger-edge)',
          borderRadius: 6, fontSize: 11.5, color: 'var(--action-danger)',
        }}>
          {err}
        </div>
      )}

      {existing ? (
        <ModalActions
          onCancel={onClose}
          onConfirm={() => void continueExisting()}
          confirmLabel={
            busy
              ? 'Marking Won…'
              : (proposal.lifecycle?.status === 'sent'
                  ? 'Mark Won + Open project'
                  : 'Continue to project')
          }
          confirmDisabled={busy}
          confirmKind={proposal.lifecycle?.status === 'sent' ? 'win' : 'primary'}
        />
      ) : (
        <ModalActions
          onCancel={onClose}
          onConfirm={() => void submit()}
          confirmLabel={busy ? 'Initializing…' : 'Mark Won + Initialize'}
          confirmDisabled={!canSubmit}
          confirmKind="win"
        />
      )}
    </Modal>
  );
}

const fieldStyle: React.CSSProperties = {
  width: '100%', height: 32, padding: '0 10px',
  border: '1px solid var(--hair)', borderRadius: 6,
  fontSize: 12.5, fontFamily: 'var(--sans)',
  background: 'var(--surface)', color: 'var(--ink)',
  marginTop: 4, marginBottom: 10,
  outline: 'none',
};

function RadioRow({ label, value, checked, onPick }: {
  label: string; value: string; checked: boolean; onPick: () => void;
}) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 12, color: 'var(--body)', cursor: 'pointer',
      padding: '4px 0',
    }}>
      <input type="radio" name="template-mode" value={value}
        checked={checked} onChange={onPick} style={{ margin: 0 }} />
      {label}
    </label>
  );
}

