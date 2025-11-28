/**
 * Centralized constants for format strings and limits.
 */

/** Maximum file size in bytes (10 MB) to prevent OOM on large files. */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Time format regex for parsing HH:MM:SS. */
export const TIME_REGEX = /^(\d{2}):(\d{2}):(\d{2})$/;

/** Date format regex for parsing YYYY-MM-DD. */
export const DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Compact date format regex for parsing YYYYMMDD. */
export const DATE_COMPACT_REGEX = /^(\d{4})(\d{2})(\d{2})$/;
