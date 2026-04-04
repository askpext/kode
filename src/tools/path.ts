import { existsSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'path';

export interface ResolvedWorkspacePath {
  absolutePath: string;
  displayPath: string;
}

export function resolveWorkspacePath(cwd: string, inputPath: string): ResolvedWorkspacePath {
  const workspaceRoot = resolve(cwd);
  const absolutePath = resolveFlexiblePath(workspaceRoot, inputPath);
  const relativePath = relative(workspaceRoot, absolutePath);
  const escapesWorkspace =
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`);

  if (escapesWorkspace) {
    throw new Error(`Path must stay within the workspace: ${inputPath}`);
  }

  return {
    absolutePath,
    displayPath: relativePath || '.',
  };
}

export function getParentDirectory(filePath: string): string {
  return dirname(filePath);
}

export function normalizeUserPath(inputPath: string): string {
  return inputPath.trim().replace(/^['"`]+|['"`]+$/g, '');
}

export function resolveFlexiblePath(cwd: string, inputPath: string): string {
  const normalizedPath = normalizeUserPath(inputPath);

  if (normalizedPath.startsWith('~')) {
    return resolve(homedir(), normalizedPath.slice(1));
  }

  if (isAbsolute(normalizedPath)) {
    return resolve(normalizedPath);
  }

  return resolve(cwd, normalizedPath);
}

export interface DirectoryHintResolution {
  matches: string[];
  attempted: string[];
}

export function resolveDirectoryHint(cwd: string, hint: string): DirectoryHintResolution {
  const normalizedHint = sanitizeDirectoryHint(hint);
  const home = homedir();
  const homeName = basename(home).toLowerCase();
  const hintSegments = normalizedHint.split(/[\\/]+/).filter(Boolean);
  const attempted = new Set<string>();
  const matches = new Set<string>();

  const candidateInputs = new Set<string>();
  if (normalizedHint) {
    candidateInputs.add(resolveFlexiblePath(cwd, normalizedHint));
    candidateInputs.add(resolve(dirname(cwd), normalizedHint));
    candidateInputs.add(resolve(home, normalizedHint));

    if (hintSegments.length > 0 && hintSegments[0].toLowerCase() === homeName) {
      candidateInputs.add(resolve(dirname(home), normalizedHint));
    }

    if (hintSegments.length === 1) {
      const leaf = hintSegments[0];
      candidateInputs.add(resolve(cwd, leaf));
      candidateInputs.add(resolve(dirname(cwd), leaf));
      candidateInputs.add(resolve(home, leaf));
    }
  }

  for (const candidate of candidateInputs) {
    attempted.add(candidate);
    if (isExistingDirectory(candidate)) {
      matches.add(candidate);
    }
  }

  const fallbackName = hintSegments[hintSegments.length - 1];
  if (matches.size === 0 && fallbackName) {
    for (const root of [cwd, dirname(cwd), home, dirname(home)]) {
      attempted.add(root);
      for (const match of findMatchingChildDirectories(root, fallbackName)) {
        matches.add(match);
      }
    }
  }

  return {
    matches: Array.from(matches),
    attempted: Array.from(attempted),
  };
}

function sanitizeDirectoryHint(hint: string): string {
  return normalizeUserPath(
    hint
      .replace(/\b(?:dir|directory|folder)\b/gi, '')
      .replace(/[.,!?]+$/g, '')
      .trim()
  );
}

function isExistingDirectory(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }

  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function findMatchingChildDirectories(root: string, name: string): string[] {
  if (!isExistingDirectory(root)) {
    return [];
  }

  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.toLowerCase() === name.toLowerCase())
      .map((entry) => resolve(root, entry.name));
  } catch {
    return [];
  }
}
