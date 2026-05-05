// Editable rate cell for the phase task table. Direct port from PM Quoting
// App with an unchanged state machine:
//   - no override: task.rate_override == null → display = categoryRate
//   - overridden:  task.rate_override is a finite number ≠ categoryRate →
//                  display = task.rate_override; yellow background; tooltip
//                  with audit metadata; ↺ button to revert.
//
// On commit (onBlur):
//   - newVal ≈ categoryRate → clear override (and audit fields)
//   - else → set rate_override + freeze rate_baseline = categoryRate +
//            stamp who/when

import { useEffect, useRef, useState } from 'react';
import type { ProjectTask } from '../../types/domain';

interface RateCellProps {
  task: ProjectTask;
  /** Current category-lookup rate. Cell uses this both as the displayed
   *  value when no override is set and as the comparison target when
   *  deciding whether to clear an override. */
  categoryRate: number;
  disabled?: boolean;
  currentUser: { email: string | null; name: string | null } | null;
  onChange: (patch: Partial<ProjectTask>) => void;
}

function fmtTimestamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const trimmed = iso.trim();
  const hasTz = /([Zz]|[+-]\d{2}:?\d{2})$/.test(trimmed);
  const norm = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const d = new Date(hasTz ? norm : norm + 'Z');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function RateCell({ task, categoryRate, disabled, currentUser, onChange }: RateCellProps) {
  const storedOverride = task.rate_override != null && Number.isFinite(task.rate_override);
  const overridden = storedOverride
    && Math.abs(Number(task.rate_override) - categoryRate) >= 0.005;
  const displayValue = overridden ? Number(task.rate_override) : categoryRate;

  const [text, setText] = useState<string>(String(displayValue ?? 0));
  const focusedRef = useRef(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    setText(String(displayValue ?? 0));
  }, [displayValue]);

  function commit(rawValue: string) {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const parsed = parseFloat(rawValue);
    const newVal = Number.isFinite(parsed) ? parsed : 0;
    if (Math.abs(newVal - categoryRate) < 0.005) {
      onChange({
        rate_override: null,
        rate_baseline: null,
        rate_override_by_email: null,
        rate_override_by_name: null,
        rate_override_at: null,
      });
      return;
    }
    const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    onChange({
      rate_override: newVal,
      rate_baseline: categoryRate,
      rate_override_by_email: currentUser?.email ?? null,
      rate_override_by_name:  currentUser?.name  ?? null,
      rate_override_at:       nowIso,
    });
  }

  function reset() {
    onChange({
      rate_override: null,
      rate_baseline: null,
      rate_override_by_email: null,
      rate_override_by_name: null,
      rate_override_at: null,
    });
  }

  const tooltip = (() => {
    if (!overridden) return `Category rate: $${categoryRate.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    const baseline = task.rate_baseline ?? categoryRate;
    const who = task.rate_override_by_name || task.rate_override_by_email || 'Someone';
    const when = task.rate_override_at ? ` on ${fmtTimestamp(task.rate_override_at)}` : '';
    return `Category rate was $${baseline.toLocaleString('en-US', { maximumFractionDigits: 2 })}. ${who} changed it to $${Number(task.rate_override).toLocaleString('en-US', { maximumFractionDigits: 2 })}${when}.`;
  })();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }} title={tooltip}>
      <input
        type="number"
        min={0}
        step={0.01}
        value={text}
        disabled={disabled}
        onFocus={() => { focusedRef.current = true; }}
        onChange={(e) => { dirtyRef.current = true; setText(e.target.value); }}
        onBlur={(e) => { focusedRef.current = false; commit(e.target.value); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={{
          width: 88, height: 26,
          padding: '0 6px', textAlign: 'right',
          border: overridden ? '1px solid #f59e0b' : '1px solid var(--hair)',
          borderRadius: 4,
          background: overridden ? '#FEF9C3' : 'var(--surface)',
          fontWeight: overridden ? 600 : 400,
          color: overridden ? '#78350F' : 'var(--ink)',
          fontFamily: 'var(--sans)',
          fontVariantNumeric: 'tabular-nums',
        }}
      />
      {overridden && !disabled && (
        <button
          type="button"
          onClick={reset}
          aria-label="Reset to category rate"
          style={{
            padding: '0 5px', height: 22, fontSize: 11,
            color: '#92400E', background: 'transparent',
            border: '1px solid #FDE68A', borderRadius: 3, cursor: 'pointer',
          }}>↺</button>
      )}
    </div>
  );
}
