// Lifecycle UI primitives — direct port of QuickProp's StatusComponents.jsx.
// All status-mutating actions round-trip through the IPC layer; the UI
// dispatches REPLACE_LIFECYCLE with the fresh lifecycle returned from main.

import { useEffect, useState, type ReactNode, type Dispatch } from 'react';
import { FieldLabel, TextArea } from './shared';
import { LOST_REASONS, STATUS_LABELS, canDelete, getStatus } from '../lib/lifecycle';
import type {
  AllowedUser,
  Lifecycle,
  Project,
  Proposal,
  ProposalStatus,
  VersionRecord,
} from '../types/domain';
import type { EditorState, EditorAction } from '../state/editorReducer';
import InitializeProjectModal from './InitializeProjectModal';
import SendToClickUpModal from './clickup/SendToClickUpModal';

// ── status badge ──────────────────────────────────────────────────────────

// Status pill colors live in styles.css (--status-{status}-bg/fg). Pulled out
// of the JS so a re-skin is a CSS edit, not a code search.
const STATUS_COLORS: Record<ProposalStatus, { bg: string; fg: string }> = {
  draft:    { bg: 'var(--status-draft-bg)',    fg: 'var(--status-draft-fg)' },
  sent:     { bg: 'var(--status-sent-bg)',     fg: 'var(--status-sent-fg)' },
  won:      { bg: 'var(--status-won-bg)',      fg: 'var(--status-won-fg)' },
  lost:     { bg: 'var(--status-lost-bg)',     fg: 'var(--status-lost-fg)' },
  archived: { bg: 'var(--status-archived-bg)', fg: 'var(--status-archived-fg)' },
};

// Single-letter monogram so the status is distinguishable without color
// (colorblind-friendly, prints monochrome legibly).
const STATUS_MONOGRAM: Record<ProposalStatus, string> = {
  draft: 'D', sent: 'S', won: 'W', lost: 'L', archived: 'A',
};

interface StatusBadgeProps {
  status: ProposalStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.draft;
  const label = STATUS_LABELS[status] || status;
  const monogram = STATUS_MONOGRAM[status] || label.slice(0, 1).toUpperCase();
  const pad = size === 'sm' ? '2px 7px' : '3px 9px';
  const fs = size === 'sm' ? 10 : 11;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: pad, borderRadius: 10,
      background: colors.bg, color: colors.fg,
      fontSize: fs, fontWeight: 700, letterSpacing: 0.4,
      textTransform: 'uppercase', fontFamily: 'var(--sans)',
    }}>
      <span aria-hidden="true" style={{
        display: 'inline-grid', placeItems: 'center',
        width: size === 'sm' ? 13 : 15, height: size === 'sm' ? 13 : 15,
        borderRadius: '50%', background: colors.fg, color: colors.bg,
        fontSize: size === 'sm' ? 8.5 : 9.5, fontWeight: 800,
        letterSpacing: 0,
      }}>{monogram}</span>
      {label}
    </span>
  );
}

// ── status action bar ─────────────────────────────────────────────────────

// Names that produce useless dashboard rows when used verbatim. Trimmed +
// lowercased before comparison. Kept short on purpose — we want to nudge,
// not block, so most names should pass.
const GENERIC_NAMES: ReadonlySet<string> = new Set([
  'new proposed residence',
  'new project',
  'new proposal',
  'untitled',
  'untitled proposal',
  'tbd',
  'test',
  'project',
  'proposal',
]);

function looksGeneric(rawName: string): boolean {
  const n = rawName.trim().toLowerCase();
  if (!n) return true;
  if (n.length <= 2) return true;
  return GENERIC_NAMES.has(n);
}

type LifecycleFn = 'mark_sent' | 'mark_won' | 'mark_lost' | 'mark_archived' | 'reopen' | 'add_note' | 'follow_up';

interface StatusActionBarProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  onReload?: () => void;
  onDeleted?: () => void;
}

