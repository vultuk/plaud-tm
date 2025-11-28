/**
 * Merge command implementation - merges multiple transcript segments.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import { MAX_FILE_SIZE, DATE_COMPACT_REGEX } from './constants.js';
import { atomicWrite } from './update.js';
import { type DateOnly, formatDateDashed } from './transcript.js';

/** Request parameters for the merge command. */
export interface MergeRequest {
  patterns: string[];
  output?: string;
  noDelete: boolean;
}

/** Result of the merge operation. */
export interface MergeOutcome {
  files: string[];
  outputPath: string;
}

/** Error types for merge operations. */
export class MergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MergeError';
  }
}

export class InvalidGlobPatternError extends MergeError {
  constructor(pattern: string, source: Error) {
    super(`Invalid glob pattern '${pattern}': ${source.message}`);
    this.name = 'InvalidGlobPatternError';
  }
}

export class NoMatchesError extends MergeError {
  constructor(pattern: string) {
    super(`No files matched pattern '${pattern}'`);
    this.name = 'NoMatchesError';
  }
}

export class UnrecognizedFilenameError extends MergeError {
  constructor(filepath: string) {
    super(`Unrecognized transcript filename '${filepath}'`);
    this.name = 'UnrecognizedFilenameError';
  }
}

export class MixedDatesError extends MergeError {
  constructor() {
    super('Files correspond to multiple dates; supply --output to choose the destination');
    this.name = 'MixedDatesError';
  }
}

export class UndeterminedDateError extends MergeError {
  constructor() {
    super('Unable to determine an output filename; rerun with --output <file>');
    this.name = 'UndeterminedDateError';
  }
}

export class FileTooLargeError extends MergeError {
  constructor(filepath: string, size: number, max: number) {
    super(`File too large: ${filepath} (${size} bytes exceeds maximum of ${max} bytes)`);
    this.name = 'FileTooLargeError';
  }
}

export class IOError extends MergeError {
  constructor(message: string) {
    super(`I/O error: ${message}`);
    this.name = 'IOError';
  }
}

/** Sort key for chronological ordering of transcript files. */
interface FileSortKey {
  date: DateOnly | null;
  startHours: number;
  startMinutes: number;
  startSeconds: number;
}

/** Compare two sort keys for ordering. */
function compareSortKeys(a: FileSortKey, b: FileSortKey): number {
  // First compare by date if both have dates
  if (a.date && b.date) {
    if (a.date.year !== b.date.year) return a.date.year - b.date.year;
    if (a.date.month !== b.date.month) return a.date.month - b.date.month;
    if (a.date.day !== b.date.day) return a.date.day - b.date.day;
  } else if (a.date && !b.date) {
    return 1; // Files with dates come after files without
  } else if (!a.date && b.date) {
    return -1;
  }

  // Then compare by start time
  if (a.startHours !== b.startHours) return a.startHours - b.startHours;
  if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
  return a.startSeconds - b.startSeconds;
}

/** Check if filename matches flat format: YYYYMMDD_HHMMSS_HHMMSS */
function looksLikeFlatFormat(filename: string): boolean {
  const parts = filename.split('_');
  if (parts.length !== 3) return false;

  // Date part: 8 digits
  if (parts[0].length !== 8 || !/^\d{8}$/.test(parts[0])) return false;

  // Start time: 6 digits
  if (parts[1].length !== 6 || !/^\d{6}$/.test(parts[1])) return false;

  // End time: 6 digits
  if (parts[2].length !== 6 || !/^\d{6}$/.test(parts[2])) return false;

  return true;
}

/** Check if filename matches nested format: HHMMSS-HHMMSS */
function looksLikeNestedFormat(filename: string): boolean {
  const parts = filename.split('-');
  if (parts.length !== 2) return false;

  // Start time: 6 digits
  if (parts[0].length !== 6 || !/^\d{6}$/.test(parts[0])) return false;

  // End time: 6 digits
  if (parts[1].length !== 6 || !/^\d{6}$/.test(parts[1])) return false;

  return true;
}

/** Parse 6 digits as time components. */
function parseTimeDigits(value: string): { hours: number; minutes: number; seconds: number } | null {
  if (value.length !== 6 || !/^\d{6}$/.test(value)) return null;

  const hours = parseInt(value.slice(0, 2), 10);
  const minutes = parseInt(value.slice(2, 4), 10);
  const seconds = parseInt(value.slice(4, 6), 10);

  if (hours > 23 || minutes > 59 || seconds > 59) return null;

  return { hours, minutes, seconds };
}

