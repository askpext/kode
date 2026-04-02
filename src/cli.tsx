#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './ui/App.js';
import { Onboarding } from './ui/Onboarding.js';
import { loadConfig, saveGlobalApiKey } from './config.js';
import SessionDB from './db/sessions.js';
import { Agent } from './agent/loop.js';
import { v4 as uuidv4 } from 'uuid';
import { cwd } from 'process';

interface CliArgs {
  help?: boolean;
  version?: boolean;
  session?: string;
  new?: boolean;
  resume?: string;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--version' || arg === '-v') {
      args.version = true;
    } else if (arg === '--new' || arg === '-n') {
      args.new = true;
    } else if (arg === '--session' || arg === '-s') {
      args.session = argv[++i];
    } else if (arg === '--resume' || arg === '-r') {
      args.resume = argv[++i];
    }
  }

  return args;
}

function showHelp() {
  console.log(`
Kode - AI Coding Agent for the Terminal

Usage: kode [options]

Options:
  -h, --help           Show this help message
  -v, --version        Show version number
  -n, --new            Start a new session
  -s, --session <id>   Use a specific session ID
  -r, --resume <id>    Resume an existing session

Slash Commands (type in the app):
  /help                Show all commands
  /new                 Start new session
  /sessions            List recent sessions
  /resume <id>         Resume a session
  /undo                Restore last git snapshot
  /clear               Clear screen
  /model               Show current model info
  /cost                Show token usage

Examples:
  kode                 Start kode with a new session
  kode --new           Force start a new session
  kode --resume abc123 Resume session abc123

Get your API key at: https://sarvam.ai
`);
}

function showVersion() {
  console.log('kode v1.0.0');
}

async function launchApp(apiKey: string, baseUrl: string, model: string, args: CliArgs) {
  // Initialize database
  const db = new SessionDB();
  await db.ensureInit();

  // Determine session ID
  let sessionId: string;

  if (args.resume) {
    sessionId = args.resume;
    const session = await db.getSession(sessionId);
    if (!session) {
      console.error(`Session not found: ${sessionId}`);
      process.exit(1);
    }
  } else if (args.new || !args.session) {
    // Create new session
    const session = await db.createSession(cwd());
    sessionId = session.id;
  } else {
    sessionId = args.session;
  }

  // Create agent
  const agent = new Agent({
    sessionId,
    cwd: cwd(),
    db,
    apiKey,
    baseUrl,
    model,
  });

  // Initialize agent
  await agent.initialize();

  // Render the app
  const { unmount } = render(
    <App
      agent={agent}
      db={db}
      sessionId={sessionId}
      cwd={cwd()}
      model={model}
      onExit={() => {
        unmount();
        // Restart with new session
        main();
      }}
    />
  );

  // Handle cleanup
  process.on('SIGINT', () => {
    unmount();
    db.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    unmount();
    db.close();
    process.exit(0);
  });
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (args.version) {
    showVersion();
    process.exit(0);
  }

  // Load configuration
  const config = await loadConfig();

  // Check for API key — if missing, show onboarding
  if (!config.provider.apiKey) {
    const { unmount, waitUntilExit } = render(
      <Onboarding
        onComplete={async (apiKey: string) => {
          // Save the key to ~/.kode/config.json
          saveGlobalApiKey(apiKey);

          // Unmount onboarding
          unmount();

          // Clear screen
          console.clear();
          console.log('\n✓ API key saved to ~/.kode/config.json\n');

          // Launch the app with the new key
          await launchApp(apiKey, config.provider.baseUrl, config.provider.model, args);
        }}
      />
    );

    await waitUntilExit();
    return;
  }

  // API key exists — launch directly
  await launchApp(config.provider.apiKey, config.provider.baseUrl, config.provider.model, args);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

