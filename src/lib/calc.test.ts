import { describe, it, expect } from 'vitest';
import { calcSection, calcProposal } from './calc';
import type { Proposal, Section } from '../types/domain';

const blankSection = (overrides: Partial<Section> = {}): Section => ({
  id: 's1',
  title: '',
  scope: '',
  exclusions: '',
  billing: 'fixed',
  fee: 0,
  notes: '',
  labor: [],
  expenses: [],
  ...overrides,
});

describe('calcSection', () => {
  it('returns zero for an empty section', () => {
    expect(calcSection(blankSection())).toEqual({ labor: 0, expenses: 0, grand: 0 });
  });

  it('sums labor as hrs × rate', () => {
    const t = calcSection(
      blankSection({
        labor: [
          { category: 'PM', employee: 'A', hrs: 10, rate: 150 },
          { category: 'EIT', employee: 'B', hrs: 5, rate: 200 },
        ],
      }),
    );
    expect(t.labor).toBe(2500);
    expect(t.expenses).toBe(0);
    expect(t.grand).toBe(2500);
  });

  it('applies markup to expenses', () => {
    const t = calcSection(
      blankSection({
        expenses: [{ item: 'Travel', qty: 2, unit: 'ea', unitCost: 100, markup: 10 }],
      }),
    );
    expect(t.expenses).toBeCloseTo(220, 5);
  });
});

describe('calcProposal', () => {
  it('sums fee across sections (NOT computed grand)', () => {
    const r = calcProposal({
      sections: [blankSection({ id: 'a', fee: 1000 }), blankSection({ id: 'b', fee: 2500 })],
    } as Proposal);
    expect(r.sum).toBe(3500);
    expect(r.totals).toHaveLength(2);
  });
});
