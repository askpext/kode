import { readFile } from 'fs/promises';
import { join, relative } from 'path';
import { existsSync } from 'fs';
import { countTokens } from '../utils/tokens.js';

export interface ReadFileArgs {
  path: string;
  startLine?: number;
  endLine?: number;
}

export interface ReadFileResult {
  success: boolean;
  content?: string;
  error?: string;
  truncated?: boolean;
  totalLines?: number;
  shownLines?: { start: number; end: number };
}

const MAX_FILE_TOKENS = 8000;
const DEFAULT_PREVIEW_LINES = 200;

export async function readFileTool(args: ReadFileArgs, cwd: string): Promise<ReadFileResult> {
  const filePath = join(cwd, args.path);

  if (!existsSync(filePath)) {
    return {
      success: false,
      error: `File not found: ${args.path}`,
    };
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const totalLines = lines.length;
    const fileTokens = countTokens(content);

    // If file is small enough, return it all
    if (fileTokens <= MAX_FILE_TOKENS && !args.startLine && !args.endLine) {
      return {
        success: true,
        content,
        totalLines,
        shownLines: { start: 1, end: totalLines },
      };
    }

    // Determine line range to read
    let startLine = args.startLine || 1;
    let endLine = args.endLine || Math.min(DEFAULT_PREVIEW_LINES, totalLines);

    // If file is large and no specific range requested, show first chunk
    if (!args.startLine && !args.endLine && fileTokens > MAX_FILE_TOKENS) {
      // Find where to cut off based on tokens
      let currentTokens = 0;
      endLine = 0;

      for (let i = 0; i < lines.length; i++) {
        const lineTokens = countTokens(lines[i]);
        if (currentTokens + lineTokens > MAX_FILE_TOKENS) {
          endLine = i;
          break;
        }
        currentTokens += lineTokens;
        endLine = i + 1;
      }

      endLine = Math.min(endLine, DEFAULT_PREVIEW_LINES);
    }

    // Extract the requested lines
    const selectedLines = lines.slice(startLine - 1, endLine);
    const selectedContent = selectedLines.join('\n');

    return {
      success: true,
      content: selectedContent,
      truncated: endLine < totalLines,
      totalLines,
      shownLines: { start: startLine, end: endLine },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error reading file';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export function formatReadResult(result: ReadFileResult): string {
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  let output = result.content || '';

  if (result.truncated && result.totalLines) {
    output += `\n\n[File truncated: showing lines ${result.shownLines?.start}-${result.shownLines?.end} of ${result.totalLines} total lines]`;
    output += `\n[To read more, specify startLine and endLine parameters]`;
  }

  return output;
}
