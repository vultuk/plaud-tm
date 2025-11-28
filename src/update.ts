/**
 * Update command implementation - adjusts timestamps in transcript files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MAX_FILE_SIZE } from './constants.js';
import {
  adjustTranscript,
  type DateOnly,
  type DateTime,
  type Time,
  formatDateCompact,
} from './transcript.js';

/** Request parameters for the update command. */
export interface UpdateRequest {
  inputFile: string;
  outputDir: string;
  flattenOutput: boolean;
  startTime: Time;
  date: DateOnly;
}

/** Result of the update operation. */
export interface UpdateOutcome {
  outputPath: string;
  /** Warning: timestamps in the input were not in chronological order. */
  hasOutOfOrderTimestamps: boolean;
}

/** Error types for update operations. */
export class UpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpdateError';
  }
}

export class FileTooLargeError extends UpdateError {
  constructor(size: number, max: number) {
    super(`File too large: ${size} bytes exceeds maximum of ${max} bytes`);
    this.name = 'FileTooLargeError';
  }
}

export class FileIOError extends UpdateError {
  constructor(message: string) {
    super(`I/O error: ${message}`);
    this.name = 'FileIOError';
  }
}

/** Write content atomically by writing to a temp file and renaming. */
export function atomicWrite(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.tmp-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if rename fails
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/** Format time component for filename (HHMMSS). */
function formatTimeCompact(dt: DateTime): string {
  return `${String(dt.hours).padStart(2, '0')}${String(dt.minutes).padStart(2, '0')}${String(dt.seconds).padStart(2, '0')}`;
}

/** Resolve the output path based on timestamps and mode. */
function resolveOutputPath(
  request: UpdateRequest,
  first: DateTime,
  last: DateTime
): string {
  // Use the actual date from the last timestamp (handles midnight overflow)
  const effectiveDate: DateOnly = {
    year: last.year,
    month: last.month,
    day: last.day,
  };

  if (request.flattenOutput) {
    const filename = `${formatDateCompact(effectiveDate)}_${formatTimeCompact(first)}_${formatTimeCompact(last)}.txt`;
    return path.join(process.cwd(), filename);
  } else {
    const filename = `${formatTimeCompact(first)}-${formatTimeCompact(last)}.txt`;
    const year = String(effectiveDate.year);
    const month = String(effectiveDate.month).padStart(2, '0');
    const day = String(effectiveDate.day).padStart(2, '0');
    return path.join(request.outputDir || '.', year, month, day, filename);
  }
}

/** Execute the update operation on a transcript file. */
export function executeUpdate(request: UpdateRequest): UpdateOutcome {
  // Check file size before reading to prevent OOM
  let stats: fs.Stats;
  try {
    stats = fs.statSync(request.inputFile);
  } catch (error) {
    throw new FileIOError(
      error instanceof Error ? error.message : String(error)
    );
  }

  if (stats.size > MAX_FILE_SIZE) {
    throw new FileTooLargeError(stats.size, MAX_FILE_SIZE);
  }

  // Read the file
  let contents: string;
  try {
    contents = fs.readFileSync(request.inputFile, 'utf-8');
  } catch (error) {
    throw new FileIOError(
      error instanceof Error ? error.message : String(error)
    );
  }

  // Process the transcript
  const transcript = adjustTranscript(contents, request.startTime, request.date);

  // Resolve output path
  const outputPath = resolveOutputPath(
    request,
    transcript.firstTimestamp,
    transcript.lastTimestamp
  );

  // Create parent directories
  const parentDir = path.dirname(outputPath);
  try {
    fs.mkdirSync(parentDir, { recursive: true });
  } catch (error) {
    throw new FileIOError(
      error instanceof Error ? error.message : String(error)
    );
  }

  // Atomic write
  try {
    atomicWrite(outputPath, transcript.body);
  } catch (error) {
    throw new FileIOError(
      error instanceof Error ? error.message : String(error)
    );
  }

  return {
    outputPath,
    hasOutOfOrderTimestamps: transcript.hasOutOfOrderTimestamps,
  };
}
