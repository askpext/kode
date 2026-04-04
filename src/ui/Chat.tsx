import React from 'react';
import { Box, Text } from 'ink';
import { highlightFile, getLanguageFromPath } from '../utils/highlight.js';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
}

interface ChatProps {
  messages: Message[];
}

function renderContent(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  // Match code blocks with optional language hint
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      parts.push(
        <Text key={`text-${lastIndex}`}>
          {textBefore}
        </Text>
      );
    }

    // Add highlighted code block
    const lang = match[1] || '';
    const code = match[2].trim();

    // Try to apply syntax highlighting
    let highlightedCode = code;
    try {
      const langToUse = lang || 'typescript';
      highlightedCode = highlightFile(code, `file.${langToUse}`);
    } catch {
      // Fallback to plain text
    }

    parts.push(
      <Box key={`code-${match.index}`} flexDirection="column" marginBottom={1} marginLeft={2}>
        {highlightedCode.split('\n').map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </Box>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(
      <Text key={`text-${lastIndex}`}>
        {content.slice(lastIndex)}
      </Text>
    );
  }

  return parts.length > 0 ? parts : [<Text key="plain">{content}</Text>];
}

export function Chat({ messages }: ChatProps) {
  return (
    <Box flexDirection="column">
      {messages.map((message, index) => (
        <Box key={index} flexDirection="column" marginBottom={1}>
          {message.role === 'user' && (
            <Box>
              <Text bold color="cyan">
                You:{' '}
              </Text>
              <Text>{message.content}</Text>
            </Box>
          )}

          {message.role === 'assistant' && (
            <Box flexDirection="column" marginTop={1}>
              {message.content && (
                <Box 
                  flexDirection="column" 
                  borderStyle="single" 
                  borderTop={false} 
                  borderRight={false} 
                  borderBottom={false} 
                  borderColor="green" 
                  paddingLeft={1}
                >
                  <Box marginBottom={1}>
                    <Text bold color="green">
                      Kode
                    </Text>
                  </Box>
                  <Box flexDirection="column">
                    {renderContent(message.content)}
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
