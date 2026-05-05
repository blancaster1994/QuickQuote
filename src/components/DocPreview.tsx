// Live preview that approximates the Word template's rendered output.
// Direct port of QuickProp's DocPreview.jsx.
//
// Template facts driving these styles:
//   - Normal style uses Times New Roman
//   - Body Text + Heading 1 are both 12pt (bold = emphasis)
//   - Page margins 0.33in top / 0.71in bottom / 0.82in left+right
//   - Header has a tiny 7.5pt Arial address block top-right

import type { ReactNode } from 'react';
import { buildFeeText, fmt$ } from '../lib/formatting';
import type { Proposal, Section } from '../types/domain';
import type { SectionTotalsRow } from '../lib/calc';

const INK = '#000';
const BODY = '#111';

const BODY_FONT = '"Times New Roman", Times, serif';
const HEADER_FONT = 'Arial, Helvetica, sans-serif';

const PAGE_WIDTH = 612;
const PAGE_PAD_T = 22;
const PAGE_PAD_B = 48;
const PAGE_PAD_LR = 60;

interface DocPreviewProps {
  proposal: Proposal;
  totals: SectionTotalsRow[];
  sum: number;
  activeSection: string;
}

export default function DocPreview({ proposal, sum, activeSection }: DocPreviewProps) {
  const multiSection = proposal.sections.length > 1;

  return (
    <div id="doc-preview"
      style={{
        width: PAGE_WIDTH, background: '#fff', borderRadius: 3,
        boxShadow: '0 2px 20px rgba(20,20,30,0.12), 0 0 0 1px rgba(0,0,0,.04)',
        padding: `${PAGE_PAD_T}px ${PAGE_PAD_LR}px ${PAGE_PAD_B}px`,
        fontFamily: BODY_FONT, fontSize: 12, color: INK, lineHeight: 1.3,
        alignSelf: 'flex-start',
      }}>
      <PageHeader />
      <Title>PROPOSAL FOR ENGINEERING SERVICES</Title>

      <LabeledBlock label="PROJECT:">
        <Bold>{proposal.name}</Bold>
        {proposal.address && <Bold>{proposal.address}</Bold>}
        {proposal.cityStateZip && <Bold>{proposal.cityStateZip}</Bold>}
      </LabeledBlock>

      <Spacer h={12} />

      <LabeledBlock label="CLIENT:">
        <Bold>{proposal.client}</Bold>
        {proposal.contact && <Bold>Attn. {proposal.contact}</Bold>}
        {proposal.clientAddress && <Bold>{proposal.clientAddress}</Bold>}
        {proposal.clientCityStateZip && <Bold>{proposal.clientCityStateZip}</Bold>}
      </LabeledBlock>

      <Spacer h={12} />

      <LabeledBlock label="DATE:"><Bold>{proposal.date}</Bold></LabeledBlock>

      <Spacer h={14} />

      <BodyPara>
        Childress Engineering Services, Inc. (CES) is pleased to submit this
        proposal for Professional Services at the facility referenced above.
      </BodyPara>

      {proposal.sections.map((s, i) => (
        <SectionBlock key={s.id} section={s} index={i} isActive={s.id === activeSection} />
      ))}

      {multiSection && <GrandTotal sum={sum} />}
    </div>
  );
}

function PageHeader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      marginBottom: 18,
    }}>
      <img src="/logo.png" alt="CES"
        style={{ height: 52, width: 'auto', objectFit: 'contain' }} />
      <div style={{
        textAlign: 'right',
        fontFamily: HEADER_FONT, fontSize: 8, color: BODY, lineHeight: 1.55,
      }}>
        2505 N Plano Rd.<br />
        Suite 4000<br />
        Richardson, TX 75082<br />
        214.451.6630 P<br />
        214.451.6631 F
      </div>
    </div>
  );
}

function Title({ children }: { children: ReactNode }) {
  return (
    <div style={{
      textAlign: 'center', fontWeight: 700, fontSize: 13,
      marginBottom: 18, marginTop: 4,
    }}>
      {children}
    </div>
  );
}

function LabeledBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '80px 1fr',
      columnGap: 4, fontSize: 12, alignItems: 'baseline',
    }}>
      <div style={{ fontWeight: 700 }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}

