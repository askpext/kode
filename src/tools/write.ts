import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { createTwoFilesPatch } from 'diff';
import { getParentDirectory, resolveWorkspacePath } from './path.js';

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

export async function writeFileTool(args: WriteFileArgs, cwd: string): Promise<WriteFileResult> {
  try {
    const { absolutePath, displayPath } = resolveWorkspacePath(cwd, args.path);

    let oldContent = '';
    if (existsSync(absolutePath)) {
      oldContent = await readFile(absolutePath, 'utf-8');
    }

    const diff = await generateDiff(displayPath, oldContent, args.content);

    return {
      success: true,
      diff,
      filePath: displayPath,
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
  try {
    const { absolutePath } = resolveWorkspacePath(cwd, args.path);
    await mkdir(getParentDirectory(absolutePath), { recursive: true });
    await writeFile(absolutePath, args.content, 'utf-8');

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
