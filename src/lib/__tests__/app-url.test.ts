import { afterEach, describe, expect, it, vi } from 'vitest';
import { appBaseUrl } from '../app-url';

describe('appBaseUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  function clearAll() {
    for (const k of ['NEXT_PUBLIC_APP_URL', 'APP_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL', 'NEXT_PUBLIC_BASE_URL']) {
      vi.stubEnv(k, '');
    }
  }

  it('prefers the explicit app URL and strips trailing slashes', () => {
    clearAll();
    vi.stubEnv('APP_URL', 'https://crm.example.com//');
    expect(appBaseUrl()).toBe('https://crm.example.com');
  });

  it('falls back to the Vercel production domain, adding https', () => {
    clearAll();
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'my-app.vercel.app');
    vi.stubEnv('VERCEL_URL', 'my-app-abc123.vercel.app');
    expect(appBaseUrl()).toBe('https://my-app.vercel.app');
  });

  it('ignores the dead NEXT_PUBLIC_BASE_URL and never returns empty', () => {
    clearAll();
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://dead.example.com');
    expect(appBaseUrl()).toBe('https://ady-shokolad-crm.vercel.app');
  });
});
