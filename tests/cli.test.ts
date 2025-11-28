import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

describe('CLI integration tests', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plaud-cli-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const cliPath = path.resolve(__dirname, '..', 'dist', 'index.js');

  function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
    try {
      const stdout = execSync(`node "${cliPath}" ${args.join(' ')}`, {
        encoding: 'utf-8',
        cwd: tempDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.status || 1,
      };
    }
  }

  const sampleTranscript = `00:00:01 Speaker 1
Line
00:00:05 Speaker 2
`;

  const expectedTranscript = `18:01:13 Speaker 1
Line
18:01:17 Speaker 2
`;

  describe('update command', () => {
    it('writes nested output by default', () => {
      fs.writeFileSync(path.join(tempDir, 'input.txt'), sampleTranscript);

      const result = runCli([
        'update',
        'input.txt',
        '--time',
        '18:01:12',
        '--date',
        '2024-12-25',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('2024/12/25/180113-180117.txt');

      const outputPath = path.join(tempDir, '2024', '12', '25', '180113-180117.txt');
      expect(fs.existsSync(outputPath)).toBe(true);

      const contents = fs.readFileSync(outputPath, 'utf-8');
      expect(contents).toBe(expectedTranscript);
    });

    it('supports flat output', () => {
      fs.writeFileSync(path.join(tempDir, 'input.txt'), sampleTranscript);

      const result = runCli([
        'update',
        'input.txt',
        '--time',
        '18:01:12',
        '--date',
        '2024-12-25',
        '--flat',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('20241225_180113_180117.txt');

      const outputPath = path.join(tempDir, '20241225_180113_180117.txt');
      expect(fs.existsSync(outputPath)).toBe(true);

      const contents = fs.readFileSync(outputPath, 'utf-8');
      expect(contents).toBe(expectedTranscript);
    });
  });

  describe('merge command', () => {
    function setupNestedFiles(): void {
      const dayDir = path.join(tempDir, '2025', '01', '27');
      fs.mkdirSync(dayDir, { recursive: true });
      fs.writeFileSync(path.join(dayDir, '112256-162256.txt'), 'late segment\n');
      fs.writeFileSync(path.join(dayDir, '061901-111901.txt'), 'early segment\n');
    }

    it('merges with explicit list and outputs sorted paths', () => {
      setupNestedFiles();

      const result = runCli([
        'merge',
        '2025/01/27/112256-162256.txt',
        '2025/01/27/061901-111901.txt',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('2025/01/27/061901-111901.txt');
      expect(result.stdout).toContain('2025/01/27/112256-162256.txt');
      expect(result.stdout).toContain('Merged into 2025/01/27/2025-01-27.txt');

      const mergedPath = path.join(tempDir, '2025', '01', '27', '2025-01-27.txt');
      expect(fs.existsSync(mergedPath)).toBe(true);

      // Source files should be deleted
      expect(fs.existsSync(path.join(tempDir, '2025', '01', '27', '061901-111901.txt'))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, '2025', '01', '27', '112256-162256.txt'))).toBe(false);

      const contents = fs.readFileSync(mergedPath, 'utf-8');
      expect(contents).toBe('early segment\nlate segment\n');
    });

    it('merges with glob pattern', () => {
      setupNestedFiles();

      const result = runCli(['merge', '2025/01/27/*']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Merged into 2025/01/27/2025-01-27.txt');

      const mergedPath = path.join(tempDir, '2025', '01', '27', '2025-01-27.txt');
      expect(fs.existsSync(mergedPath)).toBe(true);

      const contents = fs.readFileSync(mergedPath, 'utf-8');
      expect(contents).toBe('early segment\nlate segment\n');
    });

    it('respects custom output argument', () => {
      setupNestedFiles();

      const result = runCli([
        'merge',
        '2025/01/27/*',
        '--output',
        'combined.txt',
        '--no-delete',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Merged into combined.txt');

      const mergedPath = path.join(tempDir, 'combined.txt');
      expect(fs.existsSync(mergedPath)).toBe(true);

      // Source files should still exist with --no-delete
      expect(fs.existsSync(path.join(tempDir, '2025', '01', '27', '061901-111901.txt'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, '2025', '01', '27', '112256-162256.txt'))).toBe(true);

      const contents = fs.readFileSync(mergedPath, 'utf-8');
      expect(contents).toBe('early segment\nlate segment\n');
    });
  });
});
