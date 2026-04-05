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

  it('creates a missing sibling directory deterministically and switches there after approval', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-create-dir-'));
    const codeRoot = join(root, 'code');
    const kodeDir = join(codeRoot, 'kode');
    const lowkeyDir = join(codeRoot, 'lowkey');
    const dbPath = join(root, 'sessions.db');

    await mkdir(kodeDir, { recursive: true });
    await writeFile(join(kodeDir, 'package.json'), '{"name":"kode"}', 'utf-8');

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

      const miss = await agent.run('hey can you go to dir lowkey');
      expect(miss.content).toContain("I couldn't find that directory");

      const create = await agent.run('okay then make one');
      expect(create.done).toBe(false);
      expect(create.toolCalls?.[0].name).toBe('create_directory');
      expect(create.toolCalls?.[0].args).toEqual({ path: lowkeyDir });

      agent.grantPermission('write', true);
      const execution = await agent.executeToolWithPermission(create.toolCalls![0]);
      expect(execution.success).toBe(true);

      const completion = await agent.continueAfterPermission();
      expect(completion.done).toBe(true);
      expect(completion.content).toContain(`Created directory: ${lowkeyDir}`);
      expect(agent.getCwd()).toBe(lowkeyDir);
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('counts directories deterministically without falling back to recursive bash logic', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-count-dir-'));
    const kodeDir = join(root, 'kode');
    const alphaDir = join(kodeDir, 'alpha');
    const betaDir = join(kodeDir, 'beta');
    const nestedDir = join(alphaDir, 'nested');
    const dbPath = join(root, 'sessions.db');

    await mkdir(nestedDir, { recursive: true });
    await mkdir(betaDir, { recursive: true });
    await writeFile(join(kodeDir, 'package.json'), '{"name":"kode"}', 'utf-8');

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

      const result = await agent.run('how many dir are there in current workspace?');
      expect(result.done).toBe(true);
      expect(result.content).toContain(`There are 2 directories in ${kodeDir} (directly).`);
      expect(result.content).toContain(alphaDir);
      expect(result.content).toContain(betaDir);
      expect(result.content).not.toContain(nestedDir);
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

  it('routes xml-style write tool calls into permission flow without leaking raw tool markup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-write-tool-'));
    const kodeDir = join(root, 'kode');
    const dbPath = join(root, 'sessions.db');

    await mkdir(kodeDir, { recursive: true });

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
        .mockResolvedValueOnce(`I'll create it now.
<tool_call>write_file
<arg_key>path</arg_key>
<arg_value>${join(kodeDir, 'index.html')}</arg_value>
<arg_key>content</arg_key>
<arg_value><!DOCTYPE html>
<html><body>Hello</body></html>`);

      const response = await agent.run('make a portfolio');

      expect(response.done).toBe(false);
      expect(response.toolCalls?.[0].name).toBe('write_file');
      expect(response.content).not.toContain('<tool_call>');
      expect(response.content).toContain("I'll create it now.");
    } finally {
      vi.restoreAllMocks();
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reads an explicit file deterministically without using the model loop', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-read-file-'));
    const kodeDir = join(root, 'kode');
    const dbPath = join(root, 'sessions.db');

    await mkdir(kodeDir, { recursive: true });
    await writeFile(join(kodeDir, 'README.md'), '# hello\nworld\n', 'utf-8');

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

      const response = await agent.run('read README.md');

      expect(response.done).toBe(true);
      expect(response.content).toContain('# hello');
      expect(response.content).toContain('world');
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('edits an explicit file deterministically after approval', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-edit-file-'));
    const kodeDir = join(root, 'kode');
    const dbPath = join(root, 'sessions.db');

    await mkdir(kodeDir, { recursive: true });
    await writeFile(join(kodeDir, 'note.txt'), 'hello world', 'utf-8');

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

      const response = await agent.run('replace "world" with "team" in note.txt');

      expect(response.done).toBe(false);
      expect(response.toolCalls?.[0].name).toBe('edit_file');

      agent.grantPermission('edit', true);
      const execution = await agent.executeToolWithPermission(response.toolCalls![0]);
      expect(execution.success).toBe(true);

      const completion = await agent.continueAfterPermission();
      expect(completion.done).toBe(true);
      expect(completion.content).toContain('Updated note.txt');

      const followup = await agent.run('did it?');
      expect(followup.content).toContain('Updated note.txt');
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('creates a portfolio starter deterministically as a single write action', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-portfolio-'));
    const kodeDir = join(root, 'dics');
    const dbPath = join(root, 'sessions.db');

    await mkdir(kodeDir, { recursive: true });

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

      const response = await agent.run('make a good html css portfolio there');

      expect(response.done).toBe(false);
      expect(response.toolCalls?.[0].name).toBe('write_file');
      expect(response.toolCalls?.[0].args).toMatchObject({ path: 'index.html' });

      agent.grantPermission('write', true);
      const execution = await agent.executeToolWithPermission(response.toolCalls![0]);
      expect(execution.success).toBe(true);

      const completion = await agent.continueAfterPermission();
      expect(completion.done).toBe(true);
      expect(completion.content).toContain(join(kodeDir, 'index.html'));

      const status = await agent.run('did it?');
      expect(status.content).toContain(join(kodeDir, 'index.html'));
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
