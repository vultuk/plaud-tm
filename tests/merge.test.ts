import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  executeMerge,
  type MergeRequest,
  NoMatchesError,
  UnrecognizedFilenameError,
  _internal,
} from '../src/merge.js';

const { looksLikeFlatFormat, looksLikeNestedFormat } = _internal;

describe('filename format detection', () => {
  it('detects nested format correctly', () => {
    expect(looksLikeNestedFormat('112256-162256')).toBe(true);
    expect(looksLikeNestedFormat('061901-111901')).toBe(true);
    expect(looksLikeNestedFormat('000000-235959')).toBe(true);

    // Invalid formats
    expect(looksLikeNestedFormat('meeting-notes')).toBe(false);
    expect(looksLikeNestedFormat('2025-01-27')).toBe(false);
    expect(looksLikeNestedFormat('abc123-def456')).toBe(false);
    expect(looksLikeNestedFormat('11225-162256')).toBe(false); // 5 digits
    expect(looksLikeNestedFormat('1122567-162256')).toBe(false); // 7 digits
  });

  it('detects flat format correctly', () => {
    expect(looksLikeFlatFormat('20250127_112256_162256')).toBe(true);
    expect(looksLikeFlatFormat('20241225_061901_111901')).toBe(true);

    // Invalid formats
    expect(looksLikeFlatFormat('notes_about_meeting')).toBe(false);
    expect(looksLikeFlatFormat('2025_01_27')).toBe(false);
    expect(looksLikeFlatFormat('20250127_112256')).toBe(false); // Missing part
    expect(looksLikeFlatFormat('2025012_112256_162256')).toBe(false); // 7 digit date
  });
});

