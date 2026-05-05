// Horizontal tab strip below the project header. Mirrors BidItemTabs.tsx
// shape — same hairline bottom border, same active-2px-navy underline —
// but renders project phases instead of proposal sections.
//
// Each tab shows: phase number, name, project_type pill (FF / T&M),
// computed budget (sum of task hours × rate). The "+" button at the end
// adds a fresh phase. Drag-to-reorder via @dnd-kit; drop commits a
// REORDER_PHASES action which renumbers phase_no and updates resources
// that referenced the moved phase.

import type { Dispatch } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ProjectPhase } from '../../types/domain';
import type { ProjectEditorAction } from '../../state/projectReducer';
import { fmt$ } from '../../lib/formatting';

interface PhaseTabsProps {
  phases: ProjectPhase[];
  activeIndex: number;
  /** Per-phase budget rollup — sum of task hours × effective rate.
   *  Computed by ProjectEditor and passed in so this component stays
   *  presentational. Length matches phases.length. */
  budgets: number[];
  dispatch: Dispatch<ProjectEditorAction>;
  disabled?: boolean;
}

export default function PhaseTabs({ phases, activeIndex, budgets, dispatch, disabled }: PhaseTabsProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    if (disabled) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = phases.findIndex((p) => phaseId(p) === active.id);
    const toIndex = phases.findIndex((p) => phaseId(p) === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    dispatch({ type: 'REORDER_PHASES', fromIndex, toIndex });
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 4,
      borderBottom: '1px solid var(--hair)', overflowX: 'auto',
    }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={phases.map(phaseId)} strategy={horizontalListSortingStrategy}>
          {phases.map((p, i) => (
            <SortablePhaseTab
              key={phaseId(p)}
              phase={p}
              active={i === activeIndex}
              budget={budgets[i] ?? 0}
              draggable={!disabled}
              onClick={() => dispatch({ type: 'SET_ACTIVE_PHASE', index: i })}
            />
          ))}
        </SortableContext>
      </DndContext>
      {!disabled && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'ADD_PHASE' })}
          aria-label="Add phase"
          style={{
            padding: '10px 12px', border: 'none', background: 'transparent',
            fontSize: 18, color: 'var(--muted)', cursor: 'pointer',
            alignSelf: 'center', lineHeight: 1,
          }}>
          +
        </button>
      )}
    </div>
  );
}

function phaseId(p: ProjectPhase): string {
  return `phase-${p.phase_no}`;
}

interface SortablePhaseTabProps {
  phase: ProjectPhase;
  active: boolean;
  budget: number;
  draggable: boolean;
  onClick: () => void;
}

function SortablePhaseTab({ phase, active, budget, draggable, onClick }: SortablePhaseTabProps) {
  const sortable = useSortable({ id: phaseId(phase), disabled: !draggable });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      title={phase.name}
      {...attributes}
      {...(draggable ? listeners : {})}
      style={{
        padding: '10px 14px', border: 'none', background: 'transparent',
        borderBottom: `2px solid ${active ? 'var(--navy-deep)' : 'transparent'}`,
        cursor: isDragging ? 'grabbing' : 'pointer',
        fontFamily: 'var(--sans)', textAlign: 'left',
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        minWidth: 0, maxWidth: 240, flexShrink: 0,
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}>
      <span style={{
        fontSize: 12.5, fontWeight: active ? 600 : 500,
        color: active ? 'var(--ink)' : 'var(--body)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        minWidth: 0, width: '100%',
      }}>
        <span style={{ color: 'var(--muted)', marginRight: 4 }}>#{phase.phase_no}</span>
        {phase.name || `Phase ${phase.phase_no}`}
      </span>
      <div className="tabular" style={{
        fontSize: 10.5, color: 'var(--muted)', marginTop: 2,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          padding: '1px 5px', borderRadius: 3,
          background: phase.project_type === 'T&M' ? 'var(--status-draft-bg)' : 'var(--navy-tint)',
          color: phase.project_type === 'T&M' ? 'var(--status-draft-fg)' : 'var(--navy-deep)',
          fontWeight: 700, letterSpacing: 0.3,
        }}>{phase.project_type || 'FF'}</span>
        <span>{fmt$(budget)}</span>
      </div>
    </button>
  );
}