/** Extract date from path directory structure (YYYY/MM/DD or YYYY-MM-DD). */
function extractDateFromPath(filepath: string): DateOnly | null {
  const dir = path.dirname(filepath);
  const dayDir = path.basename(dir);

  // Try YYYY-MM-DD format
  const dashedMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayDir);
  if (dashedMatch) {
    return {
      year: parseInt(dashedMatch[1], 10),
      month: parseInt(dashedMatch[2], 10),
      day: parseInt(dashedMatch[3], 10),
    };
  }

  // Try nested YYYY/MM/DD format
  const parts = dir.split(path.sep);
  if (parts.length >= 3) {
    const dayPart = parts[parts.length - 1];
    const monthPart = parts[parts.length - 2];
    const yearPart = parts[parts.length - 3];

    if (
      /^\d{4}$/.test(yearPart) &&
      /^\d{2}$/.test(monthPart) &&
      /^\d{2}$/.test(dayPart)
    ) {
      const year = parseInt(yearPart, 10);
      const month = parseInt(monthPart, 10);
      const day = parseInt(dayPart, 10);

      // Validate date
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return { year, month, day };
      }
    }
  }

  return null;
}

/** Parse nested format (HHMMSS-HHMMSS). */
function parseNested(filepath: string, filename: string): FileSortKey {
  const parts = filename.split('-');
  const startTime = parseTimeDigits(parts[0]);

  if (!startTime) {
    throw new UnrecognizedFilenameError(filepath);
  }

  const date = extractDateFromPath(filepath);

  return {
    date,
    startHours: startTime.hours,
    startMinutes: startTime.minutes,
    startSeconds: startTime.seconds,
  };
}

/** Parse flat format (YYYYMMDD_HHMMSS_HHMMSS). */
function parseFlat(filepath: string, filename: string): FileSortKey {
  const parts = filename.split('_');
  const datePart = parts[0];
  const startPart = parts[1];

  const dateMatch = DATE_COMPACT_REGEX.exec(datePart);
  if (!dateMatch) {
    throw new UnrecognizedFilenameError(filepath);
  }

  const date: DateOnly = {
    year: parseInt(dateMatch[1], 10),
    month: parseInt(dateMatch[2], 10),
    day: parseInt(dateMatch[3], 10),
  };

  const startTime = parseTimeDigits(startPart);
  if (!startTime) {
    throw new UnrecognizedFilenameError(filepath);
  }

  return {
    date,
    startHours: startTime.hours,
    startMinutes: startTime.minutes,
    startSeconds: startTime.seconds,
  };
}

/** Extract sort key from file path. */
function getSortKey(filepath: string): FileSortKey {
  const basename = path.basename(filepath);
  const filename = basename.replace(/\.[^.]+$/, ''); // Remove extension

  // Try flat format first (more specific)
  if (looksLikeFlatFormat(filename)) {
    return parseFlat(filepath, filename);
  }

  // Try nested format
  if (looksLikeNestedFormat(filename)) {
    return parseNested(filepath, filename);
  }

  throw new UnrecognizedFilenameError(filepath);
}

/** Extract the day directory info for a nested file. */
function extractNestedDayDirectory(filepath: string): { dir: string; date: DateOnly } | null {
  const date = extractDateFromPath(filepath);
  if (!date) return null;
  return { dir: path.dirname(filepath), date };
}

/** Detect if all files share a common nested directory. */
function detectCommonNestedDirectory(paths: string[]): { dir: string; date: DateOnly } | null {
  let candidate: { dir: string; date: DateOnly } | null = null;

  for (const filepath of paths) {
    const info = extractNestedDayDirectory(filepath);
    if (!info) return null;

    if (candidate === null) {
      candidate = info;
    } else if (candidate.dir !== info.dir ||
               candidate.date.year !== info.date.year ||
               candidate.date.month !== info.date.month ||
               candidate.date.day !== info.date.day) {
      return null;
    }
  }

  return candidate;
}

