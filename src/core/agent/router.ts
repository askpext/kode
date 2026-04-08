export type DeterministicDomain = 'workspace' | 'directory' | 'file' | 'analysis' | 'task';

export interface DeterministicTask {
  type:
    | 'test' | 'build' | 'dev' | 'clone' | 'delete'
    | 'git_status' | 'git_commit' | 'git_push' | 'git_pull' | 'git_checkout'
    | 'git_diff' | 'git_log' | 'git_stash' | 'git_branch'
    | 'create_file' | 'move_file' | 'copy_file'
    | 'install_pkg' | 'uninstall_pkg' | 'install_deps'
    | 'kill_process' | 'list_processes'
    | 'download' | 'extract' | 'compress'
    | 'chmod' | 'disk_usage' | 'env_var'
    | 'docker_run' | 'docker_stop' | 'docker_build' | 'docker_ps';
  label: string;
  successLabel: string;
  background: boolean;
}

export function looksLikeDirectoryFollowup(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 120) {
    return false;
  }

  if (/["'`]/.test(trimmed)) {
    return false;
  }

  if (/\b(make|create|read|show|replace|change|run|start|build|test|analy[sz]e)\b/i.test(trimmed)) {
    return false;
  }

  if (/\s/.test(trimmed) && !/[\\/]/.test(trimmed)) {
    return false;
  }

  return /^([A-Za-z0-9._~/-]+(?:\\[A-Za-z0-9._ -]+)*)$/.test(trimmed)
    || /^[A-Za-z0-9._ -]+\/[A-Za-z0-9._ -]+$/.test(trimmed)
    || /^[A-Za-z0-9._ -]+$/.test(trimmed);
}

