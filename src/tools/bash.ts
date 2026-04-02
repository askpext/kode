import { execa } from 'execa';

export interface BashArgs {
  command: string;
  cwd?: string;
}

export interface BashResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
  timedOut?: boolean;
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds

export async function bashTool(args: BashArgs, cwd: string, timeout: number = DEFAULT_TIMEOUT): Promise<BashResult> {
  const commandCwd = args.cwd || cwd;

  try {
    const child = execa(args.command, {
      shell: true,
      cwd: commandCwd,
      timeout,
      buffer: false,
      all: true,
    });

    let stdout = '';
    let stderr = '';

    // Stream output
    if (child.stdout) {
      for await (const chunk of child.stdout) {
        stdout += chunk;
        process.stdout.write(chunk);
      }
    }

    if (child.stderr) {
      for await (const chunk of child.stderr) {
        stderr += chunk;
        process.stderr.write(chunk);
      }
    }

    const result = await child;

    return {
      success: result.exitCode === 0,
      stdout: result.stdout || stdout,
      stderr: result.stderr || stderr,
      exitCode: result.exitCode,
    };
  } catch (error) {
    if (error instanceof Error) {
      // Check if it's a timeout
      if (error.message.includes('timed out')) {
        return {
          success: false,
          error: `Command timed out after ${timeout / 1000} seconds`,
          timedOut: true,
        };
      }

      // Handle execa error with output
      const execaError = error as Error & { stdout?: string; stderr?: string; exitCode?: number };

      return {
        success: false,
        stdout: execaError.stdout,
        stderr: execaError.stderr,
        exitCode: execaError.exitCode,
        error: execaError.message,
      };
    }

    return {
      success: false,
      error: 'Unknown error executing command',
    };
  }
}

export function formatBashResult(result: BashResult): string {
  let output = '';

  if (result.stdout) {
    output += result.stdout;
  }

  if (result.stderr) {
    if (output) output += '\n';
    output += result.stderr;
  }

  if (result.error) {
    if (output) output += '\n';
    output += `Error: ${result.error}`;
  }

  if (result.timedOut) {
    output += '\n(Command timed out)';
  }

  if (result.exitCode !== undefined && result.exitCode !== 0) {
    output += `\n(Exit code: ${result.exitCode})`;
  }

  return output || '(no output)';
}
