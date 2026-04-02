import React from 'react';
import { Box, Text } from 'ink';

export interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

interface TodoListProps {
  todos: Todo[];
  title?: string;
}

export function TodoList({ todos, title = 'Tasks' }: TodoListProps) {
  if (todos.length === 0) {
    return null;
  }

  const getStatusIcon = (status: Todo['status']) => {
    switch (status) {
      case 'pending':
        return '⬜';
      case 'in_progress':
        return '⏳';
      case 'completed':
        return '✅';
      case 'cancelled':
        return '❌';
      default:
        return '⬜';
    }
  };

  const getStatusColor = (status: Todo['status']) => {
    switch (status) {
      case 'pending':
        return 'gray';
      case 'in_progress':
        return 'yellow';
      case 'completed':
        return 'green';
      case 'cancelled':
        return 'red';
      default:
        return 'white';
    }
  };

  const inProgress = todos.filter((t) => t.status === 'in_progress');
  const pending = todos.filter((t) => t.status === 'pending');
  const completed = todos.filter((t) => t.status === 'completed');

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold underline>
          {title}
        </Text>
      </Box>

      {inProgress.map((todo) => (
        <Box key={todo.id} marginBottom={0}>
          <Text>
            {getStatusIcon(todo.status)}{' '}
          </Text>
          <Text color={getStatusColor(todo.status)}>{todo.content}</Text>
        </Box>
      ))}

      {pending.map((todo) => (
        <Box key={todo.id} marginBottom={0}>
          <Text>
            {getStatusIcon(todo.status)}{' '}
          </Text>
          <Text color={getStatusColor(todo.status)}>{todo.content}</Text>
        </Box>
      ))}

      {completed.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor italic>
            Completed:
          </Text>
          {completed.slice(-3).map((todo) => (
            <Box key={todo.id}>
              <Text dimColor>
                {getStatusIcon(todo.status)} {todo.content}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
