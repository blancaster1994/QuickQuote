// QuickQuote domain types — placeholder shapes for Step 3.
//
// Step 4 (port the reducer + state types) fills out Proposal, Section,
// LaborRow, ExpenseRow, Lifecycle, Version, etc. For now this file carries
// only the small union types that surface on the IPC boundary so api.d.ts
// can be strongly typed where it's free to be.

export type ProposalStatus =
  | 'draft'
  | 'sent'
  | 'won'
  | 'lost'
  | 'archived';

export type LostReason =
  | 'price'
  | 'scope_mismatch'
  | 'timing'
  | 'competitor'
  | 'no_decision';

export type BillingType = 'fixed' | 'tm';

export type GeneratedFormat = 'docx' | 'pdf';

export type VersionStatus = 'draft' | 'final';

export type RateTableName = 'consulting' | 'structural';

/** Minimal user reference. Filled out properly in Step 4. */
export interface UserRef {
  email: string;
  name: string;
}

/** Result envelope for proposal generation (Step 7). */
export interface GenerateResult {
  ok: boolean;
  reused?: boolean;
  path?: string;
  filename?: string;
  format?: GeneratedFormat;
  error?: string;
}
