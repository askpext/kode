export type DeterministicDomain = 'workspace' | 'directory' | 'file' | 'analysis' | 'task';

export interface DeterministicTask {
  type: 'test' | 'build' | 'dev';
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

  return null;
}

export function classifyDeterministicDomain(
  userMessage: string,
  lastMissingDirectoryHint: string | null
): DeterministicDomain | null {
  const trimmed = userMessage.trim().toLowerCase();

  if (looksLikeDirectoryFollowup(trimmed) && lastMissingDirectoryHint) {
    return 'workspace';
  }

  if (/\b(analy[sz]e|inspect|review|summari[sz]e|understand)\b.*\b(codebase|repo|repository|project)\b/.test(trimmed)) {
    return 'analysis';
  }

  if (/\b(run|start|execute|build|test|dev server|development server)\b/.test(trimmed)) {
    return 'task';
  }

  if (/\b(read|show|view|replace|change)\b/.test(trimmed) && /\b(file|\.|readme|package\.json|tsconfig|note\.txt)\b/.test(trimmed)) {
    return 'file';
  }

  if (/\b(go to|goto|switch to|move to|open|enter|use|workspace|path)\b/.test(trimmed) || /^[/~]/.test(trimmed)) {
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
