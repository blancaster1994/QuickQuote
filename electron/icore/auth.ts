// iCore (D365 F&O) authentication via Microsoft Entra ID + MSAL Node.
//
// Pattern: PublicClientApplication with PKCE + a loopback redirect URI.
// `acquireTokenInteractive` opens the system browser (via shell.openExternal)
// and spins up a one-shot HTTP listener on a free localhost port to receive
// the auth code. No custom protocol registration required.
//
// Token cache: MSAL's serialized cache JSON is written to
// `userData/icore-msal-cache.bin`, encrypted with Electron's safeStorage
// when available. Without safeStorage we still persist (plaintext) but log
// a warning — the cache contains refresh tokens, so this should never
// happen in a packaged build.
//
// Scope: each F&O environment uses `${environment_url}/.default` as the
// resource scope. The token returned is a bearer the API client (slice 4)
// will pass in the Authorization header against F&O OData endpoints.

import fs from 'node:fs';
import path from 'node:path';
import { app, shell, safeStorage } from 'electron';
import {
  PublicClientApplication,
  type Configuration,
  type AccountInfo,
  type AuthenticationResult,
  type ICachePlugin,
  type TokenCacheContext,
  LogLevel,
} from '@azure/msal-node';
import type Database from 'better-sqlite3';
import { getIcoreConfig } from '../db/icore';

// ── token cache (encrypted on disk) ─────────────────────────────────────────

function cachePath(): string {
  return path.join(app.getPath('userData'), 'icore-msal-cache.bin');
}

const cachePlugin: ICachePlugin = {
  async beforeCacheAccess(ctx: TokenCacheContext): Promise<void> {
    const p = cachePath();
    if (!fs.existsSync(p)) return;
    try {
      const raw = fs.readFileSync(p);
      let json: string;
      if (safeStorage.isEncryptionAvailable()) {
        json = safeStorage.decryptString(raw);
      } else {
        json = raw.toString('utf-8');
        console.warn('[icore-auth] safeStorage unavailable; token cache read in plaintext');
      }
      ctx.tokenCache.deserialize(json);
    } catch (e) {
      console.error('[icore-auth] cache read failed:', e);
    }
  },
  async afterCacheAccess(ctx: TokenCacheContext): Promise<void> {
    if (!ctx.cacheHasChanged) return;
    try {
      const json = ctx.tokenCache.serialize();
      const buf = safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(json)
        : Buffer.from(json, 'utf-8');
      const p = cachePath();
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, buf);
    } catch (e) {
      console.error('[icore-auth] cache write failed:', e);
    }
  },
};

// ── client construction ─────────────────────────────────────────────────────

interface ClientBits {
  pca: PublicClientApplication;
  scope: string;
}

function buildClient(tenantId: string, clientId: string, envUrl: string): ClientBits {
  const config: Configuration = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
    cache: { cachePlugin },
    system: {
      loggerOptions: {
        loggerCallback: (level, message) => {
          if (level === LogLevel.Error || level === LogLevel.Warning) {
            console[level === LogLevel.Error ? 'error' : 'warn']('[msal]', message);
          }
        },
        piiLoggingEnabled: false,
        logLevel: LogLevel.Warning,
      },
    },
  };
  return {
    pca: new PublicClientApplication(config),
    scope: `${envUrl.replace(/\/+$/, '')}/.default`,
  };
}

/** Pulls the current iCore config and returns a constructed client.
 *  Throws if required fields are missing — callers should validate the
 *  config (or rely on testConnection) first. */
function clientFromConfig(db: Database.Database): ClientBits {
  const cfg = getIcoreConfig(db);
  if (!cfg.tenant_id || !cfg.client_id || !cfg.environment_url) {
    throw new Error('iCore is not fully configured (tenant id, client id, environment URL required).');
  }
  return buildClient(cfg.tenant_id, cfg.client_id, cfg.environment_url);
}

// ── public surface ──────────────────────────────────────────────────────────

export interface IcoreAccount {
  username: string;        // typically the user's UPN / email
  name: string | null;     // display name from id_token claims
  home_account_id: string; // MSAL's primary key for this account
  tenant_id: string;
}

function toAccount(a: AccountInfo): IcoreAccount {
  return {
    username: a.username,
    name: a.name ?? null,
    home_account_id: a.homeAccountId,
    tenant_id: a.tenantId,
  };
}

/** Returns the cached account, if any. Single-account model — the first
 *  account wins. Multi-account isn't supported (one bot user per install). */
