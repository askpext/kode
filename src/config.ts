import { cosmiconfig } from 'cosmiconfig';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface PermissionConfig {
  bash: 'ask' | 'allow' | 'deny';
  write: 'ask' | 'allow' | 'deny';
  edit: 'ask' | 'allow' | 'deny';
}

export interface ContextConfig {
  maxTokens: number;
  compressAt: number;
}

export interface KodeConfig {
  provider: ProviderConfig;
  permission: PermissionConfig;
  context: ContextConfig;
}

const defaultConfig: KodeConfig = {
  provider: {
    apiKey: process.env.SARVAM_API_KEY || '',
    baseUrl: 'https://api.sarvam.ai/v1',
    model: 'sarvam-m',
  },
  permission: {
    bash: 'ask',
    write: 'ask',
    edit: 'ask',
  },
  context: {
    maxTokens: 28000,
    compressAt: 0.80,
  },
};

const searchPlaces = [
  'kode.json',
  'kode.config.ts',
  'kode.config.js',
  '.koderc',
  '.koderc.json',
  '.koderc.yaml',
  '.koderc.yml',
];

async function loadConfigFile(): Promise<Partial<KodeConfig> | null> {
  const explorer = cosmiconfig('kode', {
    searchPlaces,
    stopDir: dirname(process.cwd()),
  });

  try {
    const result = await explorer.search();
    if (result && result.config) {
      return result.config as Partial<KodeConfig>;
    }
  } catch (error) {
    // Config file not found or invalid, use defaults
  }

  return null;
}

export async function loadConfig(): Promise<KodeConfig> {
  const fileConfig = await loadConfigFile();

  // Merge configs with priority: file > env > defaults
  const config: KodeConfig = {
    provider: {
      ...defaultConfig.provider,
      ...fileConfig?.provider,
      apiKey: fileConfig?.provider?.apiKey || process.env.SARVAM_API_KEY || defaultConfig.provider.apiKey,
    },
    permission: {
      ...defaultConfig.permission,
      ...fileConfig?.permission,
    },
    context: {
      ...defaultConfig.context,
      ...fileConfig?.context,
    },
  };

  return config;
}

export function findAgentsFile(cwd: string = process.cwd()): string | null {
  let currentDir = cwd;

  while (currentDir !== dirname(currentDir)) {
    const agentsPath = join(currentDir, 'AGENTS.md');
    const claudePath = join(currentDir, 'CLAUDE.md');

    if (existsSync(agentsPath)) {
      return agentsPath;
    }
    if (existsSync(claudePath)) {
      return claudePath;
    }

    currentDir = dirname(currentDir);
  }

  return null;
}

export function readAgentsFile(path: string | null): string | null {
  if (!path || !existsSync(path)) {
    return null;
  }

  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}
