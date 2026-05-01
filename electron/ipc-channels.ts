// IPC channel name constants. Mirror QuickProp v3.1.1's JsApi surface
// (QuickProp/quickprop/api.py) one-for-one, grouped by namespace.
//
// Naming convention: '<namespace>:<method>' lowerCamelCase. Keep these strings
// in sync with the inlined strings in electron/preload.ts (sandboxed preload
// can't import this module — see PM Quoting App's preload for the same idiom).

export const IPC = {
  // ── bootstrap ─────────────────────────────────────────────────────────────
  APP_BOOTSTRAP:           'app:bootstrap',

  // ── identity ──────────────────────────────────────────────────────────────
  IDENTITY_GET:            'identity:get',
  IDENTITY_SET:            'identity:set',
  IDENTITY_CLEAR:          'identity:clear',
  IDENTITY_LIST_ALLOWED:   'identity:listAllowed',

  // ── client templates (per-engineer) ───────────────────────────────────────
  CLIENT_TEMPLATE_LIST:    'clientTemplate:list',
  CLIENT_TEMPLATE_LOAD:    'clientTemplate:load',
  CLIENT_TEMPLATE_SAVE:    'clientTemplate:save',
  CLIENT_TEMPLATE_DELETE:  'clientTemplate:delete',

  // ── project (scope) templates (per-engineer) ─────────────────────────────
  PROJECT_TEMPLATE_LIST:   'projectTemplate:list',
  PROJECT_TEMPLATE_LOAD:   'projectTemplate:load',
  PROJECT_TEMPLATE_SAVE:   'projectTemplate:save',
  PROJECT_TEMPLATE_DELETE: 'projectTemplate:delete',

  // ── proposal CRUD ─────────────────────────────────────────────────────────
  PROPOSAL_LIST:           'proposal:list',
  PROPOSAL_LOAD:           'proposal:load',
  PROPOSAL_SAVE:           'proposal:save',
  PROPOSAL_DELETE:         'proposal:delete',

  // ── lifecycle transitions ─────────────────────────────────────────────────
  LIFECYCLE_MARK_SENT:     'lifecycle:markSent',
  LIFECYCLE_MARK_WON:      'lifecycle:markWon',
  LIFECYCLE_MARK_LOST:     'lifecycle:markLost',
  LIFECYCLE_MARK_ARCHIVED: 'lifecycle:markArchived',
  LIFECYCLE_REOPEN:        'lifecycle:reopen',
  LIFECYCLE_ADD_NOTE:      'lifecycle:addNote',
  LIFECYCLE_REASSIGN:      'lifecycle:reassign',
  LIFECYCLE_SET_FOLLOW_UP: 'lifecycle:setFollowUp',

  // ── versioning (snapshots) ────────────────────────────────────────────────
  VERSION_CREATE:          'version:create',
  VERSION_LIST:            'version:list',
  VERSION_LOAD:            'version:load',

  // ── dashboard ─────────────────────────────────────────────────────────────
  DASHBOARD_GET:           'dashboard:get',

  // ── proposal generation (Python CLI subprocess in Step 7) ────────────────
  GENERATE_DOCX:           'generate:docx',
  GENERATE_PDF:            'generate:pdf',

  // ── OS integration ────────────────────────────────────────────────────────
  OS_OPEN_FILE:            'os:openFile',
  OS_REVEAL_IN_EXPLORER:   'os:revealInExplorer',
} as const;

export type IpcChannel = typeof IPC[keyof typeof IPC];
