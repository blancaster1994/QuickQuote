/**
 * Electron adapter — verbatim proxy to `window.api` (the preload bridge
 * defined in `electron/preload.ts`). The renderer never touches `window.api`
 * directly; it always goes through `apiClient` which today resolves here.
 */

import type { QuickQuoteApi } from '../types/api';

export const electronAdapter: QuickQuoteApi = window.api;
