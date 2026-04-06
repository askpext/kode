# Agent Behavior Guide

This document explains how Kode's intent routing works and how to write effective prompts.

## How Kode Thinks

Kode doesn't just send every message to the LLM. Instead, it runs your input through a **deterministic intent router** that classifies requests into specific domains before deciding whether to call the LLM at all.

```
Your Message
    │
    ▼
┌──────────────────────────────┐
│  Deterministic Router        │
│  (No LLM involved)           │
│                              │
│  1. Is this a failure Q?     │──▶ Yes → Explain error
│  2. Is this a dir followup?  │──▶ Yes → Navigate
│  3. Is this a file request?  │──▶ Yes → Read file
│  4. Is this a task?          │──▶ Yes → Execute
│  5. Is this navigation?      │──▶ Yes → Change cwd
│  6. Is this analysis?        │──▶ Yes → Analyze codebase
│  7. Unknown                  │──▶ Fall through to LLM
└──────────────────────────────┘
```

## What Works Well

### ✅ Clear File Requests

Kode recognizes patterns that mention files with specific keywords:

```
check its package json      → Reads package.json
read the readme file        → Reads README.md
show me the src/index.ts    → Reads specific file
view the config file        → Reads config file
```

**Pattern:** `(check|read|view|show|open) + (file extension or known filename)`

### ✅ Navigation Commands

Kode looks for explicit directory/folder keywords:

```
go to dir lowkey            → Switches to /current/lowkey
go to dir /path/to/repo     → Switches to absolute path
switch to directory src     → Switches to src/
```

**Pattern:** `(go to|goto|switch to|move to|enter) + X + (dir|directory|folder)`

### ✅ Task Execution

Common development tasks are detected deterministically:

```
run tests                   → Executes npm test
run the build               → Executes npm run build
start dev server            → Executes npm run dev (background)
clone this repo https://... → Executes git clone
```

### ✅ Project Analysis

Analysis-related keywords trigger the codebase analyzer:

```
analyze the codebase        → Full analysis
inspect this repo           → Stack, structure, key files
summarize the project       → Architecture overview
understand this project     → Same as above
```

## What to Avoid

### ❌ Vague Directory Hints

Without the `dir|directory|folder` keyword, Kode won't treat it as navigation:

```
go to lowkey                → Falls through to LLM (no "dir" keyword)
open lowkey                 → Ambiguous — could be file or directory
use lowkey                  → Ambiguous
```

**Fix:** Add the keyword → `go to dir lowkey`

### ❌ Repeated Identical Requests

Kode detects when the LLM makes the same tool calls repeatedly and breaks out to prevent infinite loops:

```
[User asks same question 3 times]
→ Kode: "Error: Repeated identical tool calls detected. Please refine the path or try a different approach."
```

**Fix:** Provide more specific details or try a different approach.

### ❌ Assuming Silent Execution

Kode always asks for permission before:
- Running bash commands
- Writing files
- Editing files

This is by design. You can change this in config:

```json
{
  "permission": {
    "bash": "allow",
    "write": "allow",
    "edit": "allow"
  }
}
```

## Intent Routing Patterns

Here's exactly how the router classifies your input:

### Clone Repo Detection
```regex
\b(clone)\b.*\b(repo|repository|github|gitlab)\b
^clone\s+https?://
```

### File Read Detection
```regex
\b(read|show|view|check|open)\b.*\b(file|\.|readme|package\.json|tsconfig|src\/|\.ts|\.js|\.tsx|\.py|\.md)\b
```

### Navigation Detection
```regex
\b(go to|goto|switch to|move to|enter|change directory)\b
^[/~]
\b(workspace|path)\b (when not about file/read/write/edit/code)
```

### Task Detection
```regex
^(run|start|execute)?\s*(the\s+)?tests?\b
^(run|start|execute)?\s*(the\s+)?build\b
^(run|start)\s+(the\s+)?(dev|development)\s+(server|mode)\b
\b(clone)\b.*\b(repo|repository|github|gitlab)\b
```

### Analysis Detection
```regex
\b(analy[sz]e|inspect|review|summarize|understand)\b.*\b(codebase|repo|repository|project)\b
```

## Best Practices

### 1. Be Explicit About File vs Directory

```
✅ "go to dir src"         → Navigation
❌ "go to src"             → Ambiguous

✅ "read the package.json" → File read
❌ "check package.json"    → Might work, but "read" is clearer
```

### 2. Use Specific File Paths

```
✅ "show me src/agent/loop.ts"   → Reads exact file
❌ "show me the loop file"       → Ambiguous — which loop?
```

### 3. Provide Context for Tasks

```
✅ "run tests for the router"    → Clear intent
❌ "test it"                     → What is "it"?
```

### 4. Use Analysis for New Projects

```
✅ "analyze the codebase"        → Full analysis
✅ "inspect this repo"           → Stack + structure
```

### 5. Follow Up with Specifics

After analysis, ask targeted questions:

```
✅ "What does the build script do?"
✅ "Where is the main entry point?"
❌ "tell me everything"           → Too vague, will hit LLM loop
```

## LLM Fallback Behavior

When no deterministic pattern matches, Kode falls through to the LLM loop:

1. LLM receives your message with full context
2. LLM decides which tools to call
3. Kode executes tools (with permission)
4. Results are fed back to LLM
5. Loop continues (max 20 iterations) or LLM responds

**Tips for LLM interactions:**
- Be specific about what you want
- Reference files by path
- Ask one question at a time
- Use "show me the content of X" to force file reads

## State Tracking

Kode maintains state across turns:

| State | Purpose | Example |
|-------|---------|---------|
| `lastMissingDirectoryHint` | Remembers failed directory searches | `"lowkey"` → you say `"lowkey"` again → navigates |
| `recentNavigationAttempts` | Lists tried paths | Shows 5 attempted paths when not found |
| `lastFailureMessage` | Last error for "why?" followups | You ask "why?" → explains error |
| `lastActionSummary` | Result of last action | You ask "did it?" → reports result |
| `lastBackgroundProcess` | Running dev servers | You say "status" → checks server |
