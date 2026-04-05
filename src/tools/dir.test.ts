import { describe, expect, it } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdir, mkdtemp, rm } from 'fs/promises';
import { applyCreateDirectory, countDirectoriesTool } from './dir.js';

describe('directory tools', () => {
  it('creates directories idempotently', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-dir-tool-'));
    const target = join(root, 'projects', 'lowkey');

    try {
      const created = await applyCreateDirectory({ path: target }, root);
      expect(created.success).toBe(true);
      expect(created.existed).toBe(false);

      const existing = await applyCreateDirectory({ path: target }, root);
      expect(existing.success).toBe(true);
      expect(existing.existed).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('counts direct and recursive directories separately', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-dir-count-'));
    const alpha = join(root, 'alpha');
    const beta = join(root, 'beta');
    const nested = join(alpha, 'nested');

    try {
      await mkdir(nested, { recursive: true });
      await mkdir(beta, { recursive: true });

      const direct = await countDirectoriesTool({ path: root }, root);
      expect(direct.success).toBe(true);
      expect(direct.count).toBe(2);

      const recursive = await countDirectoriesTool({ path: root, recursive: true }, root);
      expect(recursive.success).toBe(true);
      expect(recursive.count).toBe(3);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
