import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { executeUpdate, type UpdateRequest, FileTooLargeError, FileIOError } from '../src/update.js';
import type { Time, DateOnly } from '../src/transcript.js';

describe('executeUpdate', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plaud-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const baseTime: Time = { hours: 18, minutes: 1, seconds: 12 };
  const date: DateOnly = { year: 2024, month: 12, day: 25 };

  const sampleTranscript = `00:00:01 Speaker 1
Line
00:00:05 Speaker 2
`;

  const expectedTranscript = `18:01:13 Speaker 1
Line
18:01:17 Speaker 2
`;

  it('writes nested output by default', () => {
    const inputPath = path.join(tempDir, 'input.txt');
    fs.writeFileSync(inputPath, sampleTranscript);

    const request: UpdateRequest = {
      inputFile: inputPath,
      outputDir: tempDir,
      flattenOutput: false,
      startTime: baseTime,
      date,
    };

    const outcome = executeUpdate(request);

    expect(outcome.outputPath).toContain('2024');
    expect(outcome.outputPath).toContain('12');
    expect(outcome.outputPath).toContain('25');
    expect(outcome.outputPath).toContain('180113-180117.txt');

    const contents = fs.readFileSync(outcome.outputPath, 'utf-8');
    expect(contents).toBe(expectedTranscript);
  });

  it('writes flat output when requested', () => {
    const inputPath = path.join(tempDir, 'input.txt');
    fs.writeFileSync(inputPath, sampleTranscript);

    // Change to temp directory for flat output
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      const request: UpdateRequest = {
        inputFile: inputPath,
        outputDir: '',
        flattenOutput: true,
        startTime: baseTime,
        date,
      };

      const outcome = executeUpdate(request);

      expect(outcome.outputPath).toContain('20241225_180113_180117.txt');

      const contents = fs.readFileSync(outcome.outputPath, 'utf-8');
      expect(contents).toBe(expectedTranscript);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('handles midnight overflow in path', () => {
    const inputPath = path.join(tempDir, 'input.txt');
    fs.writeFileSync(inputPath, '00:00:01 Start\n01:00:00 Later\n');

    const request: UpdateRequest = {
      inputFile: inputPath,
      outputDir: tempDir,
      flattenOutput: false,
      startTime: { hours: 23, minutes: 30, seconds: 0 },
      date,
    };

    const outcome = executeUpdate(request);

    // Should use the date from the last timestamp (Dec 26)
    expect(outcome.outputPath).toContain('2024');
    expect(outcome.outputPath).toContain('12');
    expect(outcome.outputPath).toContain('26');
    expect(outcome.outputPath).toContain('233001-003000.txt');
  });

  it('reports out-of-order timestamps', () => {
    const inputPath = path.join(tempDir, 'input.txt');
    fs.writeFileSync(inputPath, '00:00:05 Later\n00:00:02 Earlier\n');

    const request: UpdateRequest = {
      inputFile: inputPath,
      outputDir: tempDir,
      flattenOutput: false,
      startTime: baseTime,
      date,
    };

    const outcome = executeUpdate(request);
    expect(outcome.hasOutOfOrderTimestamps).toBe(true);
  });

  it('throws error for file not found', () => {
    const request: UpdateRequest = {
      inputFile: path.join(tempDir, 'nonexistent.txt'),
      outputDir: tempDir,
      flattenOutput: false,
      startTime: baseTime,
      date,
    };

    expect(() => executeUpdate(request)).toThrow(FileIOError);
  });
});