export async function getAccount(db: Database.Database): Promise<IcoreAccount | null> {
  let bits: ClientBits;
  try { bits = clientFromConfig(db); } catch { return null; }
  const accounts = await bits.pca.getTokenCache().getAllAccounts();
  return accounts[0] ? toAccount(accounts[0]) : null;
}

/** Interactive sign-in. Opens the system browser; the loopback redirect
 *  handles the callback. Returns the signed-in account. */
export async function signIn(db: Database.Database): Promise<IcoreAccount> {
  const bits = clientFromConfig(db);
  const result: AuthenticationResult = await bits.pca.acquireTokenInteractive({
    scopes: [bits.scope],
    openBrowser: async (url: string) => { await shell.openExternal(url); },
    successTemplate: SUCCESS_HTML,
    errorTemplate:   ERROR_HTML,
  });
  if (!result.account) throw new Error('Sign-in returned no account.');
  return toAccount(result.account);
}

/** Sign out: remove the cached account + delete the persisted cache file.
 *  Note this only clears the local cache — there's no global Entra ID
 *  sign-out (would require a separate redirect to /logout). For our
 *  single-machine use that's fine. */
export async function signOut(db: Database.Database): Promise<void> {
  let bits: ClientBits;
  try { bits = clientFromConfig(db); } catch { /* config gone — fall through to file delete */ return wipeCache(); }
  const cache = bits.pca.getTokenCache();
  const accounts = await cache.getAllAccounts();
  for (const a of accounts) await cache.removeAccount(a);
  wipeCache();
}

function wipeCache(): void {
  const p = cachePath();
  try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { console.warn('[icore-auth] cache delete failed:', e); }
}

/** Acquire a bearer token for the configured F&O environment.
 *
 * Silent first (uses the cached refresh token); on `InteractionRequired`
 * the caller decides whether to prompt — the API client passes
 * `interactive: false` and surfaces the error, while user-initiated flows
 * (Sign In button) call `signIn` directly. */
export async function acquireToken(
  db: Database.Database,
  opts: { interactive?: boolean } = {},
): Promise<string> {
  const bits = clientFromConfig(db);
  const accounts = await bits.pca.getTokenCache().getAllAccounts();

  if (accounts.length) {
    try {
      const result = await bits.pca.acquireTokenSilent({
        account: accounts[0],
        scopes: [bits.scope],
      });
      if (result?.accessToken) return result.accessToken;
    } catch (e: any) {
      if (!opts.interactive) {
        throw new Error(`Silent token acquisition failed: ${e?.message ?? String(e)}. Sign in again.`);
      }
      // fall through to interactive
    }
  }

  if (!opts.interactive) {
    throw new Error('Not signed in to iCore. Sign in from Lookups → iCore.');
  }
  const result = await bits.pca.acquireTokenInteractive({
    scopes: [bits.scope],
    openBrowser: async (url: string) => { await shell.openExternal(url); },
    successTemplate: SUCCESS_HTML,
    errorTemplate:   ERROR_HTML,
  });
  if (!result?.accessToken) throw new Error('Interactive auth returned no access token.');
  return result.accessToken;
}

// ── HTML shown in the user's browser after the auth round-trip ──────────────

const SUCCESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>QuickQuote — Signed in</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f3f5f8;color:#0f1a2b;display:grid;place-items:center;height:100vh;margin:0}
.card{background:#fff;border:1px solid #d9e0e7;border-radius:8px;padding:32px 40px;max-width:420px;box-shadow:0 4px 16px rgba(15,25,40,.06)}
h1{font-size:18px;margin:0 0 8px}
p{font-size:13px;color:#5a6373;margin:0;line-height:1.5}</style></head>
<body><div class="card"><h1>✓ Signed in to iCore</h1><p>You can close this tab and return to QuickQuote.</p></div></body></html>`;

const ERROR_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>QuickQuote — Sign-in failed</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f3f5f8;color:#0f1a2b;display:grid;place-items:center;height:100vh;margin:0}
.card{background:#fff;border:1px solid #d9e0e7;border-radius:8px;padding:32px 40px;max-width:420px;box-shadow:0 4px 16px rgba(15,25,40,.06)}
h1{font-size:18px;margin:0 0 8px;color:#b91c1c}
p{font-size:13px;color:#5a6373;margin:0;line-height:1.5}</style></head>
<body><div class="card"><h1>✗ Sign-in failed</h1><p>You can close this tab and try again in QuickQuote.</p></div></body></html>`;
