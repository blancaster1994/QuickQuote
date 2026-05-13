// MarkWonModal — opens when the user clicks Mark Won on a Sent proposal.
//
// Always sends the project to iCore. If iCore was already pushed at Send
// time the existing ID is displayed read-only and Proceed just flips the
// status. Otherwise the user is prompted for the iCore project ID and a
// single transaction stamps it on the project + marks Won.

import { useState } from 'react';
import { Modal, ModalActions } from './StatusComponents';
import { FieldLabel } from './shared';
import type { Project, Proposal } from '../types/domain';

interface MarkWonModalProps {
  proposal: Proposal;
  project: Project | null;
  onClose: () => void;
  /** Called once Mark Won (and any iCore stamp) succeeds. Caller refreshes
   *  the proposal + project from server. */
  onCommitted: (result: { proposal: Proposal; project: Project | null }) => void;
}

const ICORE_PATTERN = /^[A-Za-z0-9_-]+$/;

export default function MarkWonModal({
  proposal, project, onClose, onCommitted,
}: MarkWonModalProps) {
  const existingIcoreId =
    project?.icore_project_id?.trim()
    || proposal.lifecycle?.metadata?.iCore_project_id?.trim()
    || '';
  const alreadyLinked = !!existingIcoreId;

  const [icoreId, setIcoreId] = useState(existingIcoreId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const trimmed = icoreId.trim();
  const icoreValid = alreadyLinked || (trimmed.length > 0 && ICORE_PATTERN.test(trimmed));
  const canSubmit = icoreValid && !busy;

  async function submit() {
    if (!canSubmit) return;
    if (!proposal.name?.trim()) {
      setErr('Save the proposal first (give it a name) before marking Won.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const idToSync = alreadyLinked ? existingIcoreId : trimmed;
      const result = await window.api.lifecycle.markWonAndSync({
        proposalName: proposal.name,
        icoreProjectId: idToSync,
      });
      onCommitted(result);
    } catch (e: any) {
      setErr(`Mark Won failed: ${e?.message || String(e)}`);
      setBusy(false);
    }
  }

  return (
    <Modal title="Mark Won" onClose={onClose}>
      <div style={{ fontSize: 12.5, color: 'var(--body)', marginBottom: 12, lineHeight: 1.5 }}>
        Marking <strong>{proposal.name || '(untitled)'}</strong> as Won.{' '}
        {alreadyLinked
          ? <>This project is already linked to iCore as <strong>{existingIcoreId}</strong>. Proceeding will record the Won date.</>
          : <>This will send the project to iCore and record the Won date. Enter the iCore project ID below.</>}
      </div>

      <FieldLabel>iCore project ID</FieldLabel>
      <input
        value={icoreId}
        onChange={(e) => setIcoreId(e.target.value)}
        placeholder="e.g. C-2026-0042"
        disabled={alreadyLinked}
        autoFocus={!alreadyLinked}
        style={{
          ...fieldStyle,
          background: alreadyLinked ? 'var(--canvas)' : 'var(--surface)',
          color: alreadyLinked ? 'var(--body)' : 'var(--ink)',
        }}
      />
      {!icoreValid && !alreadyLinked && (
        <div style={{ fontSize: 11.5, color: 'var(--action-danger)', marginTop: 4 }}>
          iCore IDs are required and alphanumeric (letters, digits, "-" or "_").
        </div>
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

      <ModalActions
        onCancel={onClose}
        onConfirm={() => void submit()}
        confirmLabel={busy ? 'Marking Won…' : (alreadyLinked ? 'Proceed' : 'Push to iCore + Mark Won')}
        confirmDisabled={!canSubmit}
        confirmKind="win"
      />
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