/** Determine the output path for merged file. */
function determineOutputPath(
  ordered: string[],
  descriptors: Array<{ path: string; key: FileSortKey }>,
  request: MergeRequest
): string {
  // Use explicit output if provided
  if (request.output) {
    return request.output;
  }

  // Try to detect common nested directory
  const common = detectCommonNestedDirectory(ordered);
  if (common) {
    return path.join(common.dir, `${formatDateDashed(common.date)}.txt`);
  }

  // Check if all files have the same date
  let selectedDate: DateOnly | null = null;
  for (const { key } of descriptors) {
    if (key.date) {
      if (selectedDate === null) {
        selectedDate = key.date;
      } else if (
        selectedDate.year !== key.date.year ||
        selectedDate.month !== key.date.month ||
        selectedDate.day !== key.date.day
      ) {
        throw new MixedDatesError();
      }
    }
  }

  if (selectedDate) {
    const baseDir = ordered.length > 0 ? path.dirname(ordered[0]) : '.';
    return path.join(baseDir, `${formatDateDashed(selectedDate)}.txt`);
  }

  throw new UndeterminedDateError();
}

/** Write merged content to output file. */
function writeMergedFile(files: string[], outputPath: string): void {
  let merged = '';

  for (let i = 0; i < files.length; i++) {
    const content = fs.readFileSync(files[i], 'utf-8');
    merged += content;
    // Add newline between segments if needed
    if (i + 1 < files.length && !merged.endsWith('\n')) {
      merged += '\n';
    }
  }

  // Create parent directories
  const parentDir = path.dirname(outputPath);
  if (parentDir && parentDir !== '.') {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  atomicWrite(outputPath, merged);
}

/** Delete source files after merge. */
function deleteSources(files: string[], outputPath: string): void {
  const outputCanonical = fs.existsSync(outputPath)
    ? fs.realpathSync(outputPath)
    : path.resolve(outputPath);

  for (const filepath of files) {
    const fileCanonical = fs.existsSync(filepath)
      ? fs.realpathSync(filepath)
      : path.resolve(filepath);

    // Never delete the output file
    if (fileCanonical === outputCanonical) {
      continue;
    }

    fs.unlinkSync(filepath);
  }
}

/** Execute the merge operation on transcript files. */
export async function executeMerge(request: MergeRequest): Promise<MergeOutcome> {
  const collected: string[] = [];

  // Expand glob patterns
  for (const pattern of request.patterns) {
    let matches: string[];
    try {
      matches = await glob(pattern, { nodir: true });
    } catch (error) {
      throw new InvalidGlobPatternError(
        pattern,
        error instanceof Error ? error : new Error(String(error))
      );
    }

    if (matches.length === 0) {
      throw new NoMatchesError(pattern);
    }

    collected.push(...matches);
  }

  // Check file sizes
  for (const filepath of collected) {
    let stats: fs.Stats;
    try {
      stats = fs.statSync(filepath);
    } catch (error) {
      throw new IOError(error instanceof Error ? error.message : String(error));
    }

    if (stats.size > MAX_FILE_SIZE) {
      throw new FileTooLargeError(filepath, stats.size, MAX_FILE_SIZE);
    }
  }

  // Extract sort keys and sort
  const descriptors: Array<{ path: string; key: FileSortKey }> = collected.map((filepath) => ({
    path: filepath,
    key: getSortKey(filepath),
  }));

  descriptors.sort((a, b) => compareSortKeys(a.key, b.key));

  // Deduplicate
  const ordered: string[] = [];
  for (const { path: filepath } of descriptors) {
    if (ordered.length === 0 || ordered[ordered.length - 1] !== filepath) {
      ordered.push(filepath);
    }
  }

  // Determine output path
  const outputPath = determineOutputPath(ordered, descriptors, request);

  // Canonicalize output path for reliable comparison
  const outputCanonical = fs.existsSync(outputPath)
    ? fs.realpathSync(outputPath)
    : path.resolve(outputPath);

  // Filter out the output path from sources
  const sourcesToMerge = ordered.filter((filepath) => {
    const fileCanonical = fs.existsSync(filepath)
      ? fs.realpathSync(filepath)
      : path.resolve(filepath);
    return fileCanonical !== outputCanonical;
  });

  // Write merged file
  try {
    writeMergedFile(sourcesToMerge, outputPath);
  } catch (error) {
    throw new IOError(error instanceof Error ? error.message : String(error));
  }

  // Delete sources if requested
  if (!request.noDelete) {
    try {
      deleteSources(sourcesToMerge, outputPath);
    } catch (error) {
      throw new IOError(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    files: sourcesToMerge,
    outputPath,
  };
}

// Export helper functions for testing
export const _internal = {
  looksLikeFlatFormat,
  looksLikeNestedFormat,
  parseTimeDigits,
  getSortKey,
};
