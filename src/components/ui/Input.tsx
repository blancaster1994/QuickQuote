// Unified input primitives. Replace the inline-styled <input>/<textarea>/<select>
// scattered across HeaderCard, FeeCalculator, lookups editors, etc. New code
// should use these; existing callers compose them through Field wrappers in
// shared.tsx so call sites don't need to change.
//
// Three components, not one with a `kind` prop, because <input>, <textarea>,
// and <select> have different DOM event shapes and different supported attrs.

import type {
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

export type InputSize = 'sm' | 'md';
export type InputVariant = 'default' | 'money' | 'numeric';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  size?: InputSize;
  variant?: InputVariant;
  /** Visual adornment before the input (e.g. "$"). */
  prefix?: ReactNode;
  /** Visual adornment after the input (e.g. "%"). */
  suffix?: ReactNode;
  invalid?: boolean;
  /** When true, the field background swaps to --canvas on focus — used by
   *  FeeCalculator cell editors for editorial feedback. */
  focusFill?: boolean;
  /** When true, uses the darker --hair-strong border (FeeCalculator cells). */
  strongBorder?: boolean;
}

export function Input({
  size = 'md',
  variant = 'default',
  prefix,
  suffix,
  invalid,
  focusFill,
  strongBorder,
  style,
  className,
  ...rest
}: InputProps) {
  const inputClass = [variant === 'money' || variant === 'numeric' ? 'tabular' : '', className]
    .filter(Boolean).join(' ');
  const inputType = rest.type ?? (variant === 'money' || variant === 'numeric' ? 'number' : 'text');

  // No adornments: render bare <input> for minimal markup.
  if (prefix == null && suffix == null) {
    return (
      <input
        {...rest}
        type={inputType}
        className={inputClass || undefined}
        style={{ ...inputBaseStyle(size, !!invalid, !!strongBorder, !!focusFill), ...(style || {}) }}
      />
    );
  }

  // With adornments: wrap in a flex container so prefix/suffix stay outside
  // the input's text area but inside the bordered box.
  return (
    <div style={{
      ...wrapperStyle(size, !!invalid, !!strongBorder),
      ...(style || {}),
    }}>
      {prefix != null && <span style={adornmentStyle}>{prefix}</span>}
      <input
        {...rest}
        type={inputType}
        className={inputClass || undefined}
        style={{
          flex: 1, height: '100%', border: 'none', outline: 'none',
          background: 'transparent', fontSize: 12.5, color: 'var(--ink)',
          fontFamily: 'var(--sans)', minWidth: 0, padding: 0,
        }}
      />
      {suffix != null && <span style={adornmentStyle}>{suffix}</span>}
    </div>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /** Convenience: sets min-height in pixels. */
  minHeight?: number;
}

export function Textarea({
  invalid,
  minHeight = 70,
  style,
  ...rest
}: TextareaProps) {
  return (
    <textarea
      {...rest}
      style={{
        width: '100%', minHeight,
        border: `1px solid ${invalid ? 'var(--action-danger-edge)' : 'var(--hair)'}`,
        borderRadius: 'var(--radius-md, 6px)',
        padding: 10, fontSize: 13, lineHeight: 1.5,
        color: 'var(--body)', fontFamily: 'var(--sans)',
        resize: 'vertical', background: 'var(--surface)',
        outline: 'none',
        ...(style || {}),
      }}
    />
  );
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: InputSize;
  invalid?: boolean;
  strongBorder?: boolean;
}

export function Select({
  size = 'md',
  invalid,
  strongBorder,
  style,
  ...rest
}: SelectProps) {
  return (
    <select
      {...rest}
      style={{ ...inputBaseStyle(size, !!invalid, !!strongBorder, false), ...(style || {}) }}
    />
  );
}

// ── style internals ─────────────────────────────────────────────────────────

function inputBaseStyle(
  size: InputSize,
  invalid: boolean,
  strongBorder: boolean,
  focusFill: boolean,
): CSSProperties {
  const height = size === 'sm' ? 'var(--control-h-sm, 28px)' : 'var(--control-h-md, 32px)';
  const borderColor = invalid
    ? 'var(--action-danger-edge)'
    : strongBorder
      ? 'var(--hair-strong, #B8BEC8)'
      : 'var(--hair)';
  const base: CSSProperties = {
    width: '100%',
    height,
    padding: '0 10px',
    border: `1px solid ${borderColor}`,
    borderRadius: 'var(--radius-md, 6px)',
    background: 'var(--surface)',
    color: 'var(--ink)',
    fontSize: 12.5,
    fontFamily: 'var(--sans)',
    outline: 'none',
  };
  if (focusFill) {
    // The :focus pseudo can't be expressed in inline styles. Components that
    // opt into focusFill should layer a className-based rule, or rely on the
    // inline onFocus/onBlur pattern they already use. We just leave a hint
    // here via a CSS variable so consumers can read it back.
    (base as Record<string, unknown>)['--focus-fill'] = '1';
  }
  return base;
}

function wrapperStyle(size: InputSize, invalid: boolean, strongBorder: boolean): CSSProperties {
  const height = size === 'sm' ? 'var(--control-h-sm, 28px)' : 'var(--control-h-md, 32px)';
  const borderColor = invalid
    ? 'var(--action-danger-edge)'
    : strongBorder
      ? 'var(--hair-strong, #B8BEC8)'
      : 'var(--hair)';
  return {
    display: 'flex', alignItems: 'center', gap: 4,
    width: '100%', height,
    padding: '0 10px',
    border: `1px solid ${borderColor}`,
    borderRadius: 'var(--radius-md, 6px)',
    background: 'var(--surface)',
  };
}

const adornmentStyle: CSSProperties = {
  color: 'var(--muted)',
  fontSize: 11,
  fontFamily: 'var(--sans)',
  flex: '0 0 auto',
};
