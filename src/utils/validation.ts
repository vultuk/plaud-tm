/**
 * Input validation utilities.
 */

import { parse, isValid } from 'date-fns';
import { TIME_FORMAT, DATE_FORMAT_DASHED } from '../constants.js';
import { UpdateError } from '../errors.js';

/**
 * Validates and parses a time string in HH:MM:SS format.
 * @param timeStr The time string to validate
 * @returns Parsed Date object (only time portion is relevant)
 * @throws UpdateError if invalid
 */
export function validateTime(timeStr: string): Date {
  const time = parse(timeStr, TIME_FORMAT, new Date(0));
  if (!isValid(time)) {
    throw UpdateError.invalidTime(timeStr);
  }
  return time;
}

/**
 * Validates and parses a date string in YYYY-MM-DD format.
 * @param dateStr The date string to validate
 * @returns Parsed Date object
 * @throws UpdateError if invalid
 */
export function validateDate(dateStr: string): Date {
  const date = parse(dateStr, DATE_FORMAT_DASHED, new Date());
  if (!isValid(date)) {
    throw UpdateError.invalidDate(dateStr);
  }
  return date;
}

/**
 * Checks if a file exists.
 * @param filePath The file path to check
 * @returns true if file exists, false otherwise
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const { promises: fs } = await import('fs');
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
