// Step 4 smoke test: mount the reducer with fixture data and exercise a few
// action types. Real UI starts in Step 8 (port BidItemTabs.tsx as a leaf).
//
// What this proves: the discriminated-union EditorAction typechecks at every
// dispatch site, the reducer's switch is exhaustive, and the calc helpers
// flow types from Proposal → totals correctly.

import { useReducer } from 'react';
import { reducer, initialState } from './state/editorReducer';
import { calcProposal } from './lib/calc';
import { fmt$ } from './lib/formatting';
import { getStatus, STATUS_LABELS } from './lib/lifecycle';

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const { sum } = calcProposal(state.proposal);
  const status = getStatus(state.proposal);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{
        color: 'var(--navy)',
        fontFamily: 'var(--serif)',
        fontWeight: 600,
        margin: 0,
      }}>
        QuickQuote
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 12 }}>
        Step 4 smoke test — reducer mounted, calc helpers flowing.
      </p>

      <dl style={{ marginTop: 24, color: 'var(--body)' }}>
        <dt style={{ fontWeight: 600 }}>Sections</dt>
        <dd style={{ margin: '0 0 12px' }}>{state.proposal.sections.length}</dd>
        <dt style={{ fontWeight: 600 }}>Pipeline (sum of section fees)</dt>
        <dd style={{ margin: '0 0 12px' }}>{fmt$(sum)}</dd>
        <dt style={{ fontWeight: 600 }}>Status</dt>
        <dd style={{ margin: '0 0 12px' }}>{STATUS_LABELS[status]}</dd>
        <dt style={{ fontWeight: 600 }}>Active section</dt>
        <dd style={{ margin: '0 0 12px' }}>{state.activeSection}</dd>
      </dl>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button onClick={() => dispatch({ type: 'ADD_SECTION' })}>
          Add section
        </button>
        <button
          onClick={() => dispatch({
            type: 'SET_FIELD',
            field: 'name',
            value: 'Smoke Test Project',
          })}
        >
          Set name
        </button>
        <button onClick={() => dispatch({ type: 'TOGGLE_PREVIEW' })}>
          Toggle preview ({state.previewOpen ? 'open' : 'closed'})
        </button>
      </div>
    </div>
  );
}
