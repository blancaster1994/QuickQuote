// Project / client header card — ported from QuickProp's HeaderCard.jsx.
// Project name, Date, Client, Attention always visible; full address fields
// toggled behind a persistent disclosure row. Above the client fields, two
// toolbars let the engineer recall a saved bundle (Client Template / Project
// Type Template) — both scoped per CES identity email.

import { useState, type Dispatch, type ReactNode } from 'react';
import { Field, FieldLabel } from './shared';
import { Modal, ModalActions } from './StatusComponents';
import { Button, Input, Select } from './ui';
import type { ClientTemplateRecord, Proposal, ProjectTemplateRecord } from '../types/domain';
import type { EditorAction } from '../state/editorReducer';

interface HeaderCardProps {
  proposal: Proposal;
  dispatch: Dispatch<EditorAction>;
  bootstrap: { client_templates?: string[]; project_templates?: string[] } | null;
}

export default function HeaderCard({ proposal, dispatch, bootstrap }: HeaderCardProps) {
  const [addrOpen, setAddrOpen] = useState(
    !!(proposal.address || proposal.clientAddress
      || proposal.cityStateZip || proposal.clientCityStateZip),
  );
  const setField = (field: keyof Proposal) => (value: string) =>
    dispatch({ type: 'SET_FIELD', field, value });

  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: 10, padding: 16, marginBottom: 14,
    }}>
      <ClientTemplateBar proposal={proposal} dispatch={dispatch}
        templates={bootstrap?.client_templates || []}
        onAfterLoad={() => setAddrOpen(true)} />
      <ProjectTemplateBar proposal={proposal} dispatch={dispatch}
        templates={bootstrap?.project_templates || []} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
        <div>
          <Field label="Project Name" value={proposal.name} onChange={setField('name')} />
          {!(proposal.name && proposal.name.trim()) && (
            <div style={{
              marginTop: 4, fontSize: 10.5, color: 'var(--muted)',
              fontStyle: 'italic',
            }}>
              Autosave starts once the proposal has a name.
            </div>
          )}
        </div>
        <Field label="Date"         value={proposal.date}    onChange={setField('date')} />
        <Field label="Client"       value={proposal.client}  onChange={setField('client')} />
        <Field label="Attention"    value={proposal.contact} onChange={setField('contact')} />
      </div>

      <AddressFieldsToggle
        open={addrOpen}
        onToggle={() => setAddrOpen((o) => !o)}
      />
      {addrOpen && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px',
          marginTop: 8,
        }}>
          <Field label="Project Address"            value={proposal.address}            onChange={setField('address')} />
          <Field label="Project City, State, Zip"   value={proposal.cityStateZip}       onChange={setField('cityStateZip')} />
          <Field label="Client Address"             value={proposal.clientAddress}      onChange={setField('clientAddress')} />
          <Field label="Client City, State, Zip"    value={proposal.clientCityStateZip} onChange={setField('clientCityStateZip')} />
        </div>
      )}
    </div>
  );
}

// Disclosure row for the optional address block. Persistent regardless of
// state (open or closed) so users see the affordance even when collapsed.
function AddressFieldsToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      style={{
        marginTop: 12, paddingTop: 12, paddingBottom: open ? 4 : 0,
        borderTop: '1px solid var(--line)',
        width: '100%',
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'transparent', border: 'none', cursor: 'pointer',
        fontFamily: 'var(--sans)', textAlign: 'left',
      }}>
      <span style={{
        fontSize: 11, color: 'var(--muted)',
        transform: open ? 'rotate(90deg)' : 'none',
        display: 'inline-block', transition: 'transform .15s',
      }}>▸</span>
      <span style={{
        fontSize: 'var(--label-size, 12px)',
        letterSpacing: 'var(--label-letter-spacing, 0.6px)',
        color: 'var(--label-color, var(--muted))',
        fontWeight: 600, textTransform: 'uppercase',
      }}>
        Address fields {open ? '' : '(optional)'}
      </span>
    </button>
  );
}

// ── Client Template toolbar ────────────────────────────────────────────────

interface ClientTemplateBarProps {
  proposal: Proposal;
  dispatch: Dispatch<EditorAction>;
  templates: string[];
  onAfterLoad?: () => void;
}

