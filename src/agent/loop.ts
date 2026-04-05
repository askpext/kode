import { ContextManager, buildSystemPrompt } from './context.js';
import { ToolExecutor, ToolCall, toolDefinitions } from './tools.js';
import { Planner } from './planner.js';
import SessionDB from '../db/sessions.js';
import { loadConfig, findAgentsFile, readAgentsFile } from '../config.js';
import { getGitStatusString } from '../utils/git.js';
import { platform } from 'os';
import { existsSync, readFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { resolveDirectoryHint, resolveFlexiblePath } from '../tools/path.js';
import { analyzeCodebase, isAnalysisIntent } from '../core/agent/analyze.js';
import { countDirectoriesTool, formatCountDirectoriesResult } from '../tools/dir.js';

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
  private recentNavigationAttempts: string[] = [];
  private lastFailureMessage: string | null = null;
  private lastMissingDirectoryHint: string | null = null;
  private lastPermissionResult: { toolName: string; success: boolean; result: string } | null = null;
  private lastActionSummary: string | null = null;
  private lastBackgroundProcess: { id: string; command: string } | null = null;
  private pendingDeterministicPermission:
    | {
        toolName: string;
        successMessage: string;
        failureMessage: string;
        nextCwd?: string;
        backgroundCommand?: string;
      }
    | null = null;

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
    await this.refreshSystemPrompt();
  }

  async setCwd(nextCwd: string): Promise<void> {
    this.cwd = nextCwd;
    await this.db.updateSessionCwd(this.sessionId, nextCwd);
    await this.refreshSystemPrompt();
  }

  getCwd(): string {
    return this.cwd;
  }

  private async refreshSystemPrompt(): Promise<void> {
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

    await this.db.addMessage({
      sessionId: this.sessionId,
      role: 'user',
      content: userMessage,
    });

    const failureFollowupResponse = await this.tryHandleFailureFollowup(userMessage);
    if (failureFollowupResponse) {
      return failureFollowupResponse;
    }

    const deterministicFollowupResponse = await this.tryHandleDeterministicFollowupIntent(userMessage);
    if (deterministicFollowupResponse) {
      return deterministicFollowupResponse;
    }

    const backgroundTaskResponse = await this.tryHandleBackgroundTaskIntent(userMessage);
    if (backgroundTaskResponse) {
      return backgroundTaskResponse;
    }

    const actionFollowupResponse = await this.tryHandleActionFollowup(userMessage);
    if (actionFollowupResponse) {
      return actionFollowupResponse;
    }

    const readFileResponse = await this.tryHandleReadFileIntent(userMessage);
    if (readFileResponse) {
      return readFileResponse;
    }

    const replaceTextResponse = await this.tryHandleReplaceTextIntent(userMessage);
    if (replaceTextResponse) {
      return replaceTextResponse;
    }

    const portfolioResponse = await this.tryHandlePortfolioIntent(userMessage);
    if (portfolioResponse) {
      return portfolioResponse;
    }

    const taskResponse = await this.tryHandleTaskIntent(userMessage);
    if (taskResponse) {
      return taskResponse;
    }

    const directoryCreationResponse = await this.tryHandleDirectoryCreationIntent(userMessage);
    if (directoryCreationResponse) {
      return directoryCreationResponse;
    }

    const directoryCountResponse = await this.tryHandleDirectoryCountIntent(userMessage);
    if (directoryCountResponse) {
      return directoryCountResponse;
    }

    const navigationResponse = await this.tryHandleNavigationIntent(userMessage);
    if (navigationResponse) {
      return navigationResponse;
    }

    const analysisResponse = await this.tryHandleAnalysisIntent(userMessage);
    if (analysisResponse) {
      return analysisResponse;
    }

    if (!this.shouldUseOpenEndedLoop(userMessage)) {
      const deterministicFallbackResponse = await this.tryHandleDeterministicFallback(userMessage);
      if (deterministicFallbackResponse) {
        return deterministicFallbackResponse;
      }
    }

    let iterationCount = 0;
    const maxIterations = 20;
    let lastError: string | null = null;
    let retryCount = 0;
    const maxRetries = 3;
    let previousToolRoundSignature: string | null = null;
    let repeatedToolRoundCount = 0;

    while (iterationCount < maxIterations) {
      iterationCount++;

      if (this.contextManager.shouldCompress()) {
        this.contextManager.compress();
      }

      const response = await this.callLLMWithRetry(lastError, retryCount);

      if (!response) {
        this.lastFailureMessage = 'Error: Failed to get response from LLM';
        return {
          content: 'Error: Failed to get response from LLM',
          done: true,
        };
      }

      const toolCalls = this.normalizeToolCalls(this.parseToolCalls(response));

      // Clean up tool call tags from the displayed content 
      const cleanContent = this.stripToolCallContent(response);

      if (toolCalls.length > 0) {
        const toolRoundSignature = toolCalls
          .map((toolCall) => `${toolCall.name}:${JSON.stringify(toolCall.args)}`)
          .sort()
          .join('|');

        if (toolRoundSignature === previousToolRoundSignature) {
          repeatedToolRoundCount++;
        } else {
          previousToolRoundSignature = toolRoundSignature;
          repeatedToolRoundCount = 0;
        }

        if (repeatedToolRoundCount >= 2) {
          const response = 'Error: Repeated identical tool calls detected. Please refine the path or try a different approach.';
          this.lastFailureMessage = response;
          this.contextManager.addMessage({ role: 'assistant', content: response });
          await this.db.addMessage({
            sessionId: this.sessionId,
            role: 'assistant',
            content: response,
          });

          return {
            content: response,
            done: true,
          };
        }
        const toolResults: Array<{ toolCallId: string; result: string; isError?: boolean }> = [];

        for (const toolCall of toolCalls) {
          const requiresPermission = ['bash', 'write_file', 'edit_file', 'create_directory'].includes(toolCall.name);

          if (requiresPermission) {
            return {
              content: cleanContent,
              toolCalls,
              done: false,
            };
          }

          const result = await this.executeToolWithFallback(toolCall, retryCount);

          if (!result.success && retryCount < maxRetries) {
            // Retry failed tools
            retryCount++;
            lastError = result.result;
            this.lastFailureMessage = result.result;
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
          .map((r) => `[TOOL RESULT for ${r.toolCallId}]\n${r.result}\n[END TOOL RESULT]`)
          .join('\n\n');
        
        // Force model to acknowledge the ACTUAL real content above
        const injectedContent = `The following are the REAL outputs from tools you just called. You MUST use this exact content in your response. Do NOT invent or paraphrase — show the actual content:\n\n${toolResultsContent}`;

        this.contextManager.addMessage({
          role: 'user',
          content: injectedContent,
        });

        continue;
      }

      this.contextManager.addMessage({
        role: 'assistant',
        content: response,
      });

      await this.db.addMessage({
        sessionId: this.sessionId,
        role: 'assistant',
        content: response,
      });

      this.lastFailureMessage = null;

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
      content: `[TOOL RESULT for ${toolCall.name}]\n${result.result}\n[END TOOL RESULT]\n\nAbove is the REAL output from ${toolCall.name}. Use this EXACT content.`,
    });

    this.lastPermissionResult = {
      toolName: toolCall.name,
      success: result.success,
      result: result.result,
    };

    return {
      success: result.success,
      result: result.result,
    };
  }

  /**
   * Called after the UI executes permission-gated tools.
   * Resumes the agent loop so it can process the tool results and give a proper response.
   */
  async continueAfterPermission(): Promise<AgentResponse> {
    const deterministicResponse = await this.tryHandleDeterministicPermissionCompletion();
    if (deterministicResponse) {
      return deterministicResponse;
    }

    let iterationCount = 0;
    const maxIterations = 15;
    let previousToolRoundSignature: string | null = null;
    let repeatedToolRoundCount = 0;

    while (iterationCount < maxIterations) {
      iterationCount++;

      if (this.contextManager.shouldCompress()) {
        this.contextManager.compress();
      }

      const response = await this.callLLM();

      if (!response) {
        this.lastFailureMessage = 'Error: Failed to get response from LLM';
        return { content: 'Error: Failed to get response from LLM', done: true };
      }

      const toolCalls = this.normalizeToolCalls(this.parseToolCalls(response));
      const cleanContent = this.stripToolCallContent(response);

      if (toolCalls.length > 0) {
        const toolRoundSignature = toolCalls
          .map((toolCall) => `${toolCall.name}:${JSON.stringify(toolCall.args)}`)
          .sort()
          .join('|');

        if (toolRoundSignature === previousToolRoundSignature) {
          repeatedToolRoundCount++;
        } else {
          previousToolRoundSignature = toolRoundSignature;
          repeatedToolRoundCount = 0;
        }

        if (repeatedToolRoundCount >= 2) {
          const duplicateResponse = 'Error: Repeated identical tool calls detected after permission handling. Please refine the task or path.';
          this.lastFailureMessage = duplicateResponse;
          this.contextManager.addMessage({ role: 'assistant', content: duplicateResponse });
          await this.db.addMessage({
            sessionId: this.sessionId,
            role: 'assistant',
            content: duplicateResponse,
          });

          return { content: duplicateResponse, done: true };
        }
        // If the resumed loop needs permission again, surface it back to the UI
        const requiresPermission = toolCalls.some((tc) =>
          ['bash', 'write_file', 'edit_file', 'create_directory'].includes(tc.name)
        );

        if (requiresPermission) {
          this.contextManager.addMessage({ role: 'assistant', content: response, toolCalls });
          return { content: cleanContent, toolCalls, done: false };
        }

        // Execute non-permission tools automatically
        const toolResults: Array<{ toolCallId: string; result: string; isError?: boolean }> = [];
        for (const toolCall of toolCalls) {
          const result = await this.executeToolWithFallback(toolCall, 0);
          toolResults.push({ toolCallId: toolCall.id, result: result.result, isError: !result.success });
        }

        const toolResultsContent = toolResults
          .map((r) => `[TOOL RESULT for ${r.toolCallId}]\n${r.result}\n[END TOOL RESULT]`)
          .join('\n\n');
        
        const injectedContent = `The following are the REAL outputs from tools you just called. You MUST use this exact content in your response. Do NOT invent or paraphrase — show the actual content:\n\n${toolResultsContent}`;

        this.contextManager.addMessage({ role: 'assistant', content: response, toolCalls });
        this.contextManager.addMessage({
          role: 'user',
          content: injectedContent,
        });

        continue;
      }

      // No more tools — agent is done
      this.contextManager.addMessage({ role: 'assistant', content: response });
      await this.db.addMessage({ sessionId: this.sessionId, role: 'assistant', content: response });
      this.lastFailureMessage = null;

      return { content: response, done: true };
    }

    return { content: 'Error: Maximum iterations reached', done: true };
  }

  grantPermission(type: 'bash' | 'write' | 'edit', always: boolean = false): void {
    this.toolExecutor.grantPermission(type, always);
  }

  private async tryHandleNavigationIntent(userMessage: string): Promise<AgentResponse | null> {
    const hint = this.extractDirectoryHint(userMessage);
    if (!hint) {
      return null;
    }

    return this.tryHandleNavigationHint(hint);
  }

  private async tryHandleNavigationHint(hint: string): Promise<AgentResponse | null> {

    const resolution = resolveDirectoryHint(this.cwd, hint);

    if (resolution.matches.length === 1) {
      const nextCwd = resolution.matches[0];
      this.recentNavigationAttempts = [];
      this.lastMissingDirectoryHint = null;
      await this.setCwd(nextCwd);

      const response = `Switched workspace to ${nextCwd}\nI can analyze this codebase, inspect files, or make changes here now.`;
      this.lastFailureMessage = null;
      this.contextManager.addMessage({ role: 'assistant', content: response });
      await this.db.addMessage({
        sessionId: this.sessionId,
        role: 'assistant',
        content: response,
      });

      return {
        content: response,
        done: true,
      };
    }

    if (resolution.matches.length > 1) {
      this.recentNavigationAttempts = resolution.matches;
      this.lastMissingDirectoryHint = hint;
      const response = `I found multiple matching directories:\n${resolution.matches.map((match) => `- ${match}`).join('\n')}\nTell me which one to use.`;
      this.lastFailureMessage = response;
      this.contextManager.addMessage({ role: 'assistant', content: response });
      await this.db.addMessage({
        sessionId: this.sessionId,
        role: 'assistant',
        content: response,
      });

      return {
        content: response,
        done: true,
      };
    }

    this.recentNavigationAttempts = resolution.attempted;
    this.lastMissingDirectoryHint = hint;
    const response = `I couldn't find that directory from the current workspace.\nTried:\n${resolution.attempted.slice(0, 5).map((path) => `- ${path}`).join('\n')}`;
    this.lastFailureMessage = response;
    this.contextManager.addMessage({ role: 'assistant', content: response });
    await this.db.addMessage({
      sessionId: this.sessionId,
      role: 'assistant',
      content: response,
    });

    return {
      content: response,
      done: true,
    };
  }

  private async tryHandleAnalysisIntent(userMessage: string): Promise<AgentResponse | null> {
    if (!isAnalysisIntent(userMessage)) {
      return null;
    }

    const response = await analyzeCodebase(this.cwd);
    this.lastFailureMessage = null;
    this.contextManager.addMessage({ role: 'assistant', content: response });
    await this.db.addMessage({
      sessionId: this.sessionId,
      role: 'assistant',
      content: response,
    });

    return {
      content: response,
      done: true,
    };
  }

  private async tryHandleDeterministicFallback(userMessage: string): Promise<AgentResponse | null> {
    const domain = this.classifyDeterministicDomain(userMessage);
    if (!domain) {
      return null;
    }

    const responseByDomain: Record<typeof domain, string> = {
      workspace: this.lastMissingDirectoryHint
        ? `I’m staying in deterministic workspace mode here. If you want that repo, give me a path like \`/home/aditya/lowkey\` or tell me to create \`${this.lastMissingDirectoryHint}\`.`
        : 'I’m staying in deterministic workspace mode here. Give me a concrete directory name or path, like `go to lowkey dir` or `go to /home/aditya/lowkey`.',
      directory: 'I’m staying in deterministic directory mode here. Ask me to create a named folder, count directories in a path, or list a specific directory.',
      file: 'I’m staying in deterministic file mode here. Ask me to read a file path, replace quoted text in a file, or tell me exactly which file to create.',
      analysis: 'I’m staying in deterministic analysis mode here. Ask me to analyze the current codebase or switch to a workspace first, then I’ll summarize it directly.',
      task: 'I’m staying in deterministic task mode here. Ask me to run tests, run the build, or start the dev server in the current workspace.',
    };

    const response = responseByDomain[domain];
    this.lastFailureMessage = response;
    this.contextManager.addMessage({ role: 'assistant', content: response });
    await this.db.addMessage({
      sessionId: this.sessionId,
      role: 'assistant',
      content: response,
    });

    return {
      content: response,
      done: true,
    };
  }

  private shouldUseOpenEndedLoop(userMessage: string): boolean {
    return this.classifyDeterministicDomain(userMessage) === null;
  }

  private async tryHandleFailureFollowup(userMessage: string): Promise<AgentResponse | null> {
    if (!this.lastFailureMessage) {
      return null;
    }

    const trimmed = userMessage.trim().toLowerCase();
    if (!/^(what happened|what went wrong|why|why\?|explain)/.test(trimmed)) {
      return null;
    }

    const response = `The last step failed.\n\n${this.lastFailureMessage}\n\nTry giving me a more specific path, or tell me the exact directory you want to use.`;
    this.contextManager.addMessage({ role: 'assistant', content: response });
    await this.db.addMessage({
      sessionId: this.sessionId,
      role: 'assistant',
      content: response,
    });

    return {
      content: response,
      done: true,
    };
  }

  private async tryHandleActionFollowup(userMessage: string): Promise<AgentResponse | null> {
    if (!this.lastActionSummary) {
      return null;
    }

    if (!/^(did it\??|did you do it\??|done\??|status\??|tello\??)$/i.test(userMessage.trim())) {
      return null;
    }

    const response = this.lastActionSummary;
    this.contextManager.addMessage({ role: 'assistant', content: response });
    await this.db.addMessage({
      sessionId: this.sessionId,
      role: 'assistant',
      content: response,
    });

    return {
      content: response,
      done: true,
    };
  }

  private async tryHandleDeterministicFollowupIntent(userMessage: string): Promise<AgentResponse | null> {
    if (!this.lastMissingDirectoryHint) {
      return null;
    }

    const trimmed = userMessage.trim();
    if (!trimmed || /\s{2,}/.test(trimmed)) {
      return null;
    }

    if (!this.looksLikeDirectoryFollowup(trimmed)) {
      return null;
    }

    return this.tryHandleNavigationHint(trimmed);
  }

  private async tryHandleBackgroundTaskIntent(userMessage: string): Promise<AgentResponse | null> {
    if (!this.lastBackgroundProcess) {
      return null;
    }

    const trimmed = userMessage.trim().toLowerCase();
    let action: 'read' | 'terminate' | null = null;

    if (/^(status|check status|what'?s the status|what is the status|check dev server|check server|dev server status|server status)\??$/.test(trimmed)) {
      action = 'read';
    } else if (/^(stop|stop dev server|stop server|kill dev server|kill server|terminate server|terminate dev server)\??$/.test(trimmed)) {
      action = 'terminate';
    }

    if (!action) {
      return null;
    }

    const toolCall: ToolCall = {
      id: `deterministic_background_${action}`,
      name: 'bash_status',
      args: {
        id: this.lastBackgroundProcess.id,
        action,
      },
    };

    const result = await this.executeToolWithFallback(toolCall, 0);
    const label = action === 'read' ? 'Background task status' : 'Background task stopped';
    const response = `${label} for \`${this.lastBackgroundProcess.command}\`\n\n${result.result}`;

    if (action === 'terminate' && result.success) {
      this.lastBackgroundProcess = null;
    }

    this.lastFailureMessage = result.success ? null : response;
    this.lastActionSummary = result.success ? response : this.lastActionSummary;
    this.contextManager.addMessage({ role: 'assistant', content: response });
    await this.db.addMessage({
      sessionId: this.sessionId,
      role: 'assistant',
      content: response,
    });

    return {
      content: response,
      done: true,
    };
  }

  private extractDirectoryHint(userMessage: string): string | null {
    const trimmed = userMessage.trim();
    const normalized = trimmed.replace(/^(?:hey|hi|hello|please|bro+|okay|ok)\s+/i, '');
    const politeNormalized = normalized.replace(/^(?:can you|could you|would you)\s+/i, '');
    const checkInMatch = trimmed.match(/(?:^|\b)(?:check in|look in)\s+(.+?)$/i);
    if (checkInMatch) {
      return checkInMatch[1].trim();
    }

    const namedNavigationMatch = politeNormalized.match(/(?:^|\b)(?:go to|goto|switch to|move to|open|enter|use|check)\s+(?:a\s+)?(?:dir|directory|folder)\s+named\s+(.+?)$/i);
    if (namedNavigationMatch) {
      return namedNavigationMatch[1].trim();
    }

    const directDirectoryMatch = politeNormalized.match(/(?:^|\b)(?:go to|goto|switch to|move to|open|enter|use|check)\s+(?:a\s+)?(?:dir|directory|folder)\s+(.+?)$/i);
    if (directDirectoryMatch) {
      return directDirectoryMatch[1].trim();
    }

    const navigationMatch = politeNormalized.match(/(?:^|\b)(?:go to|goto|switch to|move to|open|enter|use|check)\s+(.+?)(?:\s+(?:dir|directory|folder))?$/i);
    if (navigationMatch) {
      return navigationMatch[1].trim();
    }

    const namedDirectoryMatch = politeNormalized.match(/(?:^|\b)(?:explore|inspect|open|use)\s+(?:a\s+)?(?:dir|directory|folder)\s+named\s+(.+?)$/i);
    if (namedDirectoryMatch) {
      return namedDirectoryMatch[1].trim();
    }

    const absolutePathMatch = trimmed.match(/(~?\/[^\s,;]+(?:\/[^\s,;]+)*)/);
    if (absolutePathMatch) {
      return absolutePathMatch[1].trim();
    }

    const windowsAbsolutePathMatch = trimmed.match(/([A-Za-z]:\\[^\s,;]+(?:\\[^\s,;]+)*)/);
    if (windowsAbsolutePathMatch) {
      return windowsAbsolutePathMatch[1].trim();
    }

    const attemptedPathMatch = [...this.recentNavigationAttempts]
      .sort((left, right) => right.length - left.length)
      .find((attempt) => trimmed.includes(attempt));
    if (attemptedPathMatch) {
      return attemptedPathMatch;
    }

    const pathLikeMatch = trimmed.match(/^([A-Za-z]:\\[^\s]+|~?[\\/][^\s]+|[\w.-]+[\\/][^\s]+)(?:\s+.*)?$/);
    if (pathLikeMatch) {
      return pathLikeMatch[1].trim();
    }

    return null;
  }

  private async callLLM(): Promise<string | null> {
    const messages = this.contextManager.getMessagesForApi();

    // Professional CLI agent system prompt
    const systemPrompt = `You are Kode, a professional AI coding agent for the terminal.

CRITICAL TOOL RULES:
1. TOOL PRIORITY: Always prefer built-in tools over bash.
   - list_dir → explore directories (NEVER use bash ls, find, dir)
   - read_file → read file contents (NEVER use bash cat, type)
   - grep -> search code (NEVER use bash grep)
   - bash → ONLY for: builds, tests, git, npm/yarn installs, running scripts
2. PLATFORM: Kode targets WSL, Linux, and macOS. Use POSIX paths and bash syntax.
3. CD: NEVER use 'cd' in bash - use absolute paths.
4. CODE: Always write COMPLETE well-formed code (e.g. HTML with DOCTYPE/head/body).

OUTPUT FORMAT:
1. NEVER show <think> blocks.
2. Structure: 
   ━━━ PLAN ━━━ (max 5 points)
   ━━━ ACTION ━━━ (⏳ action, ✓ completed, ✖ failed)
3. FILE OUTPUT: Show FULL raw content in a code block if user asks to see it; else summarize.
4. DIFFS for changes: --- old / +++ new / + added / - removed.
5. Concise: No filler like "Okay, let me...".
6. Tool call format: tool_call:{"name": "tool_name", "args": {...}}

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
          ? baseSystemPrompt + '\n\n' + systemPrompt + '\n\n' + msg.content
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
        if (response.status === 403) {
          console.error(`\n✖ Invalid API Key: Please check your SARVAM_API_KEY in ~/.kode/config.json or your environment variables.\nGet a new key at https://sarvam.ai\n`);
        } else if (response.status === 404) {
          console.error(`\n✖ Model Not Found: The model "${this.model}" is not available or you don't have access to it.\n`);
        } else {
          const errorText = await response.text();
          console.error(`\n✖ LLM API error: ${response.status} ${errorText}\n`);
        }
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

    // Pattern 3: XML-like format <tool_call>name <arg_key>...
    const xmlToolPattern = /<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/g;
    while ((match = xmlToolPattern.exec(content)) !== null) {
      const toolBlock = match[1].trimStart();
      const toolNameMatch = toolBlock.match(/^([a-zA-Z0-9_\-]+)/);
      if (toolNameMatch) {
        const toolName = toolNameMatch[1].trim();
        const args = this.parseXmlToolArgs(toolBlock);

        if (this.validateToolCall({ name: toolName, args })) {
          const signature = `${toolName}:${JSON.stringify(args)}`;
          if (!seenSignatures.has(signature)) {
            seenSignatures.add(signature);
            toolCalls.push({
              id: `call_xml_${toolCalls.length}`,
              name: toolName,
              args: args,
            });
          }
        }
      }
    }

    return toolCalls;
  }

  private normalizeToolCalls(toolCalls: ToolCall[]): ToolCall[] {
    return toolCalls.map((toolCall) => {
      const normalized = this.normalizeShellLikeToolCall(toolCall);
      return normalized ?? toolCall;
    });
  }

  private normalizeShellLikeToolCall(toolCall: ToolCall): ToolCall | null {
    if (toolCall.name !== 'bash') {
      return null;
    }

    const command = typeof toolCall.args.command === 'string' ? toolCall.args.command.trim() : '';
    if (!command) {
      return null;
    }

    const mkdirMatch = command.match(/^mkdir(?:\s+-p)?\s+(.+)$/);
    if (mkdirMatch) {
      return {
        ...toolCall,
        name: 'create_directory',
        args: {
          path: this.stripShellQuotes(mkdirMatch[1].trim()),
        },
      };
    }

    const lsMatch = command.match(/^ls(?:\s+-[A-Za-z]+)*\s*(.*)$/);
    if (lsMatch) {
      const path = this.stripShellQuotes(lsMatch[1].trim());
      return {
        ...toolCall,
        name: 'list_dir',
        args: path ? { path } : {},
      };
    }

    const catMatch = command.match(/^cat\s+(.+)$/);
    if (catMatch) {
      return {
        ...toolCall,
        name: 'read_file',
        args: {
          path: this.stripShellQuotes(catMatch[1].trim()),
        },
      };
    }

    return null;
  }

  private stripShellQuotes(value: string): string {
    return value.replace(/^['"]|['"]$/g, '');
  }

  private parseXmlToolArgs(toolBlock: string): Record<string, string> {
    const args: Record<string, string> = {};
    const argPattern = /<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)(?=<\/arg_value>|<arg_key>|$)/g;
    let argMatch: RegExpExecArray | null;

    while ((argMatch = argPattern.exec(toolBlock)) !== null) {
      const key = argMatch[1].trim();
      const value = argMatch[2].trim();
      if (key) {
        args[key] = value;
      }
    }

    return args;
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

  private stripToolCallContent(content: string): string {
    return content
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
      .replace(/<tool_call>[\s\S]*$/g, '')
      .replace(/tool_call:\s*\{[\s\S]*?\}(?=\n|$)/g, '')
      .replace(/\*\*TOOL CALL:\*\*[\s\S]*?(?=\n{2,}|\Z)/g, '')
      .trim();
  }

  private validateToolCall(call: { name: string; args: Record<string, unknown> }): boolean {
    const validTools = [
      'read_file', 'write_file', 'edit_file', 'bash',
      'grep', 'list_dir', 'create_directory', 'count_directories', 'todo_write', 'todo_read',
      'replace_multi', 'fetch_url', 'bash_background', 'bash_status'
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
      create_directory: ['path'],
      count_directories: [],
      todo_write: ['todos'],
      todo_read: [],
      replace_multi: ['path', 'edits'],
      fetch_url: ['url'],
      bash_background: ['command'],
      bash_status: ['id', 'action'],
    };

    const required = requiredArgs[call.name] || [];
    for (const arg of required) {
      if (!(arg in call.args)) {
        return false;
      }
    }

    return true;
  }

  private async tryHandleDirectoryCreationIntent(userMessage: string): Promise<AgentResponse | null> {
    const explicitHint = this.extractCreateDirectoryHint(userMessage);
    const shouldCreateFromContext = this.shouldCreateLastMissingDirectory(userMessage);
    const hint = explicitHint || (shouldCreateFromContext ? this.lastMissingDirectoryHint : null);

    if (!hint) {
      return null;
    }

    const targetPath = this.resolveDirectoryCreationTarget(hint);
    const relativePath = this.toWorkspaceRelativePath(targetPath);
    const toolCall: ToolCall = {
      id: 'deterministic_create_directory',
      name: 'create_directory',
      args: {
        path: relativePath,
      },
    };

    this.pendingDeterministicPermission = {
      toolName: 'create_directory',
      successMessage: existsSync(targetPath)
        ? `Directory already exists: ${targetPath}\nSwitched workspace to ${targetPath}`
        : `Created directory: ${targetPath}\nSwitched workspace to ${targetPath}`,
      failureMessage: `I couldn't create ${targetPath}.`,
      nextCwd: targetPath,
    };

    const response = existsSync(targetPath)
      ? `I found that directory already exists at ${targetPath}. Approve the directory action and I’ll switch the workspace there.`
      : `I can create ${targetPath} and switch the workspace there once you approve it.`;

    this.contextManager.addMessage({ role: 'assistant', content: response, toolCalls: [toolCall] });
    return {
      content: response,
      toolCalls: [toolCall],
      done: false,
    };
  }

  private async tryHandleReadFileIntent(userMessage: string): Promise<AgentResponse | null> {
    const match = userMessage.trim().match(/^(?:read|show|view)\s+(?:the\s+)?(?:file\s+)?(.+?)\??$/i);
    if (!match) {
      return null;
    }

    const path = match[1].trim().replace(/^["']|["']$/g, '');
    if (!path || /^(file|a file|the file)$/i.test(path) || /\b(codebase|repo|project)\b/i.test(path)) {
      return null;
    }

    const { readFileTool, formatReadResult } = await import('../tools/read.js');
    const result = await readFileTool({ path }, this.cwd);
    const response = formatReadResult(result);

    this.lastFailureMessage = result.success ? null : response;
    this.lastActionSummary = result.success ? `Read file: ${path}` : null;
    this.contextManager.addMessage({ role: 'assistant', content: response });
    await this.db.addMessage({
      sessionId: this.sessionId,
      role: 'assistant',
      content: response,
    });

    return {
      content: response,
      done: true,
    };
  }

  private async tryHandleReplaceTextIntent(userMessage: string): Promise<AgentResponse | null> {
    const match = userMessage.trim().match(/^(?:replace|change)\s+["']([\s\S]+?)["']\s+with\s+["']([\s\S]+?)["']\s+in\s+(.+?)\??$/i);
    if (!match) {
      return null;
    }

    const [, target, replacement, path] = match;
    const normalizedPath = path.trim().replace(/^["']|["']$/g, '');
    const toolCall: ToolCall = {
      id: 'deterministic_edit_file',
      name: 'edit_file',
      args: {
        path: normalizedPath,
        target,
        replacement,
      },
    };

    this.pendingDeterministicPermission = {
      toolName: 'edit_file',
      successMessage: `Updated ${normalizedPath}`,
      failureMessage: `I couldn't update ${normalizedPath}.`,
    };

    const response = `I can update ${normalizedPath} by replacing the requested text as soon as you approve the edit.`;
    this.contextManager.addMessage({ role: 'assistant', content: response, toolCalls: [toolCall] });
    return {
      content: response,
      toolCalls: [toolCall],
      done: false,
    };
  }

  private async tryHandlePortfolioIntent(userMessage: string): Promise<AgentResponse | null> {
    const trimmed = userMessage.trim().toLowerCase();
    if (!/\bportfolio\b/.test(trimmed) || !/\b(html|css|website|landing page|site)\b/.test(trimmed)) {
      return null;
    }

    const content = buildPortfolioHtml();
    const toolCall: ToolCall = {
      id: 'deterministic_write_portfolio',
      name: 'write_file',
      args: {
        path: 'index.html',
        content,
      },
    };

    this.pendingDeterministicPermission = {
      toolName: 'write_file',
      successMessage: `Created portfolio starter at ${resolve(this.cwd, 'index.html')}`,
      failureMessage: `I couldn't create the portfolio starter in ${this.cwd}.`,
    };

    const response = `I can create a polished single-file portfolio starter at ${resolve(this.cwd, 'index.html')} once you approve the write.`;
    this.contextManager.addMessage({ role: 'assistant', content: response, toolCalls: [toolCall] });
    return {
      content: response,
      toolCalls: [toolCall],
      done: false,
    };
  }

  private async tryHandleTaskIntent(userMessage: string): Promise<AgentResponse | null> {
    const task = this.detectDeterministicTask(userMessage);
    if (!task) {
      return null;
    }

    const command = this.resolveTaskCommand(task);
    if (!command) {
      const response = `I couldn't find a clear ${task.label} command in this workspace.`;
      this.lastFailureMessage = response;
      this.contextManager.addMessage({ role: 'assistant', content: response });
      await this.db.addMessage({
        sessionId: this.sessionId,
        role: 'assistant',
        content: response,
      });

      return {
        content: response,
        done: true,
      };
    }

    const toolCall: ToolCall = {
      id: `deterministic_${task.type}`,
      name: task.background ? 'bash_background' : 'bash',
      args: {
        command,
      },
    };

    this.pendingDeterministicPermission = {
      toolName: toolCall.name,
      successMessage: task.background
        ? `${task.successLabel} started with \`${command}\``
        : `${task.successLabel} finished with \`${command}\``,
      failureMessage: `I couldn't ${task.label} with \`${command}\`.`,
      backgroundCommand: task.background ? command : undefined,
    };

    const response = task.background
      ? `I can start ${task.label} with \`${command}\` as a tracked background process once you approve it.`
      : `I can run ${task.label} with \`${command}\` once you approve it.`;

    this.contextManager.addMessage({ role: 'assistant', content: response, toolCalls: [toolCall] });
    return {
      content: response,
      toolCalls: [toolCall],
      done: false,
    };
  }

  private async tryHandleDirectoryCountIntent(userMessage: string): Promise<AgentResponse | null> {
    const match = userMessage.trim().match(/(?:how many|count)\s+(?:directories|directory|dirs|dir)\s+(?:are there\s+)?(?:in\s+(.+))?\??$/i);
    if (!match) {
      return null;
    }

    const rawTarget = match[1]?.trim().replace(/[?.,!]+$/g, '');
    const targetHint = rawTarget && !/^(here|current|current workspace)$/i.test(rawTarget) ? rawTarget : undefined;
    const recursive = /\brecursive|recursively|all\b/i.test(userMessage);
    const result = await countDirectoriesTool({ path: targetHint, recursive }, this.cwd);
    const response = formatCountDirectoriesResult(result);

    this.lastFailureMessage = result.success ? null : response;
    this.contextManager.addMessage({ role: 'assistant', content: response });
    await this.db.addMessage({
      sessionId: this.sessionId,
      role: 'assistant',
      content: response,
    });

    return {
      content: response,
      done: true,
    };
  }

  private async tryHandleDeterministicPermissionCompletion(): Promise<AgentResponse | null> {
    if (!this.pendingDeterministicPermission || !this.lastPermissionResult) {
      return null;
    }

    if (this.pendingDeterministicPermission.toolName !== this.lastPermissionResult.toolName) {
      return null;
    }

    const pending = this.pendingDeterministicPermission;
    const permissionResult = this.lastPermissionResult;
    this.pendingDeterministicPermission = null;
    this.lastPermissionResult = null;

    let response = pending.failureMessage;
    if (permissionResult.success) {
      if (pending.nextCwd) {
        await this.setCwd(pending.nextCwd);
      }
      this.lastMissingDirectoryHint = null;
      this.recentNavigationAttempts = [];
      this.lastFailureMessage = null;
      response = pending.successMessage;
      if (permissionResult.result && pending.toolName === 'bash') {
        response = `${pending.successMessage}\n\n${permissionResult.result}`;
      }
      if (pending.toolName === 'bash_background') {
        const backgroundId = this.extractBackgroundProcessId(permissionResult.result);
        if (backgroundId && pending.backgroundCommand) {
          this.lastBackgroundProcess = {
            id: backgroundId,
            command: pending.backgroundCommand,
          };
          response = `${pending.successMessage}\n\nProcess ID: ${backgroundId}`;
        }
      }
      this.lastActionSummary = response;
    } else {
      response = `${pending.failureMessage}\n\n${permissionResult.result}`;
      this.lastFailureMessage = response;
      this.lastActionSummary = null;
    }

    this.contextManager.addMessage({ role: 'assistant', content: response });
    await this.db.addMessage({
      sessionId: this.sessionId,
      role: 'assistant',
      content: response,
    });

    return {
      content: response,
      done: true,
    };
  }

  private extractBackgroundProcessId(result: string): string | null {
    const match = result.match(/ID:\s*([a-zA-Z0-9-]+)/i);
    return match ? match[1] : null;
  }

  private extractCreateDirectoryHint(userMessage: string): string | null {
    const trimmed = userMessage.trim();
    const explicitMatch = trimmed.match(/(?:^|\b)(?:make|create|mkdir)\s+(?:a\s+)?(?:dir|directory|folder)\s+(?:named\s+)?["']?([^"'?]+?)["']?\??$/i);
    if (explicitMatch) {
      return explicitMatch[1].trim();
    }

    return null;
  }

  private shouldCreateLastMissingDirectory(userMessage: string): boolean {
    if (!this.lastMissingDirectoryHint) {
      return false;
    }

    return /^(?:(?:ok(?:ay)?|yes|then)\s+)*(?:make one|create one|make it|create it|make that|create that)\b/i.test(userMessage.trim());
  }

  private resolveDirectoryCreationTarget(hint: string): string {
    const normalizedHint = hint.trim();

    if (/^(~?[\\/]|[A-Za-z]:\\)/.test(normalizedHint) || normalizedHint.includes('/')) {
      return resolveFlexiblePath(this.cwd, normalizedHint);
    }

    if (normalizedHint.includes('\\')) {
      return resolveFlexiblePath(this.cwd, normalizedHint.replace(/\\/g, '/'));
    }

    if (this.isProjectWorkspace(this.cwd)) {
      return resolve(dirname(this.cwd), normalizedHint);
    }

    return resolve(this.cwd, normalizedHint);
  }

  private isProjectWorkspace(directory: string): boolean {
    return ['package.json', '.git', 'README.md', 'README'].some((marker) =>
      existsSync(resolve(directory, marker))
    );
  }

  private toWorkspaceRelativePath(targetPath: string): string {
    const relativePath = relative(this.cwd, targetPath);
    if (relativePath && !relativePath.startsWith('..') && relativePath !== '.') {
      return relativePath;
    }

    return targetPath;
  }

  private detectDeterministicTask(userMessage: string): {
    type: 'test' | 'build' | 'dev';
    label: string;
    successLabel: string;
    background: boolean;
  } | null {
    const trimmed = userMessage.trim().toLowerCase();

    if (/^(run|start|execute)?\s*(the\s+)?tests?\b|^test this\b|^check tests?\b/.test(trimmed)) {
      return {
        type: 'test',
        label: 'tests',
        successLabel: 'Tests',
        background: false,
      };
    }

    if (/^(run|start|execute)?\s*(the\s+)?build\b|^build (this|it|project|repo)?\b/.test(trimmed)) {
      return {
        type: 'build',
        label: 'the build',
        successLabel: 'Build',
        background: false,
      };
    }

    if (/^(run|start)\s+(the\s+)?(dev|development)\s+(server|mode)\b|^(run|start)\s+dev\b/.test(trimmed)) {
      return {
        type: 'dev',
        label: 'the dev server',
        successLabel: 'Dev server',
        background: true,
      };
    }

    return null;
  }

  private resolveTaskCommand(task: { type: 'test' | 'build' | 'dev' }): string | null {
    const scripts = this.readPackageScripts();
    if (!scripts) {
      return null;
    }

    if (task.type === 'test' && scripts.test) {
      return 'npm test';
    }

    if (task.type === 'build' && scripts.build) {
      return 'npm run build';
    }

    if (task.type === 'dev' && scripts.dev) {
      return 'npm run dev';
    }

    return null;
  }

  private readPackageScripts(): Record<string, string> | null {
    const packageJsonPath = resolve(this.cwd, 'package.json');
    if (!existsSync(packageJsonPath)) {
      return null;
    }

    try {
      const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { scripts?: Record<string, string> };
      return parsed.scripts || null;
    } catch {
      return null;
    }
  }

  private classifyDeterministicDomain(userMessage: string): 'workspace' | 'directory' | 'file' | 'analysis' | 'task' | null {
    const trimmed = userMessage.trim().toLowerCase();

    if (this.looksLikeDirectoryFollowup(trimmed) && this.lastMissingDirectoryHint) {
      return 'workspace';
    }

    if (/\b(analy[sz]e|inspect|review|summari[sz]e|understand)\b.*\b(codebase|repo|repository|project)\b/.test(trimmed)) {
      return 'analysis';
    }

    if (/\b(run|start|execute|build|test|dev server|development server)\b/.test(trimmed)) {
      return 'task';
    }

    if (/\b(read|show|view|replace|change)\b/.test(trimmed) && /\b(file|\.|readme|package\.json|tsconfig|note\.txt)\b/.test(trimmed)) {
      return 'file';
    }

    if (/\b(go to|goto|switch to|move to|open|enter|use|workspace|path)\b/.test(trimmed) || /^[/~]/.test(trimmed)) {
      return 'workspace';
    }

    if (/\b(dir|directory|folder|mkdir|count directories|count dirs|list directory)\b/.test(trimmed)) {
      return 'directory';
    }

    return null;
  }

  private looksLikeDirectoryFollowup(input: string): boolean {
    const trimmed = input.trim();
    if (!trimmed || trimmed.length > 120) {
      return false;
    }

    if (/["'`]/.test(trimmed)) {
      return false;
    }

    if (/\b(make|create|read|show|replace|change|run|start|build|test|analy[sz]e)\b/i.test(trimmed)) {
      return false;
    }

    if (/\s/.test(trimmed) && !/[\\/]/.test(trimmed)) {
      return false;
    }

    return /^([A-Za-z0-9._~/-]+(?:\\[A-Za-z0-9._ -]+)*)$/.test(trimmed)
      || /^[A-Za-z0-9._ -]+\/[A-Za-z0-9._ -]+$/.test(trimmed)
      || /^[A-Za-z0-9._ -]+$/.test(trimmed);
  }

  getContextStatus() {
    return this.contextManager.getStatus();
  }

  setModel(model: string): void {
    this.model = model;
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

function buildPortfolioHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Portfolio</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1020;
      --panel: rgba(17, 24, 39, 0.78);
      --text: #e5eefc;
      --muted: #96a3b8;
      --accent: #7c3aed;
      --accent-2: #22d3ee;
      --border: rgba(148, 163, 184, 0.18);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(124, 58, 237, 0.24), transparent 30%),
        radial-gradient(circle at top right, rgba(34, 211, 238, 0.18), transparent 25%),
        var(--bg);
      line-height: 1.6;
    }
    a { color: inherit; text-decoration: none; }
    .container { width: min(1120px, calc(100% - 2rem)); margin: 0 auto; }
    .nav, section { padding: 1.25rem 0; }
    .nav .container, .hero, .grid, .footer {
      display: flex;
      gap: 1rem;
      align-items: center;
      justify-content: space-between;
    }
    .nav-links, .socials {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .hero {
      min-height: 82vh;
      padding: 4rem 0;
      align-items: stretch;
    }
    .hero-copy, .card {
      background: var(--panel);
      border: 1px solid var(--border);
      backdrop-filter: blur(16px);
      border-radius: 24px;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.35);
    }
    .hero-copy { flex: 1.2; padding: 3rem; }
    .hero-visual { flex: 1; display: grid; place-items: center; }
    .badge {
      display: inline-flex;
      padding: 0.4rem 0.8rem;
      border-radius: 999px;
      background: rgba(124, 58, 237, 0.16);
      color: #d8c4ff;
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }
    h1, h2, h3, p { margin-top: 0; }
    h1 { font-size: clamp(2.5rem, 6vw, 4.8rem); line-height: 1.05; margin-bottom: 1rem; }
    .lead { font-size: 1.08rem; color: var(--muted); max-width: 56ch; }
    .actions { display: flex; gap: 1rem; flex-wrap: wrap; margin: 2rem 0; }
    .button {
      padding: 0.9rem 1.2rem;
      border-radius: 999px;
      border: 1px solid var(--border);
      transition: transform 160ms ease, border-color 160ms ease;
    }
    .button.primary {
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      color: white;
      border: 0;
    }
    .button:hover { transform: translateY(-1px); }
    .card {
      padding: 1.5rem;
      width: min(100%, 420px);
    }
    .stat { display: flex; justify-content: space-between; padding: 0.8rem 0; border-bottom: 1px solid var(--border); }
    .stat:last-child { border-bottom: 0; }
    .section-title { margin-bottom: 1rem; font-size: 1.8rem; }
    .section-copy { color: var(--muted); max-width: 60ch; margin-bottom: 1.5rem; }
    .grid {
      align-items: stretch;
      gap: 1.25rem;
      flex-wrap: wrap;
    }
    .grid > * { flex: 1 1 280px; }
    .pill-list { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .pill {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.45rem 0.85rem;
      color: var(--muted);
      background: rgba(15, 23, 42, 0.45);
    }
    .project-title { margin-bottom: 0.35rem; }
    .footer { padding: 2rem 0 3rem; color: var(--muted); flex-wrap: wrap; }
    @media (max-width: 820px) {
      .hero, .nav .container, .footer { flex-direction: column; align-items: flex-start; }
      .hero-copy { padding: 2rem; }
    }
  </style>
</head>
<body>
  <nav class="nav">
    <div class="container">
      <strong>Your Name</strong>
      <div class="nav-links">
        <a href="#about">About</a>
        <a href="#work">Work</a>
        <a href="#contact">Contact</a>
      </div>
    </div>
  </nav>
  <main class="container">
    <section class="hero">
      <div class="hero-copy">
        <span class="badge">Available for freelance + full-time roles</span>
        <h1>Designer-minded developer building polished products.</h1>
        <p class="lead">I craft fast, thoughtful web experiences with strong product instincts, clean code, and an eye for the details that make software feel premium.</p>
        <div class="actions">
          <a class="button primary" href="#work">View projects</a>
          <a class="button" href="#contact">Contact me</a>
        </div>
        <div class="socials">
          <a href="#">GitHub</a>
          <a href="#">LinkedIn</a>
          <a href="#">Email</a>
        </div>
      </div>
      <div class="hero-visual">
        <article class="card">
          <h3>Quick snapshot</h3>
          <div class="stat"><span>Experience</span><strong>5+ years</strong></div>
          <div class="stat"><span>Focus</span><strong>Frontend + product UX</strong></div>
          <div class="stat"><span>Stack</span><strong>TypeScript, React, Node.js</strong></div>
          <div class="stat"><span>Currently</span><strong>Shipping AI-first tools</strong></div>
        </article>
      </div>
    </section>
    <section id="about">
      <h2 class="section-title">About</h2>
      <p class="section-copy">I work at the intersection of product thinking, interface design, and engineering execution. I like turning rough ideas into clear, high-quality experiences people actually enjoy using.</p>
      <div class="pill-list">
        <span class="pill">Design systems</span>
        <span class="pill">TypeScript</span>
        <span class="pill">React</span>
        <span class="pill">Node.js</span>
        <span class="pill">Performance</span>
        <span class="pill">Developer tools</span>
      </div>
    </section>
    <section id="work">
      <h2 class="section-title">Featured work</h2>
      <p class="section-copy">A few examples of the product and engineering work I enjoy most.</p>
      <div class="grid">
        <article class="card"><h3 class="project-title">AI Coding Workspace</h3><p>Built a terminal-first agent workflow with safer file operations, predictable approvals, and focused developer ergonomics.</p></article>
        <article class="card"><h3 class="project-title">Commerce Redesign</h3><p>Improved conversion and mobile usability by redesigning checkout, simplifying content hierarchy, and tightening performance budgets.</p></article>
        <article class="card"><h3 class="project-title">Analytics Dashboard</h3><p>Designed and shipped a modular dashboard experience with reusable charts, fast filters, and better decision-making clarity.</p></article>
      </div>
    </section>
    <section id="contact">
      <h2 class="section-title">Let’s build something good</h2>
      <p class="section-copy">Swap in your real links, projects, and contact details, then this is ready to publish as a clean starter portfolio.</p>
      <div class="actions">
        <a class="button primary" href="mailto:hello@example.com">hello@example.com</a>
        <a class="button" href="#">Book a call</a>
      </div>
    </section>
  </main>
  <footer class="container footer">
    <span>© 2026 Your Name</span>
    <span>Built as a lightweight single-file portfolio starter.</span>
  </footer>
</body>
</html>`;
}

