import React from 'react';
import { Box, Text } from 'ink';

interface PermissionProps {
  type: 'bash' | 'write' | 'edit';
  command?: string;
  filePath?: string;
  onConfirm: (confirm: boolean, always: boolean) => void;
}

export function PermissionPrompt({ type, command, filePath, onConfirm }: PermissionProps) {
  const getMessage = () => {
    switch (type) {
      case 'bash':
        return (
          <Box flexDirection="column">
            <Box>
              <Text bold color="yellow">
                Run bash command:
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
                Write to file:
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
                Edit file:
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
        {getMessage()}
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