describe('executeMerge', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plaud-merge-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function setupNestedFiles(): void {
    const dayDir = path.join(tempDir, '2025', '01', '27');
    fs.mkdirSync(dayDir, { recursive: true });
    fs.writeFileSync(path.join(dayDir, '112256-162256.txt'), 'late segment\n');
    fs.writeFileSync(path.join(dayDir, '061901-111901.txt'), 'early segment\n');
  }

  function setupFlatFiles(): void {
    fs.writeFileSync(path.join(tempDir, '20250127_112256_162256.txt'), 'late\n');
    fs.writeFileSync(path.join(tempDir, '20250127_061901_111901.txt'), 'early\n');
  }

  it('sorts nested files chronologically', async () => {
    setupNestedFiles();

    const request: MergeRequest = {
      patterns: [path.join(tempDir, '2025', '01', '27', '*.txt')],
      noDelete: false,
    };

    const outcome = await executeMerge(request);

    expect(outcome.files.length).toBe(2);
    expect(outcome.files[0]).toContain('061901-111901.txt');
    expect(outcome.files[1]).toContain('112256-162256.txt');
    expect(outcome.outputPath).toContain('2025-01-27.txt');

    const merged = fs.readFileSync(outcome.outputPath, 'utf-8');
    expect(merged).toBe('early segment\nlate segment\n');
  });

  it('sorts flat files chronologically', async () => {
    setupFlatFiles();

    const request: MergeRequest = {
      patterns: [path.join(tempDir, '20250127_*.txt')],
      noDelete: false,
    };

    const outcome = await executeMerge(request);

    expect(outcome.files.length).toBe(2);
    expect(outcome.files[0]).toContain('20250127_061901_111901.txt');
    expect(outcome.files[1]).toContain('20250127_112256_162256.txt');
    expect(outcome.outputPath).toContain('2025-01-27.txt');

    const merged = fs.readFileSync(outcome.outputPath, 'utf-8');
    expect(merged).toBe('early\nlate\n');
  });

  it('respects --no-delete flag', async () => {
    setupNestedFiles();

    const request: MergeRequest = {
      patterns: [path.join(tempDir, '2025', '01', '27', '*.txt')],
      noDelete: true,
    };

    const outcome = await executeMerge(request);

    // Source files should still exist
    expect(fs.existsSync(path.join(tempDir, '2025', '01', '27', '061901-111901.txt'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '2025', '01', '27', '112256-162256.txt'))).toBe(true);

    // Output file should also exist
    expect(fs.existsSync(outcome.outputPath)).toBe(true);
  });

  it('deletes source files by default', async () => {
    setupNestedFiles();

    const request: MergeRequest = {
      patterns: [path.join(tempDir, '2025', '01', '27', '*.txt')],
      noDelete: false,
    };

    const outcome = await executeMerge(request);

    // Source files should be deleted
    expect(fs.existsSync(path.join(tempDir, '2025', '01', '27', '061901-111901.txt'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, '2025', '01', '27', '112256-162256.txt'))).toBe(false);

    // Output file should exist
    expect(fs.existsSync(outcome.outputPath)).toBe(true);
  });

  it('respects custom output path', async () => {
    setupNestedFiles();

    const customOutput = path.join(tempDir, 'custom-merged.txt');
    const request: MergeRequest = {
      patterns: [path.join(tempDir, '2025', '01', '27', '*.txt')],
      output: customOutput,
      noDelete: true,
    };

    const outcome = await executeMerge(request);

    expect(outcome.outputPath).toBe(customOutput);
    expect(fs.existsSync(customOutput)).toBe(true);

    const merged = fs.readFileSync(customOutput, 'utf-8');
    expect(merged).toBe('early segment\nlate segment\n');
  });

  it('merges explicit file list in correct order', async () => {
    setupNestedFiles();

    // Pass files in reverse order - should still be sorted
    const request: MergeRequest = {
      patterns: [
        path.join(tempDir, '2025', '01', '27', '112256-162256.txt'),
        path.join(tempDir, '2025', '01', '27', '061901-111901.txt'),
      ],
      noDelete: true,
    };

    const outcome = await executeMerge(request);

    // Should be sorted chronologically
    expect(outcome.files[0]).toContain('061901-111901.txt');
    expect(outcome.files[1]).toContain('112256-162256.txt');
  });

  it('throws error for no matching files', async () => {
    const request: MergeRequest = {
      patterns: [path.join(tempDir, 'nonexistent', '*.txt')],
      noDelete: false,
    };

    await expect(executeMerge(request)).rejects.toThrow(NoMatchesError);
  });

  it('throws error for unrecognized filenames', async () => {
    const dayDir = path.join(tempDir, '2025', '01', '27');
    fs.mkdirSync(dayDir, { recursive: true });
    fs.writeFileSync(path.join(dayDir, '112256-162256.txt'), 'valid\n');
    fs.writeFileSync(path.join(dayDir, 'notes.txt'), 'invalid\n');

    const request: MergeRequest = {
      patterns: [path.join(dayDir, '*.txt')],
      noDelete: false,
    };

    await expect(executeMerge(request)).rejects.toThrow(UnrecognizedFilenameError);
  });

  it('excludes output file from merge sources when output matches a source', async () => {
    const dayDir = path.join(tempDir, '2025', '01', '27');
    fs.mkdirSync(dayDir, { recursive: true });
    fs.writeFileSync(path.join(dayDir, '112256-162256.txt'), 'segment 1\n');
    fs.writeFileSync(path.join(dayDir, '061901-111901.txt'), 'segment 2\n');

    const outputFile = path.join(dayDir, 'merged.txt');

    const request: MergeRequest = {
      patterns: [
        path.join(dayDir, '061901-111901.txt'),
        path.join(dayDir, '112256-162256.txt'),
      ],
      output: outputFile,
      noDelete: false,
    };

    const outcome = await executeMerge(request);

    // Source files should be deleted
    expect(fs.existsSync(path.join(dayDir, '061901-111901.txt'))).toBe(false);
    expect(fs.existsSync(path.join(dayDir, '112256-162256.txt'))).toBe(false);

    // Output file should exist
    expect(fs.existsSync(outcome.outputPath)).toBe(true);

    const merged = fs.readFileSync(outcome.outputPath, 'utf-8');
    expect(merged).toBe('segment 2\nsegment 1\n');
  });
});
