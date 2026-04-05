import React from 'react';
import { Box, Text } from 'ink';

interface PermissionProps {
  type: 'bash' | 'write' | 'edit';
  command?: string;
  filePath?: string;
  toolName?: string;
  onConfirm: (confirm: boolean, always: boolean) => void;
}

export function PermissionPrompt({ type, command, filePath, toolName, onConfirm }: PermissionProps) {
  const getIntentLabel = () => {
    switch (toolName) {
      case 'create_directory':
        return 'Create directory';
      case 'write_file':
        return 'Write file';
      case 'edit_file':
        return 'Edit file';
      case 'bash_background':
        return 'Start background task';
      case 'bash':
        return 'Run command';
      default:
        return type === 'bash' ? 'Run command' : type === 'write' ? 'Write file' : 'Edit file';
    }
  };

  const getHint = () => {
    switch (toolName) {
      case 'create_directory':
        return 'This will create a new folder and may switch the workspace there.';
      case 'write_file':
        return 'This will apply the prepared file content after approval.';
      case 'edit_file':
        return 'This will apply the prepared text replacement after approval.';
      case 'bash_background':
        return 'This will start a long-running task and keep it tracked in the session.';
      case 'bash':
        return 'This will run in the current workspace shell.';
      default:
        return null;
    }
  };

  const getMessage = () => {
    switch (type) {
      case 'bash':
        return (
          <Box flexDirection="column">
            <Box>
              <Text bold color="yellow">
                {getIntentLabel()}:
              </Text>
            </Box>
            <Box marginLeft={2}>
              <Text backgroundColor="gray" color="white">
                {' '}
                {command}{' '}
              </Text>
            </Box>
          </Box>
        );

      case 'write':
        return (
          <Box flexDirection="column">
            <Box>
              <Text bold color="yellow">
                {getIntentLabel()}:
              </Text>
            </Box>
            <Box marginLeft={2}>
              <Text color="cyan">
                {filePath}
              </Text>
            </Box>
          </Box>
        );

      case 'edit':
        return (
          <Box flexDirection="column">
            <Box>
              <Text bold color="yellow">
                {getIntentLabel()}:
              </Text>
            </Box>
            <Box marginLeft={2}>
              <Text color="cyan">
                {filePath}
              </Text>
            </Box>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box borderTop={1} borderColor="yellow" paddingTop={1}>
        <Box flexDirection="column">
          {getMessage()}
          {getHint() && (
            <Box marginTop={1} marginLeft={2}>
              <Text dimColor>{getHint()}</Text>
            </Box>
          )}
        </Box>
        <Box marginTop={1}>
          <Text bold color="green">
            [y]
          </Text>
          <Text> Yes  </Text>
          <Text bold color="blue">
            [a]
          </Text>
          <Text> Always  </Text>
          <Text bold color="red">
            [n]
          </Text>
          <Text> No</Text>
        </Box>
      </Box>
    </Box>
  );
}
