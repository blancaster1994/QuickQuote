// iCore (Dynamics 365 F&O) settings panel.
//
// Structurally mirrors ClickUpSettings.tsx — same admin gate, status
// card + edit card layout, same disabled/edit-mode wiring. The
// difference is the fields: instead of a single bot-token rotation, we
// capture the app-registration metadata required to authenticate to F&O
// (tenant ID, application client ID, environment URL, deeplink pattern).
//
// Today "Test Connection" only validates the saved config shape — no
// network call. The auth + API client land in the next slice; once
// they do, this panel inherits real connectivity testing without
// shape changes.

import { useEffect, useState } from 'react';
import { canDo } from '../../lib/lifecycle';
import type { IcoreAccount, IcoreStatus, Identity } from '../../types/domain';

interface IcoreSettingsProps {
  identity: Identity | null;
  disabled?: boolean;
}

export default function IcoreSettings({ identity, disabled }: IcoreSettingsProps) {
  const isAdmin = canDo(identity?.role, 'manage');
  const lock = !!disabled;

  const [status, setStatus] = useState<IcoreStatus | null>(null);
  const [account, setAccount] = useState<IcoreAccount | null>(null);
  const [clientCount, setClientCount] = useState<number>(0);
  const [tenantId,     setTenantId]     = useState('');
  const [clientId,     setClientId]     = useState('');
  const [envUrl,       setEnvUrl]       = useState('');
  const [deeplink,     setDeeplink]     = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [refreshResult, setRefreshResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function refresh() {
    try {
      const [next, acct, clients] = await Promise.all([
        window.api.icore.getConfig(),
        window.api.icore.getAccount(),
        window.api.icore.listClients({ limit: 1, includeInactive: true }).catch(() => []),
      ]);
      setStatus(next);
      setAccount(acct);
      // Quick count: pull a 1-row sample to confirm cache exists, then a
      // count query via a wider call. listClients already returns rows
      // ordered; do a no-limit count via a second small call. (A cheaper
      // route is to add a count endpoint — fine to upgrade later.)
      try {
        const all = await window.api.icore.listClients({ includeInactive: true });
        setClientCount(all.length);
      } catch { setClientCount(clients.length); }
      // Seed edit fields from the saved values so the user sees what's
      // already there. Empty strings mean "not yet set".
      setTenantId(next.tenant_id ?? '');
      setClientId(next.client_id ?? '');
      setEnvUrl(next.environment_url ?? '');
      setDeeplink(next.deeplink_url_pattern ?? '');
    } catch (e) {
      console.warn('icore config load failed', e);
    }
  }
  useEffect(() => { void refresh(); }, []);

  async function refreshClients() {
    setBusy('refresh');
    setRefreshResult(null);
    try {
      const res = await window.api.icore.refreshClients();
      if (res.ok) {
        setRefreshResult({
          ok: true,
          text: `Pulled ${res.total} (upserted ${res.upserted}, deactivated ${res.deactivated}) in ${Math.round(res.duration_ms / 100) / 10}s.`,
        });
        await refresh();
      } else {
        setRefreshResult({ ok: false, text: res.error });
      }
    } catch (e: any) {
      setRefreshResult({ ok: false, text: e?.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function signIn() {
    setBusy('signin');
    setTestResult(null);
    try {
      const acct = await window.api.icore.signIn();
      setAccount(acct);
    } catch (e: any) {
      alert('Sign-in failed: ' + (e?.message ?? String(e)));
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    if (!confirm('Sign out of iCore on this machine? The cached token will be deleted.')) return;
    setBusy('signout');
    setTestResult(null);
    try {
      await window.api.icore.signOut();
      setAccount(null);
    } catch (e: any) {
      alert('Sign-out failed: ' + (e?.message ?? String(e)));
    } finally {
      setBusy(null);
    }
  }

  async function saveConfig() {
    setBusy('save');
    try {
      await window.api.icore.setConfig({
        tenant_id:            tenantId.trim() || null,
        client_id:            clientId.trim() || null,
        environment_url:      envUrl.trim().replace(/\/+$/, '') || null,
        deeplink_url_pattern: deeplink.trim() || null,
      });
      await refresh();
      setTestResult(null);
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
      const res = await window.api.icore.testConnection();
      if (res.ok) setTestResult({ ok: true,  text: res.message });
      else        setTestResult({ ok: false, text: res.error });
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
      await window.api.icore.setConfig({ enabled: !status.enabled });
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
        iCore settings are admin-only. Ask an admin to configure the integration.
      </div>
    );
  }
  if (!status) {
    return <div className="card" style={{ color: 'var(--muted)' }}>Loading…</div>;
  }

  const dirty =
    (tenantId.trim() || null) !== (status.tenant_id ?? null) ||
    (clientId.trim() || null) !== (status.client_id ?? null) ||
    (envUrl.trim().replace(/\/+$/, '') || null) !== (status.environment_url ?? null) ||
    (deeplink.trim() || null) !== (status.deeplink_url_pattern ?? null);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
      {/* Status */}
      <div className="card">
        <h3>Status</h3>
        <Row label="Configured" value={
          status.configured
            ? <span style={{ color: '#047857', fontWeight: 600 }}>yes</span>
            : <span style={{ color: '#b91c1c', fontWeight: 600 }}>missing fields</span>
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
        <Row label="Tenant ID"        value={<code>{status.tenant_id || '—'}</code>} />
        <Row label="Client ID"        value={<code>{status.client_id || '—'}</code>} />
        <Row label="Environment URL"  value={<code>{status.environment_url || '—'}</code>} />
        <Row label="Deeplink pattern" value={<code>{status.deeplink_url_pattern || '—'}</code>} />
        <Row label="Client refresh"   value={`every ${status.client_sync_interval_minutes} min`} />
        <Row label="Cached clients"   value={`${clientCount} row${clientCount === 1 ? '' : 's'}`}
             extra={account && status.configured && (
               <button onClick={() => void refreshClients()} disabled={lock || busy === 'refresh'} style={{ marginLeft: 8 }}>
                 {busy === 'refresh' ? 'Refreshing…' : 'Refresh now'}
               </button>
             )} />
        <Row label="Last client sync" value={status.client_last_synced_at ? new Date(status.client_last_synced_at).toLocaleString() : '—'} />
        {refreshResult && (
          <div style={{
            marginTop: 8, padding: '6px 8px',
            background: refreshResult.ok ? 'rgba(4,120,87,0.08)' : 'rgba(185,28,28,0.08)',
            border: `1px solid ${refreshResult.ok ? 'rgba(4,120,87,0.3)' : 'rgba(185,28,28,0.3)'}`,
            borderRadius: 5, fontSize: 11,
            color: refreshResult.ok ? '#047857' : '#b91c1c',
          }}>
            {refreshResult.ok ? '✓ ' : '✗ '}{refreshResult.text}
          </div>
        )}
        <Row label="Signed in" value={
          account
            ? <span style={{ color: '#047857', fontWeight: 600 }}>{account.username}</span>
            : <span style={{ color: '#92400e', fontWeight: 600 }}>no</span>
        } extra={status.configured && (
          account
            ? <button onClick={() => void signOut()} disabled={lock || busy === 'signout'} style={{ marginLeft: 8 }}>
                {busy === 'signout' ? 'Signing out…' : 'Sign out'}
              </button>
            : <button onClick={() => void signIn()} disabled={lock || busy === 'signin'} style={{ marginLeft: 8 }}>
                {busy === 'signin' ? 'Opening browser…' : 'Sign in'}
              </button>
        )} />
        <Row label="Last updated"     value={status.updated_at ? new Date(status.updated_at).toLocaleString() : '—'} />

        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => void testConnection()} disabled={lock || busy === 'test'} className="primary">
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
        <div style={{
          marginTop: 12, padding: '8px 10px',
          background: 'var(--canvas)', border: '1px solid var(--hair)',
          borderRadius: 6, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5,
        }}>
          Test connection validates the saved config and (when signed in)
          attempts a silent token acquisition. A live OData probe is added
          when the API client lands in the next slice.
        </div>
      </div>

      {/* Edit */}
      <div className="card">
        <h3>App registration</h3>
        <p className="muted">
          These come from the QuickQuote app registration in Microsoft Entra ID.
          The tenant + client IDs are non-secret GUIDs; the environment URL is
          your F&amp;O instance.
        </p>

        <FieldBlock>
          <FieldLabel>Tenant ID (Directory ID)</FieldLabel>
          <input
            type="text"
            placeholder="7e0d…-…-…-…-…"
            value={tenantId}
            disabled={lock}
            onChange={(e) => setTenantId(e.target.value)}
            spellCheck={false}
            style={{ fontFamily: 'var(--mono)' }}
          />
        </FieldBlock>

        <FieldBlock>
          <FieldLabel>Application (client) ID</FieldLabel>
          <input
            type="text"
            placeholder="8f3c…-…-…-…-…"
            value={clientId}
            disabled={lock}
            onChange={(e) => setClientId(e.target.value)}
            spellCheck={false}
            style={{ fontFamily: 'var(--mono)' }}
          />
        </FieldBlock>

        <FieldBlock>
          <FieldLabel>Environment URL</FieldLabel>
          <input
            type="text"
            placeholder="https://prod.operations.dynamics.com"
            value={envUrl}
            disabled={lock}
            onChange={(e) => setEnvUrl(e.target.value)}
            spellCheck={false}
            style={{ fontFamily: 'var(--mono)' }}
          />
        </FieldBlock>

        <FieldBlock>
          <FieldLabel>Deeplink URL pattern (optional)</FieldLabel>
          <input
            type="text"
            placeholder="https://prod.operations.dynamics.com/?cmp={company}&mi=ProjTable&Project={id}"
            value={deeplink}
            disabled={lock}
            onChange={(e) => setDeeplink(e.target.value)}
            spellCheck={false}
            style={{ fontFamily: 'var(--mono)' }}
          />
          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>
            Placeholders: <code>{'{company}'}</code> (F&amp;O dataAreaId),{' '}
            <code>{'{id}'}</code> (iCore project ID). Used by the
            "Open in iCore" button on each project's iCore badge.
          </div>
        </FieldBlock>

        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button
            onClick={() => void saveConfig()}
            disabled={lock || busy === 'save' || !dirty}
            className="primary"
          >
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => {
              setTenantId(status.tenant_id ?? '');
              setClientId(status.client_id ?? '');
              setEnvUrl(status.environment_url ?? '');
              setDeeplink(status.deeplink_url_pattern ?? '');
            }}
            disabled={lock || busy === 'save' || !dirty}
          >Revert</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, extra }: { label: string; value: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--line)', gap: 10 }}>
      <div style={{ width: 170, fontSize: 11.5, color: 'var(--muted)' }}>{label}</div>
      <div style={{ flex: 1, fontSize: 12, wordBreak: 'break-all' }}>{value}</div>
      {extra}
    </div>
  );
}

function FieldBlock({ children }: { children: React.ReactNode }) {
  return <div style={{ marginTop: 10 }}>{children}</div>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      fontSize: 10.5, fontWeight: 600, color: 'var(--muted)',
      textTransform: 'uppercase', letterSpacing: 0.4,
      display: 'block', marginBottom: 4,
    }}>
      {children}
    </label>
  );
}
