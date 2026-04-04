import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export type ToolStatus = 'pending' | 'running' | 'done' | 'error';

interface ToolCallProps {
  name: string;
  args: Record<string, unknown>;
  status: ToolStatus;
  result?: string;
  error?: string;
}

function getProgressMessage(name: string, args: Record<string, unknown>, status: ToolStatus): string {
  const path = (args.path as string) || '';
  const command = (args.command as string) || '';
  const pattern = (args.pattern as string) || '';

  switch (name) {
    case 'read_file':
      if (status === 'running' || status === 'pending') return `Reading ${path || 'file'}...`;
      if (status === 'done') return `Read ${path || 'file'}`;
      return `Failed to read ${path || 'file'}`;

    case 'write_file':
      if (status === 'running' || status === 'pending') return `Writing ${path || 'file'}...`;
      if (status === 'done') return `Wrote ${path || 'file'}`;
      return `Failed to write ${path || 'file'}`;

    case 'edit_file':
      if (status === 'running' || status === 'pending') return `Editing ${path || 'file'}...`;
      if (status === 'done') return `Edited ${path || 'file'}`;
      return `Failed to edit ${path || 'file'}`;

    case 'bash':
      const cmdPreview = command.slice(0, 30) + (command.length > 30 ? '...' : '');
      if (status === 'running' || status === 'pending') return `Running: ${cmdPreview}`;
      if (status === 'done') return `Completed: ${cmdPreview}`;
      return `Failed: ${cmdPreview}`;

    case 'grep':
      if (status === 'running' || status === 'pending') return `Searching for "${pattern}"...`;
      if (status === 'done') return `Found matches for "${pattern}"`;
      return `Search failed for "${pattern}"`;

    case 'list_dir':
      if (status === 'running' || status === 'pending') return `Listing ${path || 'directory'}...`;
      if (status === 'done') return `Listed ${path || 'directory'}`;
      return `Failed to list ${path || 'directory'}`;

    default:
      return `${name} ${status}`;
  }
}

function getSpinnerType(name: string, status: ToolStatus): 'dots' | 'star' | 'triangle' | 'simpleDots' {
  if (status === 'done') return 'simpleDots';
  if (status === 'error') return 'simpleDots';
  
  // Different spinners for different tool types
  switch (name) {
    case 'read_file':
      return 'dots';
    case 'write_file':
      return 'star';
    case 'edit_file':
      return 'triangle';
    case 'bash':
      return 'dots';
    case 'grep':
      return 'simpleDots';
    default:
      return 'dots';
  }
}

function getStatusColor(status: ToolStatus): string {
  switch (status) {
    case 'pending':
      return 'yellow';
    case 'running':
      return 'blue';
    case 'done':
      return 'green';
    case 'error':
      return 'red';
    default:
      return 'white';
  }
}

function getStatusIcon(status: ToolStatus): string {
  switch (status) {
    case 'pending':
      return '⏳';
    case 'running':
      return '⏳';
    case 'done':
      return '✓';
    case 'error':
      return '✖';
    default:
      return '·';
  }
}

export function ToolCall({ name, args, status, result, error }: ToolCallProps) {
  const progressMsg = getProgressMessage(name, args, status);
  const spinnerType = getSpinnerType(name, status);
  const color = getStatusColor(status);
  const icon = getStatusIcon(status);

  // Determine if we should show output and how much
  const shouldShowResult = status === 'done' && result && result.trim().length > 0;
  const shouldShowError = status === 'error' && error;

  // Truncate very long output to avoid flooding the screen
  const MAX_OUTPUT_LINES = 40;
  const getDisplayedResult = (text: string) => {
    const lines = text.split('\n');
    if (lines.length > MAX_OUTPUT_LINES) {
      return lines.slice(0, MAX_OUTPUT_LINES).join('\n') + `\n... (${lines.length - MAX_OUTPUT_LINES} more lines)`;
    }
    return text;
  };

  return (
    <Box flexDirection="column" marginY={0}>
      <Box>
        {(status === 'pending' || status === 'running') && (
          <>
            <Text color={color}>
              <Spinner type={spinnerType} />{' '}
            </Text>
            <Text color={color}>
              {icon} {progressMsg}
            </Text>
          </>
        )}

        {status === 'done' && (
          <>
            <Text color={color}>
              {icon}{' '}
            </Text>
            <Text color={color}>
              {progressMsg}
            </Text>
          </>
        )}

        {status === 'error' && (
          <>
            <Text color={color}>
              {icon}{' '}
            </Text>
            <Text color={color}>
              {progressMsg}
            </Text>
          </>
        )}
      </Box>

      {/* Show tool output below the status line */}
      {shouldShowResult && (
        <Box
          flexDirection="column"
          marginLeft={2}
          marginTop={0}
          marginBottom={1}
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
        >
          <Text dimColor>{getDisplayedResult(result!)}</Text>
        </Box>
      )}

      {/* Show error details */}
      {shouldShowError && (
        <Box marginLeft={2} marginTop={0}>
          <Text color="red" dimColor>
            {error}
          </Text>
        </Box>
      )}
    </Box>
  );
}
