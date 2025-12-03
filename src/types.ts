/**
 * Type definitions for the plaud-timestamp CLI application.
 */

/**
 * Arguments for the update command.
 */
export interface UpdateArgs {
  /** File whose timestamps will be adjusted. */
  file: string;
  /** Optional prefix directory where updated output should be written. */
  outputDir?: string;
  /** When set, write output in flat mode (no subdirectories) to the current working directory. */
  flat: boolean;
  /** Timestamp that will eventually adjust file entries (HH:MM:SS). */
  time: string;
  /** Calendar date associated with the update (YYYY-MM-DD). */
  date: string;
}

/**
 * Arguments for the merge command.
 */
export interface MergeArgs {
  /** One or more files or glob patterns to merge, e.g. 2025/01/27/*. */
  patterns: string[];
  /** Optional explicit output file to override the inferred location. */
  output?: string;
  /** Preserve the original segments instead of deleting them after merging. */
  noDelete: boolean;
}

/**
 * Result of parsing a timestamp line.
 */
export interface TimestampLine {
  /** The original timestamp string (HH:MM:SS). */
  timestamp: string;
  /** The content following the timestamp. */
  content: string;
}

/**
 * Information about a transcript file for merging.
 */
export interface TranscriptFileInfo {
  /** Full path to the file. */
  path: string;
  /** Start time extracted from the filename. */
  startTime: Date;
  /** End time extracted from the filename. */
  endTime: Date;
  /** Date extracted from the filename or directory structure. */
  date: Date;
}

/**
 * Props for Ink App component.
 */
export interface AppProps {
  /** The command to execute (update or merge). */
  command?: string;
  /** Arguments passed to the command. */
  args: string[];
  /** Flags/options from meow. */
  flags: Record<string, any>;
}

/**
 * Props for UpdateCommand component.
 */
export interface UpdateCommandProps {
  args: UpdateArgs;
}

/**
 * Props for MergeCommand component.
 */
export interface MergeCommandProps {
  args: MergeArgs;
}
