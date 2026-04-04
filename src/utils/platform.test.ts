import { afterEach, describe, expect, it, vi } from 'vitest';

const originalWslDistro = process.env.WSL_DISTRO_NAME;
const originalWslInterop = process.env.WSL_INTEROP;

afterEach(() => {
  process.env.WSL_DISTRO_NAME = originalWslDistro;
  process.env.WSL_INTEROP = originalWslInterop;
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('platform helpers', () => {
  it('treats native win32 as unsupported', async () => {
    vi.doMock('os', () => ({
      platform: () => 'win32',
      release: () => '10.0.0',
    }));

    const mod = await import('./platform');
    expect(mod.isNativeWindowsEnvironment()).toBe(true);
  });

  it('recognizes WSL from environment signals', async () => {
    process.env.WSL_INTEROP = '/run/WSL/1_interop';
    vi.doMock('os', () => ({
      platform: () => 'linux',
      release: () => '6.6.0',
    }));

    const mod = await import('./platform');
    expect(mod.isWslEnvironment()).toBe(true);
    expect(mod.isNativeWindowsEnvironment()).toBe(false);
    expect(mod.getSupportedPlatformLabel()).toBe('WSL');
  });
});
