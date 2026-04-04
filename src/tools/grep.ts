import { execa } from 'execa';
import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { resolveFlexiblePath } from './path.js';

export interface GrepArgs {
  pattern: string;
  path?: string;
  include?: string;
  exclude?: string;
  caseSensitive?: boolean;
  maxResults?: number;
}

export interface GrepResult {
  success: boolean;
  results?: Array<{
    file: string;
    line: number;
    content: string;
  }>;
  totalFound?: number;
  truncated?: boolean;
  error?: string;
}

const DEFAULT_MAX_RESULTS = 50;

export async function grepTool(args: GrepArgs, cwd: string): Promise<GrepResult> {
  const maxResults = args.maxResults || DEFAULT_MAX_RESULTS;
  const searchPath = args.path ? resolveFlexiblePath(cwd, args.path) : cwd;

  // Try ripgrep first
  try {
    const rgArgs = [
      args.pattern,
      '--line-number',
      '--no-heading',
      '--color', 'never',
    ];

    if (args.include) {
      rgArgs.push('--glob', args.include);
    }

    if (args.exclude) {
      rgArgs.push('--glob', `!${args.exclude}`);
    }

    if (!args.caseSensitive) {
      rgArgs.push('--ignore-case');
    }

    rgArgs.push(searchPath);

    const { stdout, exitCode } = await execa('rg', rgArgs, {
      cwd,
      reject: false,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    if (exitCode === 0 || stdout) {
      const results = parseRipgrepOutput(stdout, maxResults);
      return {
        success: true,
        results: results.results,
        totalFound: results.total,
        truncated: results.truncated,
      };
    }

    if (exitCode === 1) {
      // No matches found
      return {
        success: true,
        results: [],
        totalFound: 0,
      };
    }

    // ripgrep failed, fall back to Node implementation
  } catch {
    // ripgrep not available, fall back to Node implementation
  }

  // Fallback: Node.js glob + regex
  return grepWithNode(args, cwd, maxResults);
}

async function grepWithNode(args: GrepArgs, cwd: string, maxResults: number): Promise<GrepResult> {
  const searchPath = args.path ? resolveFlexiblePath(cwd, args.path) : cwd;
  const pattern = args.include || '**/*.{ts,tsx,js,jsx,py,rs,go,java,c,cpp,h,hpp,md,json,yaml,yml,txt}';

  try {
    const files = await glob(pattern, {
      cwd: searchPath,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/*.min.js'],
      absolute: false,
    });

    const regex = new RegExp(
      args.pattern,
      args.caseSensitive ? 'g' : 'gi'
    );

    const results: Array<{ file: string; line: number; content: string }> = [];
    let totalFound = 0;

    for (const file of files) {
      try {
        const content = await readFile(join(searchPath, file), 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const matches = line.match(regex);

          if (matches) {
            totalFound += matches.length;

            if (results.length < maxResults) {
              results.push({
                file,
                line: i + 1,
                content: line.trim(),
              });
            }
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return {
      success: true,
      results,
      totalFound,
      truncated: totalFound > maxResults,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during grep';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

function parseRipgrepOutput(output: string, maxResults: number): {
  results: Array<{ file: string; line: number; content: string }>;
  total: number;
  truncated: boolean;
} {
  const lines = output.split('\n').filter(Boolean);
  const results: Array<{ file: string; line: number; content: string }> = [];

  for (const line of lines) {
    // ripgrep format: file:line:content
    const match = line.match(/^([^:]+):(\d+):(.*)$/);
    if (match) {
      const [, file, lineNum, content] = match;

      if (results.length < maxResults) {
        results.push({
          file,
          line: parseInt(lineNum, 10),
          content: content.replace(/\u001b\[[0-9;]*m/g, ''), // Strip ANSI codes
        });
      }
    }
  }

  return {
    results,
    total: lines.length,
    truncated: lines.length > maxResults,
  };
}

export function formatGrepResult(result: GrepResult): string {
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  if (!result.results || result.results.length === 0) {
    return 'No matches found';
  }

  let output = `Found ${result.totalFound} match${result.totalFound !== 1 ? 'es' : ''}`;
  if (result.truncated) {
    output += ` (showing first ${result.results.length})`;
  }
  output += ':\n\n';

  for (const r of result.results) {
    output += `${r.file}:${r.line}: ${r.content}\n`;
  }

  return output;
}
