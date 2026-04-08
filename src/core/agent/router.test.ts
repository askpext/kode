import { describe, expect, it } from 'vitest';
import {
  classifyDeterministicDomain,
  detectDeterministicTask,
  looksLikeDirectoryFollowup,
  shouldUseOpenEndedLoop,
} from './router';

describe('router helpers', () => {
  it('detects deterministic tasks', () => {
    // Original tasks
    expect(detectDeterministicTask('run tests')?.type).toBe('test');
    expect(detectDeterministicTask('build project')?.type).toBe('build');
    expect(detectDeterministicTask('start dev server')?.type).toBe('dev');
    expect(detectDeterministicTask('delete lowkey directory')?.type).toBe('delete');
    expect(detectDeterministicTask('remove this folder')?.type).toBe('delete');
    expect(detectDeterministicTask('rm temp')?.type).toBe('delete');
    expect(detectDeterministicTask('implement login')).toBeNull();

    // Git operations
    expect(detectDeterministicTask('git status')?.type).toBe('git_status');
    expect(detectDeterministicTask('what has changed in files?')?.type).toBe('git_status');
    expect(detectDeterministicTask('show modified files')?.type).toBe('git_status');
    expect(detectDeterministicTask('git commit')?.type).toBe('git_commit');
    expect(detectDeterministicTask('commit changes with message "fix bug"')?.type).toBe('git_commit');
    expect(detectDeterministicTask('git push')?.type).toBe('git_push');
    expect(detectDeterministicTask('push to origin')?.type).toBe('git_push');
    expect(detectDeterministicTask('git pull')?.type).toBe('git_pull');
    expect(detectDeterministicTask('pull latest')?.type).toBe('git_pull');
    expect(detectDeterministicTask('switch to branch feature')?.type).toBe('git_checkout');
    expect(detectDeterministicTask('git diff')?.type).toBe('git_diff');
    expect(detectDeterministicTask('show diff')?.type).toBe('git_diff');
    expect(detectDeterministicTask('git log')?.type).toBe('git_log');
    expect(detectDeterministicTask('recent commits')?.type).toBe('git_log');
    expect(detectDeterministicTask('git stash')?.type).toBe('git_stash');
    expect(detectDeterministicTask('pop stash')?.type).toBe('git_stash');
    expect(detectDeterministicTask('git branch')?.type).toBe('git_branch');
    expect(detectDeterministicTask('list branches')?.type).toBe('git_branch');

    // File operations
    expect(detectDeterministicTask('create file hello.txt')?.type).toBe('create_file');
    expect(detectDeterministicTask('touch newfile.js')?.type).toBe('create_file');
    expect(detectDeterministicTask('move file1.txt to dir/')?.type).toBe('move_file');
    expect(detectDeterministicTask('rename old.txt to new.txt')?.type).toBe('move_file');
    expect(detectDeterministicTask('copy src/ to backup/')?.type).toBe('copy_file');
    expect(detectDeterministicTask('duplicate config file')?.type).toBe('copy_file');

    // Package management
    expect(detectDeterministicTask('npm install axios')?.type).toBe('install_pkg');
    expect(detectDeterministicTask('pip install requests')?.type).toBe('install_pkg');
    expect(detectDeterministicTask('npm uninstall lodash')?.type).toBe('uninstall_pkg');
    expect(detectDeterministicTask('install dependencies')?.type).toBe('install_deps');
    expect(detectDeterministicTask('npm install')?.type).toBe('install_deps');

    // Process management
    expect(detectDeterministicTask('kill process on port 3000')?.type).toBe('kill_process');
    expect(detectDeterministicTask('list running processes')?.type).toBe('list_processes');
    expect(detectDeterministicTask('show processes')?.type).toBe('list_processes');

    // Network/Archives
    expect(detectDeterministicTask('download file from https://example.com/file.zip')?.type).toBe('download');
    expect(detectDeterministicTask('unzip archive.zip')?.type).toBe('extract');
    expect(detectDeterministicTask('extract file.tar.gz')?.type).toBe('extract');
    expect(detectDeterministicTask('zip this folder')?.type).toBe('compress');
    expect(detectDeterministicTask('compress project directory')?.type).toBe('compress');

    // System/Env
    expect(detectDeterministicTask('make script.sh executable')?.type).toBe('chmod');
    expect(detectDeterministicTask('chmod 755 file.txt')?.type).toBe('chmod');
    expect(detectDeterministicTask('disk usage')?.type).toBe('disk_usage');
    expect(detectDeterministicTask('how much space left?')?.type).toBe('disk_usage');
    expect(detectDeterministicTask('export API_KEY=secret123')?.type).toBe('env_var');

    // Docker
    expect(detectDeterministicTask('docker run nginx')?.type).toBe('docker_run');
    expect(detectDeterministicTask('docker stop mycontainer')?.type).toBe('docker_stop');
    expect(detectDeterministicTask('docker build')?.type).toBe('docker_build');
    expect(detectDeterministicTask('docker ps')?.type).toBe('docker_ps');
    expect(detectDeterministicTask('list containers')?.type).toBe('docker_ps');
  });

  it('classifies deterministic domains', () => {
    expect(classifyDeterministicDomain('read README.md', null)).toBe('file');
    expect(classifyDeterministicDomain('analyze this repo', null)).toBe('analysis');
    expect(classifyDeterministicDomain('go to lowkey dir', null)).toBe('workspace');
    expect(classifyDeterministicDomain('run tests', null)).toBe('task');
    expect(classifyDeterministicDomain('create folder docs', null)).toBe('directory');
    expect(classifyDeterministicDomain('delete lowkey directory', null)).toBe('task');
    expect(classifyDeterministicDomain('remove this folder', null)).toBe('task');
    expect(classifyDeterministicDomain('rm temp dir', null)).toBe('task');
  });

  it('recognizes directory followups and open-ended requests separately', () => {
    expect(looksLikeDirectoryFollowup('lowkey')).toBe(true);
    expect(looksLikeDirectoryFollowup('make one')).toBe(false);
    expect(shouldUseOpenEndedLoop('implement auth flow', null)).toBe(true);
    expect(shouldUseOpenEndedLoop('run something', null)).toBe(false);
  });
});
