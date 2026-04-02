import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { Chat, Message as ChatMessage } from './Chat.js';
import { Input } from './Input.js';
import { ToolCall, ToolStatus } from './ToolCall.js';
import { TodoList, Todo } from './TodoList.js';
import { DiffView } from './DiffView.js';
import { PermissionPrompt } from './Permission.js';
import { Agent, ToolCall as AgentToolCall } from '../agent/loop.js';
import SessionDB, { Todo as DbTodo } from '../db/sessions.js';

interface AppState {
  mode: 'input' | 'thinking' | 'tool_pending' | 'permission' | 'diff';
  messages: ChatMessage[];
  currentToolCalls: Array<{
    call: AgentToolCall;
    status: ToolStatus;
    result?: string;
    error?: string;
  }>;
  todos: Todo[];
  pendingPermission: {
    type: 'bash' | 'write' | 'edit';
    toolCall: AgentToolCall;
    command?: string;
    filePath?: string;
  } | null;
  pendingDiff: {
    filePath: string;
    diff: string;
    toolCall: AgentToolCall;
  } | null;
  statusLine: string;
  error: string | null;
  commandHistory: string[];
  startTime: number | null;
}

interface AppProps {
  agent: Agent;
  db: SessionDB;
  sessionId: string;
  cwd: string;
  model: string;
  onExit: () => void;
}

