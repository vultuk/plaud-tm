/**
 * Pure transcript transformation logic (no side effects).
 */

import { TIME_REGEX } from './constants.js';

/** Represents a date and time without timezone. */
export interface DateTime {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Represents just a time value. */
export interface Time {
  hours: number;
  minutes: number;
  seconds: number;
}

/** Represents just a date value. */
export interface DateOnly {
  year: number;
  month: number;
  day: number;
}

/** Result of a transcript adjustment operation. */
export interface TranscriptUpdate {
  body: string;
  firstTimestamp: DateTime;
  lastTimestamp: DateTime;
  /** True if timestamps were found out of chronological order. */
  hasOutOfOrderTimestamps: boolean;
}

/** Error types for transcript processing. */
export class TranscriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscriptError';
  }
}

export class NoTimestampsError extends TranscriptError {
  constructor() {
    super('No timestamped lines were found in the input file');
    this.name = 'NoTimestampsError';
  }
}

/** Parse a time string in HH:MM:SS format. */
export function parseTime(value: string): Time | null {
  const match = TIME_REGEX.exec(value);
  if (!match) {
    return null;
  }
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  if (hours > 23 || minutes > 59 || seconds > 59) {
    return null;
  }
  return { hours, minutes, seconds };
}

/** Format a time value as HH:MM:SS. */
export function formatTime(time: Time): string {
  return `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}:${String(time.seconds).padStart(2, '0')}`;
}

/** Format a date value as YYYY-MM-DD. */
export function formatDateDashed(date: DateOnly): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

/** Format a date value as YYYYMMDD. */
export function formatDateCompact(date: DateOnly): string {
  return `${date.year}${String(date.month).padStart(2, '0')}${String(date.day).padStart(2, '0')}`;
}

/** Convert time to total seconds from midnight. */
export function timeToSeconds(time: Time): number {
  return time.hours * 3600 + time.minutes * 60 + time.seconds;
}

/** Convert seconds from midnight to time (may overflow to next day). */
function secondsToTimeWithOverflow(totalSeconds: number): { time: Time; daysOverflow: number } {
  const daysOverflow = Math.floor(totalSeconds / 86400);
  const remainingSeconds = totalSeconds % 86400;
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;
  return { time: { hours, minutes, seconds }, daysOverflow };
}

/** Add days to a date. */
function addDays(date: DateOnly, days: number): DateOnly {
  const d = new Date(date.year, date.month - 1, date.day);
  d.setDate(d.getDate() + days);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  };
}

/** Create a DateTime from a date and time. */
export function createDateTime(date: DateOnly, time: Time): DateTime {
  return {
    year: date.year,
    month: date.month,
    day: date.day,
    hours: time.hours,
    minutes: time.minutes,
    seconds: time.seconds,
  };
}

/** Compare two DateTimes. Returns negative if a < b, 0 if equal, positive if a > b. */
export function compareDateTime(a: DateTime, b: DateTime): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  if (a.day !== b.day) return a.day - b.day;
  if (a.hours !== b.hours) return a.hours - b.hours;
  if (a.minutes !== b.minutes) return a.minutes - b.minutes;
  return a.seconds - b.seconds;
}

/** Parse a timestamp line and return the relative time and rest of the line. */
function parseTimestampLine(line: string): { time: Time; rest: string } | null {
  if (line.length < 8) {
    return null;
  }
  const timestampPart = line.slice(0, 8);
  const time = parseTime(timestampPart);
  if (!time) {
    return null;
  }
  return { time, rest: line.slice(8) };
}

/** Apply time offset to get adjusted datetime. */
function applyOffset(start: Time, effectiveDate: DateOnly, relative: Time): DateTime {
  const baseSeconds = timeToSeconds(start);
  const relativeSeconds = timeToSeconds(relative);
  const totalSeconds = baseSeconds + relativeSeconds;

  const { time: adjustedTime, daysOverflow } = secondsToTimeWithOverflow(totalSeconds);
  const adjustedDate = daysOverflow > 0 ? addDays(effectiveDate, daysOverflow) : effectiveDate;

  return createDateTime(adjustedDate, adjustedTime);
}

/** Adjust timestamps in a transcript. */
export function adjustTranscript(
  contents: string,
  baseTime: Time,
  effectiveDate: DateOnly
): TranscriptUpdate {
  const adjustedLines: string[] = [];
  let firstTimestamp: DateTime | null = null;
  let lastTimestamp: DateTime | null = null;
  let previousTimestamp: DateTime | null = null;
  let hasOutOfOrder = false;

  const lines = contents.split('\n');
  // Handle trailing newline - if original ends with \n, split will produce empty final element
  const hasTrailingNewline = contents.endsWith('\n');
  if (hasTrailingNewline && lines[lines.length - 1] === '') {
    lines.pop();
  }

  for (const line of lines) {
    const parsed = parseTimestampLine(line);
    if (parsed) {
      const adjusted = applyOffset(baseTime, effectiveDate, parsed.time);
      if (firstTimestamp === null) {
        firstTimestamp = adjusted;
      }

      // Check for out-of-order timestamps
      if (previousTimestamp !== null && compareDateTime(adjusted, previousTimestamp) < 0) {
        hasOutOfOrder = true;
      }
      previousTimestamp = adjusted;
      lastTimestamp = adjusted;

      adjustedLines.push(formatTime(adjusted) + parsed.rest);
    } else {
      adjustedLines.push(line);
    }
  }

  if (firstTimestamp === null) {
    throw new NoTimestampsError();
  }

  let body = adjustedLines.join('\n');
  if (hasTrailingNewline) {
    body += '\n';
  }

  return {
    body,
    firstTimestamp,
    lastTimestamp: lastTimestamp ?? firstTimestamp,
    hasOutOfOrderTimestamps: hasOutOfOrder,
  };
}
