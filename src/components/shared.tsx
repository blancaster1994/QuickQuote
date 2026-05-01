// Shared input primitives. Label-over-input pattern with muted uppercase
// labels — direct port of QuickProp/ui/components/shared.jsx.

import type { ReactNode } from 'react';

interface FieldLabelProps {
  children: ReactNode;
}

export function FieldLabel({ children }: FieldLabelProps) {
  return (
    <div style={{
      fontSize: 10.5, letterSpacing: 0.6, color: 'var(--muted)',
      fontWeight: 600, textTransform: 'uppercase', marginBottom: 5,
    }}>{children}</div>
  );
}

interface FieldProps {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}

export function Field({ label, value, onChange, placeholder, type = 'text' }: FieldProps) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', height: 32, border: '1px solid var(--hair)', borderRadius: 6,
          padding: '0 10px', fontSize: 12.5, color: 'var(--ink)',
          fontFamily: 'var(--sans)', background: 'var(--surface)', outline: 'none',
        }}
      />
    </div>
  );
}

interface FieldMoneyProps {
  label: string;
  value: number | string | null | undefined;
  onChange: (n: number) => void;
}

export function FieldMoney({ label, value, onChange }: FieldMoneyProps) {
  const display = value === '' || value === undefined || value === null
    ? ''
    : Number(value).toLocaleString('en-US');
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        border: '1px solid var(--hair)', borderRadius: 6,
        padding: '0 10px', height: 32, background: 'var(--surface)',
      }}>
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>$</span>
        <input
          value={display}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^0-9.]/g, '');
            onChange(cleaned === '' ? 0 : parseFloat(cleaned));
          }}
          className="tabular"
          style={{
            flex: 1, border: 'none', outline: 'none', fontSize: 12.5,
            fontWeight: 600, background: 'transparent', fontFamily: 'var(--sans)',
          }}
        />
      </div>
    </div>
  );
}

interface TextAreaProps {
  value: string | null | undefined;
  onChange: (v: string) => void;
  minHeight?: number;
  placeholder?: string;
}

export function TextArea({ value, onChange, minHeight = 70, placeholder }: TextAreaProps) {
  return (
    <textarea
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
  );
}

interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (v: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div style={{ display: 'flex', background: 'var(--canvas-deep)', borderRadius: 7, padding: 3 }}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1, padding: '6px 10px', border: 'none',
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--ink)' : 'var(--muted)',
              borderRadius: 5, fontSize: 11.5, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--sans)',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
              transition: 'background .12s, color .12s',
            }}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
