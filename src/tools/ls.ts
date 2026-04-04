import { readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { resolveDirectoryHint, resolveFlexiblePath } from './path.js';

export interface LsArgs {
  path?: string;
  showHidden?: boolean;
}

export interface LsResult {
  success: boolean;
  entries?: Array<{
    name: string;
    type: 'file' | 'directory' | 'symlink';
    size?: number;
  }>;
  error?: string;
  path?: string;
}

export async function lsTool(args: LsArgs, cwd: string): Promise<LsResult> {
  let targetPath = args.path ? resolveFlexiblePath(cwd, args.path) : cwd;

  if (args.path && !existsSync(targetPath)) {
    const hintResolution = resolveDirectoryHint(cwd, args.path);
    if (hintResolution.matches.length === 1) {
      targetPath = hintResolution.matches[0];
    }
  }

  if (!existsSync(targetPath)) {
    return {
      success: false,
      error: `Path not found: ${args.path || cwd}`,
    };
  }

  try {
    const entries = await readdir(targetPath, { withFileTypes: true });
    const showHidden = args.showHidden || false;

    const results: Array<{
      name: string;
      type: 'file' | 'directory' | 'symlink';
      size?: number;
    }> = [];

    for (const entry of entries) {
      // Skip hidden files unless requested
      if (!showHidden && entry.name.startsWith('.')) {
        continue;
      }

      let type: 'file' | 'directory' | 'symlink' = 'file';

      if (entry.isDirectory()) {
        type = 'directory';
      } else if (entry.isSymbolicLink()) {
        type = 'symlink';
      }

      const resultEntry = {
        name: entry.name,
        type,
      };

      // Get file size for files (skip for directories to save time)
      if (entry.isFile()) {
        try {
          const stats = await stat(join(targetPath, entry.name));
          resultEntry.size = stats.size;
        } catch {
          // Ignore stat errors
        }
      }

      results.push(resultEntry);
    }

    // Sort: directories first, then files, alphabetically
    results.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    return {
      success: true,
      entries: results,
      path: targetPath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error listing directory';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export function formatLsResult(result: LsResult): string {
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  if (!result.entries || result.entries.length === 0) {
    return `(empty directory)`;
  }

  let output = `Directory: ${result.path}\n\n`;

  const dirs = result.entries.filter((e) => e.type === 'directory');
  const files = result.entries.filter((e) => e.type === 'file');
  const symlinks = result.entries.filter((e) => e.type === 'symlink');

  if (dirs.length > 0) {
    output += 'Directories:\n';
    for (const dir of dirs) {
      output += `  📁 ${dir.name}/\n`;
    }
    output += '\n';
  }

  if (files.length > 0) {
    output += 'Files:\n';
    for (const file of files) {
      const sizeStr = file.size ? formatSize(file.size) : '';
      output += `  📄 ${file.name}${sizeStr ? ` (${sizeStr})` : ''}\n`;
    }
    output += '\n';
  }

  if (symlinks.length > 0) {
    output += 'Symlinks:\n';
    for (const link of symlinks) {
      output += `  🔗 ${link.name}\n`;
    }
  }

  return output.trim();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
