// Editable bill_rate cell for the resource assignment table. Direct port
// from PM Quoting App.
//
// "Overridden" compares bill_rate to the CURRENT lookup rate, not just the
// presence of audit metadata. So if the rate table catches up to a previous
// override, the cell stops looking overridden until the user blurs the
// input (which physically clears the audit fields).
//
// On commit:
//   - newVal ≈ baseline → not an override; clear audit fields, keep baseline
//   - else → set audit fields to current user + now
// In all cases bill_rate is set to the typed value.

import { useEffect, useRef, useState } from 'react';
import type { ResourceAssignment } from '../../types/domain';

interface BillRateCellProps {
  assignment: ResourceAssignment;
  /** Current category lookup. Used as the comparison target and as a fallback
   *  baseline when the assignment was created before audit fields existed. */
  lookupRate: number;
  disabled?: boolean;
  currentUser: { email: string | null; name: string | null } | null;
  onChange: (patch: Partial<ResourceAssignment>) => void;
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

export default function BillRateCell({ assignment: a, lookupRate, disabled, currentUser, onChange }: BillRateCellProps) {
  const overridden = !!a.rate_override_at
    && Math.abs(a.bill_rate - lookupRate) >= 0.005;
  const baseline = a.rate_baseline ?? lookupRate;

  const [text, setText] = useState<string>(String(a.bill_rate ?? 0));
  const focusedRef = useRef(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    setText(String(a.bill_rate ?? 0));
  }, [a.bill_rate]);

  function commit(rawValue: string) {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const parsed = parseFloat(rawValue);
    const newVal = Number.isFinite(parsed) ? parsed : 0;
    const effectiveBaseline = a.rate_baseline ?? lookupRate;
    if (Math.abs(newVal - effectiveBaseline) < 0.005) {
      onChange({
        bill_rate: newVal,
        rate_baseline: effectiveBaseline,
        rate_override_by_email: null,
        rate_override_by_name: null,
        rate_override_at: null,
      });
      return;
    }
    const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    onChange({
      bill_rate: newVal,
      rate_baseline: effectiveBaseline,
      rate_override_by_email: currentUser?.email ?? null,
      rate_override_by_name:  currentUser?.name  ?? null,
      rate_override_at:       nowIso,
    });
  }

  function reset() {
    onChange({
      bill_rate: baseline,
      rate_baseline: baseline,
      rate_override_by_email: null,
      rate_override_by_name: null,
      rate_override_at: null,
    });
  }

  const tooltip = (() => {
    if (!overridden) {
      return baseline > 0
        ? `Standard rate at pick time: $${baseline.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
        : 'No standard rate on file for this category — type a value.';
    }
    const who = a.rate_override_by_name || a.rate_override_by_email || 'Someone';
    const when = a.rate_override_at ? ` on ${fmtTimestamp(a.rate_override_at)}` : '';
    return `Standard rate was $${baseline.toLocaleString('en-US', { maximumFractionDigits: 2 })}. ${who} changed it to $${a.bill_rate.toLocaleString('en-US', { maximumFractionDigits: 2 })}${when}.`;
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
          aria-label="Reset to standard rate"
          style={{
            padding: '0 5px', height: 22, fontSize: 11,
            color: '#92400E', background: 'transparent',
            border: '1px solid #FDE68A', borderRadius: 3, cursor: 'pointer',
          }}>↺</button>
      )}
    </div>
  );
}
