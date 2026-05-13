// Modal that lists bid item templates for the current
// (legal_entity, department) scope and applies the chosen one to the
// proposal's sections. Append or Replace mode mirrors the previous
// InitializeProjectModal flow.

import { useEffect, useState, type Dispatch } from 'react';
import { Modal, ModalActions } from './StatusComponents';
import { FieldLabel } from './shared';
import type { BidItemTemplate, Proposal } from '../types/domain';
import type { EditorAction } from '../state/editorReducer';

interface BidItemTemplatePickerProps {
  proposal: Proposal;
  dispatch: Dispatch<EditorAction>;
  onClose: () => void;
}

export default function BidItemTemplatePicker({ proposal, dispatch, onClose }: BidItemTemplatePickerProps) {
  const legalEntity = (proposal.legal_entity || '').trim();
  const department  = (proposal.department || '').trim();
  const missingScope = !legalEntity || !department;

  const [names,   setNames]   = useState<string[]>([]);
  const [picked,  setPicked]  = useState<string>('');
  const [mode,    setMode]    = useState<'append' | 'replace'>(
    proposal.sections.length === 0 || !hasContentfulSections(proposal) ? 'replace' : 'append',
  );
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState<string | null>(null);

  useEffect(() => {
    if (missingScope) return;
    void window.api.bidItemTemplates.list(legalEntity, department).then((rs) => {
      setNames(rs);
      setPicked((prev) => prev || rs[0] || '');
    });
  }, [legalEntity, department, missingScope]);

  async function apply() {
    if (!picked) return;
    setBusy(true);
    setErr(null);
    try {
      const template = await window.api.bidItemTemplates.get(legalEntity, department, picked) as BidItemTemplate | null;
      if (!template) throw new Error('Template not found.');
      dispatch({ type: 'APPLY_BID_ITEM_TEMPLATE', template, mode });
      onClose();
    } catch (e: any) {
      setErr(`Apply failed: ${e?.message || String(e)}`);
      setBusy(false);
    }
  }

  return (
    <Modal title="Apply bid item template" onClose={onClose}>
      {missingScope ? (
        <div style={{ fontSize: 12.5, color: 'var(--body)', lineHeight: 1.5 }}>
          Set the <strong>legal entity</strong> and <strong>department</strong> in the
          proposal header first. Bid item templates are scoped per (legal
          entity, department).
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: 'var(--body)', marginBottom: 12 }}>
            Scope: <strong>{legalEntity}</strong> · <strong>{department}</strong>
          </div>

          <FieldLabel>Template</FieldLabel>
          {names.length === 0 ? (
            <div style={{
              padding: '8px 10px', marginBottom: 12,
              background: 'var(--canvas)', border: '1px dashed var(--hair)',
              borderRadius: 6, fontSize: 12, color: 'var(--muted)',
            }}>
              No templates yet for this scope. Add one in Lookups → Bid Item Templates.
            </div>
          ) : (
            <select value={picked} onChange={(e) => setPicked(e.target.value)} style={fieldStyle}>
              {names.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          )}

          <div style={{ marginTop: 6 }}>
            <RadioRow
              label="Replace existing bid items with the template"
              checked={mode === 'replace'}
              onPick={() => setMode('replace')}
            />
            <RadioRow
              label="Append the template after my existing bid items"
              checked={mode === 'append'}
              onPick={() => setMode('append')}
            />
          </div>

          {err && (
            <div style={{
              marginTop: 12, padding: '8px 10px',
              background: 'var(--action-danger-tint)', border: '1px solid var(--action-danger-edge)',
              borderRadius: 6, fontSize: 11.5, color: 'var(--action-danger)',
            }}>
              {err}
            </div>
          )}
        </>
      )}

      <ModalActions
        onCancel={onClose}
        onConfirm={() => void apply()}
        confirmLabel={busy ? 'Applying…' : 'Apply'}
        confirmDisabled={missingScope || !picked || busy}
        confirmKind="primary"
      />
    </Modal>
  );
}

function RadioRow({ label, checked, onPick }: { label: string; checked: boolean; onPick: () => void }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 12, color: 'var(--body)', cursor: 'pointer',
      padding: '4px 0',
    }}>
      <input type="radio" name="bid-item-tpl-mode"
        checked={checked} onChange={onPick} style={{ margin: 0 }} />
      {label}
    </label>
  );
}

function hasContentfulSections(proposal: Proposal): boolean {
  const sections = proposal?.sections || [];
  if (sections.length > 1) return true;
  const s = sections[0];
  if (!s) return false;
  return Boolean(
    (s.title && s.title.trim()) ||
    (s.scope && s.scope.trim()) ||
    (s.labor && s.labor.length) ||
    (s.expenses && s.expenses.length) ||
    (s.tasks && s.tasks.length) ||
    (s.fee && Number(s.fee) !== 0),
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