export function detectDeterministicTask(userMessage: string): DeterministicTask | null {
  const trimmed = userMessage.trim().toLowerCase();

  // === Tier 1: Daily Essentials ===

  if (/^(run|start|execute)?\s*(the\s+)?tests?\b|^test this\b|^check tests?\b/.test(trimmed)) {
    return {
      type: 'test',
      label: 'tests',
      successLabel: 'Tests',
      background: false,
    };
  }

  if (/^(run|start|execute)?\s*(the\s+)?build\b|^build (this|it|project|repo)?\b/.test(trimmed)) {
    return {
      type: 'build',
      label: 'the build',
      successLabel: 'Build',
      background: false,
    };
  }

  if (/^(run|start)\s+(the\s+)?(dev|development)\s+(server|mode)\b|^(run|start)\s+dev\b/.test(trimmed)) {
    return {
      type: 'dev',
      label: 'the dev server',
      successLabel: 'Dev server',
      background: true,
    };
  }

  // Git clone task
  if (/\b(clone)\b.*\b(repo|repository|github|gitlab)\b/.test(trimmed) || /^clone\s+https?:\/\//.test(trimmed)) {
    return {
      type: 'clone',
      label: 'the repository clone',
      successLabel: 'Clone',
      background: false,
    };
  }

  // Delete/remove task
  if (/\b(delete|remove|rm|rmdir|unlink)\b/.test(trimmed)) {
    return {
      type: 'delete',
      label: 'the deletion',
      successLabel: 'Delete',
      background: false,
    };
  }

  // Git status
  if (/git\s*status|what\s*(did|has)\s*(changed|change)|show\s*(modified|changed)\s*files|check\s*status/.test(trimmed)) {
    return {
      type: 'git_status',
      label: 'git status',
      successLabel: 'Git status',
      background: false,
    };
  }

  // Git commit
  if (/git\s*commit|commit\s*(changes?|this|it|with)|save\s*changes?\s*(as|with)/.test(trimmed)) {
    return {
      type: 'git_commit',
      label: 'git commit',
      successLabel: 'Commit',
      background: false,
    };
  }

  // Git push
  if (/git\s*push|push\s*(changes?|to\s*(remote|origin)|up)/.test(trimmed)) {
    return {
      type: 'git_push',
      label: 'git push',
      successLabel: 'Push',
      background: false,
    };
  }

  // Git pull/fetch
  if (/git\s*(pull|fetch)|pull\s*(latest|updates?|changes?)|sync\s*(with\s*)?remote|fetch\s*(updates?|changes?)/.test(trimmed)) {
    return {
      type: 'git_pull',
      label: 'git pull',
      successLabel: 'Pull',
      background: false,
    };
  }

  // Git checkout/switch branch
  if (/git\s*(checkout|switch)|switch\s*to\s*branch|checkout\s*branch|go\s*to\s*branch/.test(trimmed)) {
    return {
      type: 'git_checkout',
      label: 'git branch switch',
      successLabel: 'Checkout',
      background: false,
    };
  }

  // Git diff
  if (/git\s*diff|show\s*diff|what\s*changed\s*in|show\s*differences?/.test(trimmed)) {
    return {
      type: 'git_diff',
      label: 'git diff',
      successLabel: 'Diff',
      background: false,
    };
  }

  // Git log
  if (/git\s*log|commit\s*history|recent\s*commits|who\s*changed|show\s*commits?/.test(trimmed)) {
    return {
      type: 'git_log',
      label: 'git log',
      successLabel: 'Log',
      background: false,
    };
  }

  // Git stash
  if (/git\s*stash|stash\s*changes?|save\s*work\s*temporarily|pop\s*stash/.test(trimmed)) {
    return {
      type: 'git_stash',
      label: 'git stash',
      successLabel: 'Stash',
      background: false,
    };
  }

  // Git branch
  if (/git\s*branch|list\s*branches?|create\s*branch|delete\s*branch|show\s*branches?/.test(trimmed)) {
    return {
      type: 'git_branch',
      label: 'git branch',
      successLabel: 'Branch',
      background: false,
    };
  }

  // Create file
  if (/(create|make|new|touch)\s*(a\s*)?file|touch\s+\S+/.test(trimmed)) {
    return {
      type: 'create_file',
      label: 'file creation',
      successLabel: 'Create',
      background: false,
    };
  }

  // Move/rename file
  if (/\b(move|rename|mv)\b/.test(trimmed)) {
    return {
      type: 'move_file',
      label: 'the move',
      successLabel: 'Move',
      background: false,
    };
  }

  // Copy file
  if (/\b(copy|duplicate|cp)\b/.test(trimmed)) {
    return {
      type: 'copy_file',
      label: 'the copy',
      successLabel: 'Copy',
      background: false,
    };
  }

  // === Tier 2: Very Common ===

  // Install package
  if (/(install|add)\s*(package|dependency|dev-?\s*dependency)?\s*\S+\s*(npm|pip|yarn|npm\s+install|pip\s+install)/.test(trimmed)
    || /npm\s+install\s+\S+|pip\s+install\s+\S+|yarn\s+add\s+\S+/.test(trimmed)) {
    return {
      type: 'install_pkg',
      label: 'package install',
      successLabel: 'Install',
      background: false,
    };
  }

  // Uninstall package
  if (/(uninstall|remove)\s*package|npm\s+uninstall|pip\s+uninstall|yarn\s+remove/.test(trimmed)) {
    return {
      type: 'uninstall_pkg',
      label: 'package removal',
      successLabel: 'Uninstall',
      background: false,
    };
  }

  // Install dependencies
  if (/install\s*(dependencies?|deps|packages)|npm\s*(install|ci)|yarn\s*install|pip\s+install\s+-r/.test(trimmed)) {
    return {
      type: 'install_deps',
      label: 'dependency install',
      successLabel: 'Install',
      background: false,
    };
  }

  // Kill process
  if (/\b(kill|stop)\b.*\b(process|port|pid|pkill|lsof)\b|kill\s+-?\d+/.test(trimmed)) {
    return {
      type: 'kill_process',
      label: 'process kill',
      successLabel: 'Kill',
      background: false,
    };
  }

  // List processes
  if (/show\s*processes|list\s*(running\s*)?processes|ps\s*aux|what'?s\s*running|what'?s\s*using\s*port/.test(trimmed)) {
    return {
      type: 'list_processes',
      label: 'process list',
      successLabel: 'Processes',
      background: false,
    };
  }

  // Download file
  if (/\b(download|curl|wget|fetch)\b.*\b(url|from|http)/.test(trimmed) || /^(curl|wget)\s+https?:\/\//.test(trimmed)) {
    return {
      type: 'download',
      label: 'the download',
      successLabel: 'Download',
      background: false,
    };
  }

  // Extract archive
  if (/\b(unzip|extract|unpack|tar)\b.*\b(file|archive|\.(zip|tar|gz|tgz))/i.test(trimmed)
    || /unzip\s+\S+|tar\s+-x/.test(trimmed)) {
    return {
      type: 'extract',
      label: 'archive extraction',
      successLabel: 'Extract',
      background: false,
    };
  }

  // Compress/archive
  if (/\b(zip|compress|archive|tar)\b.*\b(file|folder|directory)/i.test(trimmed)
    || /tar\s+-c|zip\s+-r/.test(trimmed)) {
    return {
      type: 'compress',
      label: 'archive creation',
      successLabel: 'Compress',
      background: false,
    };
  }

  // === Tier 3: Common ===

  // Chmod
  if (/\b(chmod|make\s+\S+\s+executable|change\s*permissions?)\b/.test(trimmed)) {
    return {
      type: 'chmod',
      label: 'permission change',
      successLabel: 'Chmod',
      background: false,
    };
  }

  // Disk usage
  if (/\b(disk|space|storage)\b.*\b(usage|free|used|available|how\s*much)/i.test(trimmed)
    || /\bhow\s*much\s*(space|disk)/i.test(trimmed)
    || /^df\s*-h|^du\s*-sh/.test(trimmed)) {
    return {
      type: 'disk_usage',
      label: 'disk usage',
      successLabel: 'Disk',
      background: false,
    };
  }

  // Environment variable
  if (/\b(set|export)\b.*\b(env(ironment)?\s*(var(iable)?)?|=)/i.test(trimmed)
    || /^export\s+\w+=/.test(trimmed)) {
    return {
      type: 'env_var',
      label: 'environment variable',
      successLabel: 'Env',
      background: false,
    };
  }

  // Docker run
  if (/docker\s+run|start\s*container|spin\s*up\s*container|run\s*docker\s*image/.test(trimmed)) {
    return {
      type: 'docker_run',
      label: 'docker container',
      successLabel: 'Docker',
      background: false,
    };
  }

  // Docker stop/remove
  if (/docker\s*(stop|rm|remove)|stop\s*container|remove\s*container|kill\s*container/.test(trimmed)) {
    return {
      type: 'docker_stop',
      label: 'docker stop',
      successLabel: 'Docker',
      background: false,
    };
  }

  // Docker build
  if (/docker\s*build|build\s*docker|build\s*image\s*from/.test(trimmed)) {
    return {
      type: 'docker_build',
      label: 'docker build',
      successLabel: 'Docker build',
      background: false,
    };
  }

  // Docker ps/images/logs
  if (/docker\s*(ps|images|logs|container)|list\s*containers?|show\s*docker|docker\s*logs/.test(trimmed)) {
    return {
      type: 'docker_ps',
      label: 'docker info',
      successLabel: 'Docker',
      background: false,
    };
  }

  return null;
}

