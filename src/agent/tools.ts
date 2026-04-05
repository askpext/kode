import SessionDB from '../db/sessions.js';
import { PermissionConfig } from '../config.js';
import { getToolCache } from './cache.js';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
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
    name: 'create_directory',
    description: 'Create a directory. Requires permission.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the directory relative to the current working directory',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'count_directories',
    description: 'Count directories inside a directory.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to inspect. Optional, defaults to current directory.',
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to count nested directories recursively.',
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
  {
    name: 'fetch_url',
    description: 'Fetch a URL and read its content (HTML is converted to text).',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch over HTTP/HTTPS.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'replace_multi',
    description: 'Apply multiple replacements to a single file at once. Use this instead of edit_file when editing multiple areas of a file. Requires permission.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to the current working directory',
        },
        edits: {
          type: 'array',
          description: 'List of target/replacement pairs',
          items: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Exact string to find and replace' },
              replacement: { type: 'string', description: 'String to replace the target with' },
            },
            required: ['target', 'replacement'],
          },
        },
      },
      required: ['path', 'edits'],
    },
  },
  {
    name: 'bash_background',
    description: 'Execute a shell command in the background. Returns a process ID immediately. Requires permission.',
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
    name: 'bash_status',
    description: 'Read the logs of a background process, or terminate it.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The background process ID returned by bash_background',
        },
        action: {
          type: 'string',
          enum: ['read', 'terminate'],
          description: 'Action to perform: read logs or terminate process',
        },
      },
      required: ['id', 'action'],
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
      case 'create_directory':
        return this.executeCreateDirectory(toolCall, cwd);
      case 'count_directories':
        return this.executeCountDirectories(toolCall, cwd);
      case 'todo_write':
        return this.executeTodoWrite(toolCall, sessionId);
      case 'todo_read':
        return this.executeTodoRead(toolCall, sessionId);
      case 'fetch_url':
        return this.executeFetchUrl(toolCall);
      case 'replace_multi':
        return this.executeReplaceMulti(toolCall, cwd, sessionId);
      case 'bash_background':
        return this.executeBashBackground(toolCall, cwd);
      case 'bash_status':
        return this.executeBashStatus(toolCall);
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

    const redirectedTool = this.detectBuiltInAlternative(args.command);
    if (redirectedTool) {
      return {
        success: false,
        result: redirectedTool,
      };
    }

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

  private detectBuiltInAlternative(command: string): string | null {
    const trimmed = command.trim();

    if (/^mkdir(?:\s+-p)?\s+/.test(trimmed)) {
      return 'Use create_directory instead of bash mkdir for simple directory creation.';
    }

    if (/^ls(?:\s|$)/.test(trimmed)) {
      return 'Use list_dir instead of bash ls for directory listing.';
    }

    if (/^cat\s+/.test(trimmed)) {
      return 'Use read_file instead of bash cat for reading files.';
    }

    return null;
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

  private async executeCreateDirectory(
    toolCall: ToolCall,
    cwd: string
  ): Promise<ToolExecutionResult> {
    const { applyCreateDirectory, formatCreateDirectoryResult } = await import('../tools/dir.js');
    const args = toolCall.args as { path: string };

    const permission = await this.checkPermission('write');
    if (!permission.granted) {
      return {
        success: false,
        result: permission.reason || 'Permission denied',
        requiresPermission: true,
        permissionGranted: false,
      };
    }

    const result = await applyCreateDirectory(args, cwd);
    return {
      success: result.success,
      result: formatCreateDirectoryResult(result),
    };
  }

  private async executeCountDirectories(
    toolCall: ToolCall,
    cwd: string
  ): Promise<ToolExecutionResult> {
    const { countDirectoriesTool, formatCountDirectoriesResult } = await import('../tools/dir.js');
    const args = toolCall.args as { path?: string; recursive?: boolean };
    const result = await countDirectoriesTool(args, cwd);
    return {
      success: result.success,
      result: formatCountDirectoriesResult(result),
    };
  }

  private async executeTodoWrite(
    toolCall: ToolCall,
    sessionId: string
  ): Promise<ToolExecutionResult> {
    const { todoWriteTool, formatTodoResult } = await import('../tools/todo.js');
    const args = toolCall.args as { todos: Array<{ id?: string; content: string; status: "pending" | "in_progress" | "completed" | "cancelled" }> };
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

  private async executeFetchUrl(
    toolCall: ToolCall
  ): Promise<ToolExecutionResult> {
    const { fetchUrlTool, formatFetchResult } = await import('../tools/fetch.js');
    const args = toolCall.args as { url: string };
    const result = await fetchUrlTool(args);
    return {
      success: result.success,
      result: formatFetchResult(result),
    };
  }

  private async executeReplaceMulti(
    toolCall: ToolCall,
    cwd: string,
    sessionId: string
  ): Promise<ToolExecutionResult> {
    const { multiEditFileTool, applyMultiEditFile } = await import('../tools/edit.js');
    const args = toolCall.args as { path: string; edits: Array<{ target: string; replacement: string }> };

    // Check permission - we use 'edit' permission for replace_multi
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

    // Pre-calculate diff logic using tool
    const toolResult = await multiEditFileTool(args, cwd);
    if (!toolResult.success) {
      return {
         success: false,
         result: toolResult.error || 'Failed to apply multiple edits',
      }
    }

    // Apply the edit
    const result = await applyMultiEditFile(args, cwd);
    
    // Invalidate cache for this file
    const cache = getToolCache();
    cache.invalidateFile(args.path);
    
    return {
      success: result.success,
      result: result.success ? `Successfully applied multiple replacements to ${args.path}\n\nDiff:\n${toolResult.diff}` : result.error || 'Failed to edit file',
    };
  }

  private async executeBashBackground(
    toolCall: ToolCall,
    cwd: string
  ): Promise<ToolExecutionResult> {
    const { bashBackgroundTool } = await import('../tools/bash.js');
    const args = toolCall.args as { command: string };

    const permission = await this.checkPermission('bash');
    if (!permission.granted) {
      return {
        success: false,
        result: permission.reason || 'Permission denied',
        requiresPermission: true,
        permissionGranted: false,
      };
    }

    const result = await bashBackgroundTool(args, cwd);
    return {
      success: result.success,
      result: result.success ? `Started background process with ID: ${result.id}` : `Error: ${result.error}`,
    };
  }

  private async executeBashStatus(
    toolCall: ToolCall
  ): Promise<ToolExecutionResult> {
    const { bashStatusTool, formatBashResult } = await import('../tools/bash.js');
    const args = toolCall.args as { id: string; action: 'read' | 'terminate' };
    const result = await bashStatusTool(args);
    return {
      success: result.success,
      result: formatBashResult(result),
    };
  }
}
