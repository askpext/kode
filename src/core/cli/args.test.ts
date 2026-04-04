import { describe, expect, it } from 'vitest';
import { getVersionText, parseArgs } from './args';

describe('parseArgs', () => {
  it('parses help and version flags', () => {
    expect(parseArgs(['--help'])).toEqual({ help: true });
    expect(parseArgs(['-v'])).toEqual({ version: true });
  });

  it('parses session arguments', () => {
    expect(parseArgs(['--resume', 'abc123'])).toEqual({ resume: 'abc123' });
    expect(parseArgs(['--session', 'xyz789'])).toEqual({ session: 'xyz789' });
    expect(parseArgs(['--new'])).toEqual({ new: true });
  });
});

describe('getVersionText', () => {
  it('returns a versioned cli string', () => {
    expect(getVersionText()).toMatch(/^kode v\d+\.\d+\.\d+/);
  });
});
