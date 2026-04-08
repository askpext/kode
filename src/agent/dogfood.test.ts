import { describe, expect, it } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { Agent } from './loop';
import SessionDB from '../db/sessions';

async function createAgent(cwd: string, dbPath: string) {
  const db = new SessionDB(dbPath);
  const session = await db.createSession(cwd);
  const agent = new Agent({
    sessionId: session.id,
    cwd,
    db,
    apiKey: 'test-key',
    baseUrl: 'https://example.com',
    model: 'test-model',
  });

  await agent.initialize();
  return { agent, db, session };
}

describe('Dogfood stress harness', () => {
  it('handles repo followups like "go there" after a referenced directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-dogfood-there-'));
    const homeDir = join(root, 'home', 'aditya');
    const lowkeyDir = join(homeDir, 'Lowkey');
    const dbPath = join(root, 'sessions.db');

    await mkdir(join(lowkeyDir, 'src'), { recursive: true });
    await writeFile(join(lowkeyDir, 'package.json'), JSON.stringify({ name: 'lowkey', version: '0.1.0' }), 'utf-8');
    await writeFile(join(lowkeyDir, 'README.md'), '# Lowkey\n', 'utf-8');

    let db: SessionDB | null = null;
    try {
      const setup = await createAgent(homeDir, dbPath);
      const { agent } = setup;
      db = setup.db;

      const first = await agent.run('go to lowkey dir');
      expect(first.done).toBe(true);
      expect(agent.getCwd().toLowerCase()).toBe(lowkeyDir.toLowerCase());

      await agent.setCwd(homeDir);
      const second = await agent.run('go there');
      expect(second.done).toBe(true);
      expect(second.content.toLowerCase()).toContain(lowkeyDir.toLowerCase());
      expect(agent.getCwd().toLowerCase()).toBe(lowkeyDir.toLowerCase());
    } finally {
      await db?.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reads common filename shorthand like "package json" deterministically', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-dogfood-package-json-'));
    const repoDir = join(root, 'Lowkey');
    const dbPath = join(root, 'sessions.db');

    await mkdir(repoDir, { recursive: true });
    await writeFile(
      join(repoDir, 'package.json'),
      JSON.stringify({ name: 'lowkey', version: '0.1.0', private: true }, null, 2),
      'utf-8'
    );

    let db: SessionDB | null = null;
    try {
      const setup = await createAgent(repoDir, dbPath);
      const { agent } = setup;
      db = setup.db;
      const response = await agent.run('show me package json');

      expect(response.done).toBe(true);
      expect(response.content).toContain('"name": "lowkey"');
      expect(response.content).toContain('"private": true');
    } finally {
      await db?.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps edit followups grounded after a deterministic edit completes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-dogfood-did-it-'));
    const repoDir = join(root, 'Lowkey');
    const dbPath = join(root, 'sessions.db');

    await mkdir(repoDir, { recursive: true });
    await writeFile(join(repoDir, 'note.txt'), 'electron 30.5.1\n', 'utf-8');

    let db: SessionDB | null = null;
    try {
      const setup = await createAgent(repoDir, dbPath);
      const { agent } = setup;
      db = setup.db;
      const edit = await agent.run(`replace "30.5.1" with "26.2.1" in ${join(repoDir, 'note.txt').replace(/\\/g, '/')}`);

      expect(edit.done).toBe(false);
      expect(edit.toolCalls?.[0].name).toBe('edit_file');

      agent.grantPermission('edit', true);
      const execution = await agent.executeToolWithPermission(edit.toolCalls![0]);
      expect(execution.success).toBe(true);

      await agent.continueAfterPermission();

      const followup = await agent.run('did it?');
      expect(followup.done).toBe(true);
      expect(followup.content).toContain('Updated');
    } finally {
      await db?.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
