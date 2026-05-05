// ClickUp settings — port of PM Quoting App's ClickUpSettings.
//
// Two adjustments from the source:
//   1. `useCurrentUser` is replaced with the `identity` prop sourced from
//      QuickQuote's editor reducer (`state.identity`).
//   2. `canDo` imports from QuickQuote's lib/lifecycle (single-user app —
//      always returns true today; the gate stays as a future hardening hook).
//
// Test connection is a Stage 2 stub on the main side: it returns
// { ok: false, error: '...not implemented in Stage 2' }. Full sync ships in
// Stage 6 along with the SendToClickUpModal.

import { useEffect, useState } from 'react';
import { canDo } from '../../lib/lifecycle';
import type { ClickUpStatus, Identity } from '../../types/domain';

interface ClickUpSettingsProps {
  identity: Identity | null;
  disabled?: boolean;
}

export default function ClickUpSettings({ identity, disabled }: ClickUpSettingsProps) {
  const isAdmin = canDo(identity?.role, 'manage');
  const lock = !!disabled;

  const [status, setStatus] = useState<ClickUpStatus | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function refresh() {
    try { setStatus(await window.api.clickup.getConfig()); }
    catch (e: any) { console.warn('config load failed', e); }
  }
  useEffect(() => { void refresh(); }, []);

  async function rotateToken() {
    if (!tokenInput.trim()) return;
    setBusy('rotate');
    try {
      await window.api.clickup.setConfig({ api_token: tokenInput.trim(), enabled: true });
      setTokenInput('');
      await refresh();
      alert('Token saved. Run "Test connection" to verify it works.');
    } catch (e: any) {
      alert('Save failed: ' + (e?.message ?? String(e)));
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    setBusy('test');
    setTestResult(null);
    try {
      const res = await window.api.clickup.testConnection();
      if (res.ok) {
        const userText = res.user ? ` as ${res.user.email} (id ${res.user.id})` : '';
        setTestResult({ ok: true, text: `Connected${userText}.` });
      } else {
        setTestResult({ ok: false, text: res.error });
      }
    } catch (e: any) {
      setTestResult({ ok: false, text: e?.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function toggleEnabled() {
    if (!status) return;
    setBusy('toggle');
    try {
      await window.api.clickup.setConfig({ enabled: !status.enabled });
      await refresh();
    } catch (e: any) {
      alert('Toggle failed: ' + (e?.message ?? String(e)));
    } finally {
      setBusy(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className="card" style={{ color: 'var(--muted)' }}>
        ClickUp settings are admin-only. Ask an admin to configure the integration.
      </div>
    );
  }
  if (!status) {
    return <div className="card" style={{ color: 'var(--muted)' }}>Loading…</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
      {/* Status */}
      <div className="card">
        <h3>Status</h3>
        <Row label="API token" value={
          status.configured
            ? <span style={{ color: '#047857', fontWeight: 600 }}>configured</span>
            : <span style={{ color: '#b91c1c', fontWeight: 600 }}>not set</span>
        } />
        <Row label="Sync" value={
          status.enabled
            ? <span style={{ color: '#047857', fontWeight: 600 }}>enabled</span>
            : <span style={{ color: '#92400e', fontWeight: 600 }}>disabled</span>
        } extra={status.configured && (
          <button onClick={() => void toggleEnabled()} disabled={lock || busy === 'toggle'} style={{ marginLeft: 8 }}>
            {status.enabled ? 'Disable sync' : 'Enable sync'}
          </button>
        )} />
        <Row label="Workspace ID"          value={<code>{status.workspace_id || '—'}</code>} />
        <Row label="Admin Requests space"  value={<code>{status.admin_requests_space_id || '—'}</code>} />
        <Row label="Admin Requests list"   value={<code>{status.admin_requests_list_id || '—'}</code>} />
        <Row label="Last updated"          value={status.updated_at ? new Date(status.updated_at).toLocaleString() : '—'} />

        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => void testConnection()} disabled={lock || busy === 'test' || !status.configured} className="primary">
            {busy === 'test' ? 'Testing…' : 'Test connection'}
          </button>
          {testResult && (
            <div style={{
              fontSize: 11.5,
              color: testResult.ok ? '#047857' : '#b91c1c',
              fontWeight: 500,
            }}>
              {testResult.ok ? '✓ ' : '✗ '}{testResult.text}
            </div>
          )}
        </div>
      </div>

      {/* Rotate token */}
      <div className="card">
        <h3>Rotate API token</h3>
        <p className="muted">
          Paste a new Personal API Token (from ClickUp → avatar → Settings → Apps → API Token). The new token replaces the old one immediately. Use this when:
        </p>
        <ul style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 0, paddingLeft: 18 }}>
          <li>The bot's password was changed (token might be revoked).</li>
          <li>You're switching to a different bot user.</li>
          <li>You're re-enabling sync after a long disable.</li>
        </ul>

        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>New token</label>
          <input
            type="password"
            placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            value={tokenInput}
            disabled={lock}
            onChange={(e) => setTokenInput(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            style={{ marginTop: 4, fontFamily: 'var(--mono)' }}
          />
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button
            onClick={() => void rotateToken()}
            disabled={lock || busy === 'rotate' || !tokenInput.trim() || !/^pk_/.test(tokenInput.trim())}
            className="primary"
          >
            {busy === 'rotate' ? 'Saving…' : 'Save token'}
          </button>
          <button
            onClick={() => setTokenInput('')}
            disabled={lock || busy === 'rotate' || !tokenInput}
          >Clear</button>
        </div>
        {tokenInput && !/^pk_/.test(tokenInput.trim()) && (
          <div className="error">
            ClickUp Personal API Tokens start with <code>pk_</code>.
          </div>
        )}

        <div style={{
          marginTop: 12, padding: '8px 10px',
          background: 'var(--canvas)', border: '1px solid var(--hair)',
          borderRadius: 6, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5,
        }}>
          The token is stored in your local SQLite DB only. It never leaves this machine,
          and the renderer never receives it back — only a "configured: yes/no" flag.
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, extra }: { label: string; value: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--line)', gap: 10 }}>
      <div style={{ width: 170, fontSize: 11.5, color: 'var(--muted)' }}>{label}</div>
      <div style={{ flex: 1, fontSize: 12 }}>{value}</div>
      {extra}
    </div>
  );
}
