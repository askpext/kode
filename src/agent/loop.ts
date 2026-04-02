import { ContextManager, buildSystemPrompt } from './context.js';
import { ToolExecutor, ToolCall, toolDefinitions } from './tools.js';
import { Planner } from './planner.js';
import SessionDB from '../db/sessions.js';
import { loadConfig, findAgentsFile, readAgentsFile } from '../config.js';
import { getGitStatusString } from '../utils/git.js';
import { platform } from 'os';

export interface AgentOptions {
  sessionId: string;
  cwd: string;
  db: SessionDB;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AgentResponse {
  content: string;
  toolCalls?: ToolCall[];
  done: boolean;
}

export class Agent {
  private contextManager: ContextManager;
  private toolExecutor: ToolExecutor;
  private planner: Planner;
  private sessionId: string;
  private cwd: string;
  private db: SessionDB;
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(options: AgentOptions) {
    this.sessionId = options.sessionId;
    this.cwd = options.cwd;
    this.db = options.db;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
    this.model = options.model;

    const config = {
      maxTokens: 28000,
      compressAt: 0.80,
    };

    this.contextManager = new ContextManager(config);
    this.toolExecutor = new ToolExecutor(this.db, {
      bash: 'ask',
      write: 'ask',
      edit: 'ask',
    });
    this.planner = new Planner(this.db, this.sessionId);
  }

  async initialize(): Promise<void> {
    const config = await loadConfig();
    this.toolExecutor = new ToolExecutor(this.db, config.permission);

    const gitStatus = await getGitStatusString(this.cwd);
    const agentsPath = findAgentsFile(this.cwd);
    const agentsContent = readAgentsFile(agentsPath);

    const systemPrompt = buildSystemPrompt(
      this.cwd,
      platform(),
      gitStatus,
      agentsContent
    );

    this.contextManager.addSystemPrompt(systemPrompt);
  }

  async run(userMessage: string): Promise<AgentResponse> {
    this.contextManager.addMessage({
      role: 'user',
      content: userMessage,
    });

    this.db.addMessage({
      sessionId: this.sessionId,
      role: 'user',
      content: userMessage,
    });

    let iterationCount = 0;
    const maxIterations = 20;
    let lastError: string | null = null;
    let retryCount = 0;
    const maxRetries = 3;

    while (iterationCount < maxIterations) {
      iterationCount++;

      if (this.contextManager.shouldCompress()) {
        this.contextManager.compress();
      }

      const response = await this.callLLMWithRetry(lastError, retryCount);

      if (!response) {
        return {
          content: 'Error: Failed to get response from LLM',
          done: true,
        };
      }

      const toolCalls = this.parseToolCalls(response);

      if (toolCalls.length > 0) {
        const toolResults: Array<{ toolCallId: string; result: string; isError?: boolean }> = [];

        for (const toolCall of toolCalls) {
          const requiresPermission = ['bash', 'write_file', 'edit_file'].includes(toolCall.name);

          if (requiresPermission) {
            return {
              content: response,
              toolCalls,
              done: false,
            };
          }

          const result = await this.executeToolWithFallback(toolCall, retryCount);

          if (!result.success && retryCount < maxRetries) {
            // Retry failed tools
            retryCount++;
            lastError = result.result;
            break; // Restart the loop with retry
          }

          toolResults.push({
            toolCallId: toolCall.id,
            result: result.result,
            isError: !result.success,
          });
        }

        // If we broke out due to retry, continue to next iteration
        if (lastError && retryCount < maxRetries) {
          this.contextManager.addMessage({
            role: 'user',
            content: `Tool execution failed: ${lastError}. Retrying...`,
          });
          continue;
        }

        // Reset retry on success
        retryCount = 0;
        lastError = null;

        this.contextManager.addMessage({
          role: 'assistant',
          content: response,
          toolCalls,
        });

        const toolResultsContent = toolResults
          .map((r) => `Tool ${r.toolCallId} result: ${r.result}`)
          .join('\n');

        this.contextManager.addMessage({
          role: 'user',
          content: toolResultsContent,
        });

        continue;
      }

      this.contextManager.addMessage({
        role: 'assistant',
        content: response,
      });

      this.db.addMessage({
        sessionId: this.sessionId,
        role: 'assistant',
        content: response,
      });

      return {
        content: response,
        done: true,
      };
    }

    return {
      content: 'Error: Maximum iterations reached',
      done: true,
    };
  }

  async callLLMWithRetry(lastError: string | null, retryCount: number): Promise<string | null> {
    // Add retry context to the conversation if retrying
    if (lastError && retryCount > 0) {
      this.contextManager.addMessage({
        role: 'user',
        content: `Previous attempt failed: ${lastError}. Please try again with a different approach.`,
      });
    }

    const content = await this.callLLM();

    // Remove the retry message if we got a response
    if (lastError && retryCount > 0 && content) {
      const messages = this.contextManager.getMessagesForApi();
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.content.includes('Previous attempt failed')) {
        // Don't actually remove, just proceed
      }
    }

