import React, { useState } from 'react';
import { Box, Text, useApp } from 'ink';
import TextInput from 'ink-text-input';

interface OnboardingProps {
  onComplete: (apiKey: string) => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const { exit } = useApp();

  const handleSubmit = () => {
    const key = apiKey.trim();
    
    if (!key) {
      setError('API key cannot be empty');
      return;
    }

    if (key.length < 8) {
      setError('That doesn\'t look like a valid API key');
      return;
    }

    setError('');
    onComplete(key);
  };

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Welcome header */}
      <Box flexDirection="column" alignItems="center" marginBottom={1}>
        <Text bold color="green">
          ╔═══════════════════════════════════════╗
        </Text>
        <Text bold color="green">
          ║     Welcome to Kode (कोड)             ║
        </Text>
        <Text bold color="green">
          ║     AI Coding Agent for the Terminal   ║
        </Text>
        <Text bold color="green">
          ╚═══════════════════════════════════════╝
        </Text>
      </Box>

      {/* Setup message */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">First-time setup</Text>
        <Text dimColor>
          Kode is powered by Sarvam AI's free sarvam-m model.
        </Text>
        <Text dimColor>
          You need an API key to get started.
        </Text>
      </Box>

      {/* Get key instruction */}
      <Box marginBottom={1}>
        <Text>
          <Text bold color="yellow">1.</Text>
          <Text> Get your free key at → </Text>
          <Text bold color="cyan" underline>https://sarvam.ai</Text>
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>
          <Text bold color="yellow">2.</Text>
          <Text> Paste it below:</Text>
        </Text>
      </Box>

      {/* API key input */}
      <Box
        borderStyle="round"
        borderColor={error ? 'red' : 'green'}
        paddingX={1}
        flexDirection="column"
      >
        <Box>
          <Text bold color="green">API Key: </Text>
          <TextInput
            value={apiKey}
            onChange={setApiKey}
            onSubmit={handleSubmit}
            placeholder="paste your sarvam api key here..."
            mask="*"
          />
        </Box>
      </Box>

      {/* Error message */}
      {error && (
        <Box marginTop={1}>
          <Text color="red">✖ {error}</Text>
        </Box>
      )}

      {/* Hint */}
      <Box marginTop={1}>
        <Text dimColor>
          Press <Text bold color="green">Enter</Text> to save • 
          Key will be stored in ~/.kode/config.json • 
          <Text bold color="red">Ctrl+C</Text> to exit
        </Text>
      </Box>
    </Box>
  );
}
