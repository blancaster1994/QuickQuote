// Read-only iCore project ID display.
//
// Mono-font ID inside a hairline chip with two icon affordances:
//   • Copy — writes the ID to the system clipboard.
//   • Open in iCore — opens the project's iCore record. Disabled with a
//     tooltip until a deep-link URL pattern is configured. Once the
//     integration ships, swap the disabled stub for a real URL builder
//     (e.g., `https://icore.example.com/project/${id}`) — no other changes.
//
// Visual-only for now. The ID itself continues to be set in
// InitializeProjectModal at "Mark Won" time.

import { useState } from 'react';

interface ICoreBadgeProps {
  id: string | null | undefined;
  /** When true, prepend a small lock glyph — used in project mode where the
   *  ID is contracted-and-locked. */
  locked?: boolean;
}

export default function ICoreBadge({ id, locked }: ICoreBadgeProps) {
  const [copied, setCopied] = useState(false);

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
        disabled
        title="iCore deep links not configured yet"
        aria-label="Open in iCore"
        style={{ ...iconBtnStyle, opacity: 0.45, cursor: 'not-allowed' }}
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
