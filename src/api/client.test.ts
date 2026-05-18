import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('apiClient transport selection', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uses the Electron adapter when VITE_API_BASE_URL is empty', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const fakeWindowApi = { proposals: { list: () => Promise.resolve(['a']) } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.defineProperty(window, 'api', { value: fakeWindowApi, configurable: true });

    const { apiClient } = await import('./client');
    await expect(apiClient.proposals.list()).resolves.toEqual(['a']);
  });

  it('uses the HTTP adapter when VITE_API_BASE_URL is set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    Object.defineProperty(window, 'api', { value: undefined, configurable: true });

    const { apiClient } = await import('./client');
    // HTTP adapter without MSAL configured throws on getAccessToken
    await expect(apiClient.proposals.list()).rejects.toThrow();
  });
});
