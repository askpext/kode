import { describe, expect, it } from 'vitest';
import { sep } from 'path';
import { mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { applyWriteFile, writeFileTool } from './write';
import { editFileTool, multiEditFileTool } from './edit';
import { resolveDirectoryHint, resolveWorkspacePath } from './path';

describe('resolveWorkspacePath', () => {
  it('keeps paths inside the workspace', () => {
    const result = resolveWorkspacePath('/fake/cwd', 'src/file.ts');

    expect(result.absolutePath).toContain('fake');
    expect(result.displayPath).toBe(['src', 'file.ts'].join(sep));
  });

  it('rejects paths that escape the workspace', () => {
    expect(() => resolveWorkspacePath('/fake/cwd', '../secret.txt')).toThrow(
      'Path must stay within the workspace'
    );
  });
});

describe('workspace path guards', () => {
  it('rejects write previews outside the workspace', async () => {
    const result = await writeFileTool({ path: '../secret.txt', content: 'nope' }, '/fake/cwd');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Path must stay within the workspace');
  });

  it('rejects write application outside the workspace', async () => {
    const result = await applyWriteFile({ path: '../secret.txt', content: 'nope' }, '/fake/cwd');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Path must stay within the workspace');
  });

  it('rejects edit previews outside the workspace', async () => {
    const result = await editFileTool(
      { path: '../secret.txt', target: 'a', replacement: 'b' },
      '/fake/cwd'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Path must stay within the workspace');
  });

  it('rejects multi-edit previews outside the workspace', async () => {
    const result = await multiEditFileTool(
      { path: '../secret.txt', edits: [{ target: 'a', replacement: 'b' }] },
      '/fake/cwd'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Path must stay within the workspace');
  });
});

describe('resolveDirectoryHint', () => {
  it('finds sibling directories from a short folder name', async () => {
    const root = `${tmpdir()}${sep}kode-path-test`;
    const cwd = `${root}${sep}kode`;
    const sibling = `${root}${sep}lowkey`;

    await rm(root, { recursive: true, force: true });
    await mkdir(cwd, { recursive: true });
    await mkdir(sibling, { recursive: true });

    const resolution = resolveDirectoryHint(cwd, 'lowkey dir');

    expect(resolution.matches).toContain(sibling);

    await rm(root, { recursive: true, force: true });
  });

  it('finds a home-style hint when the username is included', async () => {
    const root = `${tmpdir()}${sep}kode-path-user-test`;
    const usersRoot = `${root}${sep}Users`;
    const cwd = `${usersRoot}${sep}Aditya${sep}kode`;
    const target = `${usersRoot}${sep}Aditya${sep}lowkey`;

    await rm(root, { recursive: true, force: true });
    await mkdir(cwd, { recursive: true });
    await mkdir(target, { recursive: true });

    const resolution = resolveDirectoryHint(cwd, `Aditya${sep}lowkey`);

    expect(resolution.matches).toContain(target);

    await rm(root, { recursive: true, force: true });
  });

  it('finds projects inside common development roots like home/code', async () => {
    const root = `${tmpdir()}${sep}kode-path-code-root-test`;
    const usersRoot = `${root}${sep}Users`;
    const cwd = `${usersRoot}${sep}Aditya${sep}kode`;
    const target = `${usersRoot}${sep}Aditya${sep}code${sep}lowkey`;

    await rm(root, { recursive: true, force: true });
    await mkdir(cwd, { recursive: true });
    await mkdir(target, { recursive: true });

    const resolution = resolveDirectoryHint(cwd, 'lowkey');

    expect(resolution.matches).toContain(target);

    await rm(root, { recursive: true, force: true });
  });
});
