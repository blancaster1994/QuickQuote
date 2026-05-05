// Bridge between QuickQuote's stored proposals and the Python CLI in
// quickquote_cli/. Mirror of PM Quoting App's electron/proposal/generate.ts,
// adapted to QuickQuote's simpler section model (no phases, no rate-entry
// joins — sections carry an explicit fee).
//
// Flow:
//  1. Load the proposal from SQLite.
//  2. Compute the content hash (mirror of QuickProp's
//     proposalContentHash) and check proposal_file for an existing file
//     with the same hash → reuse if the on-disk file still exists.
//  3. Otherwise, build the CLI input (a verbatim port of QuickProp's
//     projects._to_legacy that the CLI's docx_gen consumes), spawn
//     `py -m quickquote_cli.cli` with the JSON via stdin, and collect
//     the JSON line on stdout.
//  4. Insert a proposal_file row + a generate_docx/generate_pdf activity
//     log entry, then return the file path.

import { app } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import type Database from 'better-sqlite3';
import { loadProposal, proposalContentHash } from '../db/queries';
import { lookupAllowed, loadIdentity } from '../identity/identity';

export type GenerateFormat = 'docx' | 'pdf';

export interface GenerateResult {
  ok: boolean;
  reused?: boolean;
  path?: string;
  filename?: string;
  format?: GenerateFormat;
  error?: string;
}

interface CliResult {
  ok: boolean;
  path?: string;
  filename?: string;
  error?: string;
}

// ── path resolution ─────────────────────────────────────────────────────────

