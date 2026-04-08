import { Dirent, readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { basename, join } from 'path';
import { getGitStatusString } from '../../utils/git.js';

const IGNORED_TOP_LEVEL = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  'target',
  '__pycache__',
]);

const KEY_FILE_ORDER = [
  'package.json',
  'tsconfig.json',
  'README.md',
  'README',
  'Cargo.toml',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'pom.xml',
  'src/index.ts',
  'src/main.ts',
  'src/cli.ts',
  'src/cli.tsx',
  'src/App.tsx',
  'src/app.ts',
  'src/app.tsx',
];

interface PackageSummary {
  name?: string;
  version?: string;
  scripts: string[];
  dependencies: string[];
  devDependencies: string[];
  binEntries: string[];
}

export function isAnalysisIntent(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return false;
  }

  return /^(analy[sz]e|inspect|review|understand|summari[sz]e)\b.*\b(codebase|repo|repository|project)\b/.test(trimmed)
    || /^(analy[sz]e|inspect|review|understand|summari[sz]e)\b.*\b(dir|directory|folder)\b/.test(trimmed)
    || /^(analy[sz]e|inspect|review|understand)\s+(it|this|its)\b/.test(trimmed)
    || /^(what does|how is)\s+this\s+(repo|project|codebase)\b/.test(trimmed);
}

export async function analyzeCodebase(cwd: string): Promise<string> {
  const [topLevelEntries, gitStatus, packageSummary, readmeHeading] = await Promise.all([
    getTopLevelEntries(cwd),
    getGitStatusString(cwd),
    readPackageSummary(cwd),
    readReadmeHeading(cwd),
  ]);

  const stack = detectStack(topLevelEntries, packageSummary);
  const keyFiles = findKeyFiles(topLevelEntries);
  const architecture = describeArchitecture(topLevelEntries, packageSummary, stack);

  const lines = [
    '━━━ CODEBASE ANALYSIS ━━━',
    `Workspace: ${cwd}`,
    `Git: ${gitStatus}`,
    '',
    'Stack:',
    ...stack.map((item) => `- ${item}`),
    '',
    'Top-level structure:',
    ...formatTopLevelEntries(topLevelEntries),
    '',
    'Key files:',
    ...formatKeyFiles(keyFiles, packageSummary, readmeHeading),
    '',
    'Architecture summary:',
    ...architecture.map((item) => `- ${item}`),
  ];

  return lines.join('\n').trim();
}

