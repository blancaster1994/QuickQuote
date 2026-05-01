// One-time importer from QuickProp v3.x to QuickQuote.
//
// Reads QuickProp's on-disk data (projects/*.json, client_templates/<email>/*.json,
// project_templates/<email>/*.json) and the per-user identity file at
// %APPDATA%\QuickProp\identity.json, then inserts everything into QuickQuote's
// SQLite DB and copies the identity file to %APPDATA%\QuickQuote\identity.json.
//
// Idempotent: gated on `schema_meta.imported_from_quickprop`. Re-running is a
// no-op once the marker row exists. To force a re-run (e.g. after a partial
// import), delete that row.
//
// Skipped for now (Step 11 doesn't require it):
//   - Linking existing Generated Proposals/<Project>/*.docx|pdf into
//     proposal_file rows. The reuse-detection in proposal/generate.ts would
//     skip the first regenerate; instead, the user gets one fresh generation
//     per imported proposal. Acceptable trade-off; loose end is documented in
//     the plan.

import { app } from 'electron';
import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import * as Q from './queries';

export interface ImportResult {
  ok: boolean;
  alreadyImported: boolean;
  proposalsImported: number;
  clientTemplatesImported: number;
  projectTemplatesImported: number;
  identityCopied: boolean;
  skipped: string[];
  sourceDir: string;
}

export function defaultQuickPropSourceDir(): string {
  // The conventional location on Bryce's machine. Other users can override
  // via the IPC arg.
  return path.join('C:', 'Users', 'blancaster', 'dev', 'QuickProp');
}

function isImported(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'imported_from_quickprop'")
    .get() as { value: string } | undefined;
  return !!row;
}

function markImported(db: Database.Database): void {
  db.prepare(
    "INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('imported_from_quickprop', ?)",
  ).run(new Date().toISOString());
}

/**
 * v1/v2 → v3 forward migration. QuickProp's projects.py already does this
 * on read; QuickQuote's importer applies the same migration so old project
 * files (rare on Bryce's machine but possible) come through cleanly.
 */
function legacyToV3(data: any): any {
  if (data?.proposal && typeof data.proposal === 'object') return data.proposal;
  // Older shape: {values: {...}, scope_sections: [...]}
  const values = data?.values || {};
  const sections = (data?.scope_sections || [{
    title: values.scope_title || '',
    scope: values.scope_of_work || '',
    fee: values.fee || 0,
  }]).map((s: any, i: number) => ({
    id: `s${i + 1}`,
    title: s?.title || '',
    scope: s?.scope || '',
    billing: s?.billing_type || 'fixed',
    fee: parseFloat(String(s?.fee || 0).replace(/[^0-9.]/g, '')) || 0,
    notes: s?.notes || '',
    labor: [],
    expenses: [],
  }));
  return {
    date:               values.date || '',
    name:               values.project_name || data?.name || '',
    address:            values.project_address || '',
    cityStateZip:       values.project_city_state_zip || '',
    client:             values.client_name || '',
    contact:            values.client_contact || '',
    clientAddress:      values.client_address || '',
    clientCityStateZip: values.client_city_state_zip || values.client_city || '',
    rateTable:          values.use_structural ? 'structural' : 'consulting',
    sections,
  };
}

function importIdentity(): boolean {
  const appData = process.env.APPDATA;
  if (!appData) return false;
  const src = path.join(appData, 'QuickProp', 'identity.json');
  const dstDir = app.getPath('userData');
  const dst = path.join(dstDir, 'identity.json');

  if (!fs.existsSync(src)) return false;
  if (fs.existsSync(dst)) return false; // never clobber an identity already set in QuickQuote

  fs.mkdirSync(dstDir, { recursive: true });
  fs.copyFileSync(src, dst);
  return true;
}

