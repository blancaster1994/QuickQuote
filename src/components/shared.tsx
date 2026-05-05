// Shared input wrappers. Public signatures are stable so call sites in
// HeaderCard, modals, etc. don't need to change; internally these delegate
// to the unified primitives in components/ui so the app gets one consistent
// input style.

import type { ReactNode } from 'react';
import { Input, Textarea } from './ui';

interface FieldLabelProps {
  children: ReactNode;
}

export function FieldLabel({ children }: FieldLabelProps) {
  return (
    <div style={{
      fontSize: 'var(--label-size, 12px)',
      letterSpacing: 'var(--label-letter-spacing, 0.6px)',
      color: 'var(--label-color, var(--muted))',
      fontWeight: 'var(--label-weight, 600)' as React.CSSProperties['fontWeight'],
      textTransform: 'uppercase',
      marginBottom: 5,
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
      <Input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
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
      <Input
        type="text"
        value={display}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^0-9.]/g, '');
          onChange(cleaned === '' ? 0 : parseFloat(cleaned));
        }}
        prefix="$"
        className="tabular"
        style={{ fontWeight: 600 }}
      />
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
    <Textarea
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      minHeight={minHeight}
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
