import { describe, expect, it } from 'vitest';
import {
  classifyDeterministicDomain,
  detectDeterministicTask,
  looksLikeDirectoryFollowup,
  shouldUseOpenEndedLoop,
} from './router';

describe('router helpers', () => {
  it('detects deterministic tasks', () => {
    expect(detectDeterministicTask('run tests')?.type).toBe('test');
    expect(detectDeterministicTask('build project')?.type).toBe('build');
    expect(detectDeterministicTask('start dev server')?.type).toBe('dev');
    expect(detectDeterministicTask('implement login')).toBeNull();
  });

  it('classifies deterministic domains', () => {
    expect(classifyDeterministicDomain('read README.md', null)).toBe('file');
    expect(classifyDeterministicDomain('analyze this repo', null)).toBe('analysis');
    expect(classifyDeterministicDomain('go to lowkey dir', null)).toBe('workspace');
    expect(classifyDeterministicDomain('run tests', null)).toBe('task');
    expect(classifyDeterministicDomain('create folder docs', null)).toBe('directory');
  });

  it('recognizes directory followups and open-ended requests separately', () => {
    expect(looksLikeDirectoryFollowup('lowkey')).toBe(true);
    expect(looksLikeDirectoryFollowup('make one')).toBe(false);
    expect(shouldUseOpenEndedLoop('implement auth flow', null)).toBe(true);
    expect(shouldUseOpenEndedLoop('run something', null)).toBe(false);
  });
});
