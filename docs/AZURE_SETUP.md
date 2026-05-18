# Azure setup — step-by-step (no coding required)

This is for **you** to walk through in the Azure portal. Once everything is
provisioned, a future Claude session can wire it up.

## Phase 0 — Verify permissions (do this first)

Log into [portal.azure.com](https://portal.azure.com) with your work account.

Check each of these. If something is greyed out or you get an "insufficient
privileges" error, write it down — you'll ask IT for help with those few items.

| What | How to check | If you can't |
|---|---|---|
| See a subscription | Top search bar → "Subscriptions". Anything listed? | Email IT: "Please assign me at least Contributor on a subscription for the QuickQuote project." |
| Create a resource group | Top search → "Resource groups" → **+ Create**. Try creating one called `quickquote-rg-test` in your nearest region (East US, etc.). Delete it after. | Ask IT for "Contributor on a new RG" |
| Create an App Service | Search "App Services" → **+ Create** | Same as above |
| Create an Azure SQL Database | Search "SQL databases" → **+ Create** | Same as above |
| Create a Static Web App | Search "Static Web Apps" → **+ Create** | Same as above |
| Create a Key Vault | Search "Key vaults" → **+ Create** | Same as above |
| Create a Function App | Search "Function App" → **+ Create** | Same as above |
| **Register an application** | Search "App registrations" → **+ New registration** | This is the one most-often locked. If it's greyed out, ask IT: "Please grant me the Application Developer role in Entra ID, or register two apps on my behalf — one for the SPA, one for the API. I'll give you exact specs." |
| Access Azure DevOps | Go to [dev.azure.com](https://dev.azure.com) — do you have an organization? | Ask IT to add you to the company's Azure DevOps organization |

Once you've gone through all of these, tell Claude in the next session
what was blocked. We'll work around it.

## Phase 1 — Provision resources

When ready, create these (in this order) and note down the values listed
in the "Write down" column. Keep them somewhere safe — Claude will need
them next session.

| # | Resource | Settings | Write down |
|---|---|---|---|
| 1 | **Resource Group** | Name: `quickquote-prod`. Region: choose closest to your team. | Name |
| 2 | **Azure SQL Server + Database** | Server name: `quickquote-sql.<unique>`. Auth: **Use Microsoft Entra-only authentication** (better than passwords). DB: `quickquote`. Compute: **Serverless, General Purpose, 1 vCore**, **Auto-pause after 1 hour**. | Server FQDN, DB name |
| 3 | **App Service Plan** | Name: `quickquote-plan`. Linux, **B1 ($13/mo)** or P0v3 if budget allows. | Plan name |
| 4 | **Web App** (in that plan) | Name: `quickquote-api`. Runtime: **Node 20 LTS**. Enable system-assigned managed identity (Identity tab). | App URL (e.g. `https://quickquote-api.azurewebsites.net`) |
| 5 | **Static Web App** | Name: `quickquote-web`. Plan: **Standard**. Source: skip GitHub for now — we'll attach the pipeline manually. Region: closest. | App URL |
| 6 | **Key Vault** | Name: `quickquote-kv-<unique>`. Standard SKU. Access policy: **Azure RBAC**. Grant the Web App's managed identity (#4) the "Key Vault Secrets User" role. | Vault URL |
| 7 | **Storage Account** + **Blob Container** | Account: `quickquotestorage<unique>`. Container: `generated-proposals`. Private access (the API will mint SAS URLs). | Account name, container name |
| 8 | **Function App** (Python) | Name: `quickquote-fn`. Runtime: Python 3.11. Plan: Consumption (pay-per-execution). | Function URL |

## Phase 2 — Entra ID app registrations

Do these in **Microsoft Entra ID** (search "Entra ID" in portal).

### API app registration

1. App registrations → **+ New registration**
2. Name: `QuickQuote API`. Single tenant. No redirect URI.
3. After creating: **Expose an API** → Set Application ID URI to
   `api://quickquote-api`. Add a scope: name `access_as_user`, who can
   consent = **Admins and users**, display name "Access QuickQuote".
4. Manifest → set `accessTokenAcceptedVersion: 2` (v2 tokens).

Write down: **Application (client) ID**, **Directory (tenant) ID**,
**Application ID URI**.

### SPA app registration

1. App registrations → **+ New registration**
2. Name: `QuickQuote Web`. Single tenant. Platform: **Single-page application**.
3. Redirect URI: paste the Static Web App URL (from step #5 above).
4. API permissions → Add → My APIs → `QuickQuote API` → `access_as_user`.
   Click **Grant admin consent** (or ask an admin to).

Write down: **Application (client) ID**.

## Phase 3 — Wire secrets into Key Vault

In Key Vault (#6 above), add these secrets (Secrets → Generate/Import):

- `ClickUpApiToken` — your real ClickUp Personal API Token.
- (Optional) any other secrets you don't want in app settings.

## Phase 4 — Configure App Service settings

In the Web App (#4) → Configuration → Application settings, add:

| Name | Value |
|---|---|
| `JWT_ISSUER` | `https://login.microsoftonline.com/<tenant-id>/v2.0` |
| `JWT_AUDIENCE` | `api://quickquote-api` (or its client ID) |
| `AZURE_SQL_CONNECTION_STRING` | `Server=tcp:<server>.database.windows.net,1433;Database=quickquote;Authentication=Active Directory Default;` |
| `BLOB_CONTAINER_URL` | `https://quickquotestorage.blob.core.windows.net/generated-proposals` |
| `CLICKUP_TOKEN_KV_REF` | `@Microsoft.KeyVault(VaultName=quickquote-kv-...;SecretName=ClickUpApiToken)` |
| `ALLOWED_ORIGIN` | Static Web App URL from step #5 |
| `WEBSITE_RUN_FROM_PACKAGE` | `1` |

Grant the Web App's managed identity:
- **SQL DB Contributor** on the SQL database
- **Storage Blob Data Contributor** on the storage account
- **Key Vault Secrets User** on the Key Vault

## Phase 5 — Connect Azure DevOps

1. Go to dev.azure.com → your organization → create a project `QuickQuote`.
2. Import the GitHub repo (Repos → Import a repository).
3. Pipelines → Create pipeline → Existing YAML → `/azure-pipelines.yml`.
4. Service connections (Project settings → Service connections) → add:
   - **Azure Resource Manager** (for `AzureWebApp@1`). Name it whatever
     you set `AZURE_SUBSCRIPTION` to in the pipeline.
5. Variables (Pipelines → Library or Pipeline → Variables) — set:
   - `AZURE_STATIC_WEB_APP_TOKEN` (from Static Web App → Manage deployment token)
   - `APP_SERVICE_NAME` = `quickquote-api`
   - `STATIC_WEB_APP_NAME` = `quickquote-web`
   - `VITE_API_BASE_URL_PROD` = `https://quickquote-api.azurewebsites.net/api`
   - `VITE_AZURE_CLIENT_ID` = SPA client ID
   - `VITE_AZURE_TENANT_ID` = tenant ID
   - `VITE_AZURE_SCOPES` = `api://quickquote-api/access_as_user`

## You're done provisioning

Hand the list of "write down" values to the next Claude session. We'll wire
them up and run Phase 3+ from `docs/ROADMAP.md`.
