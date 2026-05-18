/**
 * MSAL.js wrapper — stub for the web port.
 *
 * Today this returns `null` (no token), which means the Electron mode just
 * skips the Authorization header. When the web port is wired:
 *
 *   1. npm install @azure/msal-browser @azure/msal-react
 *   2. Wrap <App/> in <MsalProvider instance={msal}> in src/main.tsx
 *   3. Replace this file with a real config that reads the VITE_AZURE_* env
 *      vars and calls acquireTokenSilent / acquireTokenPopup as needed
 *
 * Required Entra ID setup (do once in Azure portal):
 *   - Register an SPA app with redirect URI = https://<your-swa>.azurestaticapps.net
 *   - Register an API app, expose a scope (e.g. access_as_user)
 *   - Grant the SPA app permission to the API scope
 *   - Note the tenantId, SPA clientId, API scope → put in .env
 */

let warned = false;

export async function getAccessToken(): Promise<string | null> {
  const clientId = import.meta.env.VITE_AZURE_CLIENT_ID;
  if (!clientId) {
    if (!warned) {
      warned = true;
      // eslint-disable-next-line no-console
      console.warn('[msal] VITE_AZURE_CLIENT_ID not set — running without auth tokens.');
    }
    return null;
  }
  // TODO: real MSAL.js wiring goes here. See file header.
  throw new Error(
    'msal.getAccessToken: MSAL.js is not wired yet. ' +
      'Install @azure/msal-browser and implement this function — see src/api/msal.ts.',
  );
}
