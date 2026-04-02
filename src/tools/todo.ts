import SessionDB, { Todo } from '../db/sessions.js';

export interface TodoWriteArgs {
  todos: Array<{
    id?: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  }>;
}

export interface TodoReadArgs {
  // No args needed - reads all todos for session
}

export interface TodoResult {
  success: boolean;
  todos?: Todo[];
  error?: string;
}

export async function todoWriteTool(
  args: TodoWriteArgs,
  sessionId: string,
  db: SessionDB
): Promise<TodoResult> {
  try {
    const todos = db.setTodos(sessionId, args.todos);

    return {
      success: true,
      todos,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error writing todos';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function todoReadTool(
  _args: TodoReadArgs,
  sessionId: string,
  db: SessionDB
): Promise<TodoResult> {
  try {
    const todos = db.getTodos(sessionId);

    return {
      success: true,
      todos,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error reading todos';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export function formatTodoResult(result: TodoResult): string {
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  if (!result.todos || result.todos.length === 0) {
    return 'No todos';
  }

  let output = '';

  const pending = result.todos.filter((t) => t.status === 'pending');
  const inProgress = result.todos.filter((t) => t.status === 'in_progress');
  const completed = result.todos.filter((t) => t.status === 'completed');
  const cancelled = result.todos.filter((t) => t.status === 'cancelled');

  if (inProgress.length > 0) {
    output += 'In Progress:\n';
    for (const todo of inProgress) {
      output += `  ⏳ ${todo.content}\n`;
    }
    output += '\n';
  }

  if (pending.length > 0) {
    output += 'Pending:\n';
    for (const todo of pending) {
      output += `  ⬜ ${todo.content}\n`;
    }
    output += '\n';
  }

  if (completed.length > 0) {
    output += 'Completed:\n';
    for (const todo of completed) {
      output += `  ✅ ${todo.content}\n`;
    }
    output += '\n';
  }

  if (cancelled.length > 0) {
    output += 'Cancelled:\n';
    for (const todo of cancelled) {
      output += `  ❌ ${todo.content}\n`;
    }
  }

  return output.trim();
}
