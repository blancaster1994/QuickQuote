// IPC channel name constants. Mirror QuickProp v3.1.1's JsApi surface
// (QuickProp/quickprop/api.py) one-for-one, grouped by namespace.
//
// Naming convention: '<namespace>:<method>' lowerCamelCase. Keep these strings
// in sync with the inlined strings in electron/preload.ts (sandboxed preload
// can't import this module — see PM Quoting App's preload for the same idiom).

export const IPC = {
  // ── bootstrap ─────────────────────────────────────────────────────────────
  APP_BOOTSTRAP:           'app:bootstrap',
  APP_IMPORT_FROM_QUICKPROP: 'app:importFromQuickProp',
  APP_IMPORT_FROM_PMQUOTING: 'app:importFromPMQuoting',

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
  /** Mark Sent + initialize the project in one transaction. Returns
   *  `{ proposal, project }`. Replaces the old Mark-Won init flow. */
  LIFECYCLE_SEND_AND_INITIALIZE: 'lifecycle:sendAndInitialize',
  /** Mark Won + stamp the iCore project ID on the project row in one
   *  transaction. Returns `{ proposal, project }`. */
  LIFECYCLE_MARK_WON_AND_SYNC: 'lifecycle:markWonAndSync',

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
  OS_COPY_FILE_TO_CLIPBOARD: 'os:copyFileToClipboard',

  // ── PM-mode lookups (Stage 1; UI lands in Stage 2) ───────────────────────
  // Simple name-list CRUD keyed by table name (legal_entity, department,
  // rate_table, project_type, expense_category).
  LOOKUP_LIST:             'lookup:list',
  LOOKUP_ADD:              'lookup:add',
  LOOKUP_UPDATE:           'lookup:update',
  LOOKUP_DELETE:           'lookup:delete',
  // Markup percentages have a different shape (numeric value).
  MARKUP_LIST:             'markup:list',
  MARKUP_ADD:              'markup:add',
  MARKUP_UPDATE:           'markup:update',
  MARKUP_DELETE:           'markup:delete',
  // Phase + task taxonomy (per-department).
  PHASE_DEF_LIST:          'phaseDef:list',
  PHASE_DEF_SAVE:          'phaseDef:save',
  PHASE_DEF_DELETE:        'phaseDef:delete',
  TASK_DEF_LIST:           'taskDef:list',
  TASK_DEF_SAVE:           'taskDef:save',
  TASK_DEF_DELETE:         'taskDef:delete',
  // Bid item templates: phases + nested name-only tasks, scoped per
  // (legal_entity, department). Applied in the proposal editor — each
  // template phase becomes a Section, each task becomes a SectionTask.
  BID_ITEM_TEMPLATE_LIST:    'bidItemTemplate:list',
  BID_ITEM_TEMPLATE_GET:     'bidItemTemplate:get',
  BID_ITEM_TEMPLATE_SAVE:    'bidItemTemplate:save',
  BID_ITEM_TEMPLATE_DELETE:  'bidItemTemplate:delete',
  BID_ITEM_TEMPLATE_RENAME:  'bidItemTemplate:rename',
  // Employees (extended — used for resource allocation, PM picker, ClickUp).
  EMPLOYEE_LIST:           'employee:list',
  EMPLOYEE_SAVE:           'employee:save',
  EMPLOYEE_DELETE:         'employee:delete',
  EMPLOYEE_IMPORT_BULK:    'employee:importBulk',
  EMPLOYEE_FIND_BY_EMAIL:  'employee:findByEmail',
  // Rates (4-tier lookup).
  RATE_LIST:               'rate:list',
  RATE_SAVE:               'rate:save',
  RATE_DELETE:             'rate:delete',
  RATE_IMPORT_BULK:        'rate:importBulk',
  RATE_LOOKUP:             'rate:lookup',
  RATE_CATEGORIES:         'rate:categories',
  RATE_TABLES_FOR_ENTITY:  'rate:tablesForEntity',

  // ── native open-file dialog (XLSX import for lookups admin) ──────────────
  DIALOG_OPEN_FILE:        'dialog:openFile',

  // ── ClickUp settings + sync ──────────────────────────────────────────────
  // getConfig MUST strip api_token from the response — the renderer never
  // sees the token, only a `configured: boolean` flag. Sync flow lands in
  // Stage 6: preflight returns a plan, send executes user-confirmed
  // decisions. getLink / listPhaseLinks / unlink read/clear the local
  // mapping rows in project_clickup_link / project_clickup_phase_link.
  CLICKUP_GET_CONFIG:        'clickup:getConfig',
  CLICKUP_SET_CONFIG:        'clickup:setConfig',
  CLICKUP_TEST_CONNECTION:   'clickup:testConnection',
  CLICKUP_PREFLIGHT:         'clickup:preflight',
  CLICKUP_SEND:              'clickup:send',
  CLICKUP_GET_LINK:          'clickup:getLink',
  CLICKUP_LIST_PHASE_LINKS:  'clickup:listPhaseLinks',
  CLICKUP_UNLINK:            'clickup:unlink',

  // ── iCore (Dynamics 365 F&O) settings + connection ──────────────────────
  // Settings mirror the ClickUp pattern: getConfig returns a sanitized
  // status (no secrets today, but the shape is future-proof for cached
  // tokens). testConnection validates the saved config and — once the
  // auth slice lands — also probes the F&O OData endpoint with a real
  // bearer token. Sync (preflight/send/link CRUD) ships alongside the
  // API client in a follow-up.
  ICORE_GET_CONFIG:       'icore:getConfig',
  ICORE_SET_CONFIG:       'icore:setConfig',
  ICORE_TEST_CONNECTION:  'icore:testConnection',

  // ── Project mode (Stage 4) ───────────────────────────────────────────────
  // Per-proposal post-Won record. One project row per Won proposal, joined
  // via proposal_id. Renderer-facing IPC takes proposal name (consistent
  // with lifecycle.* channels); name → id translation is internal.
  PROJECT_INITIALIZE:               'project:initialize',
  PROJECT_GET:                      'project:get',
  PROJECT_GET_BY_PROPOSAL_NAME:     'project:getByProposalName',
  PROJECT_LIST:                     'project:list',
  PROJECT_UPDATE_HEADER:            'project:updateHeader',
  PROJECT_SAVE_PAYLOAD:             'project:savePayload',
  PROJECT_REASSIGN_PM:              'project:reassignPm',
} as const;

export type IpcChannel = typeof IPC[keyof typeof IPC];
