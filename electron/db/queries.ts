// CRUD queries for QuickQuote's domain objects. Populated in Step 6 when
// QuickProp's quickprop/projects.py, activity.py, versioning.py, dashboard.py,
// identity.py, client_templates.py, and project_templates.py are ported here.
//
// Step 5 leaves this file as a placeholder so the import path exists.
//
// Why a single queries.ts (not queries/projects.ts, queries/activity.ts, etc.):
// matches PM Quoting App's idiom — one file, ~40-50 small functions, easier to
// scan than splitting by concern. Group by sub-namespace via comment headers.

import type Database from 'better-sqlite3';

// Re-export the type so other modules don't have to depend on better-sqlite3
// directly.
export type { Database };
