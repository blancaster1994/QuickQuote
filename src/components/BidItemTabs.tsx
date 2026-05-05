// Horizontal tab strip below the header card. Each tab shows the section
// title (or a "Bid Item N" fallback when blank) with billing + fee underneath.
// Active tab gets a 2px navy bottom border that shares edges with the
// SectionEditor panel sitting directly below.
//
// Drag-to-reorder: each tab is a sortable item under a horizontal-listing
// SortableContext. Drag commits a REORDER_SECTIONS action on drop only —
// no intermediate states fire through autosave.

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
import type { Section } from '../types/domain';
import type { EditorAction } from '../state/editorReducer';
import type { SectionTotalsRow } from '../lib/calc';
import { fmt$ } from '../lib/formatting';

export interface BidItemTabsProps {
  sections: Section[];
  totals: SectionTotalsRow[];
  activeSection: string;
  dispatch: Dispatch<EditorAction>;
}

function shortTitle(s: Section, i: number): string {
  const raw = (s.title || '').replace(/^Bid Item \d+\s*[—\-:]\s*/i, '').trim();
  return raw || `Bid Item ${i + 1}`;
}

export default function BidItemTabs({ sections, totals, activeSection, dispatch }: BidItemTabsProps) {
  // 6px movement before drag starts so single-clicks (tab switching) still
  // work normally — only deliberate drags trigger reorder.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = sections.findIndex((s) => s.id === active.id);
    const toIndex = sections.findIndex((s) => s.id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    dispatch({ type: 'REORDER_SECTIONS', fromIndex, toIndex });
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 4,
      borderBottom: '1px solid var(--hair)', overflowX: 'auto',
    }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map(s => s.id)} strategy={horizontalListSortingStrategy}>
          {sections.map((s, i) => (
            <SortableTab
              key={s.id}
              section={s}
              index={i}
              totals={totals}
              active={s.id === activeSection}
              onClick={() => dispatch({ type: 'SET_ACTIVE_SECTION', id: s.id })}
            />
          ))}
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={() => dispatch({ type: 'ADD_SECTION' })}
        title="Add a new bid item"
        style={{
          padding: '8px 12px', border: 'none', background: 'transparent',
          fontSize: 12, fontWeight: 600, color: 'var(--navy-deep)', cursor: 'pointer',
          alignSelf: 'center', lineHeight: 1,
          fontFamily: 'var(--sans)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
        Add bid item
      </button>
    </div>
  );
}

interface SortableTabProps {
  section: Section;
  index: number;
  totals: SectionTotalsRow[];
  active: boolean;
  onClick: () => void;
}

function SortableTab({ section, index, totals, active, onClick }: SortableTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id });
  const t = totals.find((x) => x.id === section.id);
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      title={section.title}
      {...attributes}
      {...listeners}
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
        {shortTitle(section, index)}
      </span>
      <div className="tabular" style={{
        fontSize: 10.5, color: 'var(--muted)', marginTop: 2,
      }}>
        {section.billing === 'fixed' ? 'Fixed' : 'T&M'} · {fmt$(t?.fee ?? section.fee ?? 0)}
      </div>
    </button>
  );
}