export function App({ agent, db, sessionId, cwd, model, onExit }: AppProps) {
  const [state, setState] = useState<AppState>({
    mode: 'input',
    messages: [],
    currentToolCalls: [],
    todos: [],
    pendingPermission: null,
    pendingDiff: null,
    statusLine: '',
    error: null,
    commandHistory: [],
    startTime: null,
  });

  const [inputValue, setInputValue] = useState('');

  // Load initial state
  useEffect(() => {
    const loadInitialState = async () => {
      // Load messages from DB
      const messages = await db.getMessages(sessionId);
      const chatMessages: ChatMessage[] = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        toolCalls: m.toolCalls,
      }));

      // Load todos
      const todos = (await db.getTodos(sessionId)).map((t) => ({
        id: t.id,
        content: t.content,
        status: t.status,
      }));

      // Get context status
      const status = agent.getContextStatus();

      setState((prev) => ({
        ...prev,
        messages: chatMessages,
        todos,
        statusLine: `${model} | ${status.currentTokens}/${status.maxTokens} tokens | Session: ${sessionId.slice(0, 8)}`,
      }));
    };

    loadInitialState();
  }, []);

  // Handle slash commands
  const handleSlashCommand = useCallback(
    async (command: string) => {
      const parts = command.split(' ');
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ');

      switch (cmd) {
        case 'help':
          setState((prev) => ({
            ...prev,
            messages: [
              ...prev.messages,
              {
                role: 'assistant',
                content: `Available commands:
  /help - Show this help
  /new - Start new session
  /sessions - List recent sessions
  /resume <id> - Resume a session
  /undo - Restore last file change
  /search <query> - Search session history
  /clear - Clear screen
  /model - Show current model info
  /cost - Show token usage`,
              },
            ],
          }));
          break;

        case 'new':
          onExit();
          break;

        case 'sessions':
          const sessions = await db.getSessions(10);
          setState((prev) => ({
            ...prev,
            messages: [
              ...prev.messages,
              {
                role: 'assistant',
                content:
                  'Recent sessions:\n' +
                  sessions.map((s) => `  ${s.id.slice(0, 8)} - ${s.cwd} - ${s.createdAt}`).join('\n'),
              },
            ],
          }));
          break;

        case 'clear':
          setState((prev) => ({
            ...prev,
            messages: [],
          }));
          break;

        case 'model':
          setState((prev) => ({
            ...prev,
            messages: [
              ...prev.messages,
              {
                role: 'assistant',
                content: `Model: ${model}\nBase URL: https://api.sarvam.ai/v1`,
              },
            ],
          }));
          break;

        case 'cost':
          const usage = await db.getSessionTokenUsage(sessionId);
          setState((prev) => ({
            ...prev,
            messages: [
              ...prev.messages,
              {
                role: 'assistant',
                content: `Token usage this session:
  Prompt tokens: ${usage.totalPromptTokens}
  Completion tokens: ${usage.totalCompletionTokens}
  Total: ${usage.totalTokens}

Note: sarvam-m LLM is FREE.`,
              },
            ],
          }));
          break;

        case 'undo':
          const snapshot = db.getLatestSnapshotOverall(sessionId);
          if (!snapshot) {
            setState((prev) => ({
              ...prev,
              messages: [
                ...prev.messages,
                {
                  role: 'assistant',
                  content: 'No changes to undo. No file snapshots found for this session.',
                },
              ],
            }));
          } else {
            // Restore the file from snapshot
            const { writeFile } = await import('fs/promises');
            try {
              await writeFile(snapshot.filePath, snapshot.originalContent, 'utf-8');
              setState((prev) => ({
                ...prev,
                messages: [
                  ...prev.messages,
                  {
                    role: 'assistant',
                    content: `✓ Undone last change to ${snapshot.filePath}\nFile restored to previous state.`,
                  },
                ],
              }));
            } catch (error) {
              setState((prev) => ({
                ...prev,
                messages: [
                  ...prev.messages,
                  {
                    role: 'assistant',
                    content: `✖ Failed to undo: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  },
                ],
              }));
            }
          }
          break;

        case 'search':
          const searchQuery = args.trim();
          if (!searchQuery) {
            setState((prev) => ({
              ...prev,
              messages: [
                ...prev.messages,
                {
                  role: 'assistant',
                  content: 'Usage: /search <query>\n\nSearch for text in all session messages.',
                },
              ],
            }));
          } else {
            const searchResults = await db.searchSessions(searchQuery, 5);
            if (searchResults.length === 0) {
              setState((prev) => ({
                ...prev,
                messages: [
                  ...prev.messages,
                  {
                    role: 'assistant',
                    content: `No results found for "${searchQuery}"`,
                  },
                ],
              }));
            } else {
              const resultText = searchResults.map((r, i) => {
                const preview = r.lastMessage 
                  ? r.lastMessage.slice(0, 80) + (r.lastMessage.length > 80 ? '...' : '')
                  : 'No preview';
                return `${i + 1}. Session ${r.session.id.slice(0, 8)} (${r.matchCount} matches)\n   "${preview}"\n   ${r.session.updatedAt}`;
              }).join('\n\n');

              setState((prev) => ({
                ...prev,
                messages: [
                  ...prev.messages,
                  {
                    role: 'assistant',
                    content: `Found ${searchResults.length} session(s) for "${searchQuery}":\n\n${resultText}`,
                  },
                ],
              }));
            }
          }
          break;

        default:
          setState((prev) => ({
            ...prev,
            messages: [
              ...prev.messages,
              {
                role: 'assistant',
                content: `Unknown command: ${cmd}. Type /help for available commands.`,
              },
            ],
          }));
      }
    },
    [db, sessionId, model, onExit]
  );

  // Handle user input
  const handleSubmit = useCallback(
    async (value: string) => {
      if (value.startsWith('/')) {
        await handleSlashCommand(value.slice(1));
        return;
      }

      // Add to command history
      setState((prev) => ({
        ...prev,
        commandHistory: [...prev.commandHistory.slice(-49), value], // Keep last 50
      }));

      // Record start time
      const startTime = Date.now();

      // Add user message
      setState((prev) => ({
        ...prev,
        mode: 'thinking',
        messages: [...prev.messages, { role: 'user', content: value }],
        error: null,
        startTime,
      }));

      try {
        // Run agent
        const response = await agent.run(value);

        if (response.toolCalls && response.toolCalls.length > 0) {
          // Handle tool calls that need permission
          const toolCallStates = response.toolCalls.map((call) => ({
            call,
            status: 'pending' as ToolStatus,
          }));

          // Check if any tool needs permission
          const needsPermission = response.toolCalls.some((call) =>
            ['bash', 'write_file', 'edit_file'].includes(call.name)
          );

          if (needsPermission) {
            const pendingCall = response.toolCalls.find((call) =>
              ['bash', 'write_file', 'edit_file'].includes(call.name)
            );

            if (pendingCall) {
              let permissionType: 'bash' | 'write' | 'edit' = 'bash';
              let command: string | undefined;
              let filePath: string | undefined;
              let diff: string | undefined;

              if (pendingCall.name === 'bash') {
                permissionType = 'bash';
                command = (pendingCall.args as { command?: string }).command;
              } else if (pendingCall.name === 'write_file') {
                permissionType = 'write';
                filePath = (pendingCall.args as { path?: string }).path;
                // Get diff preview
                const preview = await agent.previewTool(pendingCall);
                if (preview.diff) {
                  diff = preview.diff;
                }
              } else if (pendingCall.name === 'edit_file') {
                permissionType = 'edit';
                filePath = (pendingCall.args as { path?: string }).path;
                // Get diff preview
                const preview = await agent.previewTool(pendingCall);
                if (preview.diff) {
                  diff = preview.diff;
                }
              }

              if (diff) {
                // Show diff first, then permission prompt
                setState((prev) => ({
                  ...prev,
                  mode: 'diff',
                  currentToolCalls: toolCallStates,
                  pendingDiff: {
                    filePath: filePath || '',
                    diff,
                    toolCall: pendingCall,
                  },
                }));
              } else {
                // No diff available, show permission prompt directly
                setState((prev) => ({
                  ...prev,
                  mode: 'permission',
                  currentToolCalls: toolCallStates,
                  pendingPermission: {
                    type: permissionType,
                    toolCall: pendingCall,
                    command,
                    filePath,
                  },
                }));
              }
              return;
            }
          }

          // Execute tools without permission
          setState((prev) => ({
            ...prev,
            currentToolCalls: toolCallStates,
          }));

          for (const toolCall of response.toolCalls) {
            setState((prev) => ({
              ...prev,
              currentToolCalls: prev.currentToolCalls.map((tc) =>
                tc.call.id === toolCall.id ? { ...tc, status: 'running' } : tc
              ),
            }));

            const result = await agent.executeToolWithPermission(toolCall);

            setState((prev) => ({
              ...prev,
              currentToolCalls: prev.currentToolCalls.map((tc) =>
                tc.call.id === toolCall.id
                  ? {
                      ...tc,
                      status: result.success ? 'done' : 'error',
                      result: result.result,
                      error: result.success ? undefined : result.result,
                    }
                  : tc
              ),
            }));
          }

          // Reload todos after tool execution
          const todos = (await db.getTodos(sessionId)).map((t: DbTodo) => ({
            id: t.id,
            content: t.content,
            status: t.status,
          }));

          // Calculate response time
          const responseTime = state.startTime ? ((Date.now() - state.startTime) / 1000).toFixed(1) : '0';

          // Continue with response
          setState((prev) => ({
            ...prev,
            mode: 'input',
            messages: [...prev.messages, { role: 'assistant', content: response.content }],
            todos,
            currentToolCalls: [],
            startTime: null,
            statusLine: `${model} | ${responseTime}s | Session: ${sessionId.slice(0, 8)}`,
          }));
        } else {
          // No tool calls - just show response
          // Calculate response time
          const responseTime = state.startTime ? ((Date.now() - state.startTime) / 1000).toFixed(1) : '0';

          setState((prev) => ({
            ...prev,
            mode: 'input',
            messages: [...prev.messages, { role: 'assistant', content: response.content }],
            startTime: null,
            statusLine: `${model} | ${responseTime}s | Session: ${sessionId.slice(0, 8)}`,
          }));
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          mode: 'input',
          error: error instanceof Error ? error.message : 'Unknown error',
          startTime: null,
        }));
      }
    },
    [agent, db, sessionId, handleSlashCommand]
  );

  // Handle permission response
  const handlePermissionResponse = useCallback(
    (confirm: boolean, always: boolean) => {
      if (!state.pendingPermission) return;

      // Capture current state before modifying
      const currentPendingPermission = state.pendingPermission;
      const currentToolCalls = [...state.currentToolCalls];

      if (confirm) {
        if (always) {
          agent.grantPermission(currentPendingPermission.type, true);
        }

        // Execute all pending tools
        (async () => {
          setState((prev) => ({
            ...prev,
            mode: 'thinking',
            currentToolCalls: currentToolCalls.map((tc) =>
              tc.call.id === currentPendingPermission.toolCall.id
                ? { ...tc, status: 'running' }
                : tc
            ),
            pendingPermission: null,
          }));

          // Execute all tool calls in sequence
          for (const tc of currentToolCalls) {
            const result = await agent.executeToolWithPermission(tc.call);

            setState((prev) => ({
              ...prev,
              currentToolCalls: currentToolCalls.map((item) =>
                item.call.id === tc.call.id
                  ? {
                      ...item,
                      status: result.success ? 'done' : 'error',
                      result: result.result,
                      error: result.success ? undefined : result.result,
                    }
                  : item
              ),
            }));
          }

          // Reload todos after tool execution
          const todos = (await db.getTodos(sessionId)).map((t: DbTodo) => ({
            id: t.id,
            content: t.content,
            status: t.status,
          }));

          // Add assistant message with response
          setState((prev) => ({
            ...prev,
            mode: 'input',
            messages: [...prev.messages, { role: 'assistant', content: 'Files written successfully.' }],
            todos,
            currentToolCalls: [],
          }));
        })();
      } else {
        setState((prev) => ({
          ...prev,
          mode: 'input',
          pendingPermission: null,
          currentToolCalls: currentToolCalls.map((tc) =>
            tc.call.id === currentPendingPermission.toolCall.id
              ? { ...tc, status: 'error', error: 'Permission denied' }
              : tc
          ),
        }));
      }
    },
    [state.pendingPermission, state.currentToolCalls, agent, db, sessionId]
  );

  // Handle keyboard input for permission prompts
  useInput(
    (input, key) => {
      if (state.mode === 'permission' && state.pendingPermission) {
        if (input === 'y' || input === 'Y') {
          handlePermissionResponse(true, false);
        } else if (input === 'a' || input === 'A') {
          handlePermissionResponse(true, true);
        } else if (input === 'n' || input === 'N') {
          handlePermissionResponse(false, false);
        }
      }
    },
    { isActive: state.mode === 'permission' }
  );

  // Global keyboard handling
  useInput((input, key) => {
    // Ctrl+C - Cancel current operation
    if (input === 'c' && key.ctrl && state.mode === 'thinking') {
      setState((prev) => ({
        ...prev,
        mode: 'input',
        startTime: null,
        messages: [...prev.messages, { role: 'assistant', content: 'Operation cancelled.' }],
      }));
      return;
    }

    // Allow escaping from any state
    if (input === 'q' && key.ctrl) {
      onExit();
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      {/* Main content area */}
      <Box flexDirection="column" flexGrow={1}>
        {/* Header - Always visible */}
        <Box flexDirection="column" alignItems="center" paddingY={1} borderBottom={1} borderColor="gray">
          {state.messages.length === 0 ? (
            // Big homepage header
            <Box flexDirection="column" alignItems="center">
              <Box>
                <Text bold color="green">
                  ███╗   ███╗
                </Text>
              </Box>
              <Box>
                <Text bold color="green">
                  ████╗ ████║
                </Text>
              </Box>
              <Box>
                <Text bold color="green">
                  ██╔████╔██║
                </Text>
              </Box>
              <Box>
                <Text bold color="green">
                  ██║╚██╔╝██║
                </Text>
              </Box>
              <Box>
                <Text bold color="green">
                  ██║ ╚═╝ ██║
                </Text>
              </Box>
              <Box>
                <Text bold color="green">
                  ╚═╝     ╚═╝
                </Text>
              </Box>
              <Box marginTop={1}>
                <Text bold color="cyan">
                  ███████████████████████████
                </Text>
              </Box>
              <Box marginTop={1}>
                <Text bold color="yellow">
                  AI Coding Agent for the Terminal
                </Text>
              </Box>
              <Box>
                <Text dimColor>
                  Powered by Sarvam AI (sarvam-m)
                </Text>
              </Box>
            </Box>
          ) : (
            // Compact header during chat
            <Box>
              <Text bold color="green">
                कोड
              </Text>
              <Text dimColor>
                {' '}|{' '}
              </Text>
              <Text bold color="cyan">
                Kode
              </Text>
              <Text dimColor>
                {' '}|{' '}
              </Text>
              <Text dimColor>
                {model}
              </Text>
              <Text dimColor>
                {' '}| Session: {' '}
              </Text>
              <Text color="yellow">
                {sessionId.slice(0, 6)}
              </Text>
            </Box>
          )}
        </Box>

        {/* Main chat/content area */}
        <Box flexDirection="column" flexGrow={1}>
          <Box flexDirection="row" flexGrow={1}>
            {/* Chat area */}
            <Box flexDirection="column" flexGrow={1} paddingRight={1}>
              {/* Welcome info - Show only if no messages */}
              {state.messages.length === 0 && state.mode === 'input' && (
                <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
                  <Box borderTop={1} borderBottom={1} borderColor="gray" paddingY={1} marginBottom={2}>
                    <Text dimColor>
                      Type your request or use a command
                    </Text>
                  </Box>

                  <Box flexDirection="column" alignItems="center" marginBottom={2}>
                    <Text>
                      <Text bold color="cyan">Examples:</Text>
                    </Text>
                    <Text dimColor>
                      "Create a React button component"
                    </Text>
                    <Text dimColor>
                      "Read package.json and explain dependencies"
                    </Text>
                    <Text dimColor>
                      "Search for console.log in src/"
                    </Text>
                  </Box>

                  <Box flexDirection="column" alignItems="center">
                    <Text>
                      <Text bold color="green">/help</Text>
                      <Text dimColor> - Commands</Text>
                      <Text dimColor> | </Text>
                      <Text bold color="green">↑↓</Text>
                      <Text dimColor> - History</Text>
                      <Text dimColor> | </Text>
                      <Text bold color="green">Ctrl+L</Text>
                      <Text dimColor> - Clear</Text>
                      <Text dimColor> | </Text>
                      <Text bold color="green">Ctrl+C</Text>
                      <Text dimColor> - Cancel</Text>
                    </Text>
                  </Box>
                </Box>
              )}

              <Box flexGrow={1} overflow="hidden" flexDirection="column">
                {state.messages.length > 0 ? (
                  <Chat messages={state.messages} />
                ) : null}
              </Box>

              {state.mode === 'thinking' && (
                <Box>
                  <Text color="yellow">
                    <Spinner type="dots" />{' '}
                    <Spinner type="star" />{' '}
                    Thinking...
                  </Text>
                </Box>
              )}

              {state.currentToolCalls.length > 0 && (
                <Box flexDirection="column">
                  {state.currentToolCalls.map((tc) => (
                    <ToolCall
                      key={tc.call.id}
                      name={tc.call.name}
                      args={tc.call.args}
                      status={tc.status}
                      result={tc.result}
                      error={tc.error}
                    />
                  ))}
                </Box>
              )}

              {state.error && (
                <Box>
                  <Text color="red">Error: {state.error}</Text>
                </Box>
              )}
            </Box>

            {/* Sidebar with todos */}
            {state.todos.length > 0 && (
              <Box width={30} borderStyle="round" borderColor="gray" paddingX={1}>
                <TodoList todos={state.todos} />
              </Box>
            )}
          </Box>

          {/* Input area and prompts - below chat */}
          {state.mode === 'input' && (
            <Input
              onSubmit={handleSubmit}
              placeholder="Type a message or /command..."
              commandHistory={state.commandHistory}
              onClear={() => {
                setState((prev) => ({
                  ...prev,
                  messages: [],
                }));
              }}
            />
          )}

          {state.mode === 'diff' && state.pendingDiff && (
            <DiffView
              filePath={state.pendingDiff.filePath}
              diff={state.pendingDiff.diff}
              onConfirm={(confirm, always) => {
                if (confirm && state.pendingPermission) {
                  handlePermissionResponse(confirm, always);
                } else if (confirm) {
                  setState((prev) => ({
                    ...prev,
                    mode: 'permission',
                    pendingDiff: null,
                    pendingPermission: {
                      type: state.pendingDiff!.toolCall.name === 'write_file' ? 'write' : 'edit',
                      toolCall: state.pendingDiff!.toolCall,
                      filePath: state.pendingDiff!.filePath,
                    },
                  }));
                } else {
                  setState((prev) => ({
                    ...prev,
                    mode: 'input',
                    pendingDiff: null,
                    currentToolCalls: prev.currentToolCalls.map((tc) =>
                      tc.call.id === state.pendingDiff!.toolCall.id
                        ? { ...tc, status: 'error', error: 'User rejected' }
                        : tc
                    ),
                  }));
                }
              }}
            />
          )}

          {state.mode === 'permission' && state.pendingPermission && !state.pendingDiff && (
            <PermissionPrompt
              type={state.pendingPermission.type}
              command={state.pendingPermission.command}
              filePath={state.pendingPermission.filePath}
              onConfirm={handlePermissionResponse}
            />
          )}
        </Box>
      </Box>

      {/* Status line */}
      <Box borderTop={1} borderColor="gray" paddingTop={1}>
        <Text dimColor>{state.statusLine}</Text>
      </Box>
    </Box>
  );
}
