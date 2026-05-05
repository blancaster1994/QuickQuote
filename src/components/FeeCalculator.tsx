// Fee calculator — labor table with employee avatars + expenses table.
// Direct port of QuickProp's FeeCalculator.jsx.
//
// Labor rate auto-fills from the employee's category via the active rate
// table, but any value can be overridden by typing in the Rate cell.

import { useMemo, type CSSProperties, type Dispatch } from 'react';
import { fmt$, fmt$$ } from '../lib/formatting';
import type {
  Bootstrap, EmployeeRecord, ExpenseRow, LaborRow, Section,
} from '../types/domain';
import type { EditorAction, EditorState } from '../state/editorReducer';
import type { SectionTotals } from '../lib/calc';

interface FeeCalculatorProps {
  section: Section;
  total: SectionTotals;
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}

export default function FeeCalculator({ section, total, state, dispatch }: FeeCalculatorProps) {
  const { bootstrap, proposal } = state;
  if (!bootstrap) return null;

  const lookupRate = useMemo(() => {
    const rates = proposal.rateTable === 'structural'
      ? bootstrap.structural_rates
      : bootstrap.consulting_rates;
    return (empName: string, category: string): number => {
      if (empName) {
        const emp = bootstrap.employees.find((e) => e.name === empName);
        if (emp) {
          const key = bootstrap.category_mapping[emp.category];
          if (key && rates[key] != null) return rates[key];
        }
      }
      if (category && rates[category] != null) return rates[category];
      return 0;
    };
  }, [bootstrap, proposal.rateTable]);

  const empByName = useMemo(
    () => Object.fromEntries(bootstrap.employees.map((e) => [e.name, e])),
    [bootstrap.employees],
  );
  const expenseByName = useMemo(
    () => Object.fromEntries(bootstrap.expense_lines.map((x) => [x.name, x])),
    [bootstrap.expense_lines],
  );

  const patchLabor = (i: number, p: Partial<LaborRow>) =>
    dispatch({ type: 'UPDATE_LABOR_ROW', id: section.id, index: i, patch: p });
  const addLabor = () => dispatch({ type: 'ADD_LABOR_ROW', id: section.id });
  const removeLabor = (i: number) => dispatch({ type: 'REMOVE_LABOR_ROW', id: section.id, index: i });
  const patchExpense = (i: number, p: Partial<ExpenseRow>) =>
    dispatch({ type: 'UPDATE_EXPENSE', id: section.id, index: i, patch: p });
  const addExpense = () => dispatch({ type: 'ADD_EXPENSE', id: section.id });
  const removeExpense = (i: number) => dispatch({ type: 'REMOVE_EXPENSE', id: section.id, index: i });

  const onEmployeeChange = (i: number, name: string) => {
    const current = section.labor[i];
    const emp = empByName[name];
    const patch: Partial<LaborRow> = { employee: name };
    if (emp) {
      patch.category = bootstrap.category_mapping[emp.category] || emp.category;
    }
    const effectiveCategory = patch.category ?? current.category;
    const newRate = lookupRate(name, effectiveCategory);
    if (newRate > 0) patch.rate = newRate;
    patchLabor(i, patch);
  };

  const onCategoryChange = (i: number, cat: string) => {
    const current = section.labor[i];
    const newRate = lookupRate(current.employee, cat);
    const patch: Partial<LaborRow> = { category: cat };
    if (newRate > 0) patch.rate = newRate;
    patchLabor(i, patch);
  };

  const onExpenseItemChange = (i: number, name: string) => {
    const patch: Partial<ExpenseRow> = { item: name };
    const def = expenseByName[name];
    if (def) {
      if (!section.expenses[i].unit) patch.unit = def.qty_unit;
      if (!section.expenses[i].unitCost) patch.unitCost = def.default_rate;
    }
    patchExpense(i, patch);
  };

  return (
    <div style={{
      marginTop: 10, border: '1px solid var(--hair)', borderRadius: 8, overflow: 'hidden',
    }}>
      {/* Labor table */}
      <TableHeader cols="1.1fr 1.2fr 70px 80px 90px 28px"
        labels={['Category', 'Employee', 'Hours', 'Rate', 'Total', '']} />
      {section.labor.length === 0 && (
        <EmptyRow text="No labor rows yet — add a role to build up the fee." />
      )}
      {section.labor.map((r, i) => (
        <LaborRowEditor key={i} row={r} emp={empByName[r.employee]}
          onCategory={(v) => onCategoryChange(i, v)}
          onEmployee={(v) => onEmployeeChange(i, v)}
          onHours={(v) => patchLabor(i, { hrs: v })}
          onRate={(v) => patchLabor(i, { rate: v })}
          onRemove={() => removeLabor(i)} />
      ))}

      {/* Labor subtotal */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1.1fr 1.2fr 70px 80px 90px 28px',
        padding: '8px 12px', borderTop: '1px solid var(--line)', background: 'var(--canvas)',
        alignItems: 'center', fontSize: 11.5, color: 'var(--muted)',
      }}>
        <div style={{ gridColumn: '3 / span 2', textAlign: 'right', padding: '0 7px' }}>Labor Total</div>
        <div className="tabular" style={{
          gridColumn: '5 / span 1',
          textAlign: 'right', color: 'var(--ink)', fontWeight: 600, padding: '0 7px',
        }}>{fmt$(total.labor)}</div>
      </div>

      {/* Expenses */}
      <TableHeader cols="1.4fr 70px 70px 90px 70px 90px 28px"
        labels={['Expense', 'Qty', 'Unit', 'Unit cost', 'Markup %', 'Total', '']}
        top />
      {section.expenses.length === 0 && (
        <EmptyRow text="No expenses yet — add mileage, airfare, per diem, or a custom line." />
      )}
      {section.expenses.map((e, i) => (
        <ExpenseRowEditor key={i} row={e}
          onItem={(v) => onExpenseItemChange(i, v)}
          onQty={(v) => patchExpense(i, { qty: v })}
          onUnit={(v) => patchExpense(i, { unit: v })}
          onUnitCost={(v) => patchExpense(i, { unitCost: v })}
          onMarkup={(v) => patchExpense(i, { markup: v })}
          onRemove={() => removeExpense(i)} />
      ))}

      {/* Footer */}
      <div style={{
        padding: '10px 12px', borderTop: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', gap: 16, background: 'var(--surface)',
      }}>
        <button type="button" onClick={addLabor} style={addBtnStyle}>+ Add role</button>
        <button type="button" onClick={addExpense} style={{ ...addBtnStyle, fontWeight: 500 }}>+ Add expense</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Expenses</span>
        <span className="tabular" style={{
          fontSize: 12, fontWeight: 600, minWidth: 70, textAlign: 'right',
        }}>
          {fmt$(total.expenses)}
        </span>
        <div style={{ width: 1, height: 20, background: 'var(--hair)' }} />
        <span style={{
          fontSize: 11, color: 'var(--muted)', fontWeight: 600,
          letterSpacing: 0.4, textTransform: 'uppercase',
        }}>
          Grand total
        </span>
        <span className="tabular" style={{
          fontSize: 14, fontWeight: 700, color: 'var(--navy-deep)',
          minWidth: 90, textAlign: 'right',
        }}>
          {fmt$(total.grand)}
        </span>
      </div>

      {/* Shared autocomplete lists */}
      <datalist id="qq-rate-cats">
        {bootstrap.rate_categories.map((c) => <option key={c} value={c} />)}
      </datalist>
      <datalist id="qq-employees">
        {bootstrap.employees.map((e) => <option key={e.name} value={e.name}>{e.category}</option>)}
      </datalist>
      <datalist id="qq-expense-items">
        {bootstrap.expense_lines.map((x) => (
          <option key={x.name} value={x.name}>{x.qty_unit} · ${x.default_rate}</option>
        ))}
      </datalist>
    </div>
  );
}

