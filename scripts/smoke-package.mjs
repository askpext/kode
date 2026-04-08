import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function run(command) {
  try {
    const output = execSync(command, {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });

    return {
      success: true,
      output,
    };
  } catch (error) {
    return {
      success: false,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`,
    };
  }
}

async function main() {
  const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'));
  const packageFiles = Array.isArray(packageJson.files) ? packageJson.files : [];
  const requiredPaths = ['dist/cli.js', ...packageFiles];
  const missingPaths = requiredPaths.filter((file) => !existsSync(resolve(process.cwd(), file)));
  if (missingPaths.length > 0) {
    throw new Error(`Package smoke failed. Missing files:\n${missingPaths.join('\n')}`);
  }

  const version = run('node dist/cli.js --version');
  const versionOutput = version.output.trim();
  const validVersionOutput =
    /^kode v\d+\.\d+\.\d+$/i.test(versionOutput) ||
    versionOutput.includes('Kode currently supports WSL, Linux, and macOS.');
  if (!validVersionOutput) {
    throw new Error(`Unexpected --version output: ${versionOutput || '(empty)'}`);
  }

  const nonInteractive = run('node dist/cli.js');
  const nonInteractiveOutput = nonInteractive.output;
  const validNonInteractiveFailure =
    nonInteractiveOutput.includes('interactive TTY terminal') ||
    nonInteractiveOutput.includes('Kode currently supports WSL, Linux, and macOS.');
  if (nonInteractive.success || !validNonInteractiveFailure) {
    throw new Error(`Expected a friendly non-interactive/platform failure.\n${nonInteractiveOutput}`.trim());
  }

  console.log('Smoke checks passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
