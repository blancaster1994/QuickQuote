// Active section editor — sits directly below BidItemTabs and shares its top
// border. Title, scope, billing segmented control, fee, notes. Fee calculator
// collapsible lives at the bottom.
//
// Direct port of QuickProp's SectionEditor.jsx.

import { useRef, useState, type Dispatch } from 'react';
import { Field, FieldLabel, FieldMoney, SegmentedControl } from './shared';
import { ConfirmDialog } from './ui';
import FeeCalculator from './FeeCalculator';
import { fmt$ } from '../lib/formatting';
import type { BillingType, Section } from '../types/domain';
import type { EditorAction, EditorState } from '../state/editorReducer';
import type { SectionTotals } from '../lib/calc';

interface SectionEditorProps {
  section: Section;
  total: SectionTotals;
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}

export default function SectionEditor({ section, total, state, dispatch }: SectionEditorProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const patch = (p: Partial<Section>) =>
    dispatch({ type: 'UPDATE_SECTION', id: section.id, patch: p });

  // Empty-state hint for first-run users: only the default Bid Item 1 exists
  // AND it has no content yet. Hides itself the moment the user types anything.
  const isBlank = !section.title?.trim()
    && !section.scope?.trim()
    && !section.notes?.trim()
    && (Number(section.fee) || 0) === 0
    && (section.labor?.length || 0) === 0
    && (section.expenses?.length || 0) === 0;
  const isFirstSection = state.proposal.sections.length === 1;

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--hair)', borderTop: 'none',
      borderRadius: '0 0 10px 10px', padding: 18,
    }}>
      {isBlank && isFirstSection && (
        <div style={{
          marginBottom: 14, padding: '10px 12px',
          background: 'var(--navy-tint)', borderRadius: 6,
          fontSize: 12.5, color: 'var(--navy-deep)', lineHeight: 1.5,
        }}>
          <strong>Tip:</strong> name this bid item, describe the scope, and set a fee.
          Use the <em>Fee calculator</em> below to build the fee from labor + expenses,
          or click <em>+ Add bid item</em> above to scope a second piece of work.
        </div>
      )}

      <Field label="Section title" value={section.title}
        onChange={(v) => patch({ title: v })}
        placeholder="e.g. Site Inspection" />

      <div style={{ height: 10 }} />

      <FieldLabel>Scope of work</FieldLabel>
      <RichScopeEditor value={section.scope}
        onChange={(v) => patch({ scope: v })}
        placeholder="Describe the work this bid item covers…" />

      <div style={{ height: 10 }} />

      <FieldLabel>Exclusions</FieldLabel>
      <RichScopeEditor value={section.exclusions}
        onChange={(v) => patch({ exclusions: v })}
        placeholder="What's NOT covered. Will be prefixed with 'Scope specifically excluded:' in the proposal." />

      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr', gap: 12, marginTop: 12 }}>
        <div>
          <FieldLabel>Billing</FieldLabel>
          <SegmentedControl<BillingType>
            options={[{ label: 'Fixed', value: 'fixed' }, { label: 'T&M', value: 'tm' }]}
            value={section.billing}
            onChange={(v) => patch({ billing: v })}
          />
        </div>
        <FieldMoney label="Fee" value={section.fee} onChange={(v) => patch({ fee: v })} />
        <Field label="Internal notes" value={section.notes}
          onChange={(v) => patch({ notes: v })}
          placeholder="not exported" />
      </div>

      <button type="button"
        onClick={() => dispatch({ type: 'TOGGLE_FEE_BUILDER' })}
        style={{
          marginTop: 14, width: '100%', padding: '10px 14px',
          background: 'var(--canvas)', border: '1px solid var(--hair)',
          borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10,
          cursor: 'pointer', fontFamily: 'var(--sans)', textAlign: 'left',
        }}>
        <span style={{
          fontSize: 11, color: 'var(--muted)',
          transform: state.feeBuilderOpen ? 'rotate(90deg)' : 'none',
          display: 'inline-block', transition: 'transform .15s',
        }}>▸</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
          Fee calculator
        </span>
        <span className="tabular" style={{
          fontSize: 11, color: 'var(--muted)', marginLeft: 'auto',
        }}>
          {section.labor.length} role{section.labor.length === 1 ? '' : 's'} · {fmt$(total.labor)} labor · {fmt$(total.expenses)} exp
        </span>
        <span className="tabular" style={{
          fontSize: 11, color: 'var(--navy-deep)', fontWeight: 700,
        }}>
          → {fmt$(total.grand)}
        </span>
      </button>

      {state.feeBuilderOpen && (
        <FeeCalculator section={section} total={total} state={state} dispatch={dispatch} />
      )}

      {state.proposal.sections.length > 1 && (
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button"
            onClick={() => setConfirmRemove(true)}
            style={{
              padding: '6px 10px', fontSize: 11, color: 'var(--red)',
              background: 'transparent', border: '1px solid var(--hair)',
              borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--sans)',
            }}>
            Remove bid item
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove}
        title="Delete bid item?"
        body={<>Remove <strong>{section.title || 'this bid item'}</strong>? Its scope, fee, labor, and expenses will be lost.</>}
        confirmLabel="Delete"
        confirmKind="loss"
        onConfirm={() => {
          setConfirmRemove(false);
          dispatch({ type: 'REMOVE_SECTION', id: section.id });
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}

// ── Rich-ish scope editor ───────────────────────────────────────────────────
// Plain-text storage with two list-marker toggles. The user types regular
// text; clicking Bullet adds "- " to the current/selected lines, Number
// renumbers them. The preview and DOCX renderers detect the markers and
// render proper lists. No third-party rich-text dependency.

interface RichScopeEditorProps {
  value: string | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight?: number;
}

function RichScopeEditor({ value, onChange, placeholder, minHeight = 90 }: RichScopeEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function applyToLines(transform: (lines: string[]) => string[]) {
    const ta = ref.current;
    if (!ta) return;
    const v = ta.value;
    const ss = ta.selectionStart;
    const se = ta.selectionEnd;
    // Expand selection to whole lines.
    const lineStart = v.lastIndexOf('\n', ss - 1) + 1;
    const afterEnd = v.indexOf('\n', se);
    const lineEnd = afterEnd === -1 ? v.length : afterEnd;
    const block = v.slice(lineStart, lineEnd);
    const newBlock = transform(block.split('\n')).join('\n');
    const next = v.slice(0, lineStart) + newBlock + v.slice(lineEnd);
    onChange(next);
    requestAnimationFrame(() => {
      const t = ref.current;
      if (t) {
        t.focus();
        t.setSelectionRange(lineStart, lineStart + newBlock.length);
      }
    });
  }

  function toggleBullet() {
    applyToLines((lines) => {
      const nonEmpty = lines.filter(l => l.trim() !== '');
      const allBulleted = nonEmpty.length > 0 && nonEmpty.every(l => /^\s*[-*]\s+/.test(l));
      if (allBulleted) {
        return lines.map(l => l.replace(/^(\s*)[-*]\s+/, '$1'));
      }
      return lines.map((l) => {
        if (l.trim() === '') return l;
        if (/^\s*[-*]\s+/.test(l)) return l;
        const stripped = l.replace(/^(\s*)\d+\.\s+/, '$1');
        return stripped.replace(/^(\s*)/, '$1- ');
      });
    });
  }

  function toggleNumbers() {
    applyToLines((lines) => {
      const nonEmpty = lines.filter(l => l.trim() !== '');
      const allNumbered = nonEmpty.length > 0 && nonEmpty.every(l => /^\s*\d+\.\s+/.test(l));
      if (allNumbered) {
        return lines.map(l => l.replace(/^(\s*)\d+\.\s+/, '$1'));
      }
      let n = 1;
      return lines.map((l) => {
        if (l.trim() === '') return l;
        const stripped = l.replace(/^(\s*)[-*]\s+/, '$1').replace(/^(\s*)\d+\.\s+/, '$1');
        return stripped.replace(/^(\s*)/, `$1${n++}. `);
      });
    });
  }

  const tbBtn = {
    height: 24, padding: '0 8px', borderRadius: 5,
    background: 'var(--canvas)', color: 'var(--ink)',
    border: '1px solid var(--hair)',
    fontSize: 11, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--sans)',
  } as const;

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <button type="button" onClick={toggleBullet} style={tbBtn}
          title="Bullet list — toggles '- ' on the current line(s).">
          • Bullet
        </button>
        <button type="button" onClick={toggleNumbers} style={tbBtn}
          title="Numbered list — renumbers the current line(s) as 1., 2., 3., …">
          1. Number
        </button>
      </div>
      <textarea
        ref={ref}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', minHeight, border: '1px solid var(--hair)', borderRadius: 7,
          padding: 10, fontSize: 13, lineHeight: 1.5, color: 'var(--body)',
          fontFamily: 'var(--sans)', resize: 'vertical', background: 'var(--surface)',
          outline: 'none',
        }}
      />
    </div>
  );
}
