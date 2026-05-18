/**
 * QuickQuote API client.
 *
 * The renderer was originally tightly bound to `window.api` (the Electron
 * preload bridge). This module is the seam between transports:
 *
 *   - Electron mode (default today): proxies straight to `window.api`.
 *   - HTTP mode (web port, future): calls a Fastify API; selected when
 *     `import.meta.env.VITE_API_BASE_URL` is set.
 *
 * React code imports `apiClient` and never references `window.api` directly.
 * That way swapping transports is a single file change, not a code grep.
 */

import type { QuickQuoteApi } from '../types/api';
import { electronAdapter } from './electronAdapter';
import { httpAdapter } from './httpAdapter';

function pickAdapter(): QuickQuoteApi {
  const httpBase = import.meta.env.VITE_API_BASE_URL;
  if (httpBase && typeof httpBase === 'string' && httpBase.length > 0) {
    return httpAdapter;
  }
  return electronAdapter;
}

export const apiClient: QuickQuoteApi = pickAdapter();
