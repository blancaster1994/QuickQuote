// Horizontal tab strip below the project header. Mirrors BidItemTabs.tsx
// shape — same hairline bottom border, same active-2px-navy underline —
// but renders project phases instead of proposal sections.
//
// Each tab shows: phase number, name, project_type pill (FF / T&M),
// computed budget (sum of task hours × rate). The "+" button at the end
// adds a fresh phase.

import type { Dispatch } from 'react';
import type { ProjectPhase } from '../../types/domain';
import type { ProjectEditorAction } from '../../state/projectReducer';
import { fmt$ } from '../../lib/formatting';

interface PhaseTabsProps {
  phases: ProjectPhase[];
  activeIndex: number;
  /** Per-phase budget rollup — sum of task hours × effective rate.
   *  Computed by ProjectEditor and passed in so this component stays
   *  presentational. Length matches phases.length. */
  budgets: number[];
  dispatch: Dispatch<ProjectEditorAction>;
  disabled?: boolean;
}

export default function PhaseTabs({ phases, activeIndex, budgets, dispatch, disabled }: PhaseTabsProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 4,
      borderBottom: '1px solid var(--hair)', overflowX: 'auto',
    }}>
      {phases.map((p, i) => {
        const active = i === activeIndex;
        const budget = budgets[i] ?? 0;
        return (
          <button
            key={i}
            type="button"
            onClick={() => dispatch({ type: 'SET_ACTIVE_PHASE', index: i })}
            title={p.name}
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
              <span style={{ color: 'var(--muted)', marginRight: 4 }}>#{p.phase_no}</span>
              {p.name || `Phase ${p.phase_no}`}
            </span>
            <div className="tabular" style={{
              fontSize: 10.5, color: 'var(--muted)', marginTop: 2,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{
                padding: '1px 5px', borderRadius: 3,
                background: p.project_type === 'T&M' ? '#FDF3E3' : 'var(--navy-tint)',
                color: p.project_type === 'T&M' ? '#8A5A1A' : 'var(--navy-deep)',
                fontWeight: 700, letterSpacing: 0.3,
              }}>{p.project_type || 'FF'}</span>
              <span>{fmt$(budget)}</span>
            </div>
          </button>
        );
      })}
      {!disabled && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'ADD_PHASE' })}
          title="Add phase"
          style={{
            padding: '10px 12px', border: 'none', background: 'transparent',
            fontSize: 18, color: 'var(--muted)', cursor: 'pointer',
            alignSelf: 'center', lineHeight: 1,
          }}>
          +
        </button>
      )}
    </div>
  );
}
