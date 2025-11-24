//! Centralized constants for format strings and limits.

/// Maximum file size in bytes (10 MB) to prevent OOM on large files.
pub const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024;

/// Time format for parsing and display (HH:MM:SS).
pub const TIME_FORMAT: &str = "%H:%M:%S";

/// Date format for directory names (YYYY-MM-DD).
pub const DATE_FORMAT_DASHED: &str = "%Y-%m-%d";

/// Date format for flat filenames (YYYYMMDD).
pub const DATE_FORMAT_COMPACT: &str = "%Y%m%d";

/// Year format for nested directories.
pub const YEAR_FORMAT: &str = "%Y";

/// Month format for nested directories.
pub const MONTH_FORMAT: &str = "%m";

/// Day format for nested directories.
pub const DAY_FORMAT: &str = "%d";