async function getTopLevelEntries(cwd: string): Promise<Dirent[]> {
  const entries = await readdir(cwd, { withFileTypes: true });
  return entries
    .filter((entry) => !IGNORED_TOP_LEVEL.has(entry.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
}

function findKeyFiles(entries: Dirent[]): string[] {
  const entryNames = new Set(entries.map((entry) => entry.name));
  const discovered: string[] = [];

  for (const file of KEY_FILE_ORDER) {
    const topLevelName = file.split('/')[0];
    if (entryNames.has(topLevelName)) {
      discovered.push(file);
    }
  }

  return Array.from(new Set(discovered)).slice(0, 6);
}

function formatTopLevelEntries(entries: Dirent[]): string[] {
  if (entries.length === 0) {
    return ['- (empty workspace)'];
  }

  return entries.slice(0, 8).map((entry) => `- ${entry.name}${entry.isDirectory() ? '/' : ''}`);
}

function formatKeyFiles(
  keyFiles: string[],
  packageSummary: PackageSummary | null,
  readmeHeading: string | null
): string[] {
  const lines: string[] = [];

  if (packageSummary?.name) {
    const versionPart = packageSummary.version ? ` v${packageSummary.version}` : '';
    lines.push(`- package.json: ${packageSummary.name}${versionPart}`);
    if (packageSummary.binEntries.length > 0) {
      lines.push(`- CLI entrypoints: ${packageSummary.binEntries.join(', ')}`);
    }
    if (packageSummary.scripts.length > 0) {
      lines.push(`- Scripts: ${packageSummary.scripts.slice(0, 5).join(', ')}`);
    }
  }

  if (readmeHeading) {
    lines.push(`- README: ${readmeHeading}`);
  }

  for (const file of keyFiles) {
    if (file === 'package.json' || file === 'README.md' || file === 'README') {
      continue;
    }
    lines.push(`- ${file}`);
  }

  return lines.length > 0 ? lines : ['- No key files detected yet'];
}

function detectStack(entries: Dirent[], packageSummary: PackageSummary | null): string[] {
  const entryNames = new Set(entries.map((entry) => entry.name));
  const stack = new Set<string>();

  if (packageSummary) {
    stack.add('Runtime: Node.js');

    if (entryNames.has('tsconfig.json') || hasDependency(packageSummary, 'typescript')) {
      stack.add('Language: TypeScript');
    } else {
      stack.add('Language: JavaScript');
    }

    if (packageSummary.binEntries.length > 0) {
      stack.add('Product shape: CLI application');
    }
    if (hasDependency(packageSummary, 'ink')) {
      stack.add('UI: Ink terminal UI');
    } else if (hasDependency(packageSummary, 'react')) {
      stack.add('UI: React');
    }
    if (hasDependency(packageSummary, 'next')) {
      stack.add('Framework: Next.js');
    }
    if (hasDependency(packageSummary, 'express')) {
      stack.add('Framework: Express');
    }
    if (hasDependency(packageSummary, 'vite')) {
      stack.add('Tooling: Vite');
    }
  } else if (entryNames.has('Cargo.toml')) {
    stack.add('Runtime: Rust');
  } else if (entryNames.has('pyproject.toml') || entryNames.has('requirements.txt')) {
    stack.add('Runtime: Python');
  } else if (entryNames.has('go.mod')) {
    stack.add('Runtime: Go');
  } else {
    stack.add('Stack: not yet identified from standard files');
  }

  if (entryNames.has('src')) {
    stack.add('Layout: source lives under src/');
  }

  return Array.from(stack);
}

function describeArchitecture(
  entries: Dirent[],
  packageSummary: PackageSummary | null,
  stack: string[]
): string[] {
  const entryNames = new Set(entries.map((entry) => entry.name));
  const notes: string[] = [];

  if (packageSummary?.binEntries.length) {
    notes.push(`This repo exposes a CLI through ${packageSummary.binEntries.join(', ')}.`);
  } else if (stack.some((item) => item.includes('CLI application'))) {
    notes.push('This repo is structured like a CLI-first application.');
  }

  if (entryNames.has('src')) {
    notes.push('The main implementation is organized under src/, which is a clean app/core split target.');
  }

  if (packageSummary?.scripts.length) {
    notes.push(`The main package scripts are ${packageSummary.scripts.slice(0, 4).join(', ')}.`);
  }

  if (packageSummary) {
    const signals = detectDependencySignals(packageSummary);
    if (signals.length > 0) {
      notes.push(`Framework signals: ${signals.join(', ')}.`);
    }
  }

  if (notes.length === 0) {
    notes.push(`The workspace root currently contains ${entries.length} visible top-level item(s), so the next best step is reading the key config and entry files.`);
  }

  return notes;
}

async function readPackageSummary(cwd: string): Promise<PackageSummary | null> {
  const packagePath = join(cwd, 'package.json');
  if (!existsSync(packagePath)) {
    return null;
  }

  try {
    const raw = await readFile(packagePath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      name?: string;
      version?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      bin?: string | Record<string, string>;
    };

    const binEntries = typeof parsed.bin === 'string'
      ? [basename(parsed.bin)]
      : Object.keys(parsed.bin || {});

    return {
      name: parsed.name,
      version: parsed.version,
      scripts: Object.keys(parsed.scripts || {}),
      dependencies: Object.keys(parsed.dependencies || {}),
      devDependencies: Object.keys(parsed.devDependencies || {}),
      binEntries,
    };
  } catch {
    return null;
  }
}

async function readReadmeHeading(cwd: string): Promise<string | null> {
  for (const candidate of ['README.md', 'README']) {
    const path = join(cwd, candidate);
    if (!existsSync(path)) {
      continue;
    }

    try {
      const content = await readFile(path, 'utf-8');
      const heading = content
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith('#'));

      if (heading) {
        return heading.replace(/^#+\s*/, '').trim();
      }
    } catch {
      continue;
    }
  }

  return null;
}

function hasDependency(packageSummary: PackageSummary, name: string): boolean {
  return packageSummary.dependencies.includes(name) || packageSummary.devDependencies.includes(name);
}

function detectDependencySignals(packageSummary: PackageSummary): string[] {
  const signals: string[] = [];

  if (hasDependency(packageSummary, 'ink')) signals.push('Ink');
  if (hasDependency(packageSummary, 'react')) signals.push('React');
  if (hasDependency(packageSummary, 'typescript')) signals.push('TypeScript');
  if (hasDependency(packageSummary, 'vitest')) signals.push('Vitest');
  if (hasDependency(packageSummary, 'tsup')) signals.push('tsup');
  if (hasDependency(packageSummary, 'express')) signals.push('Express');
  if (hasDependency(packageSummary, 'next')) signals.push('Next.js');

  return signals;
}
