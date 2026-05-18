# Authentication & authorization

## Today (Electron)

Identity flow:

1. On first run, `App.tsx` checks if `apiClient.identity.get()` returns a user.
2. If not, the FirstRunIdentity modal asks the user to pick their email from
   `allowed_user` (table seeded from `seed/allowed_users.csv`).
3. `apiClient.identity.set(email)` writes `%APPDATA%/QuickQuote/identity.json`
   with `{ email, name }`.
4. On every subsequent boot, `identity.json` is read; the email is looked up
   in `allowed_user` to resolve current `role` (admin/pm/accounting/viewer)
   and `permissions`. Role changes take effect without re-identification.

Permissions live in code, not the DB:

```ts
// electron/identity/identity.ts:22-27
const ROLE_PERMISSIONS = {
  admin:      ['view', 'edit', 'mark_sent', 'mark_won', 'mark_lost', 'reopen', 'manage'],
  pm:         ['view', 'edit', 'mark_sent', 'mark_won', 'mark_lost'],
  accounting: ['view', 'mark_won', 'mark_lost'],
  viewer:     ['view'],
};
```

Source files:

- `electron/identity/identity.ts` (~150 lines)
- `electron/main.ts` — uses `actorFromIdentity()` for audit columns
- `seed/allowed_users.csv` — initial allowlist

## Target (web)

**Entra ID (Azure AD)** via MSAL.js on the SPA, JWT validation on the API.

```
┌──────────────┐  1. login         ┌──────────┐
│              │ ────────────────► │          │
│   SPA        │                   │ Entra ID │
│  + MSAL.js   │ ◄──────────────── │          │
│              │  2. ID + access   └──────────┘
└──────────────┘     tokens
       │
       │ 3. fetch /api/proposals
       │    Authorization: Bearer <access_token>
       ▼
┌──────────────────────────────────────────────────┐
│  API server                                       │
│   4. Validate JWT signature against Entra JWKS    │
│   5. Extract `email` claim                        │
│   6. Look up in `allowed_user` for role           │
│   7. Resolve permissions from ROLE_PERMISSIONS    │
│   8. Attach req.user = { email, name, role, perms │
└──────────────────────────────────────────────────┘
```

The `allowed_user` table stays. It's the authorization layer on top of
Entra's authentication. A user can be a valid Entra ID member of the
company tenant but still not appear in `allowed_user` — that returns 403.

## Required Entra ID setup

Done once in Azure portal. See `docs/AZURE_SETUP.md` for click-through.

1. **API app registration** (back-end)
   - Application ID URI: `api://quickquote-api` (or your tenant's pattern)
   - Expose a scope: `access_as_user`
   - Configure the JWT audience/issuer; copy both to `.env` as
     `JWT_AUDIENCE` and `JWT_ISSUER`

2. **SPA app registration** (front-end)
   - Platform: Single-page application
   - Redirect URI: your Static Web App URL (e.g.
     `https://quickquote.azurestaticapps.net`)
   - API permissions: delegated, the `access_as_user` scope above
   - Copy `Application (client) ID` and `Directory (tenant) ID` to `.env` as
     `VITE_AZURE_CLIENT_ID` and `VITE_AZURE_TENANT_ID`
   - Set `VITE_AZURE_SCOPES=api://quickquote-api/access_as_user`

## Wiring locations

- `src/api/msal.ts` — stub today; install `@azure/msal-browser` and wire up.
- `src/main.tsx` — wrap `<App>` in `<MsalProvider>` (next session).
- `src/api/httpAdapter.ts:getAccessToken` — already calls `msal.getAccessToken`.
- `server/src/middleware/auth.ts` — stub today; calls `jose.jwtVerify`
  against the JWKS URL derived from `JWT_ISSUER`. Replace the TODO that
  hardcodes `role: 'viewer'` with a real `allowed_user` lookup.

## Migration of `allowed_user`

The existing seed CSV / DB rows port unchanged to Azure SQL. The Email
column becomes the join key with the JWT's `email` (or `preferred_username`
if `email` is absent — usually the case for personal MSA accounts, but
internal corporate tenants populate `email`).
