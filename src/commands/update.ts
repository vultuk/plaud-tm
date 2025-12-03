/**
 * Update command implementation.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { format } from 'date-fns';
import { UpdateArgs } from '../types.js';
import { TranscriptProcessor } from '../transcript.js';
import { atomicWrite, readFileWithSizeLimit } from '../utils/fileio.js';
import { validateTime, validateDate, fileExists } from '../utils/validation.js';
import { UpdateError } from '../errors.js';
import { MAX_FILE_SIZE, DATE_FORMAT_COMPACT, YEAR_FORMAT, MONTH_FORMAT, DAY_FORMAT } from '../constants.js';

/**
 * Result of the update operation.
 */
export interface UpdateOutcome {
  /** Path where the output was written. */
  outputPath: string;
  /** Warning: timestamps in the input were not in chronological order. */
  hasOutOfOrderTimestamps: boolean;
}

/**
 * Resolves the output path based on the request and timestamps.
 * @param args Update arguments
 * @param firstTimestamp First timestamp in transcript
 * @param lastTimestamp Last timestamp in transcript
 * @returns The output file path
 */
function resolveOutputPath(
  args: UpdateArgs,
  firstTimestamp: Date,
  lastTimestamp: Date
): string {
  // Use the date from the last timestamp (handles midnight overflow)
  const effectiveDate = lastTimestamp;

  if (args.flat) {
    // Flat format: YYYYMMDD_HHMMSS_HHMMSS.txt in current directory
    const dateStr = format(effectiveDate, DATE_FORMAT_COMPACT);
    const startTime = format(firstTimestamp, 'HHmmss');
    const endTime = format(lastTimestamp, 'HHmmss');
    const filename = `${dateStr}_${startTime}_${endTime}.txt`;
    return join(process.cwd(), filename);
  } else {
    // Nested format: output-dir/YYYY/MM/DD/HHMMSS-HHMMSS.txt
    const year = format(effectiveDate, YEAR_FORMAT);
    const month = format(effectiveDate, MONTH_FORMAT);
    const day = format(effectiveDate, DAY_FORMAT);
    const startTime = format(firstTimestamp, 'HHmmss');
    const endTime = format(lastTimestamp, 'HHmmss');
    const filename = `${startTime}-${endTime}.txt`;

    const outputDir = args.outputDir || '';
    return join(outputDir, year, month, day, filename);
  }
}

/**
 * Executes the update operation on a transcript file.
 * @param args Update arguments
 * @returns Update outcome
 */
export async function executeUpdate(args: UpdateArgs): Promise<UpdateOutcome> {
  // Validate time and date
  const startTime = validateTime(args.time);
  const effectiveDate = validateDate(args.date);

  // Check if file exists
  if (!(await fileExists(args.file))) {
    throw UpdateError.fileNotFound(args.file);
  }

  // Read file with size limit
  let contents: string;
  try {
    contents = await readFileWithSizeLimit(args.file, MAX_FILE_SIZE);
  } catch (error: any) {
    if (error.message.includes('File too large')) {
      const stats = await fs.stat(args.file);
      throw UpdateError.fileTooLarge(stats.size, MAX_FILE_SIZE);
    }
    throw UpdateError.ioError(error.message);
  }

  // Process the transcript
  let transcript;
  try {
    transcript = TranscriptProcessor.adjust(contents, startTime, effectiveDate);
  } catch (error: any) {
    throw error;
  }

  // Resolve output path
  const outputPath = resolveOutputPath(args, transcript.firstTimestamp, transcript.lastTimestamp);

  // Write output atomically
  try {
    await atomicWrite(outputPath, transcript.body);
  } catch (error: any) {
    throw UpdateError.ioError(error.message);
  }

  return {
    outputPath,
    hasOutOfOrderTimestamps: transcript.hasOutOfOrderTimestamps,
  };
}
