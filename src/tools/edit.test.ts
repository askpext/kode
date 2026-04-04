import { describe, it, expect, vi, beforeEach } from 'vitest';
import { multiEditFileTool } from './edit';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

// Mock fs to avoid touching real files during tests
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

describe('multiEditFileTool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should successfully apply multiple non-contiguous edits', async () => {
    const fakeContent = `function hello() {\n  console.log('hi');\n}\n\nfunction bye() {\n  console.log('bye');\n}`;
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fsPromises.readFile).mockResolvedValue(fakeContent);

    const edits = [
      {
        target: `  console.log('hi');`,
        replacement: `  console.log('HELLO THERE');`,
      },
      {
        target: `  console.log('bye');`,
        replacement: `  console.log('GOODBYE NOW');`,
      }
    ];

    const result = await multiEditFileTool({ path: 'test.ts', edits }, '/fake/cwd');
    
    expect(result.success).toBe(true);
    expect(result.occurrences).toBe(2);
    // Diffs should highlight both changes correctly
    expect(result.diff).toContain('HELLO THERE');
    expect(result.diff).toContain('GOODBYE NOW');
  });

  it('should fail cleanly if target is completely missing', async () => {
    const fakeContent = `function hello() {\n  console.log('hi');\n}`;
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fsPromises.readFile).mockResolvedValue(fakeContent);

    const edits = [
      {
        target: `  console.log('MISSING');`,
        replacement: `  console.log('FOUND');`,
      }
    ];

    const result = await multiEditFileTool({ path: 'test.ts', edits }, '/fake/cwd');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Target string not found');
  });

  it('should fail cleanly if target matches multiple times (ambiguous)', async () => {
    const fakeContent = `function a() { log('x'); }\nfunction b() { log('x'); }`;
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fsPromises.readFile).mockResolvedValue(fakeContent);

    const edits = [
      {
        target: `log('x');`,
        replacement: `log('y');`,
      }
    ];

    const result = await multiEditFileTool({ path: 'test.ts', edits }, '/fake/cwd');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Target string found 2 times');
  });
});