export function classifyDeterministicDomain(
  userMessage: string,
  lastMissingDirectoryHint: string | null
): DeterministicDomain | null {
  const trimmed = userMessage.trim().toLowerCase();

  // Clone repo - should trigger bash git clone, not directory search
  if (/\b(clone)\b.*\b(repo|repository|github|gitlab)\b/.test(trimmed) || /^clone\s+https?:\/\//.test(trimmed)) {
    return 'task';
  }

  // Delete/remove operations - should trigger bash rm/rmdir
  if (/\b(delete|remove|rm|rmdir|unlink)\b/.test(trimmed)) {
    return 'task';
  }

  if (looksLikeDirectoryFollowup(trimmed) && lastMissingDirectoryHint) {
    return 'workspace';
  }

  // Analyze/inspect code - catch BEFORE workspace/navigation checks
  // Broader pattern: "analyze X", "inspect X dir", "review the project" etc.
  if (/\b(analy[sz]e|inspect|review|summari[sz]e|understand)\b/i.test(trimmed)) {
    return 'analysis';
  }

  // Go to dir / cd / explicit workspace references - should trigger workspace change
  // Added 'visit', 'explore' as navigation verbs
  if (/\b(go to|goto|switch to|move to|enter|change directory|visit|explore)\b/.test(trimmed) || /^[/~]/.test(trimmed)) {
    return 'workspace';
  }

  // Vague workspace/path references (e.g., "workspace path?", "use /some/path")
  if (/\b(workspace|path)\b/.test(trimmed) && !/\b(file|read|write|edit|code)\b/.test(trimmed)) {
    return 'workspace';
  }

  // Read/view/check file - should trigger read_file, not directory search
  if (/\b(read|show|view|check|open)\b.*\b(file|\.|readme|package\.json|tsconfig|note\.txt|src\/|\.ts|\.js|\.tsx|\.py|\.md)\b/.test(trimmed)) {
    return 'file';
  }

  if (/\b(run|start|execute|build|test|dev server|development server)\b/.test(trimmed)) {
    return 'task';
  }

  // Directory-specific operations only (list, count, create) - NOT general mentions of "dir"
  if (/\b(list directory|list dir|count directories?|count dirs?|mkdir|make directory|create directory|create folder)\b/.test(trimmed)) {
    return 'directory';
  }

  return null;
}

export function shouldUseOpenEndedLoop(
  userMessage: string,
  lastMissingDirectoryHint: string | null
): boolean {
  return classifyDeterministicDomain(userMessage, lastMissingDirectoryHint) === null;
}
