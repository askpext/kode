# Kode Configuration

Kode uses a flexible configuration system powered by [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig).

## Configuration File Discovery

Kode searches for configuration in this order (highest priority first):

1. **Project-level file**: `kode.json` or `kode.config.ts/js` in project root
2. **Environment variables**: `SARVAM_API_KEY`, `SARVAM_BASE_URL`, `SARVAM_MODEL`
3. **Global config**: `~/.kode/config.json`
4. **Dotfiles**: `.koderc`, `.koderc.json`, `.koderc.yaml`

The first found value takes precedence. This means project config overrides global config, which overrides defaults.

## Configuration Options

### Full Example

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

### Provider

Controls LLM connection and model selection.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `apiKey` | string | Yes | — | Your Sarvam API key |
| `baseUrl` | string | No | `https://api.sarvam.ai/v1` | API endpoint URL |
| `model` | string | No | `sarvam-m` | Model name to use |

**Available Models:**
- `sarvam-m` — Default, balanced performance
- `sarvam-30b` — Faster, lighter model
- `sarvam-105b` — Most capable, better reasoning

### Permission

Controls how Kode handles operations that modify your system.

| Field | Type | Allowed Values | Default | Description |
|-------|------|---------------|---------|-------------|
| `bash` | string | `ask`, `allow`, `deny` | `ask` | Shell command execution |
| `write` | string | `ask`, `allow`, `deny` | `ask` | File creation and writes |
| `edit` | string | `ask`, `allow`, `deny` | `ask` | File edits and replacements |

**Permission behavior:**
- `ask`: Shows a Y/A/N prompt before executing (Y = yes once, A = always allow, N = no)
- `allow`: Executes without any prompt
- `deny`: Blocks the operation entirely

### Context

Controls the agent's memory and compression behavior.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxTokens` | number | `28000` | Maximum tokens in conversation context |
| `compressAt` | number | `0.80` | Compression trigger threshold (80% = 0.80) |

## Environment Variables

You can set these environment variables instead of using a config file:

```bash
# Required: API key
export SARVAM_API_KEY="your-api-key"

# Optional: Custom API endpoint
export SARVAM_BASE_URL="https://api.sarvam.ai/v1"

# Optional: Model selection
export SARVAM_MODEL="sarvam-105b"
```

Environment variables take precedence over global config (`~/.kode/config.json`) but are overridden by project-level config (`kode.json`).

## Global Configuration

Store your default settings at `~/.kode/config.json`:

```bash
mkdir -p ~/.kode
cat > ~/.kode/config.json << 'EOF'
{
  "provider": {
    "apiKey": "your-api-key",
    "model": "sarvam-m"
  },
  "permission": {
    "bash": "ask",
    "write": "ask",
    "edit": "ask"
  }
}
EOF
```

This applies to all projects unless overridden by a local `kode.json`.

## Project Configuration

Create `kode.json` in your project root for project-specific settings:

```json
{
  "provider": {
    "model": "sarvam-105b"
  },
  "permission": {
    "bash": "allow",
    "write": "ask",
    "edit": "ask"
  }
}
```

This is useful for:
- Teams sharing the same API key
- Projects that need a specific model
- Repos where you trust bash commands (e.g., CI-like environments)

## AGENTS.md Integration

Kode automatically reads `AGENTS.md` or `CLAUDE.md` from your project root (or nearest parent directory) and appends it to the system prompt.

This file is **not** a configuration file — it's a way to teach Kode about your project:

```markdown
# AGENTS.md

## Project Structure
- src/agent/ — Core agent logic
- src/tools/ — Tool implementations
- src/ui/ — Terminal UI components

## Coding Conventions
- Use TypeScript strict mode
- All functions must have JSDoc comments
- Run `npm run test` before committing

## Architecture Decisions
- Intent routing is deterministic, not LLM-based
- Tools are called via prompt-based patterns
- Session storage uses SQLite (sql.js)
```

Kode appends this content to the system prompt, so the LLM knows your project's conventions.

## Configuration Priority

```
1. kode.json (project root)         ← Highest priority
2. Environment variables
3. ~/.kode/config.json (global)
4. Default values                   ← Lowest priority
```

## Troubleshooting

### "Invalid API Key" Error
- Check `SARVAM_API_KEY` env var or `kode.json` provider.apiKey
- Get a new key at https://sarvam.ai

### "Model Not Found" Error
- Verify the model name in `kode.json` provider.model
- Available models: `sarvam-m`, `sarvam-30b`, `sarvam-105b`

### Config Not Loading
- Run `kode` with `DEBUG=1` to see config discovery logs
- Check file locations: `kode.json`, `~/.kode/config.json`
- Ensure valid JSON syntax
