import { Agent, AgentResponse } from '../../agent/loop.js';
import { ToolCall as AgentToolCall } from '../../agent/tools.js';

export type ToolExecutionStatus = 'pending' | 'running' | 'done' | 'error';
export type PermissionType = 'bash' | 'write' | 'edit';

export interface ToolExecutionState {
  call: AgentToolCall;
  status: ToolExecutionStatus;
  result?: string;
  error?: string;
}

export interface PendingPermissionState {
  type: PermissionType;
  toolCall: AgentToolCall;
  command?: string;
  filePath?: string;
}

export interface PendingDiffState {
  filePath: string;
  diff: string;
  toolCall: AgentToolCall;
}

export interface ToolExecutionPlan {
  currentToolCalls: ToolExecutionState[];
  pendingPermission?: PendingPermissionState;
  pendingDiff?: PendingDiffState;
}

export function createToolExecutionPlan(toolCalls: AgentToolCall[]): ToolExecutionPlan {
  return {
    currentToolCalls: toolCalls.map((call) => ({
      call,
      status: 'pending',
    })),
  };
}

export async function buildPermissionPlan(
  agent: Agent,
  toolCalls: AgentToolCall[]
): Promise<ToolExecutionPlan> {
  const plan = createToolExecutionPlan(toolCalls);
  const pendingCall = toolCalls.find((call) => requiresPermission(call.name));

  if (!pendingCall) {
    return plan;
  }

  const permissionType = getPermissionType(pendingCall);
  const command = (pendingCall.args as { command?: string }).command;
  const filePath = (pendingCall.args as { path?: string }).path;

  if (pendingCall.name === 'write_file' || pendingCall.name === 'edit_file') {
    const preview = await agent.previewTool(pendingCall);
    if (preview.diff) {
      return {
        ...plan,
        pendingDiff: {
          filePath: filePath || '',
          diff: preview.diff,
          toolCall: pendingCall,
        },
      };
    }
  }

  return {
    ...plan,
    pendingPermission: {
      type: permissionType,
      toolCall: pendingCall,
      command,
      filePath,
    },
  };
}

export async function executeToolCalls(
  agent: Agent,
  toolCalls: ToolExecutionState[],
  onUpdate: (toolCalls: ToolExecutionState[]) => void
): Promise<ToolExecutionState[]> {
  let currentStates = [...toolCalls];

  for (const toolCall of toolCalls) {
    currentStates = updateToolState(currentStates, toolCall.call.id, { status: 'running' });
    onUpdate(currentStates);

    const result = await agent.executeToolWithPermission(toolCall.call);
    currentStates = updateToolState(currentStates, toolCall.call.id, {
      status: result.success ? 'done' : 'error',
      result: result.result,
      error: result.success ? undefined : result.result,
    });
    onUpdate(currentStates);
  }

  return currentStates;
}

export async function buildResumePlan(
  agent: Agent,
  response: AgentResponse
): Promise<ToolExecutionPlan | null> {
  if (response.done || !response.toolCalls?.length) {
    return null;
  }

  return buildPermissionPlan(agent, response.toolCalls);
}

export function requiresPermission(toolName: string): boolean {
  return ['bash', 'write_file', 'edit_file'].includes(toolName);
}

export function getPermissionType(toolCall: AgentToolCall): PermissionType {
  if (toolCall.name === 'write_file') {
    return 'write';
  }
  if (toolCall.name === 'edit_file') {
    return 'edit';
  }
  return 'bash';
}

function updateToolState(
  toolCalls: ToolExecutionState[],
  id: string,
  patch: Partial<ToolExecutionState>
): ToolExecutionState[] {
  return toolCalls.map((item) =>
    item.call.id === id
      ? {
          ...item,
          ...patch,
        }
      : item
  );
}
