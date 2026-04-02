// Token counting utilities for context management
// Approximate token counting (1 token ≈ 4 characters for English text)

export function countTokens(text: string): number {
  // Simple approximation: 1 token per 4 characters
  // This is a rough estimate; actual tokenization depends on the model
  return Math.ceil(text.length / 4);
}

export function countMessagesTokens(messages: Array<{ role: string; content: string }>): number {
  let total = 0;

  for (const msg of messages) {
    // Add tokens for role (system, user, assistant)
    total += countTokens(msg.role);
    // Add tokens for content
    total += countTokens(msg.content);
    // Add overhead per message (approximately 4 tokens for message structure)
    total += 4;
  }

  return total;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export function calculateUsage(prompt: string, completion: string): TokenUsage {
  const promptTokens = countTokens(prompt);
  const completionTokens = countTokens(completion);

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

export interface ContextStatus {
  currentTokens: number;
  maxTokens: number;
  usagePercent: number;
  needsCompression: boolean;
  compressAt: number;
}

export function getContextStatus(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  compressAt: number
): ContextStatus {
  const currentTokens = countMessagesTokens(messages);
  const usagePercent = currentTokens / maxTokens;

  return {
    currentTokens,
    maxTokens,
    usagePercent,
    needsCompression: usagePercent >= compressAt,
    compressAt,
  };
}

export function shouldCompress(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  compressAt: number
): boolean {
  const status = getContextStatus(messages, maxTokens, compressAt);
  return status.needsCompression;
}

// Compress context by summarizing older messages
export function compressContext(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  targetPercent: number = 0.6
): Array<{ role: string; content: string }> {
  const targetTokens = maxTokens * targetPercent;
  const currentTokens = countMessagesTokens(messages);

  if (currentTokens <= targetTokens) {
    return messages;
  }

  // Keep system message
  const systemMessage = messages.find((m) => m.role === 'system');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');

  // Strategy: Keep last N messages intact, summarize older ones
  const recentMessagesToKeep = 4; // Keep last 4 messages (2 exchanges)
  const messagesToSummarize = nonSystemMessages.slice(0, -recentMessagesToKeep);
  const recentMessages = nonSystemMessages.slice(-recentMessagesToKeep);

  // Summarize older messages in pairs (user + assistant = 1 exchange)
  const summarized: Array<{ role: string; content: string }> = [];
  
  if (messagesToSummarize.length > 0) {
    const summaryContent = summarizeOldMessages(messagesToSummarize);
    summarized.push({
      role: 'system',
      content: `[Previous conversation summary]\n${summaryContent}`,
    });
  }

  // Build result
  const result: Array<{ role: string; content: string }> = [];
  if (systemMessage) {
    result.push(systemMessage);
  }
  result.push(...summarized);
  result.push(...recentMessages);

  return result;
}

// Summarize a list of old messages into a concise summary
function summarizeOldMessages(messages: Array<{ role: string; content: string }>): string {
  if (messages.length === 0) return '';

  const userMessages = messages.filter((m) => m.role === 'user');
  const assistantMessages = messages.filter((m) => m.role === 'assistant');

  const summary: string[] = [];

  // Extract key topics from user messages
  for (const msg of userMessages.slice(0, 3)) {
    const preview = msg.content.slice(0, 80);
    summary.push(`User asked about: ${preview}${msg.content.length > 80 ? '...' : ''}`);
  }

  // Extract key actions from assistant messages
  for (const msg of assistantMessages.slice(0, 3)) {
    // Check if message contains tool calls
    if (msg.content.includes('tool_call:')) {
      summary.push('Assistant used tools to complete tasks');
    } else {
      const preview = msg.content.slice(0, 80);
      summary.push(`Assistant: ${preview}${msg.content.length > 80 ? '...' : ''}`);
    }
  }

  return summary.join('\n');
}

// Estimate tokens for a file based on content
export function estimateFileTokens(content: string): number {
  return countTokens(content);
}

// Check if file content exceeds token limit
export function exceedsTokenLimit(content: string, limit: number): boolean {
  return estimateFileTokens(content) > limit;
}
