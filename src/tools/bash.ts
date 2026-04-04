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

import { v4 as uuidv4 } from 'uuid';
import { ExecaChildProcess } from 'execa';

export interface ProcessInfo {
  id: string;
  command: string;
  process: ExecaChildProcess;
  stdout: string[];
  stderr: string[];
  status: 'running' | 'completed' | 'failed' | 'terminated';
  exitCode?: number;
}

const backgroundProcesses = new Map<string, ProcessInfo>();

export interface BashBackgroundArgs {
  command: string;
  cwd?: string;
}

export async function bashBackgroundTool(args: BashBackgroundArgs, cwd: string): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const id = uuidv4();
    const child = execa(args.command, {
      shell: true,
      cwd: args.cwd || cwd,
      buffer: false,
      all: true,
    });

    const processInfo: ProcessInfo = {
      id,
      command: args.command,
      process: child,
      stdout: [],
      stderr: [],
      status: 'running',
    };

    backgroundProcesses.set(id, processInfo);

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        processInfo.stdout.push(chunk.toString());
        if (processInfo.stdout.length > 500) processInfo.stdout.shift();
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        processInfo.stderr.push(chunk.toString());
        if (processInfo.stderr.length > 500) processInfo.stderr.shift();
      });
    }

    child.then((result) => {
      processInfo.status = 'completed';
      processInfo.exitCode = result.exitCode;
    }).catch((error) => {
       if (processInfo.status !== 'terminated') {
           processInfo.status = 'failed';
           processInfo.exitCode = error.exitCode;
       }
    });

    return { success: true, id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export interface BashStatusArgs {
  id: string;
  action: 'read' | 'terminate';
}

export async function bashStatusTool(args: BashStatusArgs): Promise<BashResult> {
  const processInfo = backgroundProcesses.get(args.id);
  if (!processInfo) {
    return { success: false, error: `No background process found with ID ${args.id}` };
  }

  if (args.action === 'terminate') {
    if (processInfo.status === 'running') {
      processInfo.process.kill();
      processInfo.status = 'terminated';
      return { success: true, stdout: `Process ${args.id} terminated successfully.\nStatus: terminated` };
    }
    return { success: true, stdout: `Process ${args.id} was already ${processInfo.status}.` };
  }

  const stdoutStr = processInfo.stdout.join('');
  const stderrStr = processInfo.stderr.join('');

  processInfo.stdout = [];
  processInfo.stderr = [];

  return {
    success: true,
    stdout: `[Status: ${processInfo.status}]\n${stdoutStr}`,
    stderr: stderrStr,
    exitCode: processInfo.exitCode
  };
}

export function cleanupBackgroundProcesses() {
  for (const [id, processInfo] of backgroundProcesses.entries()) {
    if (processInfo.status === 'running') {
      try {
        processInfo.process.kill();
      } catch (e) {
        // ignore
      }
    }
  }
}
