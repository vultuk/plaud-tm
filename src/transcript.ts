/**
 * Transcript processing logic for adjusting timestamps.
 */

import { parse, format, add, differenceInSeconds } from 'date-fns';
import { TIME_FORMAT, TIMESTAMP_REGEX } from './constants.js';
import { TranscriptError } from './errors.js';

/**
 * Result of transcript processing.
 */
export interface TranscriptUpdate {
  /** The adjusted transcript content. */
  body: string;
  /** First timestamp in the transcript (after adjustment). */
  firstTimestamp: Date;
  /** Last timestamp in the transcript (after adjustment). */
  lastTimestamp: Date;
  /** True if timestamps were found out of chronological order. */
  hasOutOfOrderTimestamps: boolean;
}

/**
 * Parses a timestamp line and extracts the time and content.
 * @param line The line to parse
 * @returns Object with timestamp and content, or null if not a timestamp line
 */
function parseTimestampLine(line: string): { time: Date; rest: string } | null {
  // Check minimum length for HH:MM:SS format
  if (line.length < 8) {
    return null;
  }

  // Extract first 8 characters
  const timestampPart = line.substring(0, 8);
  const rest = line.substring(8);

  // Try to parse as time
  try {
    const time = parse(timestampPart, TIME_FORMAT, new Date(0));
    if (isNaN(time.getTime())) {
      return null;
    }
    return { time, rest };
  } catch {
    return null;
  }
}

/**
 * Applies the base time offset to a relative time.
 * @param startTime The base start time
 * @param effectiveDate The effective date
 * @param relativeTime The relative time from the transcript
 * @returns The adjusted datetime
 */
function applyOffset(startTime: Date, effectiveDate: Date, relativeTime: Date): Date {
  // Create base datetime from effective date and start time
  const base = new Date(effectiveDate);
  base.setHours(startTime.getHours(), startTime.getMinutes(), startTime.getSeconds(), 0);

  // Calculate offset in seconds from midnight
  const midnightRelative = new Date(0);
  midnightRelative.setHours(0, 0, 0, 0);
  const deltaSeconds = differenceInSeconds(relativeTime, midnightRelative);

  // Apply offset
  return add(base, { seconds: deltaSeconds });
}

/**
 * Processes a transcript by adjusting timestamps.
 */
export class TranscriptProcessor {
  /**
   * Adjusts timestamps in a transcript.
   * @param contents The transcript contents
   * @param baseTime The base start time (HH:MM:SS)
   * @param effectiveDate The effective date (YYYY-MM-DD)
   * @returns The processed transcript
   */
  static adjust(contents: string, baseTime: Date, effectiveDate: Date): TranscriptUpdate {
    const adjustedLines: string[] = [];
    let firstTimestamp: Date | null = null;
    let lastTimestamp: Date | null = null;
    let previousTimestamp: Date | null = null;
    let hasOutOfOrder = false;

    const lines = contents.split('\n');

    for (const line of lines) {
      const parsed = parseTimestampLine(line);

      if (parsed) {
        const adjusted = applyOffset(baseTime, effectiveDate, parsed.time);

        if (firstTimestamp === null) {
          firstTimestamp = adjusted;
        }

        // Check for out-of-order timestamps
        if (previousTimestamp !== null && adjusted < previousTimestamp) {
          hasOutOfOrder = true;
        }
        previousTimestamp = adjusted;
        lastTimestamp = adjusted;

        // Format the adjusted timestamp and append the rest of the line
        const formattedTime = format(adjusted, TIME_FORMAT);
        adjustedLines.push(formattedTime + parsed.rest);
      } else {
        // Preserve non-timestamp lines as-is
        adjustedLines.push(line);
      }
    }

    if (firstTimestamp === null) {
      throw TranscriptError.noTimestamps();
    }

    if (lastTimestamp === null) {
      lastTimestamp = firstTimestamp;
    }

    // Join lines and preserve trailing newline if present
    let body = adjustedLines.join('\n');
    if (contents.endsWith('\n') && !body.endsWith('\n')) {
      body += '\n';
    }

    return {
      body,
      firstTimestamp,
      lastTimestamp,
      hasOutOfOrderTimestamps: hasOutOfOrder,
    };
  }
}
