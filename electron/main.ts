import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import BetterSqlite3 from 'better-sqlite3';
import { migrate } from './db/schema';
import { seedIfEmpty, resolveSeedPath } from './db/seed';
import * as Q from './db/queries';
import * as activity from './lifecycle/activity';
import * as versioning from './lifecycle/versioning';
import { buildDashboard } from './lifecycle/dashboard';
import * as identity from './identity/identity';
import { generateProposal } from './proposal/generate';
import { IPC } from './ipc-channels';

const IS_DEV = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let db: BetterSqlite3.Database | null = null;

function dbPath(): string {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'quickquote.db');
}

function initDb(): void {
  const p = dbPath();
  db = new BetterSqlite3(p);
  migrate(db);
  const seedPath = resolveSeedPath(app.getAppPath());
  const seeded = seedIfEmpty(db, seedPath);
  console.log(`DB at ${p}; seeded=${seeded}`);
}

function requireDb(): BetterSqlite3.Database {
  if (!db) throw new Error('DB not initialized');
  return db;
}

function actorFromIdentity(): { email: string; name: string } {
  const ident = identity.requireIdentity(requireDb());
  return { email: ident.email, name: ident.name };
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    backgroundColor: '#F6F5F2',
    title: 'QuickQuote',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.maximize();

  if (IS_DEV) {
    void mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc(): void {
  // ── bootstrap ────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.APP_BOOTSTRAP, () => {
    const ident = identity.loadIdentity(requireDb());
    return Q.getBootstrap(requireDb(), { identity: ident });
  });

  // ── identity ─────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.IDENTITY_GET, () => identity.loadIdentity(requireDb()));
  ipcMain.handle(IPC.IDENTITY_SET, (_e, email: string) =>
    identity.saveIdentity(requireDb(), email),
  );
  ipcMain.handle(IPC.IDENTITY_CLEAR, () => identity.clearIdentity());
  ipcMain.handle(IPC.IDENTITY_LIST_ALLOWED, () => identity.listAllowedUsers(requireDb()));

  // ── client templates ─────────────────────────────────────────────────────
  ipcMain.handle(IPC.CLIENT_TEMPLATE_LIST, () => {
    const ident = identity.loadIdentity(requireDb());
    return Q.listClientTemplates(requireDb(), ident?.email || '');
  });
  ipcMain.handle(IPC.CLIENT_TEMPLATE_LOAD, (_e, name: string) => {
    const ident = identity.loadIdentity(requireDb());
    return Q.loadClientTemplate(requireDb(), ident?.email || '', name);
  });
  ipcMain.handle(IPC.CLIENT_TEMPLATE_SAVE, (_e, name: string, fields: any) => {
    const actor = actorFromIdentity();
    return Q.saveClientTemplate(requireDb(), actor.email, name, fields);
  });
  ipcMain.handle(IPC.CLIENT_TEMPLATE_DELETE, (_e, name: string) => {
    const actor = actorFromIdentity();
    return Q.deleteClientTemplate(requireDb(), actor.email, name);
  });

  // ── project templates ────────────────────────────────────────────────────
  ipcMain.handle(IPC.PROJECT_TEMPLATE_LIST, () => {
    const ident = identity.loadIdentity(requireDb());
    return Q.listProjectTemplates(requireDb(), ident?.email || '');
  });
  ipcMain.handle(IPC.PROJECT_TEMPLATE_LOAD, (_e, name: string) => {
    const ident = identity.loadIdentity(requireDb());
    return Q.loadProjectTemplate(requireDb(), ident?.email || '', name);
  });
  ipcMain.handle(IPC.PROJECT_TEMPLATE_SAVE, (_e, name: string, sections: any[]) => {
    const actor = actorFromIdentity();
    return Q.saveProjectTemplate(requireDb(), actor.email, name, sections);
  });
  ipcMain.handle(IPC.PROJECT_TEMPLATE_DELETE, (_e, name: string) => {
    const actor = actorFromIdentity();
    return Q.deleteProjectTemplate(requireDb(), actor.email, name);
  });

  // ── proposal CRUD ────────────────────────────────────────────────────────
  ipcMain.handle(IPC.PROPOSAL_LIST, () => Q.listProposals(requireDb()));
  ipcMain.handle(IPC.PROPOSAL_LOAD, (_e, name: string) => Q.loadProposal(requireDb(), name));
  ipcMain.handle(IPC.PROPOSAL_SAVE, (_e, proposal: any, renameFrom: string | null) => {
    // actor falls back to whatever identity is loaded — first save uses it as
    // the default owner. matches QuickProp's behavior.
    const ident = identity.loadIdentity(requireDb());
    const actor = ident ? { email: ident.email, name: ident.name } : null;
    return Q.saveProposal(requireDb(), proposal, actor, renameFrom);
  });
  ipcMain.handle(IPC.PROPOSAL_DELETE, (_e, name: string) => {
    Q.deleteProposal(requireDb(), name);
    return { ok: true };
  });

  // ── lifecycle ────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.LIFECYCLE_MARK_SENT, (_e, name: string, note: string) => {
    const actor = actorFromIdentity();
    return Q.mutateAndSave(requireDb(), name, actor, (p, a) =>
      activity.markSent(p, a, note ?? ''),
    );
  });
  ipcMain.handle(IPC.LIFECYCLE_MARK_WON, (_e, name: string, note: string, icoreProjectId: string | null) => {
    const actor = actorFromIdentity();
    return Q.mutateAndSave(requireDb(), name, actor, (p, a) =>
      activity.markWon(p, a, note ?? '', icoreProjectId ?? null),
    );
  });
  ipcMain.handle(IPC.LIFECYCLE_MARK_LOST, (_e, name: string, reason: string, note: string) => {
    const actor = actorFromIdentity();
    return Q.mutateAndSave(requireDb(), name, actor, (p, a) =>
      activity.markLost(p, a, reason, note ?? ''),
    );
  });
  ipcMain.handle(IPC.LIFECYCLE_MARK_ARCHIVED, (_e, name: string, note: string) => {
    const actor = actorFromIdentity();
    return Q.mutateAndSave(requireDb(), name, actor, (p, a) =>
      activity.markArchived(p, a, note ?? ''),
    );
  });
  ipcMain.handle(IPC.LIFECYCLE_REOPEN, (_e, name: string, note: string) => {
    const actor = actorFromIdentity();
    return Q.mutateAndSave(requireDb(), name, actor, (p, a) =>
      activity.reopen(p, a, note ?? ''),
    );
  });
  ipcMain.handle(IPC.LIFECYCLE_ADD_NOTE, (_e, name: string, note: string) => {
    const actor = actorFromIdentity();
    return Q.mutateAndSave(requireDb(), name, actor, (p, a) =>
      activity.addNote(p, a, note),
    );
  });
  ipcMain.handle(IPC.LIFECYCLE_REASSIGN, (_e, name: string, newPmEmail: string, note: string) => {
    const target = identity.lookupAllowed(requireDb(), newPmEmail);
    if (!target) {
      throw new Error(`${newPmEmail} is not in the allowed-users list — can't reassign.`);
    }
    const actor = actorFromIdentity();
    return Q.mutateAndSave(requireDb(), name, actor, (p, a) =>
      activity.reassign(p, a, { email: target.email, name: target.name }, note ?? ''),
    );
  });
  ipcMain.handle(IPC.LIFECYCLE_SET_FOLLOW_UP, (_e, name: string, whenIso: string | null, note: string) => {
    const actor = actorFromIdentity();
    return Q.mutateAndSave(requireDb(), name, actor, (p, a) =>
      activity.setFollowUp(p, a, whenIso ?? null, note ?? ''),
    );
  });

  // ── versioning ───────────────────────────────────────────────────────────
  ipcMain.handle(IPC.VERSION_CREATE, (_e, name: string, note: string) => {
    const actor = actorFromIdentity();
    const proposal = Q.loadProposal(requireDb(), name);
    const record = versioning.createVersion(proposal, actor, note ?? '');
    const saved = Q.saveProposal(requireDb(), proposal, actor);
    return { version: record, proposal: saved.proposal };
  });
  ipcMain.handle(IPC.VERSION_LIST, (_e, name: string) => {
    const proposal = Q.loadProposal(requireDb(), name);
    return versioning.listVersions(proposal);
  });
  ipcMain.handle(IPC.VERSION_LOAD, (_e, name: string, version: number) => {
    const proposal = Q.loadProposal(requireDb(), name);
    return versioning.loadVersion(proposal, version);
  });

  // ── dashboard ────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.DASHBOARD_GET, (_e, opts: any) =>
    buildDashboard(requireDb(), opts ?? {}),
  );

  // ── proposal generation (Python CLI subprocess in quickquote_cli/) ──────
  // Accepts a proposal object for QuickProp 1:1 IPC compatibility but only
  // uses proposal.name — the backend reloads from DB so the generated file
  // always reflects the saved state. Renderer is responsible for saving
  // first, same as QuickProp's autosave-then-generate flow.
  ipcMain.handle(IPC.GENERATE_DOCX, async (_e, proposal: any) => {
    return generateProposal(requireDb(), { name: proposal?.name || '', format: 'docx' });
  });
  ipcMain.handle(IPC.GENERATE_PDF, async (_e, proposal: any, _previewHtml?: string) => {
    return generateProposal(requireDb(), { name: proposal?.name || '', format: 'pdf' });
  });

  // ── OS integration ───────────────────────────────────────────────────────
  ipcMain.handle(IPC.OS_OPEN_FILE, async (_e, p: string) => {
    if (!fs.existsSync(p)) throw new Error(`File not found: ${p}`);
    const errMsg = await shell.openPath(p);
    if (errMsg) throw new Error(errMsg);
    return { ok: true as const };
  });
  ipcMain.handle(IPC.OS_REVEAL_IN_EXPLORER, async (_e, p: string) => {
    if (!fs.existsSync(p)) throw new Error(`File not found: ${p}`);
    shell.showItemInFolder(p);
    return { ok: true as const };
  });
}

void app.whenReady().then(() => {
  initDb();
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (db) {
    try { db.close(); } catch { /* best effort */ }
    db = null;
  }
  if (process.platform !== 'darwin') app.quit();
});
