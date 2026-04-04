import { writeFile } from 'fs/promises';
import { Agent } from '../../agent/loop.js';
import SessionDB, { Todo as DbTodo } from '../../db/sessions.js';
import { Message as ChatMessage } from '../../ui/Chat.js';
import { Todo } from '../../ui/TodoList.js';

export interface SessionViewData {
  messages: ChatMessage[];
  todos: Todo[];
  statusLine: string;
}

export interface SlashCommandResult {
  exit?: true;
  clearMessages?: true;
  mode?: 'input' | 'model_selection';
  message?: ChatMessage;
}

export async function loadSessionViewData(
  db: SessionDB,
  sessionId: string,
  agent: Agent,
  model: string
): Promise<SessionViewData> {
  const messages = await db.getMessages(sessionId);
  const chatMessages: ChatMessage[] = messages.map((message) => ({
    role: message.role as 'user' | 'assistant',
    content: message.content,
    toolCalls: message.toolCalls,
  }));

  const todos = await loadTodos(db, sessionId);
  const status = agent.getContextStatus();

  return {
    messages: chatMessages,
    todos,
    statusLine: buildStatusLine(
      model,
      `${status.currentTokens}/${status.maxTokens} tokens`,
      agent.getCwd(),
      sessionId
    ),
  };
}

export async function executeSlashCommand(
  command: string,
  db: SessionDB,
  sessionId: string
): Promise<SlashCommandResult> {
  const parts = command.split(' ');
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  switch (cmd) {
    case 'help':
      return {
        message: {
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
      };

    case 'new':
      return { exit: true };

    case 'sessions': {
      const sessions = await db.getSessions(10);
      return {
        message: {
          role: 'assistant',
          content:
            'Recent sessions:\n' +
            sessions.map((session) => `  ${session.id.slice(0, 8)} - ${session.cwd} - ${session.createdAt}`).join('\n'),
        },
      };
    }

    case 'clear':
      return { clearMessages: true };

    case 'model':
      return { mode: 'model_selection' };

    case 'cost': {
      const usage = await db.getSessionTokenUsage(sessionId);
      return {
        message: {
          role: 'assistant',
          content: `Token usage this session:
  Prompt tokens: ${usage.totalPromptTokens}
  Completion tokens: ${usage.totalCompletionTokens}
  Total: ${usage.totalTokens}

Note: sarvam-m LLM is FREE.`,
        },
      };
    }

    case 'undo': {
      const snapshot = await db.getLatestSnapshotOverall(sessionId);
      if (!snapshot) {
        return {
          message: {
            role: 'assistant',
            content: 'No changes to undo. No file snapshots found for this session.',
          },
        };
      }

      try {
        await writeFile(snapshot.filePath, snapshot.originalContent, 'utf-8');
        return {
          message: {
            role: 'assistant',
            content: `Undone last change to ${snapshot.filePath}\nFile restored to previous state.`,
          },
        };
      } catch (error) {
        return {
          message: {
            role: 'assistant',
            content: `Failed to undo: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        };
      }
    }

    case 'search': {
      const searchQuery = args.trim();
      if (!searchQuery) {
        return {
          message: {
            role: 'assistant',
            content: 'Usage: /search <query>\n\nSearch for text in all session messages.',
          },
        };
      }

      const searchResults = await db.searchSessions(searchQuery, 5);
      if (searchResults.length === 0) {
        return {
          message: {
            role: 'assistant',
            content: `No results found for "${searchQuery}"`,
          },
        };
      }

      const resultText = searchResults
        .map((result, index) => {
          const preview = result.lastMessage
            ? result.lastMessage.slice(0, 80) + (result.lastMessage.length > 80 ? '...' : '')
            : 'No preview';
          return `${index + 1}. Session ${result.session.id.slice(0, 8)} (${result.matchCount} matches)\n   "${preview}"\n   ${result.session.updatedAt}`;
        })
        .join('\n\n');

      return {
        message: {
          role: 'assistant',
          content: `Found ${searchResults.length} session(s) for "${searchQuery}":\n\n${resultText}`,
        },
      };
    }

    default:
      return {
        message: {
          role: 'assistant',
          content: `Unknown command: ${cmd}. Type /help for available commands.`,
        },
      };
  }
}

export async function loadTodos(db: SessionDB, sessionId: string): Promise<Todo[]> {
  return (await db.getTodos(sessionId)).map((todo: DbTodo) => ({
    id: todo.id,
    content: todo.content,
    status: todo.status,
  }));
}

export function buildStatusLine(
  model: string,
  detail: string,
  cwd: string,
  sessionId: string
): string {
  return `${model} | ${detail} | ${cwd} | Session: ${sessionId.slice(0, 8)}`;
}
