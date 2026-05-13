// SendProposalModal — opens when the user clicks Mark Sent.
//
// Confirms the Send action, asks whether to push the project to iCore now,
// and bundles project initialization into the same transaction
// (LIFECYCLE_SEND_AND_INITIALIZE). The bid items become the project phases;
// section tasks become phase tasks; labor rows become the phase labor budget.
//
// iCore opt-in: when the user picks "Yes — send to iCore" they must enter an
// iCore project ID. That ID is stamped on the project row, and the project's
// phases/tasks become read-only in project mode (the data is now mirrored
// upstream).
//
// Pre-flight: the proposal MUST already have legal_entity and department
// set (in the header card). The Mark Sent button shouldn't open this modal
// if those are missing — the modal renders them read-only as confirmation.

import { useEffect, useState } from 'react';
import { Modal, ModalActions } from './StatusComponents';
import { FieldLabel } from './shared';
import type { Project, Proposal } from '../types/domain';

interface SendProposalModalProps {
  proposal: Proposal;
  onClose: () => void;
  /** Called after the Send + initialize succeeds. Caller dispatches
   *  REPLACE_PROPOSAL + LOAD_PROJECT and refreshes. */
  onCommitted: (result: { proposal: Proposal; project: Project }) => void;
}

const ICORE_PATTERN = /^[A-Za-z0-9_-]+$/;

export default function SendProposalModal({
  proposal, onClose, onCommitted,
}: SendProposalModalProps) {
  const [rateTables, setRateTables] = useState<string[]>([]);
  const [rateTable,  setRateTable]  = useState<string>(proposal.rateTable || '');
  const [sendToICore, setSendToICore] = useState<boolean>(
    !!proposal.lifecycle?.metadata?.iCore_project_id,
  );
  const [icoreId,    setIcoreId]    = useState(
    proposal.lifecycle?.metadata?.iCore_project_id || '',
  );
  const [note,       setNote]       = useState('');
  const [busy,       setBusy]       = useState(false);
  const [err,        setErr]        = useState<string | null>(null);

  const legalEntity = (proposal.legal_entity || '').trim();
  const department  = (proposal.department || '').trim();
  const missingScope = !legalEntity || !department;

  useEffect(() => {
    void window.api.lookups.list('rate_table').then(rs => setRateTables(rs.map(r => r.name)));
  }, []);

  const trimmedIcore = icoreId.trim();
  const icoreValid = !sendToICore || (trimmedIcore.length > 0 && ICORE_PATTERN.test(trimmedIcore));
  const canSubmit = !missingScope && icoreValid && !busy;

  async function submit() {
    if (!canSubmit) return;
    if (!proposal.name?.trim()) {
      setErr('Save the proposal first (give it a name) before sending.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const result = await window.api.lifecycle.sendAndInitialize({
        proposalName: proposal.name,
        rateTableOverride: rateTable || null,
        icoreProjectId: sendToICore ? trimmedIcore : null,
        note: note.trim() || undefined,
      });
      onCommitted(result);
    } catch (e: any) {
      setErr(`Send failed: ${e?.message || String(e)}`);
      setBusy(false);
    }
  }

  return (
    <Modal title="Send proposal" onClose={onClose}>
      <div style={{ fontSize: 12.5, color: 'var(--body)', marginBottom: 12 }}>
        Marking <strong>{proposal.name || '(untitled)'}</strong> as Sent will create
        the project. Bid items become phases; their tasks and labor flow over
        as-is.
      </div>

      {missingScope && (
        <div style={{
          padding: '10px 12px', marginBottom: 12,
          background: 'var(--action-danger-tint)',
          border: '1px solid var(--action-danger-edge)',
          borderRadius: 6,
          fontSize: 12, color: 'var(--action-danger)',
        }}>
          Set the <strong>legal entity</strong> and <strong>department</strong> in the
          proposal header before sending. The project needs them to know where
          to roll up.
        </div>
      )}

      <FieldLabel>Legal entity</FieldLabel>
      <ReadOnlyValue>{legalEntity || '—'}</ReadOnlyValue>

      <FieldLabel>Department</FieldLabel>
      <ReadOnlyValue>{department || '—'}</ReadOnlyValue>

      <FieldLabel>Rate table</FieldLabel>
      <select value={rateTable} onChange={(e) => setRateTable(e.target.value)} style={fieldStyle}>
        <option value="">— Use proposal's ({proposal.rateTable || '—'}) —</option>
        {rateTables.map(n => <option key={n} value={n}>{n}</option>)}
      </select>

      <div style={{
        marginTop: 6, padding: '10px 12px',
        background: 'var(--canvas)', border: '1px solid var(--hair)',
        borderRadius: 6,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
          Send the project to iCore now?
        </div>
        <RadioRow
          label="Yes — push to iCore (locks phases & tasks in project mode)"
          checked={sendToICore}
          onPick={() => setSendToICore(true)}
        />
        <RadioRow
          label="No — keep editing locally, push to iCore later"
          checked={!sendToICore}
          onPick={() => setSendToICore(false)}
        />
        {sendToICore && (
          <div style={{ marginTop: 8 }}>
            <FieldLabel>iCore project ID</FieldLabel>
            <input
              value={icoreId}
              onChange={(e) => setIcoreId(e.target.value)}
              placeholder="e.g. C-2026-0042"
              autoFocus
              style={fieldStyle}
            />
            {!icoreValid && (
              <div style={{ fontSize: 11.5, color: 'var(--action-danger)', marginTop: 4 }}>
                iCore IDs are required and alphanumeric (letters, digits, "-" or "_").
              </div>
            )}
          </div>
        )}
      </div>

      <FieldLabel>Activity note (optional)</FieldLabel>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Emailed to client 5/12"
        style={fieldStyle}
      />

      {err && (
        <div style={{
          marginTop: 12, padding: '8px 10px',
          background: 'var(--action-danger-tint)', border: '1px solid var(--action-danger-edge)',
          borderRadius: 6, fontSize: 11.5, color: 'var(--action-danger)',
        }}>
          {err}
        </div>
      )}

      <ModalActions
        onCancel={onClose}
        onConfirm={() => void submit()}
        confirmLabel={busy
          ? (sendToICore ? 'Sending + iCore…' : 'Sending…')
          : (sendToICore ? 'Mark Sent + push to iCore' : 'Mark Sent')}
        confirmDisabled={!canSubmit}
        confirmKind="primary"
      />
    </Modal>
  );
}

function ReadOnlyValue({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      ...fieldStyle,
      background: 'var(--canvas)', color: 'var(--body)',
      display: 'flex', alignItems: 'center',
    }}>
      {children}
    </div>
  );
}

function RadioRow({ label, checked, onPick }: { label: string; checked: boolean; onPick: () => void }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 12, color: 'var(--body)', cursor: 'pointer',
      padding: '3px 0',
    }}>
      <input type="radio" name="send-icore" checked={checked} onChange={onPick} style={{ margin: 0 }} />
      {label}
    </label>
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
