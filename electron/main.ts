import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { IPC } from './ipc-channels';

const IS_DEV = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

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

// Stub every IPC channel declared in ipc-channels.ts. Each handler throws
// "not implemented yet" so the renderer gets a clear error if it accidentally
// invokes a channel before Steps 5–7 land. Tests/typecheck stay clean and
// we get an end-to-end IPC surface today.
function registerIpc(): void {
  const todo = (channel: string) => async () => {
    throw new Error(`${channel}: not implemented yet (port lands in a later step)`);
  };

  // Bootstrap
  ipcMain.handle(IPC.APP_BOOTSTRAP, todo(IPC.APP_BOOTSTRAP));

  // Identity
  ipcMain.handle(IPC.IDENTITY_GET,          todo(IPC.IDENTITY_GET));
  ipcMain.handle(IPC.IDENTITY_SET,          todo(IPC.IDENTITY_SET));
  ipcMain.handle(IPC.IDENTITY_CLEAR,        todo(IPC.IDENTITY_CLEAR));
  ipcMain.handle(IPC.IDENTITY_LIST_ALLOWED, todo(IPC.IDENTITY_LIST_ALLOWED));

  // Client templates
  ipcMain.handle(IPC.CLIENT_TEMPLATE_LIST,   todo(IPC.CLIENT_TEMPLATE_LIST));
  ipcMain.handle(IPC.CLIENT_TEMPLATE_LOAD,   todo(IPC.CLIENT_TEMPLATE_LOAD));
  ipcMain.handle(IPC.CLIENT_TEMPLATE_SAVE,   todo(IPC.CLIENT_TEMPLATE_SAVE));
  ipcMain.handle(IPC.CLIENT_TEMPLATE_DELETE, todo(IPC.CLIENT_TEMPLATE_DELETE));

  // Project templates
  ipcMain.handle(IPC.PROJECT_TEMPLATE_LIST,   todo(IPC.PROJECT_TEMPLATE_LIST));
  ipcMain.handle(IPC.PROJECT_TEMPLATE_LOAD,   todo(IPC.PROJECT_TEMPLATE_LOAD));
  ipcMain.handle(IPC.PROJECT_TEMPLATE_SAVE,   todo(IPC.PROJECT_TEMPLATE_SAVE));
  ipcMain.handle(IPC.PROJECT_TEMPLATE_DELETE, todo(IPC.PROJECT_TEMPLATE_DELETE));

  // Proposal CRUD
  ipcMain.handle(IPC.PROPOSAL_LIST,   todo(IPC.PROPOSAL_LIST));
  ipcMain.handle(IPC.PROPOSAL_LOAD,   todo(IPC.PROPOSAL_LOAD));
  ipcMain.handle(IPC.PROPOSAL_SAVE,   todo(IPC.PROPOSAL_SAVE));
  ipcMain.handle(IPC.PROPOSAL_DELETE, todo(IPC.PROPOSAL_DELETE));

  // Lifecycle
  ipcMain.handle(IPC.LIFECYCLE_MARK_SENT,     todo(IPC.LIFECYCLE_MARK_SENT));
  ipcMain.handle(IPC.LIFECYCLE_MARK_WON,      todo(IPC.LIFECYCLE_MARK_WON));
  ipcMain.handle(IPC.LIFECYCLE_MARK_LOST,     todo(IPC.LIFECYCLE_MARK_LOST));
  ipcMain.handle(IPC.LIFECYCLE_MARK_ARCHIVED, todo(IPC.LIFECYCLE_MARK_ARCHIVED));
  ipcMain.handle(IPC.LIFECYCLE_REOPEN,        todo(IPC.LIFECYCLE_REOPEN));
  ipcMain.handle(IPC.LIFECYCLE_ADD_NOTE,      todo(IPC.LIFECYCLE_ADD_NOTE));
  ipcMain.handle(IPC.LIFECYCLE_REASSIGN,      todo(IPC.LIFECYCLE_REASSIGN));
  ipcMain.handle(IPC.LIFECYCLE_SET_FOLLOW_UP, todo(IPC.LIFECYCLE_SET_FOLLOW_UP));

  // Versioning
  ipcMain.handle(IPC.VERSION_CREATE, todo(IPC.VERSION_CREATE));
  ipcMain.handle(IPC.VERSION_LIST,   todo(IPC.VERSION_LIST));
  ipcMain.handle(IPC.VERSION_LOAD,   todo(IPC.VERSION_LOAD));

  // Dashboard
  ipcMain.handle(IPC.DASHBOARD_GET, todo(IPC.DASHBOARD_GET));

  // Generation
  ipcMain.handle(IPC.GENERATE_DOCX, todo(IPC.GENERATE_DOCX));
  ipcMain.handle(IPC.GENERATE_PDF,  todo(IPC.GENERATE_PDF));

  // OS integration
  ipcMain.handle(IPC.OS_OPEN_FILE,         todo(IPC.OS_OPEN_FILE));
  ipcMain.handle(IPC.OS_REVEAL_IN_EXPLORER, todo(IPC.OS_REVEAL_IN_EXPLORER));
}

void app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
