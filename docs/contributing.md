# Contributing to Kode

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Development Setup

### Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** (package manager)
- **Git**

### Quick Start

```bash
# Clone the repo
git clone https://github.com/askpext/kode.git
cd kode

# Install dependencies
pnpm install

# Build the project
pnpm build

# Run in development mode (watch + launch CLI)
pnpm dev

# Run tests
pnpm test
```

## Project Structure

```
kode/
├── src/
│   ├── cli.tsx              # Main entry point
│   ├── config.ts            # Configuration loading
│   ├── agent/               # Core agent logic
│   │   ├── loop.ts          # Main agent loop
│   │   ├── tools.ts         # Tool definitions + executor
│   │   ├── context.ts       # Context management
│   │   ├── cache.ts         # Tool result caching
│   │   └── planner.ts       # Todo/plan management
│   ├── core/                # Shared logic
│   │   ├── cli/args.ts      # CLI argument parsing
│   │   ├── commands/slash.ts# Slash command registry
│   │   ├── session/         # Session lifecycle
│   │   └── agent/           # Intent routing + analysis
│   │       ├── analyze.ts   # Codebase analysis
│   │       └── router.ts    # Deterministic intent router
│   ├── db/sessions.ts       # SQLite session storage
│   ├── tools/               # Tool implementations
│   ├── ui/                  # Ink React components
│   └── utils/               # Utilities (tokens, git, etc.)
├── docs/                    # Documentation
├── dist/                    # Build output (gitignored)
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

## Making Changes

### 1. Pick an Area

- **Bug fixes**: Check [issues](https://github.com/askpext/kode/issues)
- **New tools**: Add to `src/tools/` and register in `src/agent/tools.ts`
- **Intent routing**: Modify `src/core/agent/router.ts`
- **UI changes**: Edit components in `src/ui/`
- **Session/DB**: Work in `src/db/sessions.ts`

### 2. Create a Branch

```bash
git checkout -b feat/your-feature-name
# or
git checkout -b fix/issue-description
```

### 3. Make Your Changes

Follow these guidelines:

- **TypeScript strict mode** — No `any` types, proper null checks
- **ESM imports** — Use `.js` extensions in imports: `import { foo } from './bar.js'`
- **No relative imports between packages** — Not applicable here (single package), but keep imports clean
- **Tests co-located** — Put tests next to source: `router.ts` → `router.test.ts`
- **No filler comments** — Code should speak for itself

### 4. Write Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test src/core/agent/router.test.ts
```

Test patterns:
- Use `vitest` with `describe`, `it`, `expect`
- Mock external services with `vi.mock()`
- Use temporary directories for file system tests
- Clean up in `afterEach()`

### 5. Build and Verify

```bash
# Build the project
pnpm build

# Verify the build works
node dist/cli.js --help
```

### 6. Commit

```bash
git add .
git commit -m "feat: add your feature description"
```

**Commit message format:**
- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation changes
- `test:` — Test additions/changes
- `refactor:` — Code restructuring (no behavior change)
- `chore:` — Maintenance tasks

### 7. Open a PR

Push your branch and open a Pull Request:

```bash
git push origin your-branch-name
```

Include:
- Clear description of what changed
- Link to related issue (if applicable)
- Screenshots for UI changes (terminal output counts)
- Test results

## Adding a New Tool

Tools are the building blocks of Kode. Here's how to add one:

### 1. Create the Tool

```typescript
// src/tools/your-tool.ts
export interface YourToolArgs {
  someParam: string;
}

export interface YourToolResult {
  success: boolean;
  result: string;
  error?: string;
}

export async function yourTool(args: YourToolArgs, cwd: string): Promise<YourToolResult> {
  // Implementation
  return { success: true, result: 'done' };
}
```

### 2. Register in ToolExecutor

```typescript
// src/agent/tools.ts
import { yourTool } from '../tools/your-tool.js';

// In ToolExecutor.executeTool():
if (toolCall.name === 'your_tool') {
  return yourTool(toolCall.args, this.cwd);
}
```

### 3. Add to System Prompt

Update the system prompt in `src/agent/loop.ts` to mention your tool:

```typescript
// In callLLM() system prompt:
// - your_tool → description of what it does
```

### 4. Add Deterministic Routing (if applicable)

If your tool should be triggered deterministically (not via LLM), add detection in `src/core/agent/router.ts` and handling in `src/agent/loop.ts`.

### 5. Write Tests

```typescript
// src/tools/your-tool.test.ts
import { describe, it, expect } from 'vitest';
import { yourTool } from './your-tool.js';

describe('yourTool', () => {
  it('should do something', async () => {
    const result = await yourTool({ someParam: 'test' }, '/tmp');
    expect(result.success).toBe(true);
  });
});
```

## Code Style

- **2-space indentation**
- **Single quotes** for strings
- **Semicolons** — Always
- **Trailing commas** — Yes
- **Line length** — No hard limit, but keep it reasonable
- **Naming** — camelCase for variables/functions, PascalCase for classes/types

## Testing Guidelines

### What to Test

- **Tool functions** — Input/output, error cases
- **Intent routing** — Pattern matching, edge cases
- **Agent loop** — Permission flows, retry logic
- **Session management** — CRUD operations, wordir changes
- **Config loading** — Priority, env vars, fallbacks

### What Not to Test

- **UI components** — Visual output changes (manual testing)
- **LLM calls** — External service (mock instead)
- **Build artifacts** — Not our responsibility

## Getting Help

- **Issues**: Open a [GitHub issue](https://github.com/askpext/kode/issues)
- **Discussions**: Start a discussion for questions/ideas
- **Code**: Read the source — it's well-commented and structured

## License

By contributing, you agree that your work will be licensed under the MIT License.
