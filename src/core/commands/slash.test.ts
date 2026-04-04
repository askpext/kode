import { describe, expect, it } from 'vitest';
import { isRegisteredSlashCommand } from './slash';

describe('isRegisteredSlashCommand', () => {
  it('recognizes built-in slash commands', () => {
    expect(isRegisteredSlashCommand('/help')).toBe(true);
    expect(isRegisteredSlashCommand('/sessions')).toBe(true);
  });

  it('rejects filesystem-like paths', () => {
    expect(isRegisteredSlashCommand('/home/aditya/lowkey')).toBe(false);
    expect(isRegisteredSlashCommand('/Users/Aditya/lowkey')).toBe(false);
  });
});
