// Unified button. Replaces the four button-style helpers that drifted in
// QuickQuote (pillButton/TextButton in TopBar, btnStyle in StatusComponents,
// primaryBtn/secondaryBtn/linkDangerBtn in HeaderCard). New code should use
// this component; existing code is being migrated incrementally.

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

export type ButtonVariant =
  | 'primary'      // navy filled — main CTA
  | 'secondary'    // surface bg + hair border — default
  | 'ghost'        // transparent + hair border — quiet action
  | 'text'         // bare text — tertiary action
  | 'success'      // green filled — Mark Won
  | 'danger'       // red filled — Mark Lost / destructive
  | 'danger-ghost'; // transparent + red text — destructive ghost

export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Slot before the label (e.g. an icon). */
  iconLeft?: ReactNode;
  /** Slot after the label. */
  iconRight?: ReactNode;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  iconLeft,
  iconRight,
  children,
  disabled,
  style,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = !!disabled;
  return (
    <button
      type={type}
      disabled={isDisabled}
      style={{ ...buttonStyle(variant, size, isDisabled), ...(style || {}) }}
      {...rest}
    >
      {iconLeft != null && <span style={{ display: 'inline-flex' }}>{iconLeft}</span>}
      {children}
      {iconRight != null && <span style={{ display: 'inline-flex' }}>{iconRight}</span>}
    </button>
  );
}

/** Square icon-only button — used for ×/remove affordances in tables. */
export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** 'danger' tints hover state red — for delete affordances. */
  tone?: 'neutral' | 'danger';
  size?: 'sm' | 'md';
  label: string;          // accessible label (also used as title)
  children: ReactNode;
}

export function IconButton({
  tone = 'neutral',
  size = 'md',
  label,
  children,
  style,
  type = 'button',
  disabled,
  ...rest
}: IconButtonProps) {
  const dim = size === 'sm' ? 22 : 26;
  const base: CSSProperties = {
    width: dim, height: dim, padding: 0,
    border: '1px solid transparent',
    borderRadius: 5,
    background: 'transparent',
    color: 'var(--muted)',
    fontSize: size === 'sm' ? 13 : 15,
    lineHeight: 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--sans)',
    display: 'inline-grid',
    placeItems: 'center',
    transition: 'background .12s, color .12s, border-color .12s',
  };
  // Tone-specific hover handled inline via onMouseEnter/Leave for parity with
  // .lookups-body button.delete-x hover. Keeping it inline avoids a CSS file
  // for a single component.
  return (
    <button
      type={type}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{ ...base, ...(style || {}) }}
      onMouseEnter={(e) => {
        if (disabled) return;
        const el = e.currentTarget;
        if (tone === 'danger') {
          el.style.background = 'var(--action-danger-tint)';
          el.style.color = 'var(--action-danger)';
          el.style.borderColor = 'var(--action-danger-edge)';
        } else {
          el.style.background = 'var(--canvas-deep)';
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = 'transparent';
        el.style.color = 'var(--muted)';
        el.style.borderColor = 'transparent';
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// ── style internals ─────────────────────────────────────────────────────────

function buttonStyle(variant: ButtonVariant, size: ButtonSize, disabled: boolean): CSSProperties {
  const base: CSSProperties = {
    height: size === 'sm' ? 26 : 30,
    padding: size === 'sm' ? '0 10px' : '0 12px',
    borderRadius: 6,
    fontSize: size === 'sm' ? 11.5 : 12,
    fontWeight: variant === 'text' ? 500 : 600,
    fontFamily: 'var(--sans)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
    opacity: disabled ? 0.55 : 1,
    transition: 'background .12s, color .12s, border-color .12s',
  };
  return { ...base, ...variantStyle(variant) };
}

function variantStyle(variant: ButtonVariant): CSSProperties {
  switch (variant) {
    case 'primary':
      return { background: 'var(--navy-deep)', color: '#fff', border: '1px solid var(--navy-deep)' };
    case 'success':
      return { background: 'var(--action-success)', color: '#fff', border: '1px solid var(--action-success)' };
    case 'danger':
      return { background: 'var(--action-danger)', color: '#fff', border: '1px solid var(--action-danger)' };
    case 'ghost':
      return { background: 'transparent', color: 'var(--body)', border: '1px solid var(--hair)' };
    case 'danger-ghost':
      return { background: 'transparent', color: 'var(--action-danger)', border: '1px solid var(--action-danger-edge)' };
    case 'text':
      return { background: 'transparent', color: 'var(--body)', border: '1px solid transparent' };
    case 'secondary':
    default:
      return { background: 'var(--surface)', color: 'var(--body)', border: '1px solid var(--hair)' };
  }
}
