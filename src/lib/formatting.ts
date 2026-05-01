// Currency formatters + number-to-words + fee-sentence builder.
//
// Must stay byte-identical to QuickProp/quickprop/formatting.py — both sides
// produce the same fee phrase, since the live preview must read identically
// to the generated .docx / .pdf.

import type { BillingType } from '../types/domain';

// ── currency ────────────────────────────────────────────────────────────────

export function fmt$(n: number | string | null | undefined): string {
  return '$' + (Number(n) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function fmt$$(n: number | string | null | undefined): string {
  return '$' + (Number(n) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── number-to-words ─────────────────────────────────────────────────────────

const _ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
  'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
  'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const _TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy',
  'Eighty', 'Ninety',
];

export function numberToWords(n: number): string {
  if (n === 0) return 'Zero';
  if (n < 0) return 'Negative ' + numberToWords(-n);

  function chunk(num: number): string {
    if (num === 0) return '';
    if (num < 20) return _ONES[num];
    if (num < 100) {
      const rest = _ONES[num % 10];
      return _TENS[Math.floor(num / 10)] + (rest ? '-' + rest : '');
    }
    const rest = chunk(num % 100);
    return _ONES[Math.floor(num / 100)] + ' Hundred' + (rest ? ' ' + rest : '');
  }

  const parts: string[] = [];
  for (const [divisor, label] of [
    [1_000_000, ' Million'],
    [1_000, ' Thousand'],
    [1, ''],
  ] as const) {
    const group = Math.floor(n / divisor);
    n %= divisor;
    if (group) parts.push(chunk(group) + label);
  }
  return parts.join(' ');
}

// ── fee phrase ──────────────────────────────────────────────────────────────

export function formatFeeForDoc(raw: number | string | null | undefined): string {
  if (raw === '' || raw === undefined || raw === null) return '';
  const value = typeof raw === 'number'
    ? raw
    : parseFloat(String(raw).replace(/[,\s$]/g, ''));
  if (!isFinite(value)) return String(raw);
  const rounded = value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
  const words = numberToWords(rounded);
  const formatted = value === Math.floor(value)
    ? '$' + Math.floor(value).toLocaleString('en-US')
    : '$' + value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
  return `${words} (${formatted})`;
}

export function buildFeeText(
  fee: number | string | null | undefined,
  billing: BillingType,
  nte: boolean,
): string {
  if (billing === 'tm') {
    const base = 'Fees for these services shall be billed on a time and material '
      + 'basis in accordance with the attached schedule of professional services';
    if (nte && fee && Number(fee) !== 0) {
      return base + ' up to a “Not-to-Exceed” amount of '
        + formatFeeForDoc(fee) + ' dollars.';
    }
    return base + '.';
  }
  return 'The fee for these services shall be a fixed fee price of '
    + formatFeeForDoc(fee) + ' dollars. Additional work above the scope '
    + 'referenced above will be billed on an hourly basis in accordance with '
    + 'the attached schedule of professional services.';
}
