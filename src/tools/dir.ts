import { existsSync, statSync } from 'fs';
import { mkdir, readdir } from 'fs/promises';
import { resolve } from 'path';
import { resolveDirectoryHint, resolveFlexiblePath } from './path.js';

export interface CreateDirectoryArgs {
  path: string;
}

export interface CreateDirectoryResult {
  success: boolean;
  directoryPath?: string;
  existed?: boolean;
  error?: string;
}

export interface CountDirectoriesArgs {
  path?: string;
  recursive?: boolean;
}

export interface CountDirectoriesResult {
  success: boolean;
  directoryPath?: string;
  count?: number;
  directories?: string[];
  recursive?: boolean;
  error?: string;
}

export async function createDirectoryTool(
  args: CreateDirectoryArgs,
  cwd: string
): Promise<CreateDirectoryResult> {
  try {
    const targetPath = resolveFlexibleDirectoryPath(cwd, args.path);
    const existed = existsSync(targetPath);

    if (existed) {
      if (!statSync(targetPath).isDirectory()) {
        return {
          success: false,
          error: `A file already exists at ${targetPath}`,
        };
      }

      return {
        success: true,
        directoryPath: targetPath,
        existed: true,
      };
    }

    return {
      success: true,
      directoryPath: targetPath,
      existed: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error preparing directory creation';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function applyCreateDirectory(
  args: CreateDirectoryArgs,
  cwd: string
): Promise<CreateDirectoryResult> {
  try {
    const targetPath = resolveFlexibleDirectoryPath(cwd, args.path);
    const existed = existsSync(targetPath);

    if (existed) {
      if (!statSync(targetPath).isDirectory()) {
        return {
          success: false,
          error: `A file already exists at ${targetPath}`,
        };
      }
    } else {
      await mkdir(targetPath, { recursive: true });
    }

    return {
      success: true,
      directoryPath: targetPath,
      existed,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error creating directory';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function countDirectoriesTool(
  args: CountDirectoriesArgs,
  cwd: string
): Promise<CountDirectoriesResult> {
  try {
    const targetPath = resolveFlexibleDirectoryPath(cwd, args.path);

    if (!existsSync(targetPath) || !statSync(targetPath).isDirectory()) {
      return {
        success: false,
        error: `Directory not found: ${args.path || cwd}`,
      };
    }

    const directories = args.recursive
      ? await collectDirectoriesRecursive(targetPath)
      : await collectDirectoriesShallow(targetPath);

    return {
      success: true,
      directoryPath: targetPath,
      count: directories.length,
      directories,
      recursive: Boolean(args.recursive),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error counting directories';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export function formatCreateDirectoryResult(result: CreateDirectoryResult): string {
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  if (result.existed) {
    return `Directory already exists: ${result.directoryPath}`;
  }

  return `Created directory: ${result.directoryPath}`;
}

export function formatCountDirectoriesResult(result: CountDirectoriesResult): string {
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  const label = result.count === 1 ? 'directory' : 'directories';
  const scope = result.recursive ? 'recursively' : 'directly';
  const lines = result.directories?.slice(0, 20).map((directory) => `- ${directory}`) ?? [];

  let output = `There are ${result.count} ${label} in ${result.directoryPath} (${scope}).`;
  if (lines.length > 0) {
    output += `\n${lines.join('\n')}`;
  }

  if ((result.directories?.length ?? 0) > lines.length) {
    output += `\n...and ${result.directories!.length - lines.length} more.`;
  }

  return output;
}

function resolveFlexibleDirectoryPath(cwd: string, inputPath?: string): string {
  if (!inputPath) {
    return cwd;
  }

  const directPath = resolveFlexiblePath(cwd, inputPath);
  if (existsSync(directPath)) {
    return directPath;
  }

  const resolution = resolveDirectoryHint(cwd, inputPath);
  if (resolution.matches.length === 1) {
    return resolution.matches[0];
  }

  return directPath;
}

async function collectDirectoriesShallow(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(root, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function collectDirectoriesRecursive(root: string): Promise<string[]> {
  const directories: string[] = [];
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const directory = resolve(current, entry.name);
      directories.push(directory);
      queue.push(directory);
    }
  }

  return directories.sort((left, right) => left.localeCompare(right));
}
