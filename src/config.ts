import { cosmiconfig } from 'cosmiconfig';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

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
  const globalConfig = loadGlobalConfig();

  // Merge configs with priority: project file > env > global config > defaults
  const config: KodeConfig = {
    provider: {
      ...defaultConfig.provider,
      ...globalConfig?.provider,
      ...fileConfig?.provider,
      apiKey: fileConfig?.provider?.apiKey 
        || process.env.SARVAM_API_KEY 
        || globalConfig?.provider?.apiKey 
        || defaultConfig.provider.apiKey,
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

function getGlobalConfigPath(): string {
  return join(homedir(), '.kode', 'config.json');
}

function loadGlobalConfig(): Partial<KodeConfig> | null {
  const configPath = getGlobalConfigPath();
  
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as Partial<KodeConfig>;
  } catch {
    return null;
  }
}

export function saveGlobalApiKey(apiKey: string): void {
  const kodeDir = join(homedir(), '.kode');
  const configPath = getGlobalConfigPath();

  // Ensure ~/.kode/ exists
  if (!existsSync(kodeDir)) {
    mkdirSync(kodeDir, { recursive: true });
  }

  // Load existing config or create new
  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
      // Start fresh if corrupt
    }
  }

  // Set the API key
  config.provider = {
    ...(config.provider as Record<string, unknown> || {}),
    apiKey,
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function saveGlobalModel(model: string): void {
  const kodeDir = join(homedir(), '.kode');
  const configPath = getGlobalConfigPath();

  if (!existsSync(kodeDir)) {
    mkdirSync(kodeDir, { recursive: true });
  }

  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
      // Start fresh if corrupt
    }
  }

  config.provider = {
    ...(config.provider as Record<string, unknown> || {}),
    model,
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