function quickquoteCliRoot(): string {
  const candidates = [
    // Dev: <repo>/quickquote_cli (next to electron source)
    path.join(app.getAppPath(), 'quickquote_cli'),
    // Packaged: bundled under process.resourcesPath via extraResources.
    path.join(process.resourcesPath || '', 'quickquote_cli'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function generatedRoot(): string {
  return path.join(app.getPath('userData'), 'Generated Proposals');
}

function safeName(s: string): string {
  return (s || '').replace(/[\\/*?:"<>|]/g, '_').trim();
}

/**
 * Returns `<base> v<N>` filename. N matches QuickProp's convention:
 *   length(lifecycle.versions) + 1 — i.e., the version the user is
 * currently preparing.
 */
function versionedFilename(proposal: any, fmt: GenerateFormat): { folder: string; filename: string } {
  const projectName = proposal?.name || 'Proposal';
  const folder = path.join(generatedRoot(), safeName(projectName));
  fs.mkdirSync(folder, { recursive: true });
  const versions = (proposal?.lifecycle?.versions || []) as unknown[];
  const n = versions.length + 1;
  const base = `${safeName(projectName)} - Proposal v${n}`;
  return { folder, filename: `${base}.${fmt}` };
}

// ── proposal → CLI input ────────────────────────────────────────────────────

interface CliValues {
  date: string;
  project_name: string;
  project_address: string;
  project_city_state_zip: string;
  client_name: string;
  client_contact: string;
  client_address: string;
  client_city: string;
  scope_title: string;
  scope_of_work: string;
  /** Section-1 exclusions. CLI prefixes "Scope specifically excluded: " and
   *  inserts a paragraph after the scope block when non-empty. */
  scope_excluded: string;
  signer_name: string;
  signer_title: string;
}

interface BuiltCliInput {
  format: GenerateFormat;
  rate_table: string;
  output_dir: string;
  output_filename: string;
  values: CliValues;
  section1_fee: string;
  section1_billing_type: 'fixed' | 'tm';
  section1_nte: boolean;
  /** [title, scope, fee, billing, nte, exclusions] per extra section. */
  extra_sections: Array<[string, string, string, string, boolean, string]>;
}

/**
 * Build the CLI input from a proposal. Mirrors QuickProp's
 * projects._to_legacy: section[0] becomes the {{SCOPE_TITLE}} / {{FEE}}
 * placeholder block, sections[1..] become extra_sections appended after.
 */
function buildCliInput(args: {
  proposal: any;
  signer: { name: string | null; title: string | null; credentials: string | null } | null;
  format: GenerateFormat;
  outputDir: string;
  outputFilename: string;
}): BuiltCliInput {
  const { proposal, signer, format, outputDir, outputFilename } = args;
  const sections: any[] = proposal?.sections || [];
  const s0 = sections[0] || {};

  // Mirrors QuickProp's "client_city" key — drives the
  // {{CLIENT_CITY_STATE_ZIP}} placeholder. Older project files use the
  // short-form key, so the CLI's PLACEHOLDERS dict expects it.
  const clientCity = proposal?.clientCityStateZip || '';

  const signerName = signer?.credentials
    ? `${signer.name || ''}, ${signer.credentials}`
    : (signer?.name || '');

  const values: CliValues = {
    date:                   proposal?.date || '',
    project_name:           proposal?.name || '',
    project_address:        proposal?.address || '',
    project_city_state_zip: proposal?.cityStateZip || '',
    client_name:            proposal?.client || '',
    client_contact:         proposal?.contact || '',
    client_address:         proposal?.clientAddress || '',
    client_city:            clientCity,
    scope_title:            String(s0.title || ''),
    scope_of_work:          String(s0.scope || ''),
    scope_excluded:         String(s0.exclusions || ''),
    signer_name:            signerName,
    signer_title:           signer?.title || '',
  };

  const extras: Array<[string, string, string, string, boolean, string]> = sections.slice(1).map((s: any) => [
    String(s?.title || ''),
    String(s?.scope || ''),
    String(s?.fee ?? ''),
    String(s?.billing || 'fixed'),
    false, // QuickProp doesn't surface NTE per-section in the v3 schema
    String(s?.exclusions || ''),
  ]);

  return {
    format,
    rate_table:            proposal?.rateTable || 'consulting',
    output_dir:            outputDir,
    output_filename:       outputFilename,
    values,
    section1_fee:          String(s0.fee ?? ''),
    section1_billing_type: (s0.billing || 'fixed') as 'fixed' | 'tm',
    section1_nte:          false,
    extra_sections:        extras,
  };
}

// ── Python subprocess ───────────────────────────────────────────────────────

function runCli(input: BuiltCliInput): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const cwd = path.dirname(quickquoteCliRoot());
    // `py` (the Windows launcher) hands off to the system Python. Same
    // pattern as PM Quoting App. windowsHide: true keeps Word COM from
    // popping a stray console window.
    const proc = spawn('py', ['-m', 'quickquote_cli.cli'], {
      cwd,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString('utf-8'); });
    proc.stderr.on('data', (d) => { stderr += d.toString('utf-8'); });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      // The CLI prints exactly one JSON line on stdout. Take the last
      // non-empty line so progress bars / warnings on stderr don't trip us.
      const lines = stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const last = lines[lines.length - 1];
      if (!last) {
        return reject(new Error(`Generator exited with code ${code} and no output. stderr: ${stderr}`));
      }
      try {
        resolve(JSON.parse(last));
      } catch (e) {
        reject(new Error(`Generator output wasn't JSON: ${last}\nstderr: ${stderr}`));
      }
    });
    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();
  });
}

// ── public entry point (wired from main.ts) ─────────────────────────────────

export async function generateProposal(
  db: Database.Database,
  args: { name: string; format: GenerateFormat },
): Promise<GenerateResult> {
  const { name, format } = args;

  let proposal: any;
  try {
    proposal = loadProposal(db, name);
  } catch (e: any) {
    return { ok: false, error: `Proposal not found: ${name}` };
  }

  // Resolve signer (PM) for the signature block. Falls back to the proposal's
  // owner.name when the PM is no longer in the allowed list (e.g. left the
  // company) so generation never fails for that reason.
  const ownerEmail = (proposal?.lifecycle?.owner?.email || '').trim();
  let signer: { name: string | null; title: string | null; credentials: string | null } | null = null;
  if (ownerEmail) {
    const allowed = lookupAllowed(db, ownerEmail);
    if (allowed) {
      signer = {
        name: allowed.signer_name || allowed.name,
        title: allowed.title,
        credentials: allowed.credentials,
      };
    }
  }
  if (!signer) {
    const fallbackName = proposal?.lifecycle?.owner?.name || '';
    signer = { name: fallbackName, title: null, credentials: null };
  }

  // Resolve target file path.
  const { folder, filename: planFilename } = versionedFilename(proposal, format);
  const targetPath = path.join(folder, planFilename);

  // Reuse-detection. Mirror of QuickProp's _existing_generation: when the
  // current proposal hashes the same as the last generation of this format
  // AND the recorded file is still on disk AT the would-be target path,
  // hand back the existing path with reused=true.
  const hash = proposalContentHash(proposal);
  const proposalRow = db.prepare('SELECT id FROM proposal WHERE name = ?').get(name) as { id: number } | undefined;
  if (proposalRow) {
    const last = db.prepare(`
      SELECT * FROM proposal_file
      WHERE proposal_id = ? AND format = ? AND content_hash = ?
      ORDER BY id DESC LIMIT 1
    `).get(proposalRow.id, format, hash) as any | undefined;
    if (last && fs.existsSync(last.path) && path.normalize(last.path).toLowerCase() === path.normalize(targetPath).toLowerCase()) {
      return { ok: true, reused: true, path: last.path, filename: last.filename, format };
    }
  }

  // Spawn the Python CLI.
  const cliInput = buildCliInput({ proposal, signer, format, outputDir: folder, outputFilename: planFilename });
  let res: CliResult;
  try {
    res = await runCli(cliInput);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
  if (!res.ok || !res.path) {
    return { ok: false, error: res.error || 'Generator returned no path' };
  }

  // Record the file + activity. Use the actor's identity (loaded fresh — the
  // generation flow doesn't enforce identity, but if one's set we attribute).
  const ident = loadIdentity(db);
  const generatedByEmail = ident?.email || null;
  const generatedByName = ident?.name || null;

  if (proposalRow) {
    db.prepare(`
      INSERT INTO proposal_file(proposal_id, format, filename, path, content_hash, generated_by_email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      proposalRow.id,
      format,
      res.filename ?? path.basename(res.path),
      res.path,
      hash,
      generatedByEmail,
    );

    // Use an explicit UTC ISO timestamp (with 'Z' suffix) so JS doesn't
    // interpret the SQLite-default 'YYYY-MM-DD HH:MM:SS' as local time.
    const utcNowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    db.prepare(`
      INSERT INTO proposal_activity(proposal_id, timestamp, user_email, user_name, action, note, meta_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      proposalRow.id,
      utcNowIso,
      generatedByEmail,
      generatedByName,
      format === 'pdf' ? 'generate_pdf' : 'generate_docx',
      null,
      JSON.stringify({ filename: res.filename, path: res.path }),
    );
  }

  return { ok: true, reused: false, path: res.path, filename: res.filename, format };
}