function ClientTemplateBar({ proposal, dispatch, templates, onAfterLoad }: ClientTemplateBarProps) {
  const [picked, setPicked] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function refreshList(): Promise<string[]> {
    const names = (await window.api.clientTemplates.list()) as string[];
    dispatch({ type: 'SET_CLIENT_TEMPLATES', templates: names });
    return names;
  }

  async function onLoad() {
    if (!picked) return;
    try {
      const t = (await window.api.clientTemplates.load(picked)) as ClientTemplateRecord;
      dispatch({ type: 'APPLY_CLIENT_TEMPLATE', template: t });
      if (t.clientAddress || t.clientCityStateZip) onAfterLoad?.();
    } catch (e: any) {
      alert(`Couldn't load template "${picked}": ${e?.message || String(e)}`);
    }
  }

  return (
    <ToolbarRow label="Client Template" picked={picked} setPicked={setPicked}
      templates={templates} onLoad={onLoad}
      onSaveClick={() => setSaveOpen(true)}
      onDeleteClick={() => setDeleteOpen(true)}>
      {saveOpen && (
        <SaveTemplateModal title="Save Client Template"
          description="Save the current client info as a reusable template — recall it on any future proposal."
          initialName={picked || proposal.client || ''}
          placeholder="e.g. Acme Corp"
          onClose={() => setSaveOpen(false)}
          onSubmit={async (name) => {
            const res = (await window.api.clientTemplates.save(name, {
              client:             proposal.client,
              contact:            proposal.contact,
              clientAddress:      proposal.clientAddress,
              clientCityStateZip: proposal.clientCityStateZip,
            })) as { name?: string };
            setSaveOpen(false);
            const names = await refreshList();
            const saved = res.name || name;
            if (names.includes(saved)) setPicked(saved);
          }}
        />
      )}
      {deleteOpen && (
        <DeleteTemplateModal kind="Client" name={picked}
          onClose={() => setDeleteOpen(false)}
          onSubmit={async () => {
            await window.api.clientTemplates.remove(picked);
            setDeleteOpen(false);
            await refreshList();
            setPicked('');
          }}
        />
      )}
    </ToolbarRow>
  );
}

// ── Project Type Template toolbar ──────────────────────────────────────────

interface ProjectTemplateBarProps {
  proposal: Proposal;
  dispatch: Dispatch<EditorAction>;
  templates: string[];
}

function ProjectTemplateBar({ proposal, dispatch, templates }: ProjectTemplateBarProps) {
  const [picked, setPicked] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  async function refreshList(): Promise<string[]> {
    const names = (await window.api.projectTemplates.list()) as string[];
    dispatch({ type: 'SET_PROJECT_TEMPLATES', templates: names });
    return names;
  }

  async function apply() {
    try {
      const t = (await window.api.projectTemplates.load(picked)) as ProjectTemplateRecord;
      dispatch({ type: 'APPLY_PROJECT_TEMPLATE', template: t });
    } catch (e: any) {
      alert(`Couldn't load template "${picked}": ${e?.message || String(e)}`);
    }
  }

  async function onLoad() {
    if (!picked) return;
    if (hasContentfulSections(proposal)) {
      setConfirmReplace(true);
    } else {
      await apply();
    }
  }

  return (
    <ToolbarRow label="Project Type Template" picked={picked} setPicked={setPicked}
      templates={templates} onLoad={onLoad}
      onSaveClick={() => setSaveOpen(true)}
      onDeleteClick={() => setDeleteOpen(true)}>
      {saveOpen && (
        <SaveTemplateModal title="Save Project Type Template"
          description="Save the current bid item titles and scope of work as a reusable project type. Fees, billing, labor, and expenses are not saved."
          initialName={picked || ''}
          placeholder="e.g. Single Family Residence"
          onClose={() => setSaveOpen(false)}
          onSubmit={async (name) => {
            const res = (await window.api.projectTemplates.save(name, proposal.sections || [])) as { name?: string };
            setSaveOpen(false);
            const names = await refreshList();
            const saved = res.name || name;
            if (names.includes(saved)) setPicked(saved);
          }}
        />
      )}
      {deleteOpen && (
        <DeleteTemplateModal kind="Project Type" name={picked}
          onClose={() => setDeleteOpen(false)}
          onSubmit={async () => {
            await window.api.projectTemplates.remove(picked);
            setDeleteOpen(false);
            await refreshList();
            setPicked('');
          }}
        />
      )}
      {confirmReplace && (
        <Modal title="Replace Bid Items?" onClose={() => setConfirmReplace(false)}>
          <div style={{ fontSize: 13, color: 'var(--body)', lineHeight: 1.5 }}>
            Loading <strong>{picked}</strong> will replace every bid item in this
            proposal — including any titles, scope, fees, labor, and expenses
            you've already entered.
          </div>
          <ModalActions onCancel={() => setConfirmReplace(false)}
            onConfirm={async () => { setConfirmReplace(false); await apply(); }}
            confirmLabel="Replace" confirmKind="loss" />
        </Modal>
      )}
    </ToolbarRow>
  );
}

