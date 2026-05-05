// Unified table primitives. For lookups editors, Dashboard list, and any
// other "rows of data with row-level actions" surface. FeeCalculator stays
// on its CSS grid (its row-level state and dynamic cell types don't fit a
// generic <table> abstraction); the visual parity is achieved through the
// shared design tokens, not through this component.

import type {
  HTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react';

export type TableDensity = 'comfortable' | 'compact';

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  density?: TableDensity;
  children?: ReactNode;
}

export function Table({ density = 'comfortable', style, children, ...rest }: TableProps) {
  return (
    <table
      data-density={density}
      style={{
        width: '100%', borderCollapse: 'collapse',
        fontSize: 12.5, fontFamily: 'var(--sans)', color: 'var(--body)',
        ...(style || {}),
      }}
      {...rest}
    >
      {children}
    </table>
  );
}

export function THead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TR({ style, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      style={{ borderBottom: '1px solid var(--line)', ...(style || {}) }}
      {...rest}
    />
  );
}

export interface THProps extends ThHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

export function TH({ numeric, style, ...rest }: THProps) {
  return (
    <th
      style={{
        fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: 0.4, color: 'var(--muted)',
        textAlign: numeric ? 'right' : 'left',
        borderBottom: '1px solid var(--line)',
        background: 'var(--canvas)',
        // density: comfortable=8/12, compact=6/8 — applied via CSS data-attr
        // on parent, but for inline-styled callers we default to comfortable.
        padding: 'var(--space-3, 8px) var(--space-5, 12px)',
        ...(style || {}),
      }}
      {...rest}
    />
  );
}

export interface TDProps extends TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

export function TD({ numeric, style, ...rest }: TDProps) {
  return (
    <td
      style={{
        padding: 'var(--space-3, 8px) var(--space-5, 12px)',
        textAlign: numeric ? 'right' : 'left',
        fontVariantNumeric: numeric ? 'tabular-nums' : undefined,
        verticalAlign: 'middle',
        ...(style || {}),
      }}
      {...rest}
    />
  );
}