// ── small building blocks ──────────────────────────────────────────────────

function TableHeader({ cols, labels, top }: { cols: string; labels: string[]; top?: boolean }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: cols,
      padding: '8px 12px', background: 'var(--canvas)',
      fontSize: 10.5, color: 'var(--muted)', letterSpacing: 0.6,
      textTransform: 'uppercase', fontWeight: 600,
      borderTop: top ? '1px solid var(--hair)' : 'none',
    }}>
      {labels.map((l, i) => (
        <div key={i} style={{
          padding: '0 7px',
          textAlign: i >= 2 && i < labels.length - 1 ? 'right' : 'left',
        }}>{l}</div>
      ))}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{
      padding: '10px 12px', borderTop: '1px solid var(--line)',
      color: 'var(--muted)', fontSize: 12, fontStyle: 'italic',
    }}>
      {text}
    </div>
  );
}

interface LaborRowEditorProps {
  row: LaborRow;
  emp: EmployeeRecord | undefined;
  onCategory: (v: string) => void;
  onEmployee: (v: string) => void;
  onHours: (v: number) => void;
  onRate: (v: number) => void;
  onRemove: () => void;
}

function LaborRowEditor({ row, emp, onCategory, onEmployee, onHours, onRate, onRemove }: LaborRowEditorProps) {
  const total = (Number(row.hrs) || 0) * (Number(row.rate) || 0);
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1.1fr 1.2fr 70px 80px 90px 28px',
      padding: '8px 12px', borderTop: '1px solid var(--line)', alignItems: 'center',
      fontSize: 12.5,
    }}>
      <CellInput list="qq-rate-cats" value={row.category} onChange={onCategory} placeholder="Category" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, padding: '0 7px' }}>
        {emp
          ? <Avatar bg={emp.color} text={emp.initials} />
          : <div style={{
              width: 20, height: 20, borderRadius: '50%', background: 'var(--canvas-deep)',
              color: 'var(--subtle)', display: 'grid', placeItems: 'center',
              fontSize: 10, fontWeight: 600, flexShrink: 0,
            }}>—</div>}
        <CellInput list="qq-employees" value={row.employee} onChange={onEmployee}
          placeholder="Employee (or leave blank)" style={{ flex: 1, padding: 0 }} />
      </div>
      <CellNumber value={row.hrs} onChange={onHours} />
      <CellNumber value={row.rate} onChange={onRate} prefix="$" />
      <div className="tabular" style={{ textAlign: 'right', fontWeight: 600, padding: '0 7px' }}>
        {fmt$(total)}
      </div>
      <button type="button" onClick={onRemove} aria-label="Remove role" style={removeBtnStyle}>×</button>
    </div>
  );
}

