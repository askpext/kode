# Kode Slash Commands

Slash commands give you direct control over sessions, models, and context without going through the agent loop.

## Session Management

### `/new`

Start a fresh session. Clears conversation history and creates a new session ID.

```
/new
```

Use when:
- Switching to a different task
- Starting a new project
- Wanting a clean slate

### `/sessions`

List all recent sessions with IDs, working directories, and timestamps.

```
/sessions
```

Output:
```
Recent sessions:
- 984ae987 | /home/aditya/lowkey | 2026-04-06 15:30
- 5ce805a5 | /home/aditya | 2026-04-06 14:12
- a1b2c3d4 | /home/aditya/kode | 2026-04-06 10:45
```

### `/resume <id>`

Resume a previous session by ID. Restores conversation history and context.

```
/resume 984ae987
```

Use when:
- Picking up where you left off
- Switching back to a previous project
- Recovering from an accidental `/new`

### `/undo`

Restore the last git snapshot. Kode automatically creates a git snapshot before every file write, so this gives you instant undo.

```
/undo
```

This:
1. Finds the most recent git snapshot for the current session
2. Restores all files to that state
3. Confirms the rollback

**Note:** Only works if git is initialized and you've made changes that triggered a snapshot.

## Display & UI

### `/clear`

Clear the terminal screen. Keeps session state and history intact.

```
/clear
```

### `/help`

Show all available commands and their descriptions.

```
/help
```

### `/model`

Open the interactive model switcher. Lets you choose between available Sarvam models.

```
/model
```

Available models:
- `sarvam-m` (default) — Fast, good for most tasks
- `sarvam-30b` — Lighter, faster responses
- `sarvam-105b` — More capable, better reasoning

Use `/model` to switch models mid-session without restarting.

### `/cost`

Show token usage for the current session including input tokens, output tokens, and estimated cost.

```
/cost
```

Output:
```
Session: 984ae987
Input tokens: 12,450
Output tokens: 3,280
Total tokens: 15,730
```

## Natural Language Commands

Kode also understands natural language commands that get routed to specific tools:

### Navigation

```
go to dir lowkey          → Switch workspace to /home/aditya/lowkey
go to dir /path/to/repo   → Switch to absolute path
workspace path?           → Shows last attempted directory
```

### File Operations

```
check its package json    → Reads package.json
read the readme file      → Reads README.md
show me the src/index.ts  → Reads specific file
```

### Directory Operations

```
how many directories here          → Count directories in cwd
how many directories recursive     → Count all subdirectories
list the src directory              → List contents of src/
```

### Project Analysis

```
analyze the codebase    → Full project analysis
inspect this repo       → Stack, structure, key files
summarize the project   → Architecture overview
```

### Development Tasks

```
run tests               → Executes npm test
run the build           → Executes npm run build
start dev server        → Runs npm run dev (background)
clone this repo https://github.com/... → git clone
```
