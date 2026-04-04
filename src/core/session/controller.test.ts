import { describe, expect, it, vi } from 'vitest';
import { buildStatusLine, executeSlashCommand } from './controller';

describe('buildStatusLine', () => {
  it('formats model, detail, cwd, and session id', () => {
    expect(buildStatusLine('sarvam-m', '1.2s', 'C:\\repo', '12345678-1234')).toBe(
      'sarvam-m | 1.2s | C:\\repo | Session: 12345678'
    );
  });
});

describe('executeSlashCommand', () => {
  it('returns exit for /new', async () => {
    const db = {} as never;
    await expect(executeSlashCommand('new', db, 'session')).resolves.toEqual({ exit: true });
  });

  it('returns help content for /help', async () => {
    const db = {} as never;
    const result = await executeSlashCommand('help', db, 'session');
    expect(result.message?.content).toContain('/help - Show this help');
  });

  it('returns no-result content for empty search', async () => {
    const db = {
      searchSessions: vi.fn(),
    } as never;

    const result = await executeSlashCommand('search', db, 'session');
    expect(result.message?.content).toContain('Usage: /search <query>');
  });
});
