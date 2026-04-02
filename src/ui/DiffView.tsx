import React from 'react';
import { Box, Text, useInput } from 'ink';
import { highlightDiff } from '../utils/highlight.js';

interface DiffViewProps {
  filePath: string;
  diff: string;
  onConfirm: (confirm: boolean, always: boolean) => void;
}

export function DiffView({ filePath, diff, onConfirm }: DiffViewProps) {
  const highlightedDiff = highlightDiff(diff);

  // Handle keyboard input
  useInput((input, key) => {
    if (input === 'y' || input === 'Y') {
      onConfirm(true, false);
    } else if (input === 'a' || input === 'A') {
      onConfirm(true, true);
    } else if (input === 'n' || input === 'N') {
      onConfirm(false, false);
    }
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text bold color="blue">
          📄 {filePath}
        </Text>
      </Box>

      <Box
        flexDirection="column"
        marginBottom={1}
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        maxHeight={15}
      >
        {highlightedDiff.split('\n').slice(0, 20).map((line, index) => (
          <Box key={index}>
            <Text>{line}</Text>
          </Box>
        ))}
      </Box>

      <Box borderTop={1} borderColor="yellow" paddingTop={1}>
        <Text bold color="green">[y]</Text>
        <Text> Apply  </Text>
        <Text bold color="blue">[a]</Text>
        <Text> Always  </Text>
        <Text bold color="red">[n]</Text>
        <Text> Skip</Text>
      </Box>
    </Box>
  );
}
