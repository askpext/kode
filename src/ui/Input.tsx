import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

interface InputProps {
  onSubmit: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  commandHistory?: string[];
  onClear?: () => void;
}

export function Input({ onSubmit, disabled = false, placeholder = 'Type a message...', commandHistory = [], onClear }: InputProps) {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(true);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useInput((input, key) => {
    if (disabled) return;

    // Handle Enter
    if (key.return && value.trim()) {
      onSubmit(value.trim());
      setValue('');
      setHistoryIndex(-1);
      return;
    }

    // Handle Up Arrow - previous command
    if (key.upArrow && commandHistory.length > 0) {
      const newIndex = historyIndex < 0 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      setValue(commandHistory[newIndex]);
      return;
    }

    // Handle Down Arrow - next command
    if (key.downArrow && commandHistory.length > 0) {
      if (historyIndex >= 0) {
        const newIndex = Math.min(commandHistory.length - 1, historyIndex + 1);
        setHistoryIndex(newIndex);
        if (newIndex === commandHistory.length - 1) {
          setValue('');
          setHistoryIndex(-1);
        } else {
          setValue(commandHistory[newIndex]);
        }
      } else {
        setValue('');
      }
      return;
    }

    // Handle Ctrl+L - clear screen
    if (input === 'l' && key.ctrl) {
      onClear?.();
      return;
    }
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box
        borderStyle="round"
        borderColor={isFocused && !disabled ? 'green' : 'gray'}
        paddingX={1}
      >
        <Box>
          <Text bold color={isFocused && !disabled ? 'green' : 'gray'}>
            ┌─{' '}
          </Text>
          <Text dimColor>
            Enter to send • ↑↓ history • Ctrl+L clear
          </Text>
        </Box>
        <Box>
          <Text bold color={isFocused && !disabled ? 'green' : 'gray'}>
            │{' '}
          </Text>
          <TextInput
            value={value}
            onChange={setValue}
            placeholder={placeholder}
            placeholderColor="gray"
            focus={isFocused && !disabled}
          />
        </Box>
        <Box>
          <Text bold color={isFocused && !disabled ? 'green' : 'gray'}>
            └─{' '}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
