import packageJson from '../../../package.json';

export interface CliArgs {
  help?: boolean;
  version?: boolean;
  session?: string;
  new?: boolean;
  resume?: string;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const args: CliArgs = {};

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--version' || arg === '-v') {
      args.version = true;
    } else if (arg === '--new' || arg === '-n') {
      args.new = true;
    } else if (arg === '--session' || arg === '-s') {
      args.session = argv[++index];
    } else if (arg === '--resume' || arg === '-r') {
      args.resume = argv[++index];
    }
  }

  return args;
}

export function getHelpText(): string {
  return `
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
`.trim();
}

export function getVersionText(): string {
  return `kode v${packageJson.version}`;
}
