/**
 * Centralized constants for format strings and limits.
 */

/** Maximum file size in bytes (10 MB) to prevent OOM on large files. */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Time format for parsing and display (HH:MM:SS). */
export const TIME_FORMAT = 'HH:mm:ss';

/** Date format for directory names (yyyy-MM-dd). */
export const DATE_FORMAT_DASHED = 'yyyy-MM-dd';

/** Date format for flat filenames (yyyyMMdd). */
export const DATE_FORMAT_COMPACT = 'yyyyMMdd';

/** Year format for nested directories. */
export const YEAR_FORMAT = 'yyyy';

/** Month format for nested directories. */
export const MONTH_FORMAT = 'MM';

/** Day format for nested directories. */
export const DAY_FORMAT = 'dd';

/** Regex pattern to match timestamp lines (HH:MM:SS format). */
export const TIMESTAMP_REGEX = /^(\d{2}:\d{2}:\d{2})\s+(.*)$/;