interface ExpenseRowEditorProps {
  row: ExpenseRow;
  onItem: (v: string) => void;
  onQty: (v: number) => void;
  onUnit: (v: string) => void;
  onUnitCost: (v: number) => void;
  onMarkup: (v: number) => void;
  onRemove: () => void;
}

function ExpenseRowEditor({ row, onItem, onQty, onUnit, onUnitCost, onMarkup, onRemove }: ExpenseRowEditorProps) {
  const total = (Number(row.qty) || 0) * (Number(row.unitCost) || 0) * (1 + (Number(row.markup) || 0) / 100);
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1.4fr 70px 70px 90px 70px 90px 28px',
      padding: '8px 12px', borderTop: '1px solid var(--line)', alignItems: 'center',
      fontSize: 12.5,
    }}>
      <CellInput list="qq-expense-items" value={row.item} onChange={onItem}
        placeholder="Mileage, Per Diem, …" />
      <CellNumber value={row.qty} onChange={onQty} />
      <CellInput value={row.unit} onChange={onUnit} placeholder="Unit" />
      <CellNumber value={row.unitCost} onChange={onUnitCost} prefix="$" />
      <CellNumber value={row.markup} onChange={onMarkup} suffix="%" />
      <div className="tabular" style={{ textAlign: 'right', fontWeight: 600, padding: '0 7px' }}>
        {fmt$$(total)}
      </div>
      <button type="button" onClick={onRemove} aria-label="Remove expense" style={removeBtnStyle}>×</button>
    </div>
  );
}

function Avatar({ bg, text }: { bg: string; text: string }) {
  return (
    <div style={{
      width: 20, height: 20, borderRadius: '50%', background: bg || 'var(--subtle)',
      color: '#fff', display: 'grid', placeItems: 'center',
      fontSize: 9, fontWeight: 700, flexShrink: 0,
    }}>{text}</div>
  );
}

interface CellInputProps {
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  list?: string;
  style?: CSSProperties;
}

function CellInput({ value, onChange, placeholder, list, style }: CellInputProps) {
  return (
    <input value={value ?? ''} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} list={list}
      style={{
        width: '100%', height: 26, border: '1px solid #B8BEC8', borderRadius: 5,
        padding: '0 7px', fontSize: 12.5, background: 'var(--surface)',
        color: 'var(--ink)', fontFamily: 'var(--sans)', outline: 'none',
        ...(style || {}),
      }}
      onFocus={(e) => { e.currentTarget.style.background = 'var(--canvas)'; e.currentTarget.style.borderColor = 'var(--navy-deep)'; }}
      onBlur={(e) => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = '#B8BEC8'; }} />
  );
}

interface CellNumberProps {
  value: number | undefined;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
}

function CellNumber({ value, onChange, prefix, suffix }: CellNumberProps) {
  return (
    <label style={{ position: 'relative', display: 'block', height: 26, cursor: 'text' }}>
      <input type="number" step="any"
        value={value === 0 ? '' : (value ?? '')}
        onChange={(e) => onChange(e.target.value === '' ? 0 : parseFloat(e.target.value))}
        className="tabular"
        style={{
          width: '100%', height: '100%', boxSizing: 'border-box',
          border: '1px solid #B8BEC8', outline: 'none',
          background: 'var(--surface)', borderRadius: 5,
          paddingTop: 0, paddingBottom: 0,
          paddingLeft: prefix ? 18 : 7,
          paddingRight: suffix ? 18 : 7,
          fontSize: 12.5, textAlign: 'right',
          fontFamily: 'var(--sans)', color: 'var(--ink)',
        }}
        onFocus={(e) => { e.currentTarget.style.background = 'var(--canvas)'; e.currentTarget.style.borderColor = 'var(--navy-deep)'; }}
        onBlur={(e) => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = '#B8BEC8'; }} />
      {prefix && (
        <span style={{
          position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--muted)', fontSize: 11, pointerEvents: 'none',
        }}>{prefix}</span>
      )}
      {suffix && (
        <span style={{
          position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--muted)', fontSize: 11, pointerEvents: 'none',
        }}>{suffix}</span>
      )}
    </label>
  );
}

const addBtnStyle: CSSProperties = {
  border: 'none', background: 'transparent', color: 'var(--navy-deep)',
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'var(--sans)', padding: 0,
};

const removeBtnStyle: CSSProperties = {
  width: 24, height: 24, padding: 0, background: 'transparent',
  border: 'none', color: 'var(--subtle)', fontSize: 16, cursor: 'pointer',
  borderRadius: 4,
};