export function StatusActionBar({ state, dispatch, onReload, onDeleted }: StatusActionBarProps) {
  const proposal = state.proposal;
  const status = getStatus(proposal);
  const saved = !!state.projectName;
  const [busy, setBusy] = useState<string | null>(null);
  const [showLost, setShowLost] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [showInitProject, setShowInitProject] = useState(false);
  const [showSendClickUp, setShowSendClickUp] = useState(false);
  const [nameWarn, setNameWarn] = useState<{ kind: 'generic' | 'dup'; dupName?: string } | null>(null);
  const [nameWarnAck, setNameWarnAck] = useState(false);
  // ClickUp link + config status. Refreshed when project changes.
  const [clickUpEnabled, setClickUpEnabled] = useState(false);
  const [clickUpLinkUrl, setClickUpLinkUrl] = useState<string | null>(null);
  const [clickUpLastSyncedAt, setClickUpLastSyncedAt] = useState<string | null>(null);
  const currentPm = (proposal.lifecycle?.owner) || { email: '', name: '' };
  const followUpAt = proposal.lifecycle?.metadata?.follow_up_at || null;
  const followUpOverdue = isFollowUpOverdue(followUpAt, status);
  const inProjectMode = state.editorMode === 'project' && !!state.project;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await window.api.clickup.getConfig();
        if (!cancelled) setClickUpEnabled(!!cfg.configured && !!cfg.enabled);
      } catch { if (!cancelled) setClickUpEnabled(false); }
    })();
    if (state.project) {
      void window.api.clickup.getLink(state.project.id)
        .then(link => {
          if (cancelled) return;
          setClickUpLinkUrl(link?.list_url ?? null);
          setClickUpLastSyncedAt(link?.last_synced_at ?? null);
        })
        .catch(() => {
          if (cancelled) return;
          setClickUpLinkUrl(null);
          setClickUpLastSyncedAt(null);
        });
    } else {
      setClickUpLinkUrl(null);
      setClickUpLastSyncedAt(null);
    }
    return () => { cancelled = true; };
  }, [state.project?.id, state.project]);

  async function dispatchLifecycle(fn: LifecycleFn, run: () => Promise<{ lifecycle: Lifecycle }>) {
    if (!saved || !state.projectName) {
      alert('Save the proposal first (autosave will kick in once you give it a name).');
      return;
    }
    setBusy(fn);
    try {
      const updated = await run();
      dispatch({ type: 'REPLACE_LIFECYCLE', lifecycle: updated.lifecycle });
      onReload?.();
    } catch (e: any) {
      alert(`${fn} failed: ${e?.message || String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  // Mark Sent puts the proposal on the dashboard for follow-up tracking, so
  // generic or duplicate names ("New Proposed Residence" × 15) make it
  // unusable. Run a soft check before flipping; one acknowledgement per
  // session avoids re-nagging.
  async function handleMarkSentClick() {
    if (!nameWarnAck) {
      const trimmed = (proposal.name || '').trim();
      if (looksGeneric(trimmed)) {
        setNameWarn({ kind: 'generic' });
        return;
      }
      try {
        const all = await window.api.proposals.list();
        const lower = trimmed.toLowerCase();
        const currentLower = (state.projectName || '').toLowerCase();
        const dup = all.find(n => n.toLowerCase() === lower && n.toLowerCase() !== currentLower);
        if (dup) {
          setNameWarn({ kind: 'dup', dupName: dup });
          return;
        }
      } catch { /* if the list call fails, fall through and let Mark Sent proceed */ }
    }
    await dispatchLifecycle('mark_sent', async () =>
      (await window.api.lifecycle.markSent(state.projectName!)) as any);
  }

  const buttons: Array<{ label: string; fn: string; kind: ButtonKind; title?: string; click: () => void | Promise<void> }> = [];
  if (status === 'draft') {
    buttons.push({
      label: 'Mark as Sent', fn: 'mark_sent', kind: 'primary',
      title: "Click only once you've actually sent the proposal to the client. Records the sent date and starts follow-up tracking.",
      click: () => void handleMarkSentClick(),
    });
  } else if (status === 'sent') {
    buttons.push({
      label: 'Mark Won', fn: 'mark_won', kind: 'win',
      title: 'Click once the client has accepted/signed. Opens the project initialization dialog (legal entity, department, iCore ID).',
      // Stage 4 intercepts the Mark Won button: instead of immediately
      // flipping status, open the InitializeProjectModal so the user can
      // pick legal_entity / department / iCore ID. The modal handles the
      // markWon + project.initialize chain on submit, and leaves the
      // proposal in 'sent' state if the user cancels.
      click: () => {
        if (!saved || !state.projectName) {
          alert('Save the proposal first (autosave will kick in once you give it a name).');
          return;
        }
        setShowInitProject(true);
      },
    });
    buttons.push({
      label: 'Mark Lost', fn: 'mark_lost', kind: 'loss',
      title: "Click if the client passed or chose another firm. You'll be asked for a reason.",
      click: () => setShowLost(true),
    });
  } else if (status === 'won' || status === 'lost') {
    buttons.push({
      label: 'Reopen', fn: 'reopen', kind: 'ghost',
      title: 'Move this proposal back to Sent so you can change the outcome.',
      click: () => dispatchLifecycle('reopen', async () =>
        (await window.api.lifecycle.reopen(state.projectName!)) as any),
    });
    buttons.push({
      label: 'Archive', fn: 'mark_archived', kind: 'ghost',
      title: 'Hide this proposal from the active dashboard. You can still find it under Archived.',
      click: () => dispatchLifecycle('mark_archived', async () =>
        (await window.api.lifecycle.markArchived(state.projectName!)) as any),
    });
  } else if (status === 'archived') {
    buttons.push({
      label: 'Reopen', fn: 'reopen', kind: 'ghost',
      title: 'Restore this proposal to its previous status (Won/Lost/Sent).',
      click: () => dispatchLifecycle('reopen', async () =>
        (await window.api.lifecycle.reopen(state.projectName!)) as any),
    });
  }

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', background: 'var(--surface)',
        border: '1px solid var(--hair)', borderRadius: 8, marginBottom: 14,
      }}>
        <div style={{
          fontSize: 10.5, letterSpacing: 0.6, color: 'var(--muted)',
          fontWeight: 600, textTransform: 'uppercase',
        }}>Status</div>
        <StatusBadge status={status} />
        {proposal.lifecycle?.metadata?.sent_date && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            · sent {formatDate(proposal.lifecycle.metadata.sent_date)}
          </span>
        )}
        {proposal.lifecycle?.metadata?.won_date && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            · won {formatDate(proposal.lifecycle.metadata.won_date)}
          </span>
        )}
        {proposal.lifecycle?.metadata?.lost_date && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            · lost {formatDate(proposal.lifecycle.metadata.lost_date)}
            {proposal.lifecycle.metadata.lost_reason
              ? ` (${reasonLabel(proposal.lifecycle.metadata.lost_reason)})`
              : ''}
          </span>
        )}

        {saved && (
          <>
            <div style={{ width: 1, height: 18, background: 'var(--hair)', margin: '0 4px' }} />
            <span style={{
              fontSize: 10.5, letterSpacing: 0.6, color: 'var(--muted)',
              fontWeight: 600, textTransform: 'uppercase',
            }}>PM</span>
            <button onClick={() => setShowReassign(true)} title="Reassign Project Manager"
              style={{
                height: 24, padding: '0 8px', borderRadius: 5,
                background: 'var(--canvas)', color: 'var(--ink)',
                border: '1px solid var(--hair)',
                fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'var(--sans)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              {currentPm.name || currentPm.email || '— Unassigned —'}
              <span style={{ fontSize: 8, opacity: 0.6 }}>▾</span>
            </button>

            <button onClick={() => setShowFollowUp(true)}
              title={followUpAt
                ? `Follow-up ${followUpOverdue ? 'was due' : 'set for'} ${formatDate(followUpAt)}`
                : 'Set a follow-up reminder for this proposal'}
              style={{
                height: 24, padding: '0 8px', borderRadius: 5,
                background:    followUpOverdue ? 'var(--action-danger-tint)' : 'var(--canvas)',
                color:         followUpOverdue ? 'var(--action-danger)'      : (followUpAt ? 'var(--ink)' : 'var(--muted)'),
                border: '1px solid ' + (followUpOverdue ? 'var(--action-danger-edge)' : 'var(--hair)'),
                fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'var(--sans)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              {followUpAt
                ? <>{followUpOverdue && '⚠ '}Follow-up {formatDate(followUpAt)}</>
                : <>+ Follow-up</>}
            </button>
          </>
        )}

        <div style={{ flex: 1 }} />

        <button onClick={() => dispatch({ type: 'TOGGLE_ACTIVITY' })}
          style={btnStyle('ghost', false)}
          title="Show / hide activity timeline">
          {state.activityOpen ? 'Hide activity' : 'Activity'}
          {(proposal.lifecycle?.activity?.length || 0) > 0 && (
            <span style={{
              marginLeft: 6, padding: '0 6px', borderRadius: 9,
              background: 'var(--navy-tint)', color: 'var(--navy-deep)',
              fontSize: 10, fontWeight: 700,
            }}>{proposal.lifecycle.activity.length}</span>
          )}
        </button>

        <button onClick={() => setShowNote(true)} style={btnStyle('ghost', false)}>
          + Note
        </button>

        {buttons.map((b) => (
          <button key={b.label} disabled={!!busy} onClick={b.click}
            title={b.title}
            style={btnStyle(b.kind, busy === b.fn)}>
            {busy === b.fn ? '…' : b.label}
          </button>
        ))}

        {/* Send to ClickUp — visible only in project mode AND when sync is
            enabled in Lookups → ClickUp. Already-linked projects show a
            secondary "↗ ClickUp" chip with last-synced timestamp + Unlink. */}
        {inProjectMode && clickUpEnabled && state.project && (
          <>
            {clickUpLinkUrl ? (
              <button onClick={() => void window.api.os.openFile(clickUpLinkUrl)}
                title={clickUpLastSyncedAt
                  ? `Open in browser — last synced ${formatRelative(clickUpLastSyncedAt)}`
                  : 'Open the linked ClickUp list in your browser'}
                style={{
                  height: 30, padding: '0 10px',
                  background: 'transparent', color: '#7c3aed',
                  border: '1px solid #DDD6FE', borderRadius: 6,
                  fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'var(--sans)',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                <span>↗ ClickUp</span>
                {clickUpLastSyncedAt && (
                  <span style={{
                    fontSize: 10, color: 'var(--muted)', fontWeight: 500,
                  }}>
                    · synced {formatRelative(clickUpLastSyncedAt)}
                  </span>
                )}
              </button>
            ) : null}
            <button onClick={() => setShowSendClickUp(true)}
              title="Push this project's phases to ClickUp as tasks"
              style={{
                height: 30, padding: '0 12px',
                background: '#7c3aed', color: '#fff',
                border: 'none', borderRadius: 6,
                fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'var(--sans)',
              }}>
              {clickUpLinkUrl ? 'Re-send' : 'Send to ClickUp'}
            </button>
          </>
        )}

        {canDelete(proposal) && saved && (
          <button onClick={() => setShowDelete(true)}
            title="Delete this draft (only un-sent drafts can be deleted)"
            style={btnStyle('loss-ghost', false)}>
            Delete
          </button>
        )}
      </div>

      {showLost && (
        <LostReasonModal
          onClose={() => setShowLost(false)}
          onSubmit={async ({ reason, note }) => {
            setShowLost(false);
            await dispatchLifecycle('mark_lost', async () =>
              (await window.api.lifecycle.markLost(state.projectName!, reason as any, note)) as any);
          }}
        />
      )}

      {showNote && (
        <NoteModal title="Add activity note"
          onClose={() => setShowNote(false)}
          onSubmit={async (note) => {
            setShowNote(false);
            await dispatchLifecycle('add_note', async () =>
              (await window.api.lifecycle.addNote(state.projectName!, note)) as any);
          }}
        />
      )}

      {showDelete && state.projectName && (
        <DeleteConfirmModal proposalName={state.projectName} status={status}
          onClose={() => setShowDelete(false)}
          onConfirm={async () => {
            setShowDelete(false);
            try {
              await window.api.proposals.remove(state.projectName!);
              dispatch({ type: 'NEW_PROPOSAL' });
              if (onDeleted) onDeleted();
              else if (onReload) onReload();
            } catch (e: any) {
              alert(`Delete failed: ${e?.message || String(e)}`);
            }
          }}
        />
      )}

      {showReassign && (
        <ReassignPmModal
          allowed={state.bootstrap?.allowed_users || []}
          currentEmail={currentPm.email}
          onClose={() => setShowReassign(false)}
          onSubmit={async ({ email, note }) => {
            setShowReassign(false);
            try {
              const updated = (await window.api.lifecycle.reassign(state.projectName!, email, note)) as { lifecycle: Lifecycle };
              dispatch({ type: 'REPLACE_LIFECYCLE', lifecycle: updated.lifecycle });
              onReload?.();
            } catch (e: any) {
              alert(`Reassign failed: ${e?.message || String(e)}`);
            }
          }}
        />
      )}

      {showFollowUp && (
        <FollowUpModal
          current={followUpAt}
          onClose={() => setShowFollowUp(false)}
          onSubmit={async ({ whenIso, note }) => {
            setShowFollowUp(false);
            await dispatchLifecycle('follow_up', async () =>
              (await window.api.lifecycle.setFollowUp(state.projectName!, whenIso, note)) as any);
          }}
        />
      )}

      {showInitProject && (
        <InitializeProjectModal
          proposal={state.proposal}
          onClose={() => setShowInitProject(false)}
          onCommitted={async (project: Project) => {
            setShowInitProject(false);
            // Project's already saved on the main side. Reload the proposal
            // so the lifecycle reflects "won" status, then load the project
            // into reducer state so editorMode flips to 'project'.
            try {
              const fresh = (await window.api.proposals.load(state.projectName!)) as Proposal;
              dispatch({ type: 'LOAD_PROPOSAL', payload: fresh });
            } catch (e: any) {
              console.warn('reload proposal after initialize failed', e);
            }
            dispatch({ type: 'LOAD_PROJECT', project });
            onReload?.();
          }}
        />
      )}

      {showSendClickUp && state.project && (
        <SendToClickUpModal
          project={state.project}
          onClose={() => setShowSendClickUp(false)}
          onSent={(result) => {
            setShowSendClickUp(false);
            if (result.ok) {
              setClickUpLinkUrl(result.list_url);
              const warnText = result.warnings.length
                ? `\n\nWarnings:\n${result.warnings.map(w => '· ' + w).join('\n')}`
                : '';
              alert(
                `Sent to ClickUp.\n\n` +
                `${result.phases_synced} phase${result.phases_synced === 1 ? '' : 's'} synced` +
                (result.phases_skipped ? `, ${result.phases_skipped} skipped` : '') +
                (result.list_url ? `\n\nList: ${result.list_url}` : '') +
                warnText,
              );
            } else {
              alert(`Send failed: ${result.error}`);
            }
            onReload?.();
          }}
        />
      )}

      {nameWarn && (
        <Modal title="Consider a more specific name" onClose={() => setNameWarn(null)}>
          <div style={{ fontSize: 13, color: 'var(--body)', lineHeight: 1.5 }}>
            {nameWarn.kind === 'generic' ? (
              <>
                <p style={{ margin: '0 0 10px' }}>
                  <strong>"{proposal.name || ''}"</strong> is a generic name. Once
                  this proposal lands on the dashboard you'll have a hard time
                  telling it apart from other proposals.
                </p>
                <p style={{ margin: '0 0 4px' }}>
                  Try including the address, client, or job number — for
                  example, <em>"123 Main St — Smith Residence"</em>.
                </p>
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 10px' }}>
                  Another proposal named <strong>"{nameWarn.dupName}"</strong> already
                  exists. Two rows with the same name on the dashboard are hard
                  to tell apart.
                </p>
                <p style={{ margin: '0 0 4px' }}>
                  Consider adding the address, client, or a date to
                  distinguish — e.g., <em>"123 Main St — Smith Residence (rev 2)"</em>.
                </p>
              </>
            )}
          </div>
          <ModalActions
            onCancel={() => {
              setNameWarn(null);
              setTimeout(() => {
                const el = document.getElementById('proposal-name-input') as HTMLInputElement | null;
                if (el) {
                  el.focus();
                  el.select();
                  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }
              }, 0);
            }}
            cancelLabel="Rename"
            onConfirm={async () => {
              setNameWarn(null);
              setNameWarnAck(true);
              await dispatchLifecycle('mark_sent', async () =>
                (await window.api.lifecycle.markSent(state.projectName!)) as any);
            }}
            confirmLabel="Continue anyway"
          />
        </Modal>
      )}
    </>
  );
}

interface ReassignPmModalProps {
  allowed: AllowedUser[];
  currentEmail: string;
  onClose: () => void;
  onSubmit: (args: { email: string; note: string }) => void;
}

function ReassignPmModal({ allowed, currentEmail, onClose, onSubmit }: ReassignPmModalProps) {
  const [pick, setPick] = useState('');
  const [note, setNote] = useState('');
  const sorted = [...allowed].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return (
    <Modal title="Reassign Project Manager" onClose={onClose}>
      <div style={{ fontSize: 12.5, color: 'var(--body)', marginBottom: 12 }}>
        Pick the PM to hand this proposal off to. The change is logged in the
        activity timeline so the handoff is auditable, and the proposal moves
        into the new PM's dashboard view.
      </div>
      <FieldLabel>New project manager</FieldLabel>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280,
        overflowY: 'auto', marginTop: 6, marginBottom: 14,
        padding: 4, border: '1px solid var(--hair)', borderRadius: 6,
      }}>
        {sorted.map((u) => {
          const isCurrent = u.email.toLowerCase() === (currentEmail || '').toLowerCase();
          return (
            <button key={u.email}
              onClick={() => !isCurrent && setPick(u.email)}
              disabled={isCurrent}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 5,
                border: `1px solid ${pick === u.email ? 'var(--navy-deep)' : 'transparent'}`,
                background: pick === u.email
                  ? 'var(--navy-tint)'
                  : (isCurrent ? 'var(--canvas)' : 'transparent'),
                cursor: isCurrent ? 'not-allowed' : 'pointer',
                textAlign: 'left', fontFamily: 'var(--sans)',
                opacity: isCurrent ? 0.55 : 1,
              }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>
                  {u.name}
                  {isCurrent && (
                    <span style={{
                      marginLeft: 6, fontSize: 10, color: 'var(--muted)',
                      fontWeight: 500,
                    }}>· current PM</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{u.email}</div>
              </div>
            </button>
          );
        })}
      </div>
      <FieldLabel>Note (optional)</FieldLabel>
      <TextArea value={note} onChange={setNote} minHeight={60}
        placeholder="Reason for handoff (e.g., out of office, scope changed)" />
      <ModalActions onCancel={onClose}
        onConfirm={() => onSubmit({ email: pick, note })}
        confirmLabel="Reassign" confirmDisabled={!pick} />
    </Modal>
  );
}

interface DeleteConfirmModalProps {
  proposalName: string;
  status: ProposalStatus;
  onClose: () => void;
  onConfirm: () => void;
}

function DeleteConfirmModal({ proposalName, onClose, onConfirm }: DeleteConfirmModalProps) {
  return (
    <Modal title="Delete proposal?" onClose={onClose}>
      <div style={{ fontSize: 13, color: 'var(--body)', lineHeight: 1.5 }}>
        This will permanently remove <strong>{proposalName}</strong>. Only
        drafts can be deleted — once a proposal has been sent, its history
        (activity log, version snapshots) is preserved forever, even after
        archiving.
      </div>
      <ModalActions onCancel={onClose} onConfirm={onConfirm}
        confirmLabel="Delete draft" confirmKind="loss" />
    </Modal>
  );
}

// ── lost-reason modal ─────────────────────────────────────────────────────

interface LostReasonModalProps {
  onClose: () => void;
  onSubmit: (args: { reason: string; note: string }) => void;
}

function LostReasonModal({ onClose, onSubmit }: LostReasonModalProps) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  return (
    <Modal title="Mark proposal as lost" onClose={onClose}>
      <div style={{ fontSize: 12.5, color: 'var(--body)', marginBottom: 12 }}>
        Capturing why we lost the deal feeds win-rate and reason analytics on
        the dashboard. Pick the primary reason; notes are optional.
      </div>
      <FieldLabel>Reason</FieldLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {LOST_REASONS.map((r) => (
          <button key={r.value} onClick={() => setReason(r.value)}
            style={{
              padding: '7px 12px', borderRadius: 6,
              border: `1px solid ${reason === r.value ? 'var(--navy-deep)' : 'var(--hair)'}`,
              background: reason === r.value ? 'var(--navy-tint)' : 'var(--surface)',
              color: reason === r.value ? 'var(--navy-deep)' : 'var(--body)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--sans)',
            }}>
            {r.label}
          </button>
        ))}
      </div>
      <FieldLabel>Notes (optional)</FieldLabel>
      <TextArea value={note} onChange={setNote} minHeight={80}
        placeholder="Competitor name, price delta, client quote, etc." />
      <ModalActions onCancel={onClose}
        onConfirm={() => onSubmit({ reason, note })}
        confirmLabel="Mark as Lost" confirmDisabled={!reason} confirmKind="loss" />
    </Modal>
  );
}

// ── follow-up modal ───────────────────────────────────────────────────────

interface FollowUpModalProps {
  /** Existing follow-up date (YYYY-MM-DD or full ISO). null when none. */
  current: string | null;
  onClose: () => void;
  onSubmit: (args: { whenIso: string | null; note: string }) => void;
}

function FollowUpModal({ current, onClose, onSubmit }: FollowUpModalProps) {
  const [when, setWhen] = useState<string>(toDateInput(current));
  const [note, setNote] = useState('');

  const today = localTodayStr();
  const isPast = !!when && when < today;

  function pickPreset(days: number) { setWhen(addDaysIso(days)); }

  return (
    <Modal title={current ? 'Update follow-up' : 'Set follow-up'} onClose={onClose}>
      <div style={{ fontSize: 12.5, color: 'var(--body)', marginBottom: 12 }}>
        A follow-up is a reminder to yourself. We don't email or notify anyone — it just shows up
        on the dashboard and the editor's status bar so you can spot proposals that need attention.
      </div>

      <FieldLabel>Date</FieldLabel>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
        <input
          type="date"
          value={when}
          min={today}
          onChange={(e) => setWhen(e.target.value)}
          style={{
            height: 30, padding: '0 8px', border: '1px solid var(--hair)',
            borderRadius: 6, fontSize: 12.5, fontFamily: 'var(--sans)',
            background: 'var(--surface)', color: 'var(--ink)',
          }}
        />
        <button type="button" onClick={() => pickPreset(7)}  style={btnStyle('ghost', false)}>+1 week</button>
        <button type="button" onClick={() => pickPreset(14)} style={btnStyle('ghost', false)}>+2 weeks</button>
        <button type="button" onClick={() => pickPreset(30)} style={btnStyle('ghost', false)}>+30 days</button>
      </div>
      {isPast && (
        <div style={{ fontSize: 11.5, color: 'var(--action-danger)', marginTop: 4, marginBottom: 4 }}>
          That date is in the past. Pick today or later, or hit Clear to remove the reminder.
        </div>
      )}

      <FieldLabel>Note (optional)</FieldLabel>
      <TextArea value={note} onChange={setNote} minHeight={70}
        placeholder="What should you do then? e.g. 'Call John about scope changes.'" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, gap: 8 }}>
        <div>
          {current && (
            <button
              type="button"
              onClick={() => onSubmit({ whenIso: null, note: note.trim() })}
              title="Remove the follow-up date from this proposal"
              style={btnStyle('loss-ghost', false)}>
              Clear
            </button>
          )}
        </div>
        <ModalActions
          onCancel={onClose}
          onConfirm={() => onSubmit({ whenIso: when || null, note: note.trim() })}
          confirmLabel={current ? 'Update' : 'Set'}
          confirmDisabled={!when || isPast} />
      </div>
    </Modal>
  );
}

/** True when the proposal has an explicit follow-up date that's already
 *  past AND it's still in a state where the reminder is meaningful (draft
 *  or sent). Won/lost/archived suppress the alert. Exposed for reuse on the
 *  dashboard. */
export function isFollowUpOverdue(
  followUpAt: string | null | undefined,
  status: ProposalStatus,
): boolean {
  if (!followUpAt) return false;
  if (status !== 'draft' && status !== 'sent') return false;
  return followUpAt.slice(0, 10) < localTodayStr();
}

function localTodayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

// ── note modal ────────────────────────────────────────────────────────────

interface NoteModalProps {
  title: string;
  onClose: () => void;
  onSubmit: (note: string) => void;
}

function NoteModal({ title, onClose, onSubmit }: NoteModalProps) {
  const [note, setNote] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <FieldLabel>Note</FieldLabel>
      <TextArea value={note} onChange={setNote} minHeight={100}
        placeholder="Anything worth remembering — client feedback, internal discussion, etc." />
      <ModalActions onCancel={onClose} onConfirm={() => onSubmit(note)}
        confirmLabel="Add note" confirmDisabled={!note.trim()} />
    </Modal>
  );
}

// ── activity timeline ─────────────────────────────────────────────────────

interface ActivityTimelineProps {
  proposal: Proposal;
}

export function ActivityTimeline({ proposal }: ActivityTimelineProps) {
  const activity = proposal?.lifecycle?.activity || [];
  if (activity.length === 0) {
    return (
      <div style={{
        padding: 20, fontSize: 12, color: 'var(--muted)',
        background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 8,
      }}>
        No activity yet. Status changes and notes will show up here.
      </div>
    );
  }
  return (
    <div style={{
      padding: 14, background: 'var(--surface)',
      border: '1px solid var(--hair)', borderRadius: 8,
    }}>
      <div style={{
        fontSize: 10.5, letterSpacing: 0.6, color: 'var(--muted)',
        fontWeight: 600, textTransform: 'uppercase', marginBottom: 10,
      }}>
        Activity
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[...activity].reverse().map((e, idx) => (
          <ActivityEntryRow key={activity.length - 1 - idx} entry={e} />
        ))}
      </div>
    </div>
  );
}

function ActivityEntryRow({ entry }: { entry: any }) {
  const actionLabels: Record<string, string> = {
    mark_sent:      'marked the proposal as sent',
    mark_won:       'marked it as won',
    mark_lost:      'marked it as lost',
    mark_archived:  'archived it',
    reopen:         'reopened the proposal',
    note:           'added a note',
    create_version: 'created a new version',
    follow_up:      'set a follow-up',
    reassign:       'reassigned the PM',
  };
  const verb = actionLabels[entry.action] || entry.action;
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: actionColor(entry.action), marginTop: 6, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>
          <strong>{entry.user?.name || entry.user?.email || 'Someone'}</strong> {verb}
          {entry.action === 'mark_lost' && entry.meta?.reason &&
            <> — <em>{reasonLabel(entry.meta.reason)}</em></>}
          {entry.action === 'create_version' && entry.meta?.label &&
            <> — <em>{entry.meta.label}</em></>}
          {entry.action === 'reassign' && entry.meta && (
            <> from <em>{entry.meta.from_pm?.name || '—'}</em>
              {' '}to <em>{entry.meta.to_pm?.name || '—'}</em></>
          )}
          {entry.action === 'follow_up' && (
            entry.meta?.follow_up_at
              ? <> for <em>{formatDate(entry.meta.follow_up_at)}</em></>
              : <> — <em>cleared</em></>
          )}
        </div>
        {entry.note && (
          <div style={{
            fontSize: 12, color: 'var(--body)', marginTop: 2,
            whiteSpace: 'pre-wrap',
          }}>
            {entry.note}
          </div>
        )}
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3 }}>
          {formatDateTime(entry.timestamp)}
        </div>
      </div>
    </div>
  );
}

// ── version switcher ──────────────────────────────────────────────────────

interface VersionSwitcherProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  onReload?: () => void;
}

export function VersionSwitcher({ state, dispatch }: VersionSwitcherProps) {
  const proposal = state.proposal;
  const versions: VersionRecord[] = proposal?.lifecycle?.versions || [];
  const [open, setOpen] = useState(false);

  if (!state.projectName) return null;

  async function openFile(path: string) {
    try { await window.api.os.openFile(path); }
    catch (e: any) { alert(`Couldn't open file: ${e?.message || String(e)}`); }
  }

  function viewSnapshot(snapshot: VersionRecord) {
    dispatch({ type: 'LOAD_VERSION_VIEW', snapshot });
    setOpen(false);
  }

  const workingVersion = versions.length + 1;

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)}
        style={btnStyle('ghost', false)}
        title={`Working on v${workingVersion}` +
          (versions.length ? ` · ${versions.length} prior snapshot${versions.length === 1 ? '' : 's'}` : '')}>
        v{workingVersion}
        {versions.length > 0 && (
          <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>
            · {versions.length} prior
          </span>
        )}
        <span style={{ marginLeft: 6, fontSize: 9, opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div style={{
            position: 'absolute', top: 36, right: 0, minWidth: 320, zIndex: 11,
            background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(15,25,40,0.12)', overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)' }}>
              <div style={{
                fontSize: 10.5, letterSpacing: 0.6, color: 'var(--muted)',
                fontWeight: 600, textTransform: 'uppercase',
              }}>
                Working on v{workingVersion}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                {versions.length === 0
                  ? 'No prior snapshots yet'
                  : `${versions.length} prior snapshot${versions.length === 1 ? '' : 's'}`}
              </div>
            </div>
            <div style={{ maxHeight: 260, overflow: 'auto' }}>
              {versions.length === 0 && (
                <div style={{ padding: 14, fontSize: 12, color: 'var(--muted)' }}>
                  No versions yet. Create one when you want to preserve the current
                  content as a sent snapshot.
                </div>
              )}
              {[...versions].reverse().map((v) => {
                const isViewing = state.viewingVersion?.version === v.version;
                return (
                  <div key={v.version} style={{
                    padding: '10px 12px', borderBottom: '1px solid var(--line)',
                    fontSize: 12,
                    background: isViewing ? 'var(--navy-tint)' : 'transparent',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ color: 'var(--ink)' }}>{v.label}</strong>
                      <span style={{ color: 'var(--muted)' }}>
                        · {formatDateTime(v.snapshot_at)}
                      </span>
                      {v.status_at_snapshot && <StatusBadge status={v.status_at_snapshot} size="sm" />}
                      {isViewing && (
                        <span style={{
                          fontSize: 9.5, padding: '1px 6px', borderRadius: 8,
                          background: 'var(--navy-deep)', color: '#fff',
                          fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
                        }}>Viewing</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      by {v.snapshot_by?.name || v.snapshot_by?.email || '—'}
                    </div>
                    {v.note && (
                      <div style={{ fontSize: 11.5, color: 'var(--body)', marginTop: 4 }}>
                        {v.note}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => isViewing
                          ? dispatch({ type: 'RETURN_TO_LIVE' })
                          : viewSnapshot(v)}
                        title={isViewing
                          ? 'Return to the working version'
                          : `Load ${v.label} into the editor as read-only`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '4px 9px', fontSize: 11, fontWeight: 600,
                          background: isViewing ? 'var(--navy-deep)' : 'var(--canvas)',
                          color: isViewing ? '#fff' : 'var(--navy-deep)',
                          border: '1px solid ' + (isViewing ? 'var(--navy-deep)' : 'var(--hair)'),
                          borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--sans)',
                        }}>
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                          <path d="M1 6s2-3.5 5-3.5S11 6 11 6s-2 3.5-5 3.5S1 6 1 6Z"
                            stroke="currentColor" strokeWidth="1.2" />
                          <circle cx="6" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                        </svg>
                        {isViewing ? 'Return to working' : `View ${v.label}`}
                      </button>
                      {(v.files || []).map((f) => f.path && (
                        <button key={f.path} onClick={() => openFile(f.path)}
                          title={`Open ${f.kind.toUpperCase()} — ${f.path.split(/[\\/]/).pop()}`}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '4px 9px', fontSize: 11, fontWeight: 600,
                            background: 'var(--canvas)', color: 'var(--navy-deep)',
                            border: '1px solid var(--hair)', borderRadius: 5,
                            cursor: 'pointer', fontFamily: 'var(--sans)',
                          }}>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M3 1.5h4.5v4.5M7.5 1.5L4 5M2 4v4.5h4.5"
                              stroke="currentColor" strokeWidth="1.2"
                              strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Open {f.kind.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{
              padding: '10px 12px', borderTop: '1px solid var(--line)',
              background: 'var(--canvas)', fontSize: 11, color: 'var(--muted)',
              lineHeight: 1.45,
            }}>
              New versions are created automatically when you edit a proposal
              that's already been generated. The system flags it and asks
              whether to snapshot — you can confirm or skip.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── first-run identity ────────────────────────────────────────────────────

interface FirstRunIdentityProps {
  allowed: AllowedUser[];
  onPicked: (id: any) => void;
  onError?: (e: unknown) => void;
}

export function FirstRunIdentity({ allowed, onPicked, onError }: FirstRunIdentityProps) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  async function confirm() {
    if (!email) return;
    setBusy(true); setErr(null);
    try {
      const id = await window.api.identity.set(email);
      onPicked(id);
    } catch (e: any) {
      setErr(String(e?.message || String(e)));
      if (onError) onError(e);
    } finally {
      setBusy(false);
    }
  }

  const sorted = [...(allowed || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const q = search.trim().toLowerCase();
  const visible = q
    ? sorted.filter((u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q))
    : sorted;

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--canvas)',
      display: 'grid', placeItems: 'center', padding: 24,
    }}>
      <div style={{
        width: 480, maxHeight: 'calc(100vh - 48px)',
        background: 'var(--surface)', border: '1px solid var(--hair)',
        borderRadius: 12, padding: 24, boxShadow: '0 10px 30px rgba(15,25,40,0.06)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>
          Welcome to QuickQuote
        </div>
        <div style={{ fontSize: 13, color: 'var(--body)', marginTop: 8, lineHeight: 1.5 }}>
          Pick who you are so status changes, notes, and reassignments get
          attributed correctly. Contact the admin if your name is missing.
        </div>

        <div style={{ marginTop: 16 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…" autoFocus
            style={{
              width: '100%', height: 34, border: '1px solid var(--hair)',
              borderRadius: 7, padding: '0 12px', fontSize: 13,
              fontFamily: 'var(--sans)', background: 'var(--canvas)',
              color: 'var(--ink)', outline: 'none',
            }}
          />
        </div>

        <div style={{
          marginTop: 12, flex: 1, minHeight: 0,
          display: 'flex', flexDirection: 'column',
        }}>
          <FieldLabel>Your account ({visible.length})</FieldLabel>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6,
            overflowY: 'auto', maxHeight: 320,
            paddingRight: 4, marginRight: -4,
            border: '1px solid var(--line)', borderRadius: 8,
            background: 'var(--canvas)', padding: 6,
          }}>
            {allowed.length === 0 && (
              <div style={{ padding: 14, fontSize: 12, color: 'var(--red)' }}>
                No users are listed in allowed_users. Ask the admin to add you.
              </div>
            )}
            {allowed.length > 0 && visible.length === 0 && (
              <div style={{ padding: 14, fontSize: 12, color: 'var(--muted)' }}>
                No matches for "{search}".
              </div>
            )}
            {visible.map((u) => (
              <button key={u.email}
                onClick={() => setEmail(u.email)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 6,
                  border: `1px solid ${email === u.email ? 'var(--navy-deep)' : 'transparent'}`,
                  background: email === u.email ? 'var(--navy-tint)' : 'var(--surface)',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--sans)',
                }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: 'var(--navy-deep)',
                  color: '#fff', display: 'grid', placeItems: 'center',
                  fontSize: 10.5, fontWeight: 800, flexShrink: 0,
                }}>
                  {initials(u.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12.5, fontWeight: 600, color: 'var(--ink)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {u.name}
                  </div>
                  <div style={{
                    fontSize: 10.5, color: 'var(--muted)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {u.email} · {u.role}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
        {err && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--red)' }}>{err}</div>
        )}
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
          <button disabled={!email || busy} onClick={confirm}
            style={btnStyle('primary', busy)}>
            {busy ? 'Confirming…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── modal primitives ──────────────────────────────────────────────────────

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(15,25,40,0.4)', display: 'grid', placeItems: 'center',
      padding: 24,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)', background: 'var(--surface)',
          borderRadius: 12, boxShadow: '0 18px 40px rgba(15,25,40,0.25)',
          padding: 22,
        }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

type ButtonKind = 'primary' | 'win' | 'loss' | 'ghost' | 'loss-ghost';

interface ModalActionsProps {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmDisabled?: boolean;
  confirmKind?: ButtonKind;
  cancelLabel?: string;
}

export function ModalActions({ onCancel, onConfirm, confirmLabel, confirmDisabled, confirmKind = 'primary', cancelLabel = 'Cancel' }: ModalActionsProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
      <button onClick={onCancel} style={btnStyle('ghost', false)}>{cancelLabel}</button>
      <button onClick={onConfirm} disabled={confirmDisabled}
        style={btnStyle(confirmKind, false, confirmDisabled)}>
        {confirmLabel}
      </button>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────

function btnStyle(kind: ButtonKind, busy: boolean, disabled?: boolean) {
  const base: any = {
    height: 30, padding: '0 12px', border: 'none', borderRadius: 6,
    fontSize: 12, fontWeight: 600,
    cursor: busy ? 'wait' : (disabled ? 'not-allowed' : 'pointer'),
    fontFamily: 'var(--sans)',
    opacity: disabled ? 0.4 : 1,
  };
  const bg: Record<ButtonKind, any> = {
    primary:      { background: 'var(--navy-deep)',     color: '#fff' },
    win:          { background: 'var(--action-success)', color: '#fff' },
    loss:         { background: 'var(--action-danger)',  color: '#fff' },
    ghost:        { background: 'transparent',          color: 'var(--body)',
                    border: '1px solid var(--hair)' },
    'loss-ghost': { background: 'transparent',          color: 'var(--action-danger)',
                    border: '1px solid var(--action-danger-edge)' },
  };
  return { ...base, ...(bg[kind] || {}) };
}

function actionColor(action: string): string {
  // Activity timeline dot colors. Status-related ones reach for the same
  // hex values as the status pills (which now live in CSS vars); the
  // version/reassign colors are tonal and unique to the timeline.
  if (action === 'mark_won') return 'var(--status-won-fg)';
  if (action === 'mark_lost') return 'var(--action-danger)';
  if (action === 'mark_sent') return 'var(--status-sent-fg)';
  if (action === 'reopen') return 'var(--status-draft-fg)';
  if (action === 'create_version') return '#4A3A8A';
  if (action === 'reassign') return '#5A7CA8';
  return 'var(--muted)';
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

/** Coarse relative time for chip-style displays — "just now", "5m ago",
 *  "3h ago", "2d ago", "Mar 5". */
export function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const m = Math.round(diffMs / 60000);
  if (m < 1)    return 'just now';
  if (m < 60)   return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24)   return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function reasonLabel(value: string): string {
  const r = LOST_REASONS.find((x) => x.value === value);
  return r ? r.label : value;
}

function initials(name: string): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
