// Step 6 smoke test: call the wired-up IPC handlers and render their
// responses so we can eyeball that the bootstrap composite, identity flow,
// proposal CRUD, and lifecycle transitions all return what the renderer
// expects. Real UI starts in Step 8.

import { useEffect, useState } from 'react';
import { reducer, initialState, emptyProposal } from './state/editorReducer';
import { useReducer } from 'react';
import { calcProposal } from './lib/calc';
import { fmt$ } from './lib/formatting';
import { getStatus, STATUS_LABELS } from './lib/lifecycle';

interface Bootstrap {
  app_version: string;
  employees: any[];
  consulting_rates: Record<string, number>;
  structural_rates: Record<string, number>;
  expense_lines: any[];
  allowed_users: any[];
  identity: any | null;
  projects: string[];
  client_templates: string[];
  project_templates: string[];
}

export default function App() {
  const [state] = useReducer(reducer, undefined, initialState);
  const { sum } = calcProposal(state.proposal);
  const status = getStatus(state.proposal);

  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  function appendLog(msg: string) {
    setLog((prev) => [...prev, `${new Date().toISOString().slice(11, 19)} · ${msg}`]);
  }

  async function loadBootstrap() {
    setError(null);
    try {
      const result = (await window.api.app.bootstrap()) as Bootstrap;
      setBoot(result);
      appendLog(`bootstrap: ${result.employees.length} employees, ${result.allowed_users.length} allowed users`);
    } catch (e: any) {
      setError(`bootstrap failed: ${e?.message || String(e)}`);
    }
  }

  useEffect(() => {
    loadBootstrap();
  }, []);

  async function handleSetIdentity(email: string) {
    setBusy(true);
    try {
      const ident = await window.api.identity.set(email);
      appendLog(`identity.set ok: ${(ident as any).name}`);
      await loadBootstrap();
    } catch (e: any) {
      appendLog(`identity.set FAILED: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDemoProposal() {
    setBusy(true);
    try {
      const p = emptyProposal();
      p.name = `Smoke Test ${new Date().toISOString().slice(0, 16)}`;
      p.client = 'Test Client Inc.';
      p.sections[0].title = 'Initial Survey';
      p.sections[0].fee = 5000;
      const result = (await window.api.proposals.save(p, null)) as any;
      appendLog(`proposals.save ok: "${result.name}"`);

      const list = (await window.api.proposals.list()) as string[];
      appendLog(`proposals.list (${list.length}): ${list.slice(0, 3).join(', ')}${list.length > 3 ? '…' : ''}`);

      const loaded = (await window.api.proposals.load(result.name)) as any;
      appendLog(`proposals.load ok: status=${loaded.lifecycle.status}, fee=${loaded.sections[0].fee}`);
    } catch (e: any) {
      appendLog(`save/load demo FAILED: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100vh' }}>
      <h1 style={{
        color: 'var(--navy)',
        fontFamily: 'var(--serif)',
        fontWeight: 600,
        margin: 0,
      }}>
        QuickQuote
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 12 }}>
        Step 6 smoke test — IPC handlers wired through to SQLite + identity file.
      </p>

      {error && (
        <div style={{ padding: 12, background: '#FBECEB', color: '#8A2A2A', borderRadius: 6, marginTop: 16 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <section>
          <h3 style={{ color: 'var(--ink)', marginBottom: 8 }}>Reducer state (local)</h3>
          <dl style={{ color: 'var(--body)', margin: 0 }}>
            <dt style={{ fontWeight: 600 }}>Sections</dt>
            <dd style={{ margin: '0 0 8px' }}>{state.proposal.sections.length}</dd>
            <dt style={{ fontWeight: 600 }}>Pipeline (sum of section fees)</dt>
            <dd style={{ margin: '0 0 8px' }}>{fmt$(sum)}</dd>
            <dt style={{ fontWeight: 600 }}>Status</dt>
            <dd style={{ margin: '0 0 8px' }}>{STATUS_LABELS[status]}</dd>
          </dl>
        </section>

        <section>
          <h3 style={{ color: 'var(--ink)', marginBottom: 8 }}>Bootstrap (IPC)</h3>
          {boot ? (
            <dl style={{ color: 'var(--body)', margin: 0 }}>
              <dt style={{ fontWeight: 600 }}>Identity</dt>
              <dd style={{ margin: '0 0 8px' }}>
                {boot.identity ? `${boot.identity.name} (${boot.identity.role})` : 'not set'}
              </dd>
              <dt style={{ fontWeight: 600 }}>Employees / Allowed users</dt>
              <dd style={{ margin: '0 0 8px' }}>{boot.employees.length} / {boot.allowed_users.length}</dd>
              <dt style={{ fontWeight: 600 }}>Rate categories</dt>
              <dd style={{ margin: '0 0 8px' }}>
                {Object.keys(boot.consulting_rates).length} consulting / {Object.keys(boot.structural_rates).length} structural
              </dd>
              <dt style={{ fontWeight: 600 }}>Expense lines</dt>
              <dd style={{ margin: '0 0 8px' }}>{boot.expense_lines.length}</dd>
              <dt style={{ fontWeight: 600 }}>Saved proposals</dt>
              <dd style={{ margin: '0 0 8px' }}>{boot.projects.length}</dd>
            </dl>
          ) : (
            <p style={{ color: 'var(--muted)', margin: 0 }}>loading…</p>
          )}
        </section>
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          disabled={busy}
          onClick={() => handleSetIdentity('blancaster@groupstructural.com')}
        >
          Set identity → Bryce
        </button>
        <button disabled={busy} onClick={handleSaveDemoProposal}>
          Save demo proposal
        </button>
        <button disabled={busy} onClick={loadBootstrap}>
          Refresh bootstrap
        </button>
      </div>

      <section style={{ marginTop: 24 }}>
        <h3 style={{ color: 'var(--ink)', marginBottom: 8 }}>Activity log</h3>
        <pre style={{
          background: 'var(--surface)',
          border: '1px solid var(--hair)',
          borderRadius: 6,
          padding: 12,
          fontSize: 13,
          fontFamily: 'var(--mono)',
          color: 'var(--body)',
          margin: 0,
          maxHeight: 240,
          overflow: 'auto',
        }}>
          {log.length === 0 ? <span style={{ color: 'var(--muted)' }}>(no calls yet)</span> : log.join('\n')}
        </pre>
      </section>
    </div>
  );
}