    return content;
  }

  async executeToolWithFallback(toolCall: ToolCall, retryCount: number): Promise<{ success: boolean; result: string }> {
    try {
      const result = await this.toolExecutor.executeTool(
        toolCall,
        this.cwd,
        this.sessionId
      );

      if (!result.success && retryCount === 0) {
        // First failure - try with adjusted parameters
        const adjustedCall = this.adjustToolCallForRetry(toolCall, result.result);
        if (adjustedCall) {
          return await this.toolExecutor.executeTool(
            adjustedCall,
            this.cwd,
            this.sessionId
          );
        }
      }

      return {
        success: result.success,
        result: result.result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        result: errorMessage,
      };
    }
  }

  adjustToolCallForRetry(toolCall: ToolCall, error: string): ToolCall | null {
    // Adjust tool calls based on error type
    if (toolCall.name === 'read_file') {
      const args = toolCall.args as { path: string; startLine?: number; endLine?: number };
      
      // If file is too large, try reading first chunk
      if (error.includes('large') || error.includes('truncated')) {
        return {
          ...toolCall,
          args: { ...args, startLine: 1, endLine: 100 },
        };
      }
      
      // If file not found, try without path prefix
      if (error.includes('not found')) {
        const newPath = args.path.replace(/^\.?\//, '');
        return {
          ...toolCall,
          args: { ...args, path: newPath },
        };
      }
    }

    if (toolCall.name === 'grep') {
      const args = toolCall.args as { pattern: string; path?: string };
      
      // If no results, try case-insensitive
      if (error.includes('No matches') || args.pattern.includes('case')) {
        return {
          ...toolCall,
          args: { ...args, caseSensitive: false },
        };
      }
    }

    // No adjustment possible for other tools
    return null;
  }

  async executeToolWithPermission(toolCall: ToolCall): Promise<{ success: boolean; result: string }> {
    const result = await this.toolExecutor.executeTool(
      toolCall,
      this.cwd,
      this.sessionId
    );

    this.contextManager.addMessage({
      role: 'user',
      content: `Tool ${toolCall.name} result: ${result.result}`,
    });

    return {
      success: result.success,
      result: result.result,
    };
  }

  grantPermission(type: 'bash' | 'write' | 'edit', always: boolean = false): void {
    this.toolExecutor.grantPermission(type, always);
  }

  private async callLLM(): Promise<string | null> {
    const messages = this.contextManager.getMessagesForApi();

    // Professional CLI agent system prompt
    const systemPrompt = `You are Kode, a professional AI coding agent for the terminal.

OUTPUT FORMAT RULES:

1. NEVER show internal reasoning or <think> blocks
2. Structure output into sections when applicable:

━━━ PLAN ━━━
- Bullet points of what will be done (max 5)

━━━ ACTION ━━━
⏳ [tool] action
✓ [tool] completed
✖ [tool] failed

3. FILE OUTPUT:
📄 path (lines)
[show snippet or diff, not full content]

4. DIFFS (always for file changes):
--- old
+++ new
+ added
- removed

5. Always ask before modifying:
Apply this change? (y/n)

6. Be concise:
- Max 3-5 lines per explanation
- No paragraphs or storytelling
- No "Okay, let me..." filler

7. Status indicators:
⏳ running | ✓ success | ✖ error

8. Tool call format:
tool_call:{"name": "tool_name", "args": {...}}

Environment: ${this.cwd} | ${process.platform}

Respond professionally like a developer tool, not a chatbot.`;

    // Build messages array - Sarvam requires user message first
    const sarvamMessages: Array<{ role: string; content: string }> = [];
    
    let baseSystemPrompt = '';
    
    if (messages.length > 0 && messages[0].role === 'system') {
      baseSystemPrompt = messages[0].content;
    }

    // Build alternating user/assistant messages
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      if (msg.role === 'system') {
        continue;
      }
      
      if (msg.role === 'user') {
        const content = sarvamMessages.length === 0 && baseSystemPrompt
          ? systemPrompt + '\n\n' + msg.content
          : msg.content;
        sarvamMessages.push({ role: 'user', content });
      } else if (msg.role === 'assistant') {
        sarvamMessages.push({ role: 'assistant', content: msg.content });
      }
    }

    if (sarvamMessages.length === 0 || sarvamMessages[0].role !== 'user') {
      console.error('No user message found, cannot call LLM');
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: sarvamMessages,
          temperature: 0.2,
          max_tokens: 2000,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`LLM API error: ${response.status} ${errorText}`);
        return null;
      }

