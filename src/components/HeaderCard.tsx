import { apiClient } from '../api/client';
// Project / client header card — ported from QuickProp's HeaderCard.jsx.
// Project name, Date, Client, Attention always visible; full address fields
// toggled behind a persistent disclosure row. Above the client fields, two
// toolbars let the engineer recall a saved bundle (Client Template / Project
// Type Template) — both scoped per CES identity email.

import { useEffect, useState, type Dispatch, type ReactNode } from 'react';
import { Field, FieldLabel } from './shared';
import { Modal, ModalActions } from './StatusComponents';
import { Button, Input, Select } from './ui';
import type { ClientTemplateRecord, Proposal } from '../types/domain';
import type { EditorAction } from '../state/editorReducer';

interface HeaderCardProps {
  proposal: Proposal;
  dispatch: Dispatch<EditorAction>;
  bootstrap: { client_templates?: string[] } | null;
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
        <div>
          <Field id="proposal-name-input" label="Project Name" value={proposal.name} onChange={setField('name')} />
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

      <ScopeRow proposal={proposal} dispatch={dispatch} />

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

// ── Legal entity + department picker ───────────────────────────────────────
//
// Both are required before the user can click Mark Sent (project init reads
// them from the proposal). Inline dropdowns sourced from the lookup tables.

function ScopeRow({ proposal, dispatch }: {
  proposal: Proposal;
  dispatch: Dispatch<EditorAction>;
}) {
  const [legalEntities, setLegalEntities] = useState<string[]>([]);
  const [departments,   setDepartments]   = useState<string[]>([]);

  useEffect(() => {
    void apiClient.lookups.list('legal_entity').then(rs => setLegalEntities(rs.map(r => r.name)));
    void apiClient.lookups.list('department').then(rs => setDepartments(rs.map(r => r.name)));
  }, []);

  const legalEntity = proposal.legal_entity || '';
  const department  = proposal.department  || '';

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px',
      marginTop: 8,
    }}>
      <div>
        <FieldLabel>Legal Entity</FieldLabel>
        <Select size="sm" strongBorder value={legalEntity}
          onChange={(e) => dispatch({ type: 'SET_LEGAL_ENTITY', legalEntity: e.target.value })}
          style={{ width: '100%' }}>
          <option value="">— Select —</option>
          {legalEntities.map(n => <option key={n} value={n}>{n}</option>)}
        </Select>
      </div>
      <div>
        <FieldLabel>Department</FieldLabel>
        <Select size="sm" strongBorder value={department}
          onChange={(e) => dispatch({ type: 'SET_DEPARTMENT', department: e.target.value })}
          style={{ width: '100%' }}>
          <option value="">— Select —</option>
          {departments.map(n => <option key={n} value={n}>{n}</option>)}
        </Select>
      </div>
    </div>
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
    const names = (await apiClient.clientTemplates.list()) as string[];
    dispatch({ type: 'SET_CLIENT_TEMPLATES', templates: names });
    return names;
  }

  async function onLoad() {
    if (!picked) return;
    try {
      const t = (await apiClient.clientTemplates.load(picked)) as ClientTemplateRecord;
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
            const res = (await apiClient.clientTemplates.save(name, {
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
            await apiClient.clientTemplates.remove(picked);
            setDeleteOpen(false);
            await refreshList();
            setPicked('');
          }}
        />
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

