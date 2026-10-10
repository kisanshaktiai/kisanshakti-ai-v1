import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginPwaWork,
  getActiveNetworkRequests,
  getActivePwaWork,
  installPwaFetchTracking,
  isPwaReloadSafe,
  resetPwaActivityForTests,
  waitForPwaReloadSafe,
} from '@/utils/pwaActivity';

describe('PWA activity tracking', () => {
  let originalFetch: typeof window.fetch;

  beforeEach(() => {
    originalFetch = window.fetch;
    resetPwaActivityForTests();
  });

  afterEach(() => {
    window.fetch = originalFetch;
    resetPwaActivityForTests();
    vi.restoreAllMocks();
  });

  it('tracks direct fetch requests while they are in flight', async () => {
    let resolveFetch!: (response: Response) => void;

    window.fetch = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    })) as typeof window.fetch;

    installPwaFetchTracking();

    const request = window.fetch('/api/test');

    await Promise.resolve();
    expect(getActiveNetworkRequests()).toBe(1);

    resolveFetch(new Response('ok'));
    await request;

    expect(getActiveNetworkRequests()).toBe(0);
  });

  it('tracks long-running application work and releases it exactly once', () => {
    const release = beginPwaWork();

    expect(getActivePwaWork()).toBe(1);

    release();
    release();

    expect(getActivePwaWork()).toBe(0);
  });

  it('blocks reload safety while application work is active', () => {
    const release = beginPwaWork();

    expect(isPwaReloadSafe()).toBe(false);

    release();

    expect(isPwaReloadSafe()).toBe(true);
  });

  it('waits for active application work before resolving safe reload', async () => {
    const release = beginPwaWork();
    let resolved = false;

    const waitPromise = waitForPwaReloadSafe(5).then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);

    release();
    await waitPromise;

    expect(resolved).toBe(true);
  });

  it('does not go negative when a tracked operation finishes', async () => {
    window.fetch = vi.fn(async () => new Response('ok')) as typeof window.fetch;
    installPwaFetchTracking();

    await window.fetch('/api/test');

    expect(getActiveNetworkRequests()).toBe(0);
  });
});
