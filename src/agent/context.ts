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
    // Remove existing system prompt if present
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

    // Reconstruct messages with tool calls and results
    this.messages = compressed.map((m, index) => {
      const originalMessage = this.messages.find(
        (orig) => orig.role === m.role && orig.content === m.content
      );

      if (originalMessage) {
        return originalMessage;
      }

      // For compressed/summarized messages, create a new message
      return {
        role: m.role as Message['role'],
        content: m.content,
      };
    });
  }

  clear(): void {
    // Keep only system message
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
  let prompt = `You are Kode, an AI coding agent. You help developers understand codebases, plan features, write and fix code.

You have access to tools: read_file, write_file, edit_file, bash, grep, list_dir, todo_write, todo_read.

Rules:
- Always read before you write. Never guess file contents.
- Use todo_write to plan multi-step tasks before starting.
- Show diffs before applying changes.
- Ask for clarification if the task is ambiguous.
- Be concise. No unnecessary explanation.
- Prefer targeted edits over full rewrites.

Environment: ${cwd} | ${platform} | ${gitStatus}`;

  if (agentsFileContent) {
    prompt += `\n\nProject Guidelines:\n${agentsFileContent}`;
  }

  return prompt;
}
