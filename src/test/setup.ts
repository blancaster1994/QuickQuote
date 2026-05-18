import { vi, beforeEach } from 'vitest';

// Block accidental real IPC calls in tests. Components that hit window.api
// must mock the apiClient explicitly. Each test starts with a fresh proxy.
beforeEach(() => {
  const trap = new Proxy(
    {},
    {
      get(_target, prop) {
        // Allow Symbol property access (used by JS internals like toString).
        if (typeof prop === 'symbol') return undefined;
        throw new Error(
          `Test tried to use window.api.${String(prop)} without a mock. ` +
            `Inject a fake apiClient via the module under test instead.`,
        );
      },
    },
  );
  vi.stubGlobal('api', trap);
  Object.defineProperty(window, 'api', { value: trap, configurable: true });
});