function Bold({ children, inline }: { children: ReactNode; inline?: boolean }) {
  if (inline) {
    return <span style={{ fontWeight: 700 }}>{children}</span>;
  }
  return <div style={{ fontWeight: 700 }}>{children}</div>;
}

function BodyPara({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontSize: 12, textAlign: 'justify',
      marginBottom: 12, color: INK,
    }}>
      {children}
    </div>
  );
}

function Spacer({ h }: { h: number }) {
  return <div style={{ height: h }} />;
}

function SectionBlock({ section, index, isActive }: { section: Section; index: number; isActive: boolean }) {
  const title = (section.title || '').trim() || `Bid Item ${index + 1}`;
  const feeSentence = buildFeeText(section.fee, section.billing, false);

  return (
    <div data-section-active={isActive ? 'true' : undefined}
      style={{
        padding: '8px 10px', margin: '0 -10px 4px',
        borderRadius: 3,
        background: isActive ? 'rgba(23,65,111,0.045)' : 'transparent',
        boxShadow: isActive ? 'inset 0 0 0 1.5px rgba(23,65,111,0.22)' : 'none',
        transition: 'background .15s, box-shadow .15s',
      }}>
      {isActive && (
        <div data-editing-label="true" style={{
          fontFamily: HEADER_FONT, fontSize: 7.5, letterSpacing: 1,
          color: '#0F2D4E', fontWeight: 700, marginBottom: 6,
        }}>
          ▸ EDITING
        </div>
      )}

      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
        {title}:
      </div>

      {section.scope && (
        <RichText text={section.scope} />
      )}

      {section.exclusions && section.exclusions.trim() && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            Scope specifically excluded:
          </div>
          <RichText text={section.exclusions} />
        </>
      )}

      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
        PROPOSED FEE:
      </div>
      <div style={{ fontSize: 12, textAlign: 'justify' }}>
        {feeSentence}
      </div>
    </div>
  );
}

function GrandTotal({ sum }: { sum: number }) {
  return (
    <div style={{
      marginTop: 14, paddingTop: 10,
      borderTop: '1px solid #666',
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700 }}>
        TOTAL PROPOSED FEE:
      </div>
      <div className="tabular" style={{ fontSize: 13, fontWeight: 700 }}>
        {fmt$(sum)}
      </div>
    </div>
  );
}

// Mirror of the DOCX-side list rendering: lines starting with "- " or "* "
// group into a <ul>; "1. " / "2. " etc. group into an <ol>; everything else
// renders as a justified paragraph block. Keeps the editor and the generated
// document in visual sync.
type RichTextBlock =
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'p'; lines: string[] };

function parseRichText(text: string): RichTextBlock[] {
  const blocks: RichTextBlock[] = [];
  for (const raw of text.split('\n')) {
    const bul = /^\s*[-*]\s+(.*)$/.exec(raw);
    const num = /^\s*\d+\.\s+(.*)$/.exec(raw);
    const last = blocks[blocks.length - 1];
    if (bul) {
      if (last && last.kind === 'ul') last.items.push(bul[1]);
      else blocks.push({ kind: 'ul', items: [bul[1]] });
    } else if (num) {
      if (last && last.kind === 'ol') last.items.push(num[1]);
      else blocks.push({ kind: 'ol', items: [num[1]] });
    } else {
      if (last && last.kind === 'p') last.lines.push(raw);
      else blocks.push({ kind: 'p', lines: [raw] });
    }
  }
  return blocks;
}

function RichText({ text }: { text: string }) {
  const blocks = parseRichText(text);
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === 'ul') {
          return (
            <ul key={i} style={{ fontSize: 12, margin: '0 0 12px 0', paddingLeft: 22 }}>
              {b.items.map((it, j) => <li key={j} style={{ textAlign: 'justify' }}>{it}</li>)}
            </ul>
          );
        }
        if (b.kind === 'ol') {
          return (
            <ol key={i} style={{ fontSize: 12, margin: '0 0 12px 0', paddingLeft: 22 }}>
              {b.items.map((it, j) => <li key={j} style={{ textAlign: 'justify' }}>{it}</li>)}
            </ol>
          );
        }
        return (
          <div key={i} style={{
            fontSize: 12, textAlign: 'justify',
            marginBottom: 12, whiteSpace: 'pre-wrap',
          }}>
            {b.lines.join('\n')}
          </div>
        );
      })}
    </>
  );
}
