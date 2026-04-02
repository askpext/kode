import SessionDB from '../db/sessions.js';
import { PermissionConfig } from '../config.js';
import { getToolCache } from './cache.js';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      required?: boolean;
    }>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  result: string;
  isError?: boolean;
}

export interface ToolExecutionResult {
  success: boolean;
  result: string;
  requiresPermission?: boolean;
  permissionGranted?: boolean;
}

// Tool definitions for the LLM
export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read contents of a file. For large files, use startLine and endLine to read specific ranges.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to the current working directory',
        },
        startLine: {
          type: 'integer',
          description: 'Starting line number (1-indexed). Optional.',
        },
        endLine: {
          type: 'integer',
          description: 'Ending line number (1-indexed). Optional.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file. Always shows a diff before applying. Requires permission.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to the current working directory',
        },
        content: {
          type: 'string',
          description: 'Content to write to the file',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Edit a file by finding and replacing a specific string. Shows diff before applying. Requires permission.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to the current working directory',
        },
        target: {
          type: 'string',
          description: 'Exact string to find and replace',
        },
        replacement: {
          type: 'string',
          description: 'String to replace the target with',
        },
      },
      required: ['path', 'target', 'replacement'],
    },
  },
  {
    name: 'bash',
    description: 'Execute a shell command. Requires permission. Times out after 30 seconds.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to execute',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'grep',
    description: 'Search for a pattern in files using ripgrep or fallback. Returns file:line:content format.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Pattern to search for',
        },
        path: {
          type: 'string',
          description: 'Directory to search in. Optional, defaults to current directory.',
        },
        include: {
          type: 'string',
          description: 'Glob pattern for files to include. Optional.',
        },
        exclude: {
          type: 'string',
          description: 'Glob pattern for files to exclude. Optional.',
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Whether to do case-sensitive search. Optional, defaults to false.',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'list_dir',
    description: 'List contents of a directory.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the directory. Optional, defaults to current directory.',
        },
        showHidden: {
          type: 'boolean',
          description: 'Whether to show hidden files. Optional, defaults to false.',
        },
      },
    },
  },
  {
    name: 'todo_write',
    description: 'Write a list of todos for planning multi-step tasks. Replaces the entire todo list.',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'List of todos with id (optional), content, and status',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Optional ID for the todo' },
              content: { type: 'string', description: 'Description of the todo' },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed', 'cancelled'],
                description: 'Status of the todo',
              },
            },
            required: ['content', 'status'],
          },
        },
      },
      required: ['todos'],
    },
  },
  {
    name: 'todo_read',
    description: 'Read the current todo list for the session.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

// Tool executor
export class ToolExecutor {
  private db: SessionDB;
  private permissions: PermissionConfig;
  private permissionState: Map<string, boolean> = new Map();

  constructor(db: SessionDB, permissions: PermissionConfig) {
    this.db = db;
    this.permissions = permissions;
  }

  async executeTool(
    toolCall: ToolCall,
    cwd: string,
    sessionId: string
  ): Promise<ToolExecutionResult> {
    switch (toolCall.name) {
      case 'read_file':
        return this.executeReadFile(toolCall, cwd);
      case 'write_file':
        return this.executeWriteFile(toolCall, cwd, sessionId);
      case 'edit_file':
        return this.executeEditFile(toolCall, cwd, sessionId);
      case 'bash':
        return this.executeBash(toolCall, cwd);
      case 'grep':
        return this.executeGrep(toolCall, cwd);
      case 'list_dir':
        return this.executeListDir(toolCall, cwd);
      case 'todo_write':
        return this.executeTodoWrite(toolCall, sessionId);
      case 'todo_read':
        return this.executeTodoRead(toolCall, sessionId);
      default:
        return {
          success: false,
          result: `Unknown tool: ${toolCall.name}`,
        };
    }
  }

  private async executeReadFile(
    toolCall: ToolCall,
    cwd: string
  ): Promise<ToolExecutionResult> {
    const { readFileTool, formatReadResult } = await import('../tools/read.js');
    const args = toolCall.args as { path: string; startLine?: number; endLine?: number };
    
    // Check cache first
    const cache = getToolCache();
    const cacheKey = cache.generateKey('read_file', args);
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return {
        success: true,
        result: cached,
      };
    }
    
    const result = await readFileTool(args, cwd);
    const formatted = formatReadResult(result);
    
    // Cache successful reads
    if (result.success) {
      cache.set(cacheKey, formatted);
    }
    
    return {
      success: result.success,
      result: formatted,
    };
  }

  private async executeWriteFile(
    toolCall: ToolCall,
    cwd: string,
    sessionId: string
  ): Promise<ToolExecutionResult> {
    const { writeFileTool, applyWriteFile } = await import('../tools/write.js');
    const args = toolCall.args as { path: string; content: string };

    // Check permission
    const permission = await this.checkPermission('write');
    if (!permission.granted) {
      return {
        success: false,
        result: permission.reason || 'Permission denied',
        requiresPermission: true,
        permissionGranted: false,
      };
    }

    // Create git snapshot before writing
    const { createGitSnapshot } = await import('../utils/git.js');
    const existingContent = await createGitSnapshot(args.path, cwd);
    if (existingContent) {
      this.db.createSnapshot(sessionId, args.path, existingContent);
    }

    // Apply the write
    const result = await applyWriteFile(args, cwd);
    
    // Invalidate cache for this file
    const cache = getToolCache();
    cache.invalidateFile(args.path);
    
    return {
      success: result.success,
      result: result.success ? `Successfully wrote to ${args.path}` : result.error || 'Failed to write file',
    };
  }

  private async executeEditFile(
    toolCall: ToolCall,
    cwd: string,
    sessionId: string
  ): Promise<ToolExecutionResult> {
    const { editFileTool, applyEditFile } = await import('../tools/edit.js');
    const args = toolCall.args as { path: string; target: string; replacement: string };

    // Check permission
    const permission = await this.checkPermission('edit');
    if (!permission.granted) {
      return {
        success: false,
        result: permission.reason || 'Permission denied',
        requiresPermission: true,
        permissionGranted: false,
      };
    }

    // Create git snapshot before editing
    const { createGitSnapshot } = await import('../utils/git.js');
    const existingContent = await createGitSnapshot(args.path, cwd);
    if (existingContent) {
      this.db.createSnapshot(sessionId, args.path, existingContent);
    }

    // Apply the edit
    const result = await applyEditFile(args, cwd);
    
    // Invalidate cache for this file
    const cache = getToolCache();
    cache.invalidateFile(args.path);
    
    return {
      success: result.success,
      result: result.success ? `Successfully edited ${args.path}` : result.error || 'Failed to edit file',
    };
  }

  private async executeBash(
    toolCall: ToolCall,
    cwd: string
  ): Promise<ToolExecutionResult> {
    const { bashTool, formatBashResult } = await import('../tools/bash.js');
    const args = toolCall.args as { command: string };

    // Check permission
    const permission = await this.checkPermission('bash');
    if (!permission.granted) {
      return {
        success: false,
        result: permission.reason || 'Permission denied',
        requiresPermission: true,
        permissionGranted: false,
      };
    }

    const result = await bashTool(args, cwd);
    return {
      success: result.success,
      result: formatBashResult(result),
    };
  }

  private async executeGrep(
    toolCall: ToolCall,
    cwd: string
  ): Promise<ToolExecutionResult> {
    const { grepTool, formatGrepResult } = await import('../tools/grep.js');
    const args = toolCall.args as {
      pattern: string;
      path?: string;
      include?: string;
      exclude?: string;
      caseSensitive?: boolean;
      maxResults?: number;
    };
    const result = await grepTool(args, cwd);
    return {
      success: result.success,
      result: formatGrepResult(result),
    };
  }

  private async executeListDir(
    toolCall: ToolCall,
    cwd: string
  ): Promise<ToolExecutionResult> {
    const { lsTool, formatLsResult } = await import('../tools/ls.js');
    const args = toolCall.args as { path?: string; showHidden?: boolean };
    const result = await lsTool(args, cwd);
    return {
      success: result.success,
      result: formatLsResult(result),
    };
  }

  private async executeTodoWrite(
    toolCall: ToolCall,
    sessionId: string
  ): Promise<ToolExecutionResult> {
    const { todoWriteTool, formatTodoResult } = await import('../tools/todo.js');
    const args = toolCall.args as { todos: Array<{ id?: string; content: string; status: string }> };
    const result = await todoWriteTool(args, sessionId, this.db);
    return {
      success: result.success,
      result: formatTodoResult(result),
    };
  }

  private async executeTodoRead(
    toolCall: ToolCall,
    sessionId: string
  ): Promise<ToolExecutionResult> {
    const { todoReadTool, formatTodoResult } = await import('../tools/todo.js');
    const result = await todoReadTool({}, sessionId, this.db);
    return {
      success: result.success,
      result: formatTodoResult(result),
    };
  }

  private async checkPermission(
    type: 'bash' | 'write' | 'edit'
  ): Promise<{ granted: boolean; reason?: string }> {
    const permSetting = this.permissions[type];

    // Check if already approved for this session
    if (this.permissionState.get(type)) {
      return { granted: true };
    }

    // Check config setting
    if (permSetting === 'allow') {
      return { granted: true };
    }

    if (permSetting === 'deny') {
      return { granted: false, reason: `${type} operations are denied by configuration` };
    }

    // 'ask' - requires user confirmation (handled by UI)
    // For now, return pending - UI will handle the prompt
    return { granted: false, reason: 'pending_user_approval' };
  }

  grantPermission(type: 'bash' | 'write' | 'edit', always: boolean = false) {
    if (always) {
      this.permissionState.set(type, true);
    }
  }

  getPermissionState(type: 'bash' | 'write' | 'edit'): boolean {
    return this.permissionState.get(type) || false;
  }
}
