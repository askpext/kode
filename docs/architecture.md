# Kode Architecture

Kode is built around a deterministic intent routing architecture that classifies user requests before falling back to the LLM. This section explains how it works.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Terminal UI                       │
│                     (Ink + React)                        │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                       Agent Loop                         │
│                    (src/agent/loop.ts)                    │
│                                                          │
│  1. Failure followup checks                              │
│  2. Deterministic intent detection                        │
│  3. Action followup handling                             │
│  4. File read intent                                     │
│  5. Replace text intent                                  │
│  6. Task intent (test, build, dev, clone)                │
│  7. Directory creation/count intent                      │
│  8. Navigation intent (go to dir)                        │
│  9. Analysis intent (analyze codebase)                   │
│ 10. Open-ended LLM loop (max 20 iterations)              │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                     Intent Router                        │
│                  (src/core/agent/router.ts)              │
│                                                          │
│  classifyDeterministicDomain()                           │
│  detectDeterministicTask()                               │
│  looksLikeDirectoryFollowup()                            │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                      Tool Executor                       │
│                   (src/agent/tools.ts)                    │
│                                                          │
│  ┌─────────┬─────────┬─────────┬─────────┬──────────┐   │
│  │ read    │ write   │ edit    │ bash    │ grep     │   │
│  │ list_dir│ fetch   │ todo    │ bash_bg │ bash_st  │   │
│  │ create  │ count   │ path    │         │          │   │
│  └─────────┴─────────┴─────────┴─────────┴──────────┘   │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                   Context Manager                        │
│                  (src/agent/context.ts)                   │
│                                                          │
│  - Message history (maxTokens: 28,000)                   │
│  - Auto-compress at 80% capacity                         │
│  - System prompt builder                                 │
│  - Tool result caching with TTL                          │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                    Session Storage                       │
│                   (src/db/sessions.ts)                    │
│                                                          │
│  SQLite (sql.js) at ~/.kode/sessions.db                  │
│  Tables: sessions, messages, todos, git_snapshots,       │
│          token_usage                                     │
└──────────────────────────────────────────────────────────┘
```

## Intent Routing Pipeline

When you type a message, Kode runs it through a series of deterministic checks **before** calling the LLM:

### 1. Failure Followup
```
Input: "what happened?" / "why?" / "explain"
Action: Re-explain the last error
```

### 2. Directory Followup
```
Input: "lowkey" (after failed directory search)
Action: Try to navigate to the suggested directory
```

### 3. Background Task Intent
```
Input: "status" / "check status" / "stop dev server"
Action: Read or terminate background process
```

### 4. Action Followup
```
Input: "did it?" / "done?" / "status?"
Action: Report result of last action
```

### 5. File Read Intent
```
Input: "check its package json" / "read the readme"
Action: Read the specified file directly
```

### 6. Replace Text Intent
```
Input: "replace 'foo' with 'bar' in config.js"
Action: Edit the file with find-and-replace
```

### 7. Task Intent
```
Input: "run tests" / "build it" / "start dev server" / "clone this repo"
Action: Execute npm test, npm run build, npm run dev, or git clone
```

### 8. Directory Creation/Count
```
Input: "make a directory named src" / "how many directories here"
Action: mkdir or count directories
```

### 9. Navigation Intent
```
Input: "go to dir lowkey" / "switch to /path/to/repo"
Action: Change working directory
```

### 10. Analysis Intent
```
Input: "analyze the codebase" / "inspect this repo"
Action: Run full codebase analysis (stack, structure, key files)
```

### 11. Open-Ended LLM Loop
```
Input: Anything that doesn't match the above patterns
Action: Call the LLM and let it decide which tools to use
```

## Tool Execution Flow

```
User Message
    │
    ▼
┌─────────────┐
│Classify     │
│Intent       │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│Requires     │────▶│Show Diff    │
│Permission?  │     │+ Y/A/N      │
└──────┬──────┘     └──────┬──────┘
       │                   │
   No  │             User approves
       │                   │
       ▼                   ▼
┌─────────────┐     ┌─────────────┐
│Execute      │◀────│Execute with │
│Directly     │     │Permission   │
└──────┬──────┘     └──────┬──────┘
       │                   │
       ▼                   ▼
┌─────────────┐     ┌─────────────┐
│Return       │     │Git Snapshot │
│Result       │     │+ Return     │
└─────────────┘     └─────────────┘
```

## Permission System

Kode has three permission types, each configurable as `ask`, `allow`, or `deny`:

| Permission | Applies To | Default |
|-----------|-----------|---------|
| `bash` | Shell commands, git clone, builds | `ask` |
| `write` | File creation, file writes | `ask` |
| `edit` | File edits, find-and-replace | `ask` |

**`ask`**: Shows confirmation prompt (Y/A/N)
**`allow`**: Executes without prompting
**`deny`**: Blocks the operation

## Context Management

The context manager handles message history with intelligent compression:

- **Max tokens**: 28,000 (configurable)
- **Compression trigger**: At 80% capacity
- **Strategy**: Summarize older messages, keep recent context intact
- **System prompt**: Includes platform info, cwd, git status, and AGENTS.md content

## Session Persistence

Sessions are stored in SQLite at `~/.kode/sessions.db`:

| Table | Purpose |
|-------|---------|
| `sessions` | Session metadata (id, cwd, created_at) |
| `messages` | Conversation history per session |
| `todos` | Todo lists for multi-step tasks |
| `git_snapshots` | Pre-write git snapshots for undo |
| `token_usage` | Token counts per session |
