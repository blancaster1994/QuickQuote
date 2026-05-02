// Horizontal tab strip below the header card. Each tab shows the section
// title (or a "Bid Item N" fallback when blank) with billing + fee underneath.
// Active tab gets a 2px navy bottom border that shares edges with the
// SectionEditor panel sitting directly below.
//
// Direct port of QuickProp/ui/components/BidItemTabs.jsx — same markup,
// same styles, same UX. Step 8 reference port for the JSX → TSX playbook.

import type { Dispatch } from 'react';
import type { Section } from '../types/domain';
import type { EditorAction } from '../state/editorReducer';
import type { SectionTotalsRow } from '../lib/calc';
import { fmt$ } from '../lib/formatting';

export interface BidItemTabsProps {
  sections: Section[];
  totals: SectionTotalsRow[];
  activeSection: string;
  dispatch: Dispatch<EditorAction>;
}

function shortTitle(s: Section, i: number): string {
  const raw = (s.title || '').replace(/^Bid Item \d+\s*[—\-:]\s*/i, '').trim();
  return raw || `Bid Item ${i + 1}`;
}

export default function BidItemTabs({ sections, totals, activeSection, dispatch }: BidItemTabsProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 4,
      borderBottom: '1px solid var(--hair)', overflowX: 'auto',
    }}>
      {sections.map((s, i) => {
        const active = s.id === activeSection;
        const t = totals.find((x) => x.id === s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => dispatch({ type: 'SET_ACTIVE_SECTION', id: s.id })}
            title={s.title}
            style={{
              padding: '10px 14px', border: 'none', background: 'transparent',
              borderBottom: `2px solid ${active ? 'var(--navy-deep)' : 'transparent'}`,
              cursor: 'pointer', fontFamily: 'var(--sans)', textAlign: 'left',
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              minWidth: 0, maxWidth: 240, flexShrink: 0,
            }}>
            <span style={{
              fontSize: 12.5, fontWeight: active ? 600 : 500,
              color: active ? 'var(--ink)' : 'var(--body)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              minWidth: 0, width: '100%',
            }}>
              {shortTitle(s, i)}
            </span>
            <div className="tabular" style={{
              fontSize: 10.5, color: 'var(--muted)', marginTop: 2,
            }}>
              {s.billing === 'fixed' ? 'Fixed' : 'T&M'} · {fmt$(t?.fee ?? s.fee ?? 0)}
            </div>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => dispatch({ type: 'ADD_SECTION' })}
        title="Add a new bid item"
        style={{
          padding: '8px 12px', border: 'none', background: 'transparent',
          fontSize: 12, fontWeight: 600, color: 'var(--navy-deep)', cursor: 'pointer',
          alignSelf: 'center', lineHeight: 1,
          fontFamily: 'var(--sans)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
        Add bid item
      </button>
    </div>
  );
}
