import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createTwoFilesPatch } from 'diff';

export interface WriteFileArgs {
  path: string;
  content: string;
}

export interface WriteFileResult {
  success: boolean;
  error?: string;
  diff?: string;
  filePath?: string;
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

export async function writeFileTool(args: WriteFileArgs, cwd: string): Promise<WriteFileResult> {
  const filePath = join(cwd, args.path);

  try {
    // Read existing content if file exists
    let oldContent = '';
    if (existsSync(filePath)) {
      oldContent = await readFile(filePath, 'utf-8');
    }

    // Generate diff
    const diff = await generateDiff(args.path, oldContent, args.content);

    return {
      success: true,
      diff,
      filePath: args.path,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error preparing file write';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function applyWriteFile(args: WriteFileArgs, cwd: string): Promise<{ success: boolean; error?: string }> {
  const filePath = join(cwd, args.path);

  try {
    // Ensure directory exists
    const { mkdir } = await import('fs/promises');
    const dir = join(filePath, '..');
    await mkdir(dir, { recursive: true });

    // Write the file
    await writeFile(filePath, args.content, 'utf-8');

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error writing file';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export function formatWriteResult(result: WriteFileResult): string {
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  let output = `File: ${result.filePath}\n`;
  output += result.diff || '(new file)';
  return output;
}
