/**
 * Merge command implementation.
 */

import { promises as fs } from 'fs';
import { join, dirname, basename } from 'path';
import { parse, format } from 'date-fns';
import { glob } from 'glob';
import { MergeArgs } from '../types.js';
import { atomicWrite } from '../utils/fileio.js';
import { MergeError } from '../errors.js';
import { MAX_FILE_SIZE, DATE_FORMAT_COMPACT, DATE_FORMAT_DASHED } from '../constants.js';

/**
 * Result of the merge operation.
 */
export interface MergeOutcome {
  /** Files that were merged. */
  files: string[];
  /** Path where the merged output was written. */
  outputPath: string;
}

/**
 * Sort key for ordering transcript files.
 */
interface FileSortKey {
  /** Date extracted from filename or directory. */
  date: Date | null;
  /** Start time extracted from filename. */
  start: Date;
}

/**
 * Parses a time string in HHMMSS format.
 * @param value The 6-digit time string
 * @returns Date object with the time, or null if invalid
 */
function parseTimeDigits(value: string): Date | null {
  if (value.length !== 6) {
    return null;
  }

  const hour = parseInt(value.substring(0, 2), 10);
  const minute = parseInt(value.substring(2, 4), 10);
  const second = parseInt(value.substring(4, 6), 10);

  if (isNaN(hour) || isNaN(minute) || isNaN(second)) {
    return null;
  }

  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const date = new Date(0);
  date.setHours(hour, minute, second, 0);
  return date;
}

/**
 * Checks if filename matches flat format: YYYYMMDD_HHMMSS_HHMMSS
 */
function looksLikeFlatFormat(filename: string): boolean {
  const parts = filename.split('_');
  if (parts.length !== 3) {
    return false;
  }

  // Date part: 8 digits
  if (parts[0].length !== 8 || !/^\d{8}$/.test(parts[0])) {
    return false;
  }

  // Start time: 6 digits
  if (parts[1].length !== 6 || !/^\d{6}$/.test(parts[1])) {
    return false;
  }

  // End time: 6 digits
  if (parts[2].length !== 6 || !/^\d{6}$/.test(parts[2])) {
    return false;
  }

  return true;
}

/**
 * Checks if filename matches nested format: HHMMSS-HHMMSS
 */
function looksLikeNestedFormat(filename: string): boolean {
  const parts = filename.split('-');
  if (parts.length !== 2) {
    return false;
  }

  // Start time: 6 digits
  if (parts[0].length !== 6 || !/^\d{6}$/.test(parts[0])) {
    return false;
  }

  // End time: 6 digits
  if (parts[1].length !== 6 || !/^\d{6}$/.test(parts[1])) {
    return false;
  }

  return true;
}

/**
 * Extracts date from directory structure (YYYY/MM/DD or single YYYY-MM-DD).
 */
function extractNestedDayDirectory(path: string): { dir: string; date: Date } | null {
  const dayDir = dirname(path);
  const dayName = basename(dayDir);

  // Try parsing as YYYY-MM-DD
  try {
    const date = parse(dayName, DATE_FORMAT_DASHED, new Date());
    if (!isNaN(date.getTime())) {
      return { dir: dayDir, date };
    }
  } catch {
    // Continue to nested format
  }

  // Try parsing as YYYY/MM/DD structure
  const monthDir = dirname(dayDir);
  const yearDir = dirname(monthDir);
  const monthName = basename(monthDir);
  const yearName = basename(yearDir);

  if (
    yearName.length === 4 &&
    monthName.length === 2 &&
    dayName.length === 2 &&
    /^\d{4}$/.test(yearName) &&
    /^\d{2}$/.test(monthName) &&
    /^\d{2}$/.test(dayName)
  ) {
    try {
      const dateStr = `${yearName}-${monthName}-${dayName}`;
      const date = parse(dateStr, DATE_FORMAT_DASHED, new Date());
      if (!isNaN(date.getTime())) {
        return { dir: dayDir, date };
      }
    } catch {
      // Invalid date
    }
  }

  return null;
}

/**
 * Parses a flat format filename: YYYYMMDD_HHMMSS_HHMMSS
 */
function parseFlatFormat(filename: string): FileSortKey | null {
  const parts = filename.split('_');
  if (parts.length !== 3) {
    return null;
  }

  const datePart = parts[0];
  const startPart = parts[1];

  try {
    const date = parse(datePart, DATE_FORMAT_COMPACT, new Date());
    if (isNaN(date.getTime())) {
      return null;
    }

    const start = parseTimeDigits(startPart);
    if (!start) {
      return null;
    }

    return { date, start };
  } catch {
    return null;
  }
}

/**
 * Parses a nested format filename: HHMMSS-HHMMSS
 */
function parseNestedFormat(path: string, filename: string): FileSortKey | null {
  const parts = filename.split('-');
  if (parts.length !== 2) {
    return null;
  }

  const startPart = parts[0];
  const start = parseTimeDigits(startPart);
  if (!start) {
    return null;
  }

  const dirInfo = extractNestedDayDirectory(path);
  const date = dirInfo ? dirInfo.date : null;

  return { date, start };
}

/**
 * Extracts sort key from a file path.
 */
function extractSortKey(path: string): FileSortKey {
  const filename = basename(path, '.txt');

  // Try flat format first
  if (looksLikeFlatFormat(filename)) {
    const key = parseFlatFormat(filename);
    if (key) {
      return key;
    }
  }

  // Try nested format
  if (looksLikeNestedFormat(filename)) {
    const key = parseNestedFormat(path, filename);
    if (key) {
      return key;
    }
  }

  throw MergeError.unrecognizedFilename(filename);
}

