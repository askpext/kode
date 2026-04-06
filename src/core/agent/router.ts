export type DeterministicDomain = 'workspace' | 'directory' | 'file' | 'analysis' | 'task';

export interface DeterministicTask {
  type: 'test' | 'build' | 'dev' | 'clone';
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

  if (looksLikeDirectoryFollowup(trimmed) && lastMissingDirectoryHint) {
    return 'workspace';
  }

  if (/\b(analy[sz]e|inspect|review|summari[sz]e|understand)\b.*\b(codebase|repo|repository|project)\b/.test(trimmed)) {
    return 'analysis';
  }

  if (/\b(run|start|execute|build|test|dev server|development server)\b/.test(trimmed)) {
    return 'task';
  }

  // Read/view/check file - should trigger read_file, not directory search
  if (/\b(read|show|view|check|open)\b.*\b(file|\.|readme|package\.json|tsconfig|note\.txt|src\/|\.ts|\.js|\.tsx|\.py|\.md)\b/.test(trimmed)) {
    return 'file';
  }

  // Go to dir / cd / explicit workspace references - should trigger workspace change
  if (/\b(go to|goto|switch to|move to|enter|change directory)\b/.test(trimmed) || /^[/~]/.test(trimmed)) {
    return 'workspace';
  }

  // Vague workspace/path references (e.g., "workspace path?", "use /some/path")
  if (/\b(workspace|path)\b/.test(trimmed) && !/\b(file|read|write|edit|code)\b/.test(trimmed)) {
    return 'workspace';
  }

  if (/\b(dir|directory|folder|mkdir|count directories|count dirs|list directory)\b/.test(trimmed)) {
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
