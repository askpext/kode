import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createTwoFilesPatch } from 'diff';

export interface EditFileArgs {
  path: string;
  target: string;
  replacement: string;
}

export interface EditFileResult {
  success: boolean;
  error?: string;
  diff?: string;
  filePath?: string;
  occurrences?: number;
}

export async function generateDiff(filePath: string, oldContent: string, newContent: string): Promise<string> {
  const patch = createTwoFilesPatch(
    filePath,
    filePath,
    oldContent,
    newContent,
    'original',
    'modified'
  );

  // Colorize the diff
  const lines = patch.split('\n');
  const coloredLines = lines.map((line) => {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      return `\u001b[32m${line}\u001b[0m`; // Green for additions
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      return `\u001b[31m${line}\u001b[0m`; // Red for deletions
    }
    if (line.startsWith('@@')) {
      return `\u001b[36m${line}\u001b[0m`; // Cyan for hunk headers
    }
    return line;
  });

  return coloredLines.join('\n');
}

export async function editFileTool(args: EditFileArgs, cwd: string): Promise<EditFileResult> {
  const filePath = join(cwd, args.path);

  if (!existsSync(filePath)) {
    return {
      success: false,
      error: `File not found: ${args.path}`,
    };
  }

  try {
    const content = await readFile(filePath, 'utf-8');

    // Count occurrences of target
    const occurrences = (content.match(new RegExp(escapeRegex(args.target), 'g')) || []).length;

    if (occurrences === 0) {
      return {
        success: false,
        error: `Target string not found in file: ${args.path}`,
        occurrences: 0,
      };
    }

    if (occurrences > 1) {
      return {
        success: false,
        error: `Target string found ${occurrences} times. Please use a more specific target or use write_file for full replacement.`,
        occurrences,
      };
    }

    // Replace the target with replacement
    const newContent = content.replace(args.target, args.replacement);

    // Generate diff
    const diff = await generateDiff(args.path, content, newContent);

    return {
      success: true,
      diff,
      filePath: args.path,
      occurrences: 1,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error editing file';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function applyEditFile(args: EditFileArgs, cwd: string): Promise<{ success: boolean; error?: string }> {
  const filePath = join(cwd, args.path);

  if (!existsSync(filePath)) {
    return {
      success: false,
      error: `File not found: ${args.path}`,
    };
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    const newContent = content.replace(args.target, args.replacement);
    await writeFile(filePath, newContent, 'utf-8');

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error applying edit';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function formatEditResult(result: EditFileResult): string {
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  let output = `File: ${result.filePath}\n`;
  output += result.diff || '(no changes)';
  return output;
}
