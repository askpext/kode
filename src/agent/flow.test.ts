import { describe, expect, it, vi } from 'vitest';
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

  it('accepts a confirmed absolute path after an initial miss and then analyzes that workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-confirm-'));
    const kodeDir = join(root, 'kode');
    const homeDir = join(root, 'home', 'aditya');
    const lowkeyDir = join(homeDir, 'lowkey');
    const dbPath = join(root, 'sessions.db');

    await mkdir(kodeDir, { recursive: true });
    await mkdir(join(lowkeyDir, 'src'), { recursive: true });
    await writeFile(
      join(lowkeyDir, 'package.json'),
      JSON.stringify(
        {
          name: 'lowkey',
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

      const miss = await agent.run('go to lowkey dir');
      expect(miss.content).toContain("I couldn't find that directory");

      const followUp = await agent.run(`yes its ${lowkeyDir} go analyze its codebase and summarize to me`);
      expect(followUp.done).toBe(true);
      expect(followUp.content).toContain(lowkeyDir);
      expect(agent.getCwd()).toBe(lowkeyDir);

      const analysis = await agent.run('analyze its codebase');
      expect(analysis.content).toContain('CODEBASE ANALYSIS');
      expect(analysis.content).toContain('package.json: lowkey v0.0.1');
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('stops when the model repeats identical tool calls', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-duplicate-tools-'));
    const kodeDir = join(root, 'kode');
    const dbPath = join(root, 'sessions.db');

    await mkdir(kodeDir, { recursive: true });
    await writeFile(join(kodeDir, 'README.md'), '# kode\n', 'utf-8');

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

      vi.spyOn(agent as unknown as { callLLM: () => Promise<string | null> }, 'callLLM')
        .mockResolvedValueOnce('tool_call:{"name":"list_dir","args":{"path":"/home/aditya/lowkey"}}')
        .mockResolvedValueOnce('tool_call:{"name":"list_dir","args":{"path":"/home/aditya/lowkey"}}')
        .mockResolvedValueOnce('tool_call:{"name":"list_dir","args":{"path":"/home/aditya/lowkey"}}');

      const result = await agent.run('find that project');

      expect(result.done).toBe(true);
      expect(result.content).toContain('Repeated identical tool calls detected');
    } finally {
      vi.restoreAllMocks();
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('explains the last failure when the user asks what happened', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-why-'));
    const kodeDir = join(root, 'kode');
    const dbPath = join(root, 'sessions.db');

    await mkdir(kodeDir, { recursive: true });
    await writeFile(join(kodeDir, 'README.md'), '# kode\n', 'utf-8');

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

      vi.spyOn(agent as unknown as { callLLM: () => Promise<string | null> }, 'callLLM')
        .mockResolvedValueOnce('tool_call:{"name":"list_dir","args":{"path":"/home/aditya/lowkey"}}')
        .mockResolvedValueOnce('tool_call:{"name":"list_dir","args":{"path":"/home/aditya/lowkey"}}')
        .mockResolvedValueOnce('tool_call:{"name":"list_dir","args":{"path":"/home/aditya/lowkey"}}');

      const failed = await agent.run('find lowkey');
      expect(failed.content).toContain('Repeated identical tool calls detected');

      const followup = await agent.run('what happened?');
      expect(followup.done).toBe(true);
      expect(followup.content).toContain('The last step failed.');
      expect(followup.content).toContain('Repeated identical tool calls detected');
    } finally {
      vi.restoreAllMocks();
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