/**
 * Detects common nested directory among files.
 */
function detectCommonNestedDirectory(paths: string[]): { dir: string; date: Date } | null {
  let candidate: { dir: string; date: Date } | null = null;

  for (const path of paths) {
    const info = extractNestedDayDirectory(path);
    if (!info) {
      return null;
    }

    if (candidate) {
      if (candidate.dir !== info.dir || candidate.date.getTime() !== info.date.getTime()) {
        return null;
      }
    } else {
      candidate = info;
    }
  }

  return candidate;
}

/**
 * Determines the output path for merged file.
 */
function determineOutputPath(
  ordered: string[],
  descriptors: Array<{ path: string; key: FileSortKey }>,
  args: MergeArgs
): string {
  if (args.output) {
    return args.output;
  }

  // Check if all files share a common nested directory
  const commonDir = detectCommonNestedDirectory(ordered);
  if (commonDir) {
    const filename = format(commonDir.date, DATE_FORMAT_DASHED) + '.txt';
    return join(commonDir.dir, filename);
  }

  // Check if all files have the same date in flat format
  let selectedDate: Date | null = null;
  for (const { key } of descriptors) {
    if (key.date) {
      if (selectedDate) {
        if (selectedDate.getTime() !== key.date.getTime()) {
          throw MergeError.mixedDates();
        }
      } else {
        selectedDate = key.date;
      }
    }
  }

  if (selectedDate) {
    const baseDir = ordered.length > 0 ? dirname(ordered[0]) : '.';
    const filename = format(selectedDate, DATE_FORMAT_DASHED) + '.txt';
    return join(baseDir, filename);
  }

  throw MergeError.undeterminedDate();
}

/**
 * Writes merged content to output file.
 */
async function writeMergedFile(files: string[], outputPath: string): Promise<void> {
  let merged = '';

  for (let i = 0; i < files.length; i++) {
    const segment = await fs.readFile(files[i], 'utf-8');
    merged += segment;

    // Add newline between segments if not already present
    if (i + 1 < files.length && !merged.endsWith('\n')) {
      merged += '\n';
    }
  }

  await atomicWrite(outputPath, merged);
}

/**
 * Deletes source files after merging.
 */
async function deleteSources(files: string[], outputPath: string): Promise<void> {
  // Canonicalize output path for reliable comparison
  let outputCanonical: string;
  try {
    outputCanonical = await fs.realpath(outputPath);
  } catch {
    outputCanonical = outputPath;
  }

  for (const path of files) {
    // Canonicalize file path
    let pathCanonical: string;
    try {
      pathCanonical = await fs.realpath(path);
    } catch {
      pathCanonical = path;
    }

    // Never delete the output file
    if (pathCanonical === outputCanonical) {
      continue;
    }

    await fs.unlink(path);
  }
}

/**
 * Executes the merge operation on transcript files.
 */
export async function executeMerge(args: MergeArgs): Promise<MergeOutcome> {
  const collected: string[] = [];

  // Expand glob patterns
  for (const pattern of args.patterns) {
    const matches = await glob(pattern, { nodir: true });

    if (matches.length === 0) {
      throw MergeError.noMatches(pattern);
    }

    collected.push(...matches);
  }

  // Check file sizes before processing
  for (const path of collected) {
    const stats = await fs.stat(path);
    if (stats.size > MAX_FILE_SIZE) {
      throw MergeError.fileTooLarge(path, stats.size, MAX_FILE_SIZE);
    }
  }

  // Extract sort keys and sort files
  const descriptors = collected.map((path) => ({
    path,
    key: extractSortKey(path),
  }));

  descriptors.sort((a, b) => {
    // Compare dates first (null dates go last)
    if (a.key.date && b.key.date) {
      const dateDiff = a.key.date.getTime() - b.key.date.getTime();
      if (dateDiff !== 0) {
        return dateDiff;
      }
    } else if (a.key.date && !b.key.date) {
      return -1;
    } else if (!a.key.date && b.key.date) {
      return 1;
    }

    // Then compare start times
    return a.key.start.getTime() - b.key.start.getTime();
  });

  // Remove duplicates while preserving order
  const ordered: string[] = [];
  for (const { path } of descriptors) {
    if (ordered.length === 0 || ordered[ordered.length - 1] !== path) {
      ordered.push(path);
    }
  }

  // Determine output path
  const outputPath = determineOutputPath(ordered, descriptors, args);

  // Canonicalize output path for comparison
  let outputCanonical: string;
  try {
    outputCanonical = await fs.realpath(outputPath);
  } catch {
    outputCanonical = outputPath;
  }

  // Filter out the output path from sources to prevent self-deletion
  const sourcesToMerge: string[] = [];
  for (const path of ordered) {
    let pathCanonical: string;
    try {
      pathCanonical = await fs.realpath(path);
    } catch {
      pathCanonical = path;
    }

    if (pathCanonical !== outputCanonical) {
      sourcesToMerge.push(path);
    }
  }

  // Write merged file
  await writeMergedFile(sourcesToMerge, outputPath);

  // Delete sources if requested
  if (!args.noDelete) {
    await deleteSources(sourcesToMerge, outputPath);
  }

  return {
    files: sourcesToMerge,
    outputPath,
  };
}
