import { countMessagesTokens, compressContext, ContextStatus } from '../utils/tokens.js';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  toolResults?: Array<{
    toolCallId: string;
    result: string;
    isError?: boolean;
  }>;
}

export interface ContextManagerOptions {
  maxTokens: number;
  compressAt: number;
}

export class ContextManager {
  private messages: Message[] = [];
  private maxTokens: number;
  private compressAt: number;

  constructor(options: ContextManagerOptions) {
    this.maxTokens = options.maxTokens;
    this.compressAt = options.compressAt;
  }

  addMessage(message: Message): void {
    this.messages.push(message);
  }

  addSystemPrompt(prompt: string): void {
    this.messages = this.messages.filter((m) => m.role !== 'system');
    this.messages.unshift({ role: 'system', content: prompt });
  }

  getMessages(): Message[] {
    return this.messages;
  }

  getMessagesForApi(): Array<{ role: string; content: string }> {
    return this.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  getStatus(): ContextStatus {
    const messagesForCounting = this.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const currentTokens = countMessagesTokens(messagesForCounting);
    const usagePercent = currentTokens / this.maxTokens;

    return {
      currentTokens,
      maxTokens: this.maxTokens,
      usagePercent,
      needsCompression: usagePercent >= this.compressAt,
      compressAt: this.compressAt,
    };
  }

  shouldCompress(): boolean {
    return this.getStatus().needsCompression;
  }

  compress(): void {
    const messagesForCompressing = this.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const compressed = compressContext(
      messagesForCompressing,
      this.maxTokens,
      0.6
    );

    this.messages = compressed.map((m) => {
      const originalMessage = this.messages.find(
        (orig) => orig.role === m.role && orig.content === m.content
      );

      if (originalMessage) {
        return originalMessage;
      }

      return {
        role: m.role as Message['role'],
        content: m.content,
      };
    });
  }

  clear(): void {
    this.messages = this.messages.filter((m) => m.role === 'system');
  }

  getLastUserMessage(): Message | null {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === 'user') {
        return this.messages[i];
      }
    }
    return null;
  }

  getConversationSummary(): string {
    const userMessages = this.messages.filter((m) => m.role === 'user');
    const assistantMessages = this.messages.filter((m) => m.role === 'assistant');

    if (userMessages.length === 0) {
      return 'No conversation yet';
    }

    const lastUserMsg = userMessages[userMessages.length - 1];
    const lastAssistantMsg = assistantMessages[assistantMessages.length - 1];

    let summary = `User: ${lastUserMsg.content.slice(0, 100)}`;
    if (lastAssistantMsg) {
      summary += `\nAssistant: ${lastAssistantMsg.content.slice(0, 100)}`;
    }

    return summary;
  }
}

export function buildSystemPrompt(
  cwd: string,
  platform: string,
  gitStatus: string,
  agentsFileContent: string | null
): string {
  let prompt = `You are Kode, an autonomous AI coding agent. You help developers understand codebases, plan features, write and fix code.

You have access to tools: read_file, write_file, edit_file, bash, grep, list_dir, todo_write, todo_read, replace_multi, fetch_url, bash_background, bash_status.

TOOL PRIORITY (CRITICAL - always prefer built-in tools over bash):
- list_dir -> list and explore directories (never use bash ls, find, or dir)
- read_file -> read file contents (never use bash cat or type)
- grep -> search code (never use bash grep or findstr)
- bash -> only for builds, git, installs, or running scripts
- never use "cd" in bash; pass absolute paths instead

AGENTIC RULES (CRITICAL):
1. Always explore with list_dir or grep before assuming paths. Read files before editing.
2. When creating code files, write complete well-formed code instead of fragments.
3. If a tool fails, try a different approach instead of stalling.
4. Use edit_file for targeted changes and write_file for full-file writes.
5. Be concise. Avoid filler and keep moving.
6. Ask the user only when the task is genuinely ambiguous.
7. Infer likely local paths before asking for a perfect absolute path.
8. If the user asks to go to, open, enter, or use a directory, infer likely local matches first.
9. When asked to analyze a codebase, inspect directory structure first, then key manifests or configs, then summarize stack, entry points, architecture, and risks.

PLATFORM: ${platform === 'win32' ? 'Windows - use PowerShell syntax if bash is needed and prefer Windows paths' : platform}
Working Directory: ${cwd} | Git: ${gitStatus}`;

  if (agentsFileContent) {
    prompt += `\n\nProject Guidelines:\n${agentsFileContent}`;
  }

  return prompt;
}
