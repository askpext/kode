import { execa } from 'execa';
import { existsSync } from 'fs';
import { join, dirname } from 'path';

export interface GitStatus {
  isGitRepo: boolean;
  hasChanges: boolean;
  branch?: string;
  status?: string;
}

export async function checkGitStatus(cwd: string): Promise<GitStatus> {
  try {
    // Check if it's a git repo
    const { stdout: revParse } = await execa('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      reject: false,
    });

    if (revParse.trim() !== 'true') {
      return { isGitRepo: false, hasChanges: false };
    }

    // Get current branch
    const { stdout: branch } = await execa('git', ['branch', '--show-current'], {
      cwd,
      reject: false,
    });

    // Get status
    const { stdout: status } = await execa('git', ['status', '--short'], {
      cwd,
      reject: false,
    });

    return {
      isGitRepo: true,
      hasChanges: status.trim().length > 0,
      branch: branch.trim(),
      status: status.trim(),
    };
  } catch {
    return { isGitRepo: false, hasChanges: false };
  }
}

export async function getGitStatusString(cwd: string): Promise<string> {
  const status = await checkGitStatus(cwd);

  if (!status.isGitRepo) {
    return 'not a git repository';
  }

  if (!status.hasChanges) {
    return `on branch ${status.branch || 'unknown'}, no changes`;
  }

  return `on branch ${status.branch || 'unknown'}, ${status.status.split('\n').length} changed file(s)`;
}

export async function createGitSnapshot(filePath: string, cwd: string): Promise<string | null> {
  try {
    // Check if file exists and is tracked
    const { stdout: lsFiles } = await execa('git', ['ls-files', filePath], {
      cwd,
      reject: false,
    });

    if (lsFiles.trim() !== filePath && lsFiles.trim() !== filePath.replace(/\\/g, '/')) {
      // File is not tracked, read it directly
      const { readFile } = await import('fs/promises');
      if (existsSync(join(cwd, filePath))) {
        return await readFile(join(cwd, filePath), 'utf-8');
      }
      return null;
    }

    // Get the current content from git
    const { stdout } = await execa('git', ['show', `HEAD:${filePath}`], {
      cwd,
      reject: false,
    });

    return stdout;
  } catch {
    return null;
  }
}

export async function restoreFromGitSnapshot(filePath: string, cwd: string): Promise<boolean> {
  try {
    await execa('git', ['checkout', 'HEAD', '--', filePath], {
      cwd,
      reject: false,
    });
    return true;
  } catch {
    return false;
  }
}

export async function stageFile(filePath: string, cwd: string): Promise<boolean> {
  try {
    await execa('git', ['add', filePath], {
      cwd,
      reject: false,
    });
    return true;
  } catch {
    return false;
  }
}

export async function getDiff(filePath: string, cwd: string): Promise<string> {
  try {
    const { stdout } = await execa('git', ['diff', 'HEAD', '--', filePath], {
      cwd,
      reject: false,
    });
    return stdout;
  } catch {
    return '';
  }
}

export async function initGitIfNotExists(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execa('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      reject: false,
    });

    if (stdout.trim() === 'true') {
      return true;
    }

    await execa('git', ['init'], { cwd, reject: false });
    return true;
  } catch {
    return false;
  }
}

export async function ensureGitConfig(cwd: string): Promise<void> {
  try {
    // Check if user.name is set
    const { stdout: userName } = await execa('git', ['config', 'user.name'], {
      cwd,
      reject: false,
    });

    if (!userName.trim()) {
      await execa('git', ['config', 'user.name', 'Kode AI'], { cwd, reject: false });
    }

    // Check if user.email is set
    const { stdout: userEmail } = await execa('git', ['config', 'user.email'], {
      cwd,
      reject: false,
    });

    if (!userEmail.trim()) {
      await execa('git', ['config', 'user.email', 'kode@local'], { cwd, reject: false });
    }
  } catch {
    // Ignore errors
  }
}

export async function createUndoCommit(snapshotId: string, cwd: string): Promise<boolean> {
  try {
    await execa('git', ['commit', '-m', `Kode undo: ${snapshotId}`], {
      cwd,
      reject: false,
    });
    return true;
  } catch {
    return false;
  }
}

export function isGitAvailable(): boolean {
  try {
    const { execSync } = require('child_process');
    execSync('git --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
