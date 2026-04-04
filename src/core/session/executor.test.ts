import { describe, expect, it, vi } from 'vitest';
import {
  buildPermissionPlan,
  buildResumePlan,
  createToolExecutionPlan,
  getPermissionType,
  requiresPermission,
} from './executor';
import { AgentResponse } from '../../agent/loop';

describe('createToolExecutionPlan', () => {
  it('marks tool calls as pending', () => {
    const plan = createToolExecutionPlan([
      { id: '1', name: 'list_dir', args: {} },
    ]);

    expect(plan.currentToolCalls).toEqual([
      { call: { id: '1', name: 'list_dir', args: {} }, status: 'pending' },
    ]);
  });
});

describe('permission helpers', () => {
  it('recognizes permission-gated tools', () => {
    expect(requiresPermission('bash')).toBe(true);
    expect(requiresPermission('write_file')).toBe(true);
    expect(requiresPermission('list_dir')).toBe(false);
  });

  it('maps tool names to permission types', () => {
    expect(getPermissionType({ id: '1', name: 'bash', args: {} })).toBe('bash');
    expect(getPermissionType({ id: '1', name: 'write_file', args: {} })).toBe('write');
    expect(getPermissionType({ id: '1', name: 'edit_file', args: {} })).toBe('edit');
  });
});

describe('buildPermissionPlan', () => {
  it('creates a direct permission request for bash', async () => {
    const agent = {
      previewTool: vi.fn(),
    } as never;

    const plan = await buildPermissionPlan(agent, [
      { id: '1', name: 'bash', args: { command: 'npm test' } },
    ]);

    expect(plan.pendingPermission?.type).toBe('bash');
    expect(plan.pendingPermission?.command).toBe('npm test');
  });

  it('creates a diff prompt for file edits when preview is available', async () => {
    const agent = {
      previewTool: vi.fn().mockResolvedValue({ diff: '--- old\n+++ new' }),
    } as never;

    const plan = await buildPermissionPlan(agent, [
      { id: '1', name: 'write_file', args: { path: 'foo.ts' } },
    ]);

    expect(plan.pendingDiff?.filePath).toBe('foo.ts');
    expect(plan.pendingPermission).toBeUndefined();
  });
});

describe('buildResumePlan', () => {
  it('returns null when the agent is done', async () => {
    const agent = {} as never;
    const response: AgentResponse = { content: 'done', done: true };

    await expect(buildResumePlan(agent, response)).resolves.toBeNull();
  });
});
