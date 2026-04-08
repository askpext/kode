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

  it('accepts a bare directory followup after a navigation miss', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-bare-followup-'));
    const kodeDir = join(root, 'kode');
    const lowkeyDir = join(root, 'lowkey');
    const dbPath = join(root, 'sessions.db');

    await mkdir(kodeDir, { recursive: true });
    await mkdir(lowkeyDir, { recursive: true });

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

      const miss = await agent.run('go to dir named lowkee');
      expect(miss.content).toContain("I couldn't find that directory");

      const followup = await agent.run('lowkey');
      expect(followup.done).toBe(true);
      expect(followup.content).toContain(lowkeyDir);
      expect(agent.getCwd()).toBe(lowkeyDir);
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

  it('routes test requests into a deterministic bash command', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-task-test-'));
    const kodeDir = join(root, 'kode');
    const dbPath = join(root, 'sessions.db');

    await mkdir(kodeDir, { recursive: true });
    await writeFile(
      join(kodeDir, 'package.json'),
      JSON.stringify({ name: 'kode', scripts: { test: 'vitest run' } }),
      'utf-8'
    );

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

      const response = await agent.run('run tests');

      expect(response.done).toBe(false);
      expect(response.toolCalls?.[0]).toMatchObject({
        name: 'bash',
        args: { command: 'npm test' },
      });
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('stays out of the llm loop for vague deterministic workspace requests', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-fallback-'));
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

      const llmSpy = vi.spyOn(agent as unknown as { callLLM: () => Promise<string | null> }, 'callLLM');
      const response = await agent.run('workspace path?');

      expect(response.done).toBe(true);
      expect(response.content).toContain('deterministic workspace mode');
      expect(llmSpy).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('routes dev server requests into a deterministic background bash command', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-task-dev-'));
    const kodeDir = join(root, 'kode');
    const dbPath = join(root, 'sessions.db');

    await mkdir(kodeDir, { recursive: true });
    await writeFile(
      join(kodeDir, 'package.json'),
      JSON.stringify({ name: 'kode', scripts: { dev: 'vite' } }),
      'utf-8'
    );

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

      const response = await agent.run('start dev server');

      expect(response.done).toBe(false);
      expect(response.toolCalls?.[0]).toMatchObject({
        name: 'bash_background',
        args: { command: 'npm run dev' },
      });
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('normalizes simple bash mkdir tool calls into create_directory before permission handling', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-normalize-mkdir-'));
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
        .mockResolvedValueOnce('tool_call:{"name":"bash","args":{"command":"mkdir -p sandbox"}}');

      const response = await agent.run('help me set up a sandbox');

      expect(response.done).toBe(false);
      expect(response.toolCalls?.[0]).toMatchObject({
        name: 'create_directory',
        args: { path: 'sandbox' },
      });
    } finally {
      vi.restoreAllMocks();
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('tracks background tasks and handles status and stop requests deterministically', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-bg-status-'));
    const kodeDir = join(root, 'kode');
    const dbPath = join(root, 'sessions.db');

    await mkdir(kodeDir, { recursive: true });
    await writeFile(
      join(kodeDir, 'package.json'),
      JSON.stringify({ name: 'kode', scripts: { dev: 'vite' } }),
      'utf-8'
    );

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

      const start = await agent.run('start dev server');
      expect(start.done).toBe(false);
      expect(start.toolCalls?.[0].name).toBe('bash_background');

      (agent as any).lastPermissionResult = {
        toolName: 'bash_background',
        success: true,
        result: 'Started background process with ID: proc-123',
      };

      const started = await agent.continueAfterPermission();
      expect(started.content).toContain('Process ID: proc-123');

      vi.spyOn(agent as any, 'executeToolWithFallback')
        .mockResolvedValueOnce({ success: true, result: '[Status: running]\nready' })
        .mockResolvedValueOnce({ success: true, result: 'Process proc-123 terminated successfully.\nStatus: terminated' });

      const status = await agent.run('status');
      expect(status.done).toBe(true);
      expect(status.content).toContain('Background task status');
      expect(status.content).toContain('ready');

      const stop = await agent.run('stop dev server');
      expect(stop.done).toBe(true);
      expect(stop.content).toContain('Background task stopped');
      expect(stop.content).toContain('terminated');
    } finally {
      vi.restoreAllMocks();
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('remembers the cloned repo for follow-up visit and analysis requests', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-clone-followup-'));
    const homeDir = join(root, 'home', 'aditya');
    const lowkeyDir = join(homeDir, 'Lowkey');
    const dbPath = join(root, 'sessions.db');

    await mkdir(join(lowkeyDir, 'src'), { recursive: true });
    await writeFile(
      join(lowkeyDir, 'package.json'),
      JSON.stringify({ name: 'lowkey', version: '0.0.1', bin: { lowkey: './dist/cli.js' } }),
      'utf-8'
    );
    await writeFile(join(lowkeyDir, 'README.md'), '# Lowkey\n', 'utf-8');

    const db = new SessionDB(dbPath);

    try {
      const session = await db.createSession(homeDir);
      const agent = new Agent({
        sessionId: session.id,
        cwd: homeDir,
        db,
        apiKey: 'test-key',
        baseUrl: 'https://example.com',
        model: 'test-model',
      });

      await agent.initialize();

      const clone = await agent.run('hey clone the repo https://github.com/askpext/Lowkey');
      expect(clone.done).toBe(false);
      expect(clone.toolCalls?.[0]).toMatchObject({
        name: 'bash',
        args: { command: 'git clone https://github.com/askpext/Lowkey Lowkey' },
      });

      (agent as any).lastPermissionResult = {
        toolName: 'bash',
        success: true,
        result: 'Cloning into \'Lowkey\'...',
      };

      const cloned = await agent.continueAfterPermission();
      expect(cloned.done).toBe(true);
      expect(cloned.content).toContain('Clone finished');

      const visit = await agent.run('visit that dir');
      expect(visit.done).toBe(true);
      expect(visit.content).toContain(lowkeyDir);
      expect(agent.getCwd()).toBe(lowkeyDir);

      const analysis = await agent.run('analyze the Lowkey dir');
      expect(analysis.done).toBe(true);
      expect(analysis.content).toContain('CODEBASE ANALYSIS');
      expect(analysis.content).toContain(`Workspace: ${lowkeyDir}`);
      expect(analysis.content).toContain('package.json: lowkey v0.0.1');
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('replays the clone then visit then analyze transcript deterministically', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-transcript-'));
    const homeDir = join(root, 'home', 'aditya');
    const lowkeyDir = join(homeDir, 'Lowkey');
    const dbPath = join(root, 'sessions.db');

    await mkdir(join(lowkeyDir, 'src'), { recursive: true });
    await writeFile(
      join(lowkeyDir, 'package.json'),
      JSON.stringify({ name: 'lowkey', version: '0.0.1', bin: { lowkey: './dist/cli.js' } }),
      'utf-8'
    );
    await writeFile(join(lowkeyDir, 'README.md'), '# Lowkey\n', 'utf-8');

    const db = new SessionDB(dbPath);

    try {
      const session = await db.createSession(homeDir);
      const agent = new Agent({
        sessionId: session.id,
        cwd: homeDir,
        db,
        apiKey: 'test-key',
        baseUrl: 'https://example.com',
        model: 'test-model',
      });

      await agent.initialize();

      const clone = await agent.run('hey clone the repo https://github.com/askpext/Lowkey');
      expect(clone.done).toBe(false);

      (agent as any).lastPermissionResult = {
        toolName: 'bash',
        success: true,
        result: 'Cloning into \'Lowkey\'...',
      };
      await agent.continueAfterPermission();

      const visit = await agent.run('good visit that dir');
      expect(visit.done).toBe(true);
      expect(visit.content).toContain(lowkeyDir);

      const goTo = await agent.run('go to that dir');
      expect(goTo.done).toBe(true);
      expect(goTo.content).toContain(lowkeyDir);

      const analysis = await agent.run('analyze the Lowkey dir');
      expect(analysis.done).toBe(true);
      expect(analysis.content).toContain('CODEBASE ANALYSIS');
      expect(analysis.content).toContain(`Workspace: ${lowkeyDir}`);
    } finally {
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps ambiguous deterministic file requests out of the llm loop', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-file-fallback-'));
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

      const llmSpy = vi.spyOn(agent as unknown as { callLLM: () => Promise<string | null> }, 'callLLM');
      const response = await agent.run('read file?');

      expect(response.done).toBe(true);
      expect(response.content).toContain('deterministic file mode');
      expect(llmSpy).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps ambiguous deterministic task requests out of the llm loop', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kode-agent-task-fallback-'));
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

      const llmSpy = vi.spyOn(agent as unknown as { callLLM: () => Promise<string | null> }, 'callLLM');
      const response = await agent.run('run something');

      expect(response.done).toBe(true);
      expect(response.content).toContain('deterministic task mode');
      expect(llmSpy).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      await db.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
