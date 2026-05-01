// Local user identity. Mirrors QuickProp/quickprop/identity.py with two
// adaptations:
//   1. The allowed-users list is queried from the `allowed_user` SQLite
//      table (seeded in Step 5) instead of being read from a JSON file.
//   2. The current-user file lives at app.getPath('userData')/identity.json
//      (Electron's per-user store). QuickProp v3's identity.json sits at
//      the same path under %APPDATA%\QuickProp\; Step 11's importer copies
//      it across to %APPDATA%\QuickQuote\ on first run.
//
// The on-disk identity file is intentionally minimal (`{email, name}`); the
// role + permissions are re-resolved from `allowed_user` on every load so
// role changes take effect without asking the user to re-identify.

import { app } from 'electron';
import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// Hardcoded role → permissions map. Mirrors the `roles` block in QuickProp's
// allowed_users.json. These rarely change — when they do, edit here and ship
// a new build.
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin:      ['view', 'edit', 'mark_sent', 'mark_won', 'mark_lost', 'reopen', 'manage'],
  pm:         ['view', 'edit', 'mark_sent', 'mark_won', 'mark_lost'],
  accounting: ['view', 'mark_won', 'mark_lost'],
  viewer:     ['view'],
};

export interface Identity {
  email: string;
  name: string;
  credentials: string;
  title: string;
  signer_name: string;
  role: string;
  permissions: string[];
}

interface AllowedUserRow {
  email: string;
  name: string;
  credentials: string | null;
  title: string | null;
  signer_name: string | null;
  role: string;
}

function identityPath(): string {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'identity.json');
}

function rowToAllowedUser(row: AllowedUserRow) {
  const credentials = row.credentials || '';
  const signerName = row.signer_name || (credentials ? `${row.name}, ${credentials}` : row.name);
  return {
    email: row.email,
    name: row.name,
    credentials,
    title: row.title || '',
    signer_name: signerName,
    role: row.role || 'viewer',
  };
}

export function listAllowedUsers(db: Database.Database) {
  const rows = db.prepare(`
    SELECT email, name, credentials, title, signer_name, role
    FROM allowed_user
    WHERE active = 1
    ORDER BY name ASC
  `).all() as AllowedUserRow[];
  return rows.map(rowToAllowedUser);
}

export function lookupAllowed(db: Database.Database, email: string) {
  if (!email) return null;
  const row = db.prepare(`
    SELECT email, name, credentials, title, signer_name, role
    FROM allowed_user
    WHERE email = ? COLLATE NOCASE AND active = 1
  `).get(email.trim().toLowerCase()) as AllowedUserRow | undefined;
  return row ? rowToAllowedUser(row) : null;
}

export function permissionsFor(role: string): string[] {
  return [...(ROLE_PERMISSIONS[role] || [])];
}

export function loadIdentity(db: Database.Database): Identity | null {
  let raw: { email?: string; name?: string };
  try {
    const txt = fs.readFileSync(identityPath(), 'utf-8');
    raw = JSON.parse(txt);
  } catch {
    return null;
  }
  const email = String(raw?.email || '').trim();
  if (!email) return null;
  const allowed = lookupAllowed(db, email);
  if (!allowed) {
    // Identity points at someone no longer permitted. Treat as unset.
    return null;
  }
  return {
    email:       allowed.email,
    name:        allowed.name,
    credentials: allowed.credentials,
    title:       allowed.title,
    signer_name: allowed.signer_name,
    role:        allowed.role,
    permissions: permissionsFor(allowed.role),
  };
}

export function saveIdentity(db: Database.Database, email: string): Identity {
  const allowed = lookupAllowed(db, email);
  if (!allowed) {
    throw new Error(
      `${email} is not permitted to use QuickQuote. ` +
      `Contact the app administrator to be added to the allowed users.`,
    );
  }
  const payload = { email: allowed.email, name: allowed.name };
  fs.writeFileSync(identityPath(), JSON.stringify(payload, null, 2), 'utf-8');
  return {
    email:       allowed.email,
    name:        allowed.name,
    credentials: allowed.credentials,
    title:       allowed.title,
    signer_name: allowed.signer_name,
    role:        allowed.role,
    permissions: permissionsFor(allowed.role),
  };
}

export function clearIdentity(): { ok: true } {
  try {
    fs.unlinkSync(identityPath());
  } catch {
    /* already gone */
  }
  return { ok: true };
}

export function requireIdentity(db: Database.Database): Identity {
  const ident = loadIdentity(db);
  if (!ident) {
    throw new Error('No user identity established. Ask the user who they are first.');
  }
  return ident;
}
