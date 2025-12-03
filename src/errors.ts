/**
 * Custom error classes for the plaud-timestamp application.
 */

/**
 * Base application error class.
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Errors related to transcript processing.
 */
export class TranscriptError extends AppError {
  constructor(message: string) {
    super(message);
    this.name = 'TranscriptError';
  }

  static noTimestamps(): TranscriptError {
    return new TranscriptError('No timestamped lines were found in the input file');
  }
}

/**
 * Errors related to the update command.
 */
export class UpdateError extends AppError {
  constructor(message: string) {
    super(message);
    this.name = 'UpdateError';
  }

  static fileTooLarge(size: number, max: number): UpdateError {
    return new UpdateError(`File too large: ${size} bytes exceeds maximum of ${max} bytes`);
  }

  static invalidTime(value: string): UpdateError {
    return new UpdateError(`Invalid time '${value}'. Use HH:MM:SS (e.g. 18:06:13)`);
  }

  static invalidDate(value: string): UpdateError {
    return new UpdateError(`Invalid date '${value}'. Use YYYY-MM-DD (e.g. 2024-03-15)`);
  }

  static fileNotFound(path: string): UpdateError {
    return new UpdateError(`File not found: ${path}`);
  }

  static ioError(message: string): UpdateError {
    return new UpdateError(`I/O error: ${message}`);
  }
}

/**
 * Errors related to the merge command.
 */
export class MergeError extends AppError {
  constructor(message: string) {
    super(message);
    this.name = 'MergeError';
  }

  static invalidGlobPattern(pattern: string, error: Error): MergeError {
    return new MergeError(`Invalid glob pattern '${pattern}': ${error.message}`);
  }

  static noMatches(pattern: string): MergeError {
    return new MergeError(`No files matched pattern '${pattern}'`);
  }

  static unrecognizedFilename(filename: string): MergeError {
    return new MergeError(`Unrecognized transcript filename '${filename}'`);
  }

  static mixedDates(): MergeError {
    return new MergeError('Files correspond to multiple dates; supply --output to choose the destination');
  }

  static undeterminedDate(): MergeError {
    return new MergeError('Unable to determine an output filename; rerun with --output <file>');
  }

  static fileTooLarge(path: string, size: number, max: number): MergeError {
    return new MergeError(`File too large: ${path} (${size} bytes exceeds maximum of ${max} bytes)`);
  }

  static ioError(message: string): MergeError {
    return new MergeError(`I/O error: ${message}`);
  }
}
