// Two-phase send-to-ClickUp UI. preflight() returns a plan describing what
// will happen — workspace / space / folder / list resolution + per-phase
// create / update / skip decisions with smart defaults derived from a payload
// hash comparison. The user reviews + confirms; send() executes.
//
// Slimmer than PM Quoting App's SendToClickUpModal — the "did you mean…"
// fuzzy candidate picker, custom-field rendering, and PM admin-task creation
// are skipped here. The dedup-aware re-send (the important behavior) is
// covered by the per-phase action defaults.

import { useEffect, useState } from 'react';
import { Modal, ModalActions } from '../StatusComponents';
import type {
  ClickUpExecuteDecisions, ClickUpPhaseAction, ClickUpPreflightResult,
  ClickUpSendResult, Project,
} from '../../types/domain';

interface SendToClickUpModalProps {
  project: Project;
  onClose: () => void;
  /** Called after a successful send. Passes the result so the caller can show
   *  a summary alert and refresh the activity log. */
  onSent: (result: ClickUpSendResult) => void;
}

export default function SendToClickUpModal({ project, onClose, onSent }: SendToClickUpModalProps) {
  const [plan, setPlan] = useState<ClickUpPreflightResult | null>(null);
  const [decisions, setDecisions] = useState<Map<number, ClickUpPhaseAction>>(new Map());
  const [busy, setBusy] = useState<'preflight' | 'send' | null>('preflight');
  const [err, setErr] = useState<string | null>(null);

  // Run preflight on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await window.api.clickup.preflight(project.id);
        if (cancelled) return;
        setPlan(result);
        if (result.ok) {
          // Seed decisions with each phase's smart default.
          const initial = new Map<number, ClickUpPhaseAction>();
          for (const p of result.phases) initial.set(p.phase_index, p.default_action);
          setDecisions(initial);
        }
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => { cancelled = true; };
  }, [project.id]);

  function setPhaseAction(phaseIdx: number, action: ClickUpPhaseAction) {
    setDecisions(d => new Map(d).set(phaseIdx, action));
  }

  async function send() {
    if (!plan?.ok) return;
    setBusy('send');
    setErr(null);
    try {
      const decisionsPayload: ClickUpExecuteDecisions = {
        phases: plan.phases.map(p => ({
          phase_index: p.phase_index,
          action: decisions.get(p.phase_index) ?? p.default_action,
        })),
      };
      const result = await window.api.clickup.send(project.id, decisionsPayload);
      onSent(result);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setBusy(null);
    }
  }

  // ── render ──────────────────────────────────────────────────────────────

  if (busy === 'preflight') {
    return (
      <Modal title="Send to ClickUp" onClose={onClose}>
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>
          Checking ClickUp…
        </div>
      </Modal>
    );
  }

  if (err) {
    return (
      <Modal title="Send to ClickUp" onClose={onClose}>
        <div style={errorBoxStyle}>{err}</div>
        <ModalActions onCancel={onClose} onConfirm={onClose} confirmLabel="Close" />
      </Modal>
    );
  }

  if (plan && !plan.ok) {
    return (
      <Modal title="Send to ClickUp" onClose={onClose}>
        <div style={errorBoxStyle}>{plan.error}</div>
        <ModalActions onCancel={onClose} onConfirm={onClose} confirmLabel="Close" />
      </Modal>
    );
  }

  if (!plan || !plan.ok) return null;

  const willSend = plan.phases.filter(p => (decisions.get(p.phase_index) ?? p.default_action) !== 'skip').length;

  return (
    <Modal title="Send to ClickUp" onClose={onClose}>
      <Section label="Target">
        <Row label="Workspace" value={plan.workspace.name} muted />
        <Row label="Space"
             value={plan.space.name}
             tag={{ kind: 'reuse', text: 'Reuse' }} />
        <Row label="Folder (Client)"
             value={plan.folder.name}
             tag={plan.folder.action === 'create'
               ? { kind: 'create', text: 'Create new' }
               : { kind: 'reuse',  text: 'Reuse' }} />
        <Row label="List (Project)"
             value={plan.list.name}
             tag={plan.list.action === 'create'
               ? { kind: 'create', text: 'Create new' }
               : { kind: 'reuse',  text: 'Reuse' }} />
      </Section>

      <Section label="Phases">
        {plan.phases.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--muted)', padding: '6px 0' }}>
            This project has no phases to send.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {plan.phases.map(p => {
              const action = decisions.get(p.phase_index) ?? p.default_action;
              const hasExisting = !!p.existing_task_id;
              return (
                <div key={p.phase_index} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 8px', background: 'var(--canvas)',
                  border: '1px solid var(--line)', borderRadius: 6,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12.5, fontWeight: 600, color: 'var(--ink)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {p.phase_name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {hasExisting
                        ? (p.payload_changed
                          ? 'Linked · changed since last sync'
                          : 'Linked · unchanged since last sync')
                        : 'New'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['create', 'update', 'skip'] as ClickUpPhaseAction[]).map(opt => {
                      const valid =
                        opt === 'create' ? !hasExisting :
                        opt === 'update' ? hasExisting  :
                        true;
                      const active = action === opt;
                      return (
                        <button
                          key={opt}
                          onClick={() => valid && setPhaseAction(p.phase_index, opt)}
                          disabled={!valid}
                          style={{
                            padding: '4px 10px', fontSize: 11, fontWeight: 600,
                            background: active ? 'var(--navy-deep)' : 'var(--surface)',
                            color: active ? '#fff' : (valid ? 'var(--body)' : 'var(--subtle)'),
                            border: `1px solid ${active ? 'var(--navy-deep)' : 'var(--hair)'}`,
                            borderRadius: 4, cursor: valid ? 'pointer' : 'not-allowed',
                            fontFamily: 'var(--sans)', textTransform: 'capitalize',
                          }}>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {plan.warnings.length > 0 && (
        <Section label="Warnings">
          {plan.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 11.5, color: 'var(--status-draft-fg)', padding: '2px 0' }}>
              ⚠ {w}
            </div>
          ))}
        </Section>
      )}

      <ModalActions
        onCancel={onClose}
        onConfirm={() => void send()}
        confirmLabel={busy === 'send' ? 'Sending…' : `${willSend} phase${willSend === 1 ? '' : 's'} · Send`}
        confirmDisabled={busy === 'send' || willSend === 0}
        confirmKind="primary"
      />
    </Modal>
  );
}

// ── render helpers ───────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 10.5, letterSpacing: 0.4, fontWeight: 600,
        color: 'var(--muted)', textTransform: 'uppercase',
        marginBottom: 6,
      }}>{label}</div>
      {children}
    </div>
  );
}

function Row({ label, value, tag, muted }: {
  label: string; value: React.ReactNode;
  tag?: { kind: 'reuse' | 'create'; text: string };
  muted?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '4px 0',
      fontSize: 12.5,
    }}>
      <div style={{ width: 130, color: 'var(--muted)', fontSize: 11.5 }}>{label}</div>
      <div style={{ flex: 1, color: muted ? 'var(--muted)' : 'var(--ink)', fontWeight: 500 }}>{value}</div>
      {tag && (
        <span style={{
          fontSize: 10, padding: '2px 7px', borderRadius: 9,
          background: tag.kind === 'create' ? 'var(--status-won-bg)' : 'var(--navy-tint)',
          color:      tag.kind === 'create' ? 'var(--status-won-fg)' : 'var(--navy-deep)',
          fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase',
        }}>{tag.text}</span>
      )}
    </div>
  );
}

const errorBoxStyle: React.CSSProperties = {
  padding: '10px 12px',
  background: 'var(--action-danger-tint)', border: '1px solid var(--action-danger-edge)',
  borderRadius: 6, color: 'var(--action-danger)', fontSize: 12.5,
  marginBottom: 14,
};
