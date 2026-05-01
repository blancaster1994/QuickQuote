// IPC channel name constants. Filled out as handlers are added in later steps.
// Mirrors the QuickProp v3 JsApi surface in QuickProp/quickprop/api.py.

export const IPC = {
  APP_PING: 'app:ping',
  // Lookups, employees, rates: Step 5 (SQLite seed)
  // Proposals, lifecycle, versions: Step 6 (port quickprop/*.py)
  // Generation: Step 7 (Python CLI subprocess)
} as const;
