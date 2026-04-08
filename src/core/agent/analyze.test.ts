import { describe, expect, it } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { analyzeCodebase, isAnalysisIntent } from './analyze';

describe('isAnalysisIntent', () => {
  it('recognizes direct codebase analysis requests', () => {
    expect(isAnalysisIntent('analyze its codebase')).toBe(true);
    expect(isAnalysisIntent('review this repo')).toBe(true);
    expect(isAnalysisIntent('analyze the Lowkey dir')).toBe(true);
    expect(isAnalysisIntent('go to lowkey dir')).toBe(false);
  });
});

describe('analyzeCodebase', () => {
  it('summarizes a Node CLI workspace deterministically', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-analyze-'));

    try {
      await mkdir(join(root, 'src'), { recursive: true });
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify(
          {
            name: 'lowkey',
            version: '0.0.1',
            bin: {
              lowkey: './dist/cli.js',
            },
            scripts: {
              build: 'tsup src/cli.ts --format esm',
              test: 'vitest run',
            },
            dependencies: {
              ink: '^5.0.0',
              react: '^18.0.0',
            },
            devDependencies: {
              typescript: '^5.0.0',
              vitest: '^4.0.0',
            },
          },
          null,
          2
        ),
        'utf-8'
      );
      await writeFile(join(root, 'tsconfig.json'), '{"compilerOptions":{"strict":true}}', 'utf-8');
      await writeFile(join(root, 'README.md'), '# lowkey\nA CLI.\n', 'utf-8');

      const analysis = await analyzeCodebase(root);

      expect(analysis).toContain('Workspace:');
      expect(analysis).toContain('Runtime: Node.js');
      expect(analysis).toContain('Language: TypeScript');
      expect(analysis).toContain('Product shape: CLI application');
      expect(analysis).toContain('package.json: lowkey v0.0.1');
      expect(analysis).toContain('CLI entrypoints: lowkey');
      expect(analysis).toContain('README: lowkey');
      expect(analysis).toContain('This repo exposes a CLI');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
