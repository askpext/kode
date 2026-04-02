# Quick Start

## Running Kode

Kode is an interactive terminal UI application. Run it directly in your terminal:

```bash
cd C:\Users\Aditya\kode
node dist/cli.js
```

## First Time Setup

Your API key is already configured in `kode.json`.

## Using Kode

Once running, you can:

1. **Type natural language requests** like:
   - "Read the package.json file"
   - "List all TypeScript files in src"
   - "Search for console.log in the codebase"

2. **Use slash commands**:
   - `/help` - Show all commands
   - `/new` - Start a new session
   - `/sessions` - List recent sessions
   - `/clear` - Clear the screen
   - `/model` - Show model info
   - `/cost` - Show token usage

3. **Permission prompts**: Kode will ask before:
   - Running shell commands
   - Writing to files
   - Editing files

4. **View todos**: If you ask Kode to plan a task, todos will appear in the sidebar

## Troubleshooting

### "Raw mode is not supported"
This error occurs when running with piped input. Run `node dist/cli.js` directly in your terminal, not with echo or pipes.

### "No API key found"
Make sure `kode.json` exists with your API key, or set `SARVAM_API_KEY` environment variable.

## Global Installation (Optional)

To use `kode` command from anywhere:

```bash
npm install -g .
kode
```
