// Proposal version snapshots. Mutates `proposal.lifecycle.versions[]` in
// place — caller persists via queries.mutateAndSave.
//
// Mirror of QuickProp/quickprop/versioning.py. File-scanning for
// `Generated Proposals/<Project>/...` (the `files` field on each version) is
// deferred to Step 7 when generation lands; for now we record an empty
// files[] which is fine because no files have been generated yet.

import { ensureLifecycle, type Actor } from '../db/queries';

function utcNowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function stripLifecycle(proposal: any): any {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(proposal || {})) {
    if (k !== 'lifecycle') out[k] = v;
  }
  return out;
}

/**
 * Snapshot the current proposal as a new version on its lifecycle. Returns
 * the appended record. Mutates `proposal.lifecycle.versions` in place.
 *
 * The version's `proposal` field is a deep copy of the current content (sans
 * lifecycle — lifecycle is only tracked on the live record, not duplicated
 * inside every snapshot). The `files` field is left empty for now; Step 7
 * will populate it from `Generated Proposals/<Project>/`.
 */
export function createVersion(proposal: any, actor: Actor, note = ''): any {
  ensureLifecycle(proposal, actor);
  const lc = proposal.lifecycle;
  if (!Array.isArray(lc.versions)) lc.versions = [];
  const n = lc.versions.length + 1;

  const record = {
    version:             n,
    label:               `v${n}`,
    snapshot_at:         utcNowIso(),
    snapshot_by:         { email: actor.email || '', name: actor.name || '' },
    status_at_snapshot:  lc.status,
    proposal:            JSON.parse(JSON.stringify(stripLifecycle(proposal))),
    files:               [] as Array<{ path: string; kind: 'docx' | 'pdf' }>,
    note:                note || '',
  };
  lc.versions.push(record);

  if (!Array.isArray(lc.activity)) lc.activity = [];
  lc.activity.push({
    timestamp: utcNowIso(),
    user:      { email: actor.email || '', name: actor.name || '' },
    action:    'create_version',
    from:      lc.status,
    to:        lc.status,
    note:      note || '',
    meta:      { version: n, label: `v${n}`, files: [] },
  });

  return record;
}

export function listVersions(proposal: any): any[] {
  const lc = proposal?.lifecycle || {};
  return (lc.versions || []).map((v: any) => ({
    version:            v.version,
    label:              v.label,
    snapshot_at:        v.snapshot_at,
    snapshot_by:        v.snapshot_by,
    status_at_snapshot: v.status_at_snapshot,
    note:               v.note || '',
    files:              v.files || [],
  }));
}

export function loadVersion(proposal: any, version: number): any | null {
  const lc = proposal?.lifecycle || {};
  for (const v of lc.versions || []) {
    if (v.version === version) return v;
  }
  return null;
}