function importProposals(db: Database.Database, sourceDir: string, skipped: string[]): number {
  const projectsDir = path.join(sourceDir, 'projects');
  if (!fs.existsSync(projectsDir)) return 0;
  let count = 0;
  for (const file of fs.readdirSync(projectsDir)) {
    if (!file.endsWith('.json')) continue;
    const fullPath = path.join(projectsDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      const proposal = legacyToV3(data);
      if (!proposal?.name?.trim()) {
        skipped.push(`${file}: empty proposal.name`);
        continue;
      }
      Q.saveProposal(db, proposal, null);
      count++;
    } catch (e: any) {
      skipped.push(`${file}: ${e?.message || String(e)}`);
    }
  }
  return count;
}

function importTemplatesByOwner(
  db: Database.Database,
  baseDir: string,
  saveFn: (db: Database.Database, ownerEmail: string, name: string, payload: any) => unknown,
  skipped: string[],
  payloadFromJson: (data: any) => any,
): number {
  if (!fs.existsSync(baseDir)) return 0;
  let count = 0;
  for (const ownerEntry of fs.readdirSync(baseDir)) {
    const ownerDir = path.join(baseDir, ownerEntry);
    let stat: fs.Stats;
    try { stat = fs.statSync(ownerDir); } catch { continue; }
    if (!stat.isDirectory()) continue;

    // QuickProp's safe_name on emails leaves @ and . untouched (only \ / * ? : " < > | get
    // replaced with _). So in practice the folder name IS the engineer's email.
    const ownerEmail = ownerEntry;

    for (const file of fs.readdirSync(ownerDir)) {
      if (!file.endsWith('.json')) continue;
      const fullPath = path.join(ownerDir, file);
      const name = file.replace(/\.json$/, '');
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        const payload = payloadFromJson(data);
        saveFn(db, ownerEmail, name, payload);
        count++;
      } catch (e: any) {
        skipped.push(`${ownerEmail}/${file}: ${e?.message || String(e)}`);
      }
    }
  }
  return count;
}

export function importFromQuickProp(db: Database.Database, sourceDirArg?: string): ImportResult {
  const sourceDir = sourceDirArg || defaultQuickPropSourceDir();
  const result: ImportResult = {
    ok: true, alreadyImported: false,
    proposalsImported: 0,
    clientTemplatesImported: 0,
    projectTemplatesImported: 0,
    identityCopied: false,
    skipped: [],
    sourceDir,
  };

  if (isImported(db)) {
    result.alreadyImported = true;
    return result;
  }

  if (!fs.existsSync(sourceDir)) {
    result.ok = false;
    result.skipped.push(`Source directory not found: ${sourceDir}`);
    return result;
  }

  result.identityCopied = importIdentity();

  // Wrap the DB writes in a transaction so a mid-import crash doesn't leave a
  // half-imported state. The marker row goes inside the same transaction so a
  // partial write rolls back cleanly.
  const tx = db.transaction(() => {
    result.proposalsImported = importProposals(db, sourceDir, result.skipped);

    result.clientTemplatesImported = importTemplatesByOwner(
      db,
      path.join(sourceDir, 'client_templates'),
      (database, owner, name, payload) => Q.saveClientTemplate(database, owner, name, payload),
      result.skipped,
      (data) => ({
        client:             data?.client || '',
        contact:            data?.contact || '',
        clientAddress:      data?.clientAddress || '',
        clientCityStateZip: data?.clientCityStateZip || '',
      }),
    );

    result.projectTemplatesImported = importTemplatesByOwner(
      db,
      path.join(sourceDir, 'project_templates'),
      (database, owner, name, payload) => Q.saveProjectTemplate(database, owner, name, payload),
      result.skipped,
      (data) => Array.isArray(data?.sections) ? data.sections : [],
    );

    markImported(db);
  });

  try {
    tx();
  } catch (e: any) {
    result.ok = false;
    result.skipped.push(`Transaction failed: ${e?.message || String(e)}`);
  }

  return result;
}
