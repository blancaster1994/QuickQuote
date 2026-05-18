// Read-only iCore project ID display.
//
// Mono-font ID inside a hairline chip with two icon affordances:
//   • Copy — writes the ID to the system clipboard.
//   • Open in iCore — opens the project's F&O record in the user's
//     default browser using the configured deeplink URL pattern
//     (Lookups → iCore → "Deeplink URL pattern"). Disabled with a
//     tooltip when no pattern is configured.
//
// The ID itself is set either manually via SendProposalModal at
// "Mark Sent" time, or by SendToICoreModal once the integration
// actually creates the project upstream.

import { useEffect, useState } from 'react';

interface ICoreBadgeProps {
  id: string | null | undefined;
  /** F&O dataAreaId (company) — used to substitute `{company}` in the
   *  configured deeplink URL pattern. Optional; when missing the
   *  placeholder is left as the empty string. */
  dataAreaId?: string | null;
  /** When true, prepend a small lock glyph — used in project mode where the
   *  ID is contracted-and-locked. */
  locked?: boolean;
}

export default function ICoreBadge({ id, dataAreaId, locked }: ICoreBadgeProps) {
  const [copied, setCopied] = useState(false);
  const [deeplinkPattern, setDeeplinkPattern] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.api.icore.getConfig()
      .then(cfg => { if (!cancelled) setDeeplinkPattern(cfg.deeplink_url_pattern ?? null); })
      .catch(() => { /* config not reachable — leave Open button disabled */ });
    return () => { cancelled = true; };
  }, []);

  if (!id) {
    return (
      <span style={{
        fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--subtle)',
        padding: '1px 6px', borderRadius: 4,
        border: '1px dashed var(--hair-strong)',
      }}>
        not set
      </span>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(id || '');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1100);
    } catch {
      // Clipboard write can fail in restricted contexts; nothing to do.
    }
  }

  function deeplinkUrl(): string | null {
    if (!deeplinkPattern || !id) return null;
    return deeplinkPattern
      .replace(/\{id\}/g, encodeURIComponent(id))
      .replace(/\{company\}/g, encodeURIComponent(dataAreaId ?? ''));
  }

  async function openInICore() {
    const url = deeplinkUrl();
    if (!url) return;
    try { await window.api.os.openFile(url); }
    catch (e) { console.warn('open icore failed', e); }
  }

  const linkEnabled = !!deeplinkUrl();

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600,
      background: 'var(--canvas)', color: 'var(--ink)',
      padding: '1px 5px 1px 6px', borderRadius: 4,
      border: '1px solid var(--hair)',
    }}>
      {locked && (
        <span style={{ color: 'var(--muted)', display: 'inline-flex' }} aria-hidden>
          <LockGlyph />
        </span>
      )}
      <span>{id}</span>
      <button
        type="button"
        onClick={() => void copy()}
        title={copied ? 'Copied!' : 'Copy iCore ID'}
        aria-label="Copy iCore ID"
        style={iconBtnStyle}
      >
        {copied ? <CheckGlyph /> : <CopyGlyph />}
      </button>
      <button
        type="button"
        disabled={!linkEnabled}
        onClick={() => void openInICore()}
        title={linkEnabled
          ? 'Open this project in iCore (F&O) in your browser'
          : 'Configure the deeplink URL pattern in Lookups → iCore'}
        aria-label="Open in iCore"
        style={linkEnabled
          ? iconBtnStyle
          : { ...iconBtnStyle, opacity: 0.45, cursor: 'not-allowed' }}
      >
        <OpenGlyph />
      </button>
    </span>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: 16, height: 16, padding: 0, border: 'none',
  background: 'transparent', color: 'var(--muted)', cursor: 'pointer',
  display: 'grid', placeItems: 'center', borderRadius: 3,
  fontFamily: 'var(--sans)',
};

function CopyGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <rect x="3.5" y="3.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 2.5h4a1 1 0 0 1 1 1v4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="var(--green)" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OpenGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path d="M5.5 2.5h-3v7h7v-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M7 2.5h2.5V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M5 7l4.5-4.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
      <rect x="2.5" y="5.5" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
