import { describe, expect, it, vi } from 'vitest';
import { assertSupportedRuntimePlatform } from './runtime';

vi.mock('../../utils/platform.js', () => ({
  isNativeWindowsEnvironment: vi.fn(),
}));

describe('assertSupportedRuntimePlatform', () => {
  it('throws on native Windows', async () => {
    const platform = await import('../../utils/platform.js');
    vi.mocked(platform.isNativeWindowsEnvironment).mockReturnValue(true);

    expect(() => assertSupportedRuntimePlatform()).toThrow(
      'Kode currently supports WSL, Linux, and macOS'
    );
  });

  it('allows supported platforms', async () => {
    const platform = await import('../../utils/platform.js');
    vi.mocked(platform.isNativeWindowsEnvironment).mockReturnValue(false);

    expect(() => assertSupportedRuntimePlatform()).not.toThrow();
  });
});