// ── shared toolbar shell + modals ──────────────────────────────────────────

interface ToolbarRowProps {
  label: string;
  picked: string;
  setPicked: (s: string) => void;
  templates: string[];
  onLoad: () => void;
  onSaveClick: () => void;
  onDeleteClick: () => void;
  children?: ReactNode;
}

function ToolbarRow({ label, picked, setPicked, templates, onLoad, onSaveClick, onDeleteClick, children }: ToolbarRowProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
      paddingBottom: 10, borderBottom: '1px solid var(--line)',
      flexWrap: 'wrap',
    }}>
      <div style={{
        fontSize: 9.5, letterSpacing: 1, color: 'var(--muted)',
        fontWeight: 700, textTransform: 'uppercase', minWidth: 120,
      }}>{label}</div>
      <Select size="sm" strongBorder value={picked}
        onChange={(e) => setPicked(e.target.value)}
        style={{ minWidth: 200, cursor: 'pointer' }}>
        <option value="">— Select a saved template —</option>
        {templates.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </Select>
      <Button variant="primary" size="sm" onClick={onLoad} disabled={!picked}>
        Load
      </Button>
      <Button variant="secondary" size="sm" onClick={onSaveClick}>
        Save as Template…
      </Button>
      {picked && (
        <Button variant="danger-ghost" size="sm" onClick={onDeleteClick}>
          Delete
        </Button>
      )}
      {children}
    </div>
  );
}

interface SaveTemplateModalProps {
  title: string;
  description: string;
  initialName: string;
  placeholder: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}

function SaveTemplateModal({ title, description, initialName, placeholder, onClose, onSubmit }: SaveTemplateModalProps) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  async function submit() {
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
    } catch (e: any) {
      setBusy(false);
      alert(`Couldn't save template: ${e?.message || String(e)}`);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ fontSize: 12.5, color: 'var(--body)', marginBottom: 10, lineHeight: 1.5 }}>
        {description}
      </div>
      <FieldLabel>Template Name</FieldLabel>
      <Input type="text" value={name} autoFocus strongBorder
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && trimmed) { e.preventDefault(); submit(); } }}
        placeholder={placeholder}
        style={{ marginTop: 4, fontSize: 13 }} />
      <ModalActions onCancel={onClose} onConfirm={submit}
        confirmLabel={busy ? 'Saving…' : 'Save'}
        confirmDisabled={!trimmed || busy} />
    </Modal>
  );
}

interface DeleteTemplateModalProps {
  kind: string;
  name: string;
  onClose: () => void;
  onSubmit: () => Promise<void>;
}

function DeleteTemplateModal({ kind, name, onClose, onSubmit }: DeleteTemplateModalProps) {
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit();
    } catch (e: any) {
      setBusy(false);
      alert(`Couldn't delete template: ${e?.message || String(e)}`);
    }
  }
  return (
    <Modal title={`Delete ${kind} Template`} onClose={onClose}>
      <div style={{ fontSize: 13, color: 'var(--body)' }}>
        Delete the {kind.toLowerCase()} template <strong>{name}</strong>? This can't be undone.
      </div>
      <ModalActions onCancel={onClose} onConfirm={submit}
        confirmLabel={busy ? 'Deleting…' : 'Delete'}
        confirmDisabled={busy} confirmKind="loss" />
    </Modal>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

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
    (s.fee && Number(s.fee) !== 0),
  );
}

