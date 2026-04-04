import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { createTwoFilesPatch } from 'diff';
import { resolveWorkspacePath } from './path.js';

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

  const lines = patch.split('\n');
  const coloredLines = lines.map((line) => {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      return `\u001b[32m${line}\u001b[0m`;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      return `\u001b[31m${line}\u001b[0m`;
    }
    if (line.startsWith('@@')) {
      return `\u001b[36m${line}\u001b[0m`;
    }
    return line;
  });

  return coloredLines.join('\n');
}

export async function editFileTool(args: EditFileArgs, cwd: string): Promise<EditFileResult> {
  try {
    const { absolutePath, displayPath } = resolveWorkspacePath(cwd, args.path);

    if (!existsSync(absolutePath)) {
      return {
        success: false,
        error: `File not found: ${displayPath}`,
      };
    }

    const content = await readFile(absolutePath, 'utf-8');
    const occurrences = (content.match(new RegExp(escapeRegex(args.target), 'g')) || []).length;

    if (occurrences === 0) {
      return {
        success: false,
        error: `Target string not found in file: ${displayPath}`,
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

    const newContent = content.replace(args.target, args.replacement);
    const diff = await generateDiff(displayPath, content, newContent);

    return {
      success: true,
      diff,
      filePath: displayPath,
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
  try {
    const { absolutePath, displayPath } = resolveWorkspacePath(cwd, args.path);

    if (!existsSync(absolutePath)) {
      return {
        success: false,
        error: `File not found: ${displayPath}`,
      };
    }

    const content = await readFile(absolutePath, 'utf-8');
    const newContent = content.replace(args.target, args.replacement);
    await writeFile(absolutePath, newContent, 'utf-8');

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

export interface MultiEditArgs {
  path: string;
  edits: Array<{ target: string; replacement: string }>;
}

export async function multiEditFileTool(args: MultiEditArgs, cwd: string): Promise<EditFileResult> {
  try {
    const { absolutePath, displayPath } = resolveWorkspacePath(cwd, args.path);

    if (!existsSync(absolutePath)) {
      return { success: false, error: `File not found: ${displayPath}` };
    }

    let content = await readFile(absolutePath, 'utf-8');
    const oldContent = content;

    for (let i = 0; i < args.edits.length; i++) {
      const { target, replacement } = args.edits[i];
      const occurrences = (content.match(new RegExp(escapeRegex(target), 'g')) || []).length;
      if (occurrences === 0) {
        return { success: false, error: `Target string not found for edit index ${i}: \n${target}` };
      }
      if (occurrences > 1) {
        return { success: false, error: `Target string found ${occurrences} times for edit index ${i}. Must be unique.` };
      }
      content = content.replace(target, replacement);
    }

    const diff = await generateDiff(displayPath, oldContent, content);

    return {
      success: true,
      diff,
      filePath: displayPath,
      occurrences: args.edits.length,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function applyMultiEditFile(args: MultiEditArgs, cwd: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { absolutePath, displayPath } = resolveWorkspacePath(cwd, args.path);

    if (!existsSync(absolutePath)) {
      return { success: false, error: `File not found: ${displayPath}` };
    }

    let content = await readFile(absolutePath, 'utf-8');
    for (const edit of args.edits) {
      content = content.replace(edit.target, edit.replacement);
    }
    await writeFile(absolutePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