      // Stream the response
      const content = await this.streamResponse(response);

      return content;
    } catch (error) {
      console.error('LLM API call failed:', error);
      return null;
    }
  }

  private async streamResponse(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Strip <think> blocks from output (model sometimes ignores instructions)
    // Try multiple patterns to catch all variations
    const thinkBlockRegex = /<think>[\s\S]*?(?:<\/think>|<\/thought>|<\/thinking>)/gi;
    const thinkBlockRegex2 = /<think>[\s\S]*$/gi;
    
    fullContent = fullContent.replace(thinkBlockRegex, '').trim();
    fullContent = fullContent.replace(thinkBlockRegex2, '').trim();

    return fullContent;
  }

  private parseToolCalls(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    const seenSignatures = new Set<string>();

    // Pattern 1: tool_call:{"name": "...", "args": {...}}
    const toolCallPattern = /tool_call:\s*(\{[\s\S]*?\})\s*(?=\n|$|tool_call:)/g;
    let match;

    while ((match = toolCallPattern.exec(content)) !== null) {
      try {
        const parsed = this.parseToolCallJSON(match[1]);
        if (parsed && this.validateToolCall(parsed)) {
          const signature = `${parsed.name}:${JSON.stringify(parsed.args)}`;
          if (!seenSignatures.has(signature)) {
            seenSignatures.add(signature);
            toolCalls.push({
              id: `call_${toolCalls.length}`,
              name: parsed.name,
              args: parsed.args,
            });
          }
        }
      } catch {
        // Invalid JSON, skip
      }
    }

    // Pattern 2: Try to find JSON objects that look like tool calls
    const jsonPattern = /\{[\s\S]*?"name"[\s\S]*?"args"[\s\S]*?\}/g;
    while ((match = jsonPattern.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed.name && typeof parsed.name === 'string') {
          const signature = `${parsed.name}:${JSON.stringify(parsed.args || {})}`;
          if (!seenSignatures.has(signature)) {
            seenSignatures.add(signature);
            toolCalls.push({
              id: `call_${toolCalls.length}`,
              name: parsed.name,
              args: parsed.args || parsed.arguments || {},
            });
          }
        }
      } catch {
        // Invalid JSON, skip
      }
    }

    return toolCalls;
  }

  private parseToolCallJSON(jsonStr: string): { name: string; args: Record<string, unknown> } | null {
    try {
      // Try parsing directly
      const parsed = JSON.parse(jsonStr);
      if (parsed.name) {
        return { name: parsed.name, args: parsed.args || parsed.arguments || {} };
      }
    } catch {
      // Try to extract and parse inner JSON if wrapped
      const innerMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (innerMatch) {
        return this.parseToolCallJSON(innerMatch[0]);
      }
    }
    return null;
  }

  private validateToolCall(call: { name: string; args: Record<string, unknown> }): boolean {
    const validTools = [
      'read_file', 'write_file', 'edit_file', 'bash',
      'grep', 'list_dir', 'todo_write', 'todo_read'
    ];

    if (!call.name || !validTools.includes(call.name)) {
      return false;
    }

    if (!call.args || typeof call.args !== 'object') {
      return false;
    }

    // Validate required args per tool
    const requiredArgs: Record<string, string[]> = {
      read_file: ['path'],
      write_file: ['path', 'content'],
      edit_file: ['path', 'target', 'replacement'],
      bash: ['command'],
      grep: ['pattern'],
      list_dir: [],
      todo_write: ['todos'],
      todo_read: [],
    };

    const required = requiredArgs[call.name] || [];
    for (const arg of required) {
      if (!(arg in call.args)) {
        return false;
      }
    }

    return true;
  }

  getContextStatus() {
    return this.contextManager.getStatus();
  }

  getPlanner(): Planner {
    return this.planner;
  }

  async previewTool(toolCall: ToolCall): Promise<{ diff?: string; error?: string }> {
    try {
      if (toolCall.name === 'write_file') {
        const { writeFileTool } = await import('../tools/write.js');
        const args = toolCall.args as { path: string; content: string };
        const result = await writeFileTool(args, this.cwd);
        if (result.success && result.diff) {
          return { diff: result.diff };
        }
        return { error: result.error || 'Failed to generate diff' };
      }

      if (toolCall.name === 'edit_file') {
        const { editFileTool } = await import('../tools/edit.js');
        const args = toolCall.args as { path: string; target: string; replacement: string };
        const result = await editFileTool(args, this.cwd);
        if (result.success && result.diff) {
          return { diff: result.diff };
        }
        return { error: result.error || 'Failed to generate diff' };
      }

      return { error: 'Preview not supported for this tool' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { error: errorMessage };
    }
  }
}