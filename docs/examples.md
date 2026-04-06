# Kode Examples

Real conversation examples showing effective and ineffective usage patterns.

## Example 1: Exploring a New Project

### ✅ Good Flow

```
You: go to dir myproject

│ Kode
│
│ Switched workspace to /home/aditya/myproject
│ I can analyze this codebase, inspect files, or make changes here now.

You: analyze it

│ Kode
│
│ ━━━ CODEBASE ANALYSIS ━━━
│ Workspace: /home/aditya/myproject
│ Git: on branch main, no changes
│
│ Stack:
│ - Runtime: Node.js
│ - Language: TypeScript
│ ...

You: read the src/index.ts file

│ Kode
│
│ Here is the content of src/index.ts:
│
│ ```typescript
│ import { App } from './app.js';
│ ...
│ ```

You: what does the App class do?

│ Kode
│
│ [LLM answers based on file content]
```

**Why this works:**
1. Explicit navigation (`go to dir`)
2. Clear analysis request (`analyze it`)
3. Specific file path (`src/index.ts`)
4. Contextual followup (`what does the App class do?`)

---

## Example 2: Fixing a Bug

### ✅ Good Flow

```
You: go to dir myapp

│ Kode
│
│ Switched workspace to /home/aditya/myapp

You: read the src/auth.ts file

│ Kode
│
│ [Shows file content]

You: the login function fails with "invalid token" error. can you find the issue?

│ Kode
│
│ [LLM analyzes the code, finds the bug, suggests a fix]
│
│ I found the issue. The token validation is using the wrong header name.
│ I can fix it by changing line 42 from:
│
│ - const token = req.headers['x-auth'];
│ + const token = req.headers['authorization'];
│
│ Approve this edit? (Y/A/N)
```

**Why this works:**
1. Specific file identified
2. Error message provided exactly
3. Clear question ("can you find the issue?")

---

## Example 3: Running Development Tasks

### ✅ Good Flow

```
You: go to dir webapp

│ Kode
│
│ Switched workspace to /home/aditya/webapp

You: run tests

│ Kode
│
│ I can run tests with `npm test` once you approve it.
│
│ Approve? (Y/A/N)
│
│ ✓ Tests passed

You: start dev server

│ Kode
│
│ I can start the dev server with `npm run dev` as a tracked background process.
│
│ Approve? (Y/A/N)
│
│ Dev server started with `npm run dev`
│ Process ID: abc123

You: status

│ Kode
│
│ [Dev server status output]
```

**Why this works:**
1. Clear task commands
2. Background process tracked
3. Status check works

---

## Example 4: Cloning a Repository

### ✅ Good Flow

```
You: clone this repo https://github.com/askpext/awesome-project

│ Kode
│
│ I can run the repository clone with `git clone https://github.com/askpext/awesome-project awesome-project` once you approve it.
│
│ Approve? (Y/A/N)
│
│ ✓ Directory created: /home/aditya/awesome-project

You: go to dir awesome-project

│ Kode
│
│ Switched workspace to /home/aditya/awesome-project

You: analyze it

│ Kode
│
│ ━━━ CODEBASE ANALYSIS ━━━
│ ...
```

**Why this works:**
1. Full URL provided
2. "clone" + "repo" keywords trigger deterministic routing
3. Automatic directory verification after clone

---

## Example 5: Multi-Step Feature Implementation

### ✅ Good Flow

```
You: go to dir api

│ Kode
│
│ Switched workspace to /home/aditya/api

You: I need to add a /users/:id/profile endpoint. read the src/routes/users.ts file first

│ Kode
│
│ [Shows file content]

You: now read src/controllers/userController.ts

│ Kode
│
│ [Shows controller content]

You: add a getProfile method that fetches from the profiles table and returns JSON

│ Kode
│
│ [LLM generates the method]
│
│ I can add this method to userController.ts:
│
│ ```typescript
│ async getProfile(req, res) {
│   const profile = await db.profiles.findOne({ where: { userId: req.params.id } });
│   res.json(profile);
│ }
│ ```
│
│ Approve this edit? (Y/A/N)

You: also add the route in users.ts

│ Kode
│
│ I can add the route to users.ts:
│
│ ```typescript
│ router.get('/:id/profile', userController.getProfile);
│ ```
│
│ Approve this edit? (Y/A/N)
```

**Why this works:**
1. Sequential file reads for context
2. Clear feature request
3. Step-by-step edits with approval
4. Each build on previous context

---

## Anti-Patterns to Avoid

### ❌ Vague Navigation

```
You: go to lowkey

│ Kode
│
│ [Falls through to LLM — "lowkey" could be file or directory]
```

**Fix:** `go to dir lowkey`

---

### ❌ Unclear File Reference

```
You: check the config

│ Kode
│
│ [Ambiguous — which config file? config.json? .koderc? tsconfig.json?]
```

**Fix:** `read the kode.json file` or `show me tsconfig.json`

---

### ❌ Massive Requests

```
You: refactor the entire codebase to use a new architecture, add tests, update docs, and fix all bugs

│ Kode
│
│ [LLM loop hits max iterations or produces incomplete output]
```

**Fix:** Break into smaller tasks:
1. "analyze the codebase" — understand current state
2. "what are the main architectural issues?" — identify problems
3. "create a plan to refactor" — get strategy
4. Tackle one piece at a time

---

### ❌ Repeated Identical Requests

```
You: read package.json
You: read package.json     (again)
You: read package.json     (again)

│ Kode
│
│ Error: Repeated identical tool calls detected. Please refine the path or try a different approach.
```

**Fix:** Move forward with the content you already have.

---

### ❌ Missing Context

```
You: fix the bug

│ Kode
│
│ [Which bug? Which file? What's the error?]
```

**Fix:** Provide context:
- "the login function in src/auth.ts throws 'invalid token'"
- "tests are failing with 'expected 200 but got 500'"
- "the build fails with TypeScript error TS2345"

---

## Tips for Best Results

1. **Start with analysis** — `analyze the codebase` before making changes
2. **Read files explicitly** — `read src/file.ts` instead of assuming Kode knows
3. **One thing at a time** — Single clear request per turn
4. **Provide exact errors** — Copy-paste error messages, don't paraphrase
5. **Use deterministic commands** — `go to dir`, `run tests`, `analyze` are faster than LLM fallback
6. **Approve "Always" for trusted ops** — When prompted Y/A/N, "A" (Always) saves time for repetitive tasks
