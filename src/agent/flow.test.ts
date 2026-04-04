import { describe, expect, it } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { Agent } from './loop';
import SessionDB from '../db/sessions';

describe('Agent workspace flow', () => {
  it('switches to a hinted sibling directory and analyzes that workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-flow-'));
    const kodeDir = join(root, 'kode');
    const lowkeyDir = join(root, 'lowkey');
    const dbPath = join(root, 'sessions.db');

      await mkdir(kodeDir, { recursive: true });
      await mkdir(lowkeyDir, { recursive: true });
      await mkdir(join(lowkeyDir, 'src'), { recursive: true });
      await writeFile(
        join(lowkeyDir, 'package.json'),
        JSON.stringify(
          {
            name: 'lowkey',
            private: true,
            version: '0.0.1',
            bin: {
              lowkey: './dist/cli.js',
            },
          },
          null,
          2
        ),
        'utf-8'
      );
      await writeFile(join(lowkeyDir, 'README.md'), '# lowkey\n', 'utf-8');
      await writeFile(join(lowkeyDir, 'tsconfig.json'), '{"compilerOptions":{"strict":true}}', 'utf-8');

    const db = new SessionDB(dbPath);

    try {
      const session = await db.createSession(kodeDir);
      const agent = new Agent({
        sessionId: session.id,
        cwd: kodeDir,
        db,
        apiKey: 'test-key',
        baseUrl: 'https://example.com',
        model: 'test-model',
      });

      await agent.initialize();

      const navigation = await agent.run('go to lowkey dir');

      expect(navigation.done).toBe(true);
      expect(navigation.content).toContain(lowkeyDir);
      expect(agent.getCwd()).toBe(lowkeyDir);

      const updatedSession = await db.getSession(session.id);
      expect(updatedSession?.cwd).toBe(lowkeyDir);

      const analysis = await agent.run('analyze its codebase');

      expect(analysis.done).toBe(true);
      expect(analysis.content).toContain('CODEBASE ANALYSIS');
      expect(analysis.content).toContain('package.json: lowkey v0.0.1');
      expect(analysis.content).toContain('Product shape: CLI application');
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
