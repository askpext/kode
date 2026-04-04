# Kode

**Kode** is an open-source AI coding agent for the terminal, powered by Sarvam AI's free `sarvam-m` model.

## Why Kode?

- **Free LLM**: Powered by Sarvam AI's `sarvam-m` model - completely free for developers
- **Open Source**: Built transparently with TypeScript, no black boxes
- **Indian-Made**: Sarvam AI is an Indian company building world-class AI models
- **Terminal-First**: Clean, minimal CLI interface that stays out of your way
- **Trustworthy**: Always shows diffs before modifying files, git snapshots for undo

## Install

```bash
npm install -g kode-ai
```

Or build from source:

```bash
git clone https://github.com/askpext/kode.git
cd kode
pnpm install
pnpm build
```

## Setup

1. Get your free API key from [Sarvam AI](https://sarvam.ai)

2. Set the environment variable or configure in `kode.json`:
   ```bash
   export SARVAM_API_KEY=your-api-key
   ```

3. Run Kode:
   ```bash
   kode
   ```

## Usage

### Running Kode

Kode is an interactive terminal UI application. Run it directly in your terminal:

```bash
cd kode
node dist/cli.js
```

### Basic Commands

Once inside Kode, you can:

- Type natural language requests to understand code, write features, or fix bugs
- Use slash commands for session management

### Slash Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/new` | Start a new session |
| `/sessions` | List recent sessions |
| `/resume <id>` | Resume a specific session |
| `/undo` | Restore last git snapshot |
| `/clear` | Clear the screen |
| `/model` | Open interactive model switcher (sarvam-30b, 105b, etc.) |
| `/cost` | Show token usage |

### Tools

Kode has access to these tools via prompt-based calling:

- `read_file` - Read file contents (smart chunking for large files)
- `write_file` - Write files (always shows diff first)
- `edit_file` / `replace_multi` - Targeted and multi-block text replacement
- `bash` - Run shell commands synchronously
- `bash_background` / `bash_status` - Spawn and manage long-running dev servers
- `grep` - Search codebase with ripgrep
- `fetch_url` - Native web fetching (HTML to Markdown)
- `list_dir` - List directory contents
- `todo_write` / `todo_read` - Planning and task tracking

## Configuration

Create a `kode.json` in your project root:

```json
{
  "provider": {
    "apiKey": "your-sarvam-api-key",
    "baseUrl": "https://api.sarvam.ai/v1",
    "model": "sarvam-m"
  },
  "permission": {
    "bash": "ask",
    "write": "ask",
    "edit": "ask"
  },
  "context": {
    "maxTokens": 28000,
    "compressAt": 0.80
  }
}
```

Permission options: `ask`, `allow`, `deny`

## Project Guidelines (AGENTS.md)

Kode automatically reads `AGENTS.md` or `CLAUDE.md` from your project root and appends it to the system prompt. Use this file to document:

- Project structure
- Coding conventions
- Architecture decisions
- Testing requirements

## Key Features

1. **Native Web Browsing** - Can fetch documentation and issues directly from URLs
2. **Background Processes** - Run watch servers and test runners asynchronously
3. **Interactive Model Switcher** - Hot-swap between Sarvam models dynamically via TUI
4. **Never silently modifies files** - Always shows colored diffs before writing
5. **Smart large file handling** - Chunks files over 8000 tokens, never crashes
6. **Git snapshots** - Takes a snapshot before every write for instant undo
7. **Context compression** - Automatically summarizes at 80% of 32k token limit

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Terminal UI**: Ink v5 (React for CLIs)
- **LLM**: Sarvam AI (`sarvam-m` model) - uses prompt-based tool calling
- **Storage**: sql.js (SQLite in pure JavaScript)
- **Shell**: execa
- **Config**: cosmiconfig

## License

MIT License - See [LICENSE](LICENSE) for details.

## Get Your API Key

Visit [https://sarvam.ai](https://sarvam.ai) to get your free API key.

---

Built with ❤️ for developers
