// Read-only Bid Items strip rendered above the editable Project Phases tabs.
//
// Mirrors proposal.sections — name, billing pill (FF/T&M), contracted fee.
// Sits on a navy-tint background to telegraph "contracted scope, locked."
// Edits to bid items still live in proposal mode (which fires the version
// snapshot prompt at App.tsx); this row is purely a display anchor in
// project mode.
//
// Per-bid-item allocated $ is intentionally omitted — phases rarely map 1:1
// to bid items, and the project header card already carries the overall
// Budgeted-vs-Allocated comparison. If a phase→section mapping is ever
// introduced (e.g., phase.section_id), wire allocated dollars into the
// chip body here and the rest of the design lines up cleanly.

import type { Section } from '../../types/domain';
import type { SectionTotalsRow } from '../../lib/calc';
import { fmt$ } from '../../lib/formatting';

interface LockedBidItemsRowProps {
  sections: Section[];
  totals: SectionTotalsRow[];
}

export default function LockedBidItemsRow({ sections, totals }: LockedBidItemsRowProps) {
  if (sections.length === 0) return null;

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--hair)',
      borderRadius: '8px 8px 0 0',
      borderBottom: 'none',
      padding: '8px 12px',
      marginTop: 14,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
      }}>
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6,
          color: 'var(--muted)', textTransform: 'uppercase',
        }}>Bid Items</span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 9.5, fontWeight: 600, color: 'var(--status-won-fg)',
          background: 'var(--status-won-bg)', padding: '1px 6px', borderRadius: 9,
          letterSpacing: 0.4,
        }}>
          <LockGlyph /> Locked · contracted scope
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>
          Edit in proposal mode (will require a version snapshot)
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 4 }}>
        {sections.map((s, i) => {
          const fee = totals.find(t => t.id === s.id)?.fee ?? (+s.fee || 0);
          const billing = (s.billing === 'fixed' ? 'Fixed' : 'T&M');
          return (
            <BidItemChip key={s.id} name={shortTitle(s, i)} billing={billing} fee={fee} />
          );
        })}
      </div>
    </div>
  );
}

function shortTitle(s: Section, i: number): string {
  const raw = (s.title || '').replace(/^Bid Item \d+\s*[—\-:]\s*/i, '').trim();
  return raw || `Bid Item ${i + 1}`;
}

interface BidItemChipProps {
  name: string;
  billing: 'Fixed' | 'T&M';
  fee: number;
}

function BidItemChip({ name, billing, fee }: BidItemChipProps) {
  return (
    <div
      title={`${name} — ${billing} · ${fmt$(fee)} contracted`}
      style={{
        flex: 1, minWidth: 0,
        padding: '8px 12px',
        background: 'var(--surface)',
        border: '1px solid var(--hair)',
        borderTop: '2px solid var(--status-won-fg)',
        borderRadius: 4,
        display: 'flex', flexDirection: 'column', gap: 2,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          fontSize: 12.5, fontWeight: 700, color: 'var(--ink)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{name}</span>
        <span style={{ color: 'var(--subtle)', display: 'inline-flex' }} aria-hidden>
          <LockGlyph />
        </span>
      </div>
      <div className="tabular" style={{
        display: 'flex', alignItems: 'baseline', gap: 8,
        fontSize: 10.5, color: 'var(--muted)',
      }}>
        <span style={{
          padding: '1px 5px', borderRadius: 3,
          background: billing === 'T&M' ? 'var(--status-draft-bg)' : 'var(--navy-tint)',
          color:      billing === 'T&M' ? 'var(--status-draft-fg)' : 'var(--navy-deep)',
          fontWeight: 700,
        }}>{billing}</span>
        <span><strong style={{ color: 'var(--ink)' }}>{fmt$(fee)}</strong> contracted</span>
      </div>
    </div>
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
