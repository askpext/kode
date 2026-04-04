#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './ui/App.js';
import { Onboarding } from './ui/Onboarding.js';
import { loadConfig, saveGlobalApiKey } from './config.js';
import { cleanupBackgroundProcesses } from './tools/bash.js';
import { createSessionRuntime } from './core/session/runtime.js';
import { CliArgs, getHelpText, getVersionText, parseArgs } from './core/cli/args.js';

async function launchApp(apiKey: string, baseUrl: string, model: string, args: CliArgs) {
  const runtime = await createSessionRuntime(
    { apiKey, baseUrl, model },
    args
  );

  const { unmount } = render(
    <App
      agent={runtime.agent}
      db={runtime.db}
      sessionId={runtime.sessionId}
      cwd={runtime.cwd}
      model={runtime.model}
      onExit={() => {
        unmount();
        main();
      }}
    />
  );

  process.on('SIGINT', () => {
    cleanupBackgroundProcesses();
    unmount();
    runtime.db.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    cleanupBackgroundProcesses();
    unmount();
    runtime.db.close();
    process.exit(0);
  });
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    console.log(getHelpText());
    process.exit(0);
  }

  if (args.version) {
    console.log(getVersionText());
    process.exit(0);
  }

  const config = await loadConfig();

  const apiKey = config.provider.apiKey;
  const isPlaceholder = !apiKey || apiKey === 'your-sarvam-api-key' || apiKey.includes('your-key');

  if (isPlaceholder) {
    const { unmount, waitUntilExit } = render(
      <Onboarding
        onComplete={async (newApiKey: string) => {
          saveGlobalApiKey(newApiKey);
          unmount();
          await launchApp(newApiKey, config.provider.baseUrl, config.provider.model, args);
        }}
      />
    );

    await waitUntilExit();
    return;
  }

  await launchApp(apiKey, config.provider.baseUrl, config.provider.model, args);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  cleanupBackgroundProcesses();
  process.exit(1);
});
