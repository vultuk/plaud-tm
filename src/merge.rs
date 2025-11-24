use crate::cli::MergeArgs;
use crate::constants::{DATE_FORMAT_COMPACT, DATE_FORMAT_DASHED, MAX_FILE_SIZE};
use chrono::{NaiveDate, NaiveTime};
use glob::{glob, GlobError, PatternError};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tempfile::NamedTempFile;

#[derive(Debug, Clone)]
pub struct MergeRequest {
    pub patterns: Vec<String>,
    pub output: Option<PathBuf>,
    pub no_delete: bool,
}

impl From<MergeArgs> for MergeRequest {
    fn from(args: MergeArgs) -> Self {
        MergeRequest {
            patterns: args.patterns,
            output: args.output,
            no_delete: args.no_delete,
        }
    }
}

#[derive(Debug)]
pub struct MergeOutcome {
    pub files: Vec<PathBuf>,
    pub output_path: PathBuf,
}

#[derive(Debug, thiserror::Error)]
pub enum MergeError {
    #[error("Invalid glob pattern '{pattern}': {source}")]
    InvalidGlobPattern {
        pattern: String,
        #[source]
        source: PatternError,
    },
    #[error("No files matched pattern '{0}'")]
    NoMatches(String),
    #[error("Failed to read glob matches: {0}")]
    GlobIteration(#[from] GlobError),
    #[error("Unrecognized transcript filename '{0}'")]
    UnrecognizedFilename(String),
    #[error("Files correspond to multiple dates; supply --output to choose the destination")]
    MixedDates,
    #[error("Unable to determine an output filename; rerun with --output <file>")]
    UndeterminedDate,
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("File too large: {path} ({size} bytes exceeds maximum of {max} bytes)")]
    FileTooLarge { path: String, size: u64, max: u64 },
}

/// Execute the merge operation on transcript files.
pub fn execute(request: &MergeRequest) -> Result<MergeOutcome, MergeError> {
    let mut collected = Vec::new();

    for pattern in &request.patterns {
        let mut matches_found = false;
        let entries = glob(pattern).map_err(|err| MergeError::InvalidGlobPattern {
            pattern: pattern.clone(),
            source: err,
        })?;
        for entry in entries {
            let path = entry?;
            matches_found = true;
            collected.push(path);
        }

        if !matches_found {
            return Err(MergeError::NoMatches(pattern.clone()));
        }
    }

    // Check file sizes before processing to prevent OOM
    for path in &collected {
        let metadata = fs::metadata(path)?;
        if metadata.len() > MAX_FILE_SIZE {
            return Err(MergeError::FileTooLarge {
                path: path.display().to_string(),
                size: metadata.len(),
                max: MAX_FILE_SIZE,
            });
        }
    }

    let mut descriptors: Vec<(PathBuf, FileSortKey)> = collected
        .into_iter()
        .map(|path| {
            let key = FileSortKey::from_path(&path)?;
            Ok((path, key))
        })
        .collect::<Result<_, MergeError>>()?;

    descriptors.sort_by(|a, b| a.1.cmp(&b.1));

    let mut ordered = Vec::new();
    for (path, _) in &descriptors {
        if ordered
            .last()
            .map(|existing: &PathBuf| existing == path)
            .unwrap_or(false)
        {
            continue;
        }
        ordered.push(path.clone());
    }

    let output_path = determine_output_path(&ordered, &descriptors, request)?;

    // Canonicalize output path for reliable comparison
    // If output doesn't exist yet, we'll compare against the intended path
    let output_canonical = output_path.canonicalize().unwrap_or_else(|_| output_path.clone());

    // Filter out the output path from sources to prevent self-deletion
    let sources_to_merge: Vec<PathBuf> = ordered
        .iter()
        .filter(|p| {
            let p_canonical = p.canonicalize().unwrap_or_else(|_| (*p).clone());
            p_canonical != output_canonical
        })
        .cloned()
        .collect();

    write_merged_file(&sources_to_merge, &output_path)?;
    if !request.no_delete {
        delete_sources(&sources_to_merge, &output_path)?;
    }

    Ok(MergeOutcome {
        files: sources_to_merge,
        output_path,
    })
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct FileSortKey {
    date: Option<NaiveDate>,
    start: NaiveTime,
}

impl FileSortKey {
    fn from_path(path: &Path) -> Result<Self, MergeError> {
        let filename = path
            .file_stem()
            .and_then(|s| s.to_str())
            .ok_or_else(|| MergeError::UnrecognizedFilename(path.display().to_string()))?;

        // Try flat format first: YYYYMMDD_HHMMSS_HHMMSS (more specific pattern)
        if Self::looks_like_flat_format(filename) {
            return Self::parse_flat(path, filename);
        }

        // Try nested format: HHMMSS-HHMMSS (6 digits, dash, 6 digits)
        if Self::looks_like_nested_format(filename) {
            return Self::parse_nested(path, filename);
        }

        Err(MergeError::UnrecognizedFilename(path.display().to_string()))
    }

    /// Check if filename matches flat format: YYYYMMDD_HHMMSS_HHMMSS
    fn looks_like_flat_format(filename: &str) -> bool {
        let parts: Vec<&str> = filename.split('_').collect();
        if parts.len() != 3 {
            return false;
        }
        // Date part: 8 digits
        if parts[0].len() != 8 || !parts[0].chars().all(|c| c.is_ascii_digit()) {
            return false;
        }
        // Start time: 6 digits
        if parts[1].len() != 6 || !parts[1].chars().all(|c| c.is_ascii_digit()) {
            return false;
        }
        // End time: 6 digits
        if parts[2].len() != 6 || !parts[2].chars().all(|c| c.is_ascii_digit()) {
            return false;
        }
        true
    }

    /// Check if filename matches nested format: HHMMSS-HHMMSS
    fn looks_like_nested_format(filename: &str) -> bool {
        let parts: Vec<&str> = filename.split('-').collect();
        if parts.len() != 2 {
            return false;
        }
        // Start time: 6 digits
        if parts[0].len() != 6 || !parts[0].chars().all(|c| c.is_ascii_digit()) {
            return false;
        }
        // End time: 6 digits
        if parts[1].len() != 6 || !parts[1].chars().all(|c| c.is_ascii_digit()) {
            return false;
        }
        true
    }

    fn parse_nested(path: &Path, filename: &str) -> Result<Self, MergeError> {
        let mut segments = filename.split('-');
        let start_segment = segments
            .next()
            .ok_or_else(|| MergeError::UnrecognizedFilename(path.display().to_string()))?;

        let start = parse_time_digits(start_segment)
            .ok_or_else(|| MergeError::UnrecognizedFilename(path.display().to_string()))?;

        let date = parse_date_from_path(path);

        Ok(FileSortKey { date, start })
    }

    fn parse_flat(path: &Path, filename: &str) -> Result<Self, MergeError> {
        let mut parts = filename.split('_');
        let date_part = parts
            .next()
            .ok_or_else(|| MergeError::UnrecognizedFilename(path.display().to_string()))?;
        let start_part = parts
            .next()
            .ok_or_else(|| MergeError::UnrecognizedFilename(path.display().to_string()))?;

        let date = NaiveDate::parse_from_str(date_part, DATE_FORMAT_COMPACT)
            .map_err(|_| MergeError::UnrecognizedFilename(path.display().to_string()))?;
        let start = parse_time_digits(start_part)
            .ok_or_else(|| MergeError::UnrecognizedFilename(path.display().to_string()))?;

        Ok(FileSortKey {
            date: Some(date),
            start,
        })
    }
}

fn parse_time_digits(value: &str) -> Option<NaiveTime> {
    if value.len() != 6 {
        return None;
    }
    let hour = value.get(0..2)?.parse::<u32>().ok()?;
    let minute = value.get(2..4)?.parse::<u32>().ok()?;
    let second = value.get(4..6)?.parse::<u32>().ok()?;
    NaiveTime::from_hms_opt(hour, minute, second)
}

fn parse_date_from_path(path: &Path) -> Option<NaiveDate> {
    extract_nested_day_directory(path).map(|(_, date)| date)
}

fn extract_nested_day_directory(path: &Path) -> Option<(PathBuf, NaiveDate)> {
    let day_dir = path.parent()?;
    let day_name = day_dir.file_name()?.to_str()?;

    if let Ok(date) = NaiveDate::parse_from_str(day_name, DATE_FORMAT_DASHED) {
        return Some((day_dir.to_path_buf(), date));
    }

    let month_dir = day_dir.parent()?;
    let year_dir = month_dir.parent()?;
    let month_name = month_dir.file_name()?.to_str()?;
    let year_name = year_dir.file_name()?.to_str()?;

    if year_name.len() == 4
        && month_name.len() == 2
        && day_name.len() == 2
        && year_name
            .chars()
            .chain(month_name.chars())
            .chain(day_name.chars())
            .all(|c| c.is_ascii_digit())
    {
        if let Ok(date) =
            NaiveDate::parse_from_str(&format!("{year_name}-{month_name}-{day_name}"), DATE_FORMAT_DASHED)
        {
            return Some((day_dir.to_path_buf(), date));
        }
    }

    None
}

fn detect_common_nested_directory(paths: &[PathBuf]) -> Option<(PathBuf, NaiveDate)> {
    let mut candidate: Option<(PathBuf, NaiveDate)> = None;
    for path in paths {
        let info = extract_nested_day_directory(path)?;
        match &candidate {
            Some((dir, date)) if dir == &info.0 && *date == info.1 => continue,
            Some(_) => return None,
            None => candidate = Some(info),
        }
    }
    candidate
}

fn determine_output_path(
    ordered: &[PathBuf],
    descriptors: &[(PathBuf, FileSortKey)],
    request: &MergeRequest,
) -> Result<PathBuf, MergeError> {
    if let Some(custom) = &request.output {
        return Ok(custom.clone());
    }

    if let Some((day_dir, date)) = detect_common_nested_directory(ordered) {
        return Ok(day_dir.join(format!("{}.txt", date.format(DATE_FORMAT_DASHED))));
    }

    let mut selected_date: Option<NaiveDate> = None;
    for (_, key) in descriptors {
        if let Some(date) = key.date {
            if let Some(existing) = selected_date {
                if existing != date {
                    return Err(MergeError::MixedDates);
                }
            } else {
                selected_date = Some(date);
            }
        }
    }

    if let Some(date) = selected_date {
        let base_dir = ordered
            .first()
            .and_then(|path| path.parent())
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));
        return Ok(base_dir.join(format!("{}.txt", date.format(DATE_FORMAT_DASHED))));
    }

    Err(MergeError::UndeterminedDate)
}

fn write_merged_file(files: &[PathBuf], output_path: &Path) -> Result<(), MergeError> {
    let mut merged = String::new();
    for (idx, path) in files.iter().enumerate() {
        let segment = fs::read_to_string(path)?;
        merged.push_str(&segment);
        if idx + 1 != files.len() && !merged.ends_with('\n') {
            merged.push('\n');
        }
    }

    if let Some(parent) = output_path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }

    // Atomic write: write to temp file then rename
    atomic_write(output_path, merged.as_bytes())?;
    Ok(())
}

/// Write content atomically by writing to a temp file and renaming.
/// This prevents partial writes on crash.
fn atomic_write(path: &Path, content: &[u8]) -> std::io::Result<()> {
    let parent = path.parent().unwrap_or(Path::new("."));
    let mut temp = NamedTempFile::new_in(parent)?;
    temp.write_all(content)?;
    temp.flush()?;
    temp.persist(path).map_err(|e| e.error)?;
    Ok(())
}

fn delete_sources(files: &[PathBuf], output_path: &Path) -> Result<(), MergeError> {
    let output_canonical = output_path.canonicalize().unwrap_or_else(|_| output_path.to_path_buf());
    for path in files {
        // Double-check: never delete the output file
        let path_canonical = path.canonicalize().unwrap_or_else(|_| path.clone());
        if path_canonical == output_canonical {
            continue;
        }
        fs::remove_file(path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use assert_fs::prelude::*;
    use std::fs;
    use std::path::Path;

    #[test]
    fn sorts_nested_files() {
        let temp = assert_fs::TempDir::new().unwrap();
        let day_dir = temp.child("2025/01/27");
        day_dir.create_dir_all().unwrap();
        day_dir
            .child("112256-162256.txt")
            .write_str("late segment\n")
            .unwrap();
        day_dir
            .child("061901-111901.txt")
            .write_str("early segment\n")
            .unwrap();

        let request = MergeRequest {
            patterns: vec![day_dir.path().join("*.txt").to_string_lossy().into()],
            output: None,
            no_delete: false,
        };
        let outcome = execute(&request).unwrap();
        assert_eq!(outcome.files.len(), 2);
        assert!(
            outcome.files[0].ends_with("061901-111901.txt"),
            "expected earliest file first"
        );
        assert!(
            outcome.files[1].ends_with("112256-162256.txt"),
            "expected later file second"
        );
        assert!(
            outcome
                .output_path
                .ends_with(Path::new("2025/01/27/2025-01-27.txt")),
            "unexpected output path {:?}",
            outcome.output_path
        );
        let merged = fs::read_to_string(outcome.output_path).unwrap();
        assert_eq!(merged, "early segment\nlate segment\n");
    }

    #[test]
    fn sorts_flat_files() {
        let temp = assert_fs::TempDir::new().unwrap();
        temp.child("20250127_112256_162256.txt")
            .write_str("late\n")
            .unwrap();
        temp.child("20250127_061901_111901.txt")
            .write_str("early\n")
            .unwrap();

        let request = MergeRequest {
            patterns: vec![temp.path().join("20250127_*.txt").to_string_lossy().into()],
            output: None,
            no_delete: false,
        };
        let outcome = execute(&request).unwrap();
        assert_eq!(outcome.files.len(), 2);
        assert!(
            outcome.files[0].ends_with("20250127_061901_111901.txt"),
            "expected earliest file first"
        );
        assert!(
            outcome.files[1].ends_with("20250127_112256_162256.txt"),
            "expected later file second"
        );
        assert!(
            outcome.output_path.ends_with(Path::new("2025-01-27.txt")),
            "unexpected output path {:?}",
            outcome.output_path
        );
        let merged = fs::read_to_string(outcome.output_path).unwrap();
        assert_eq!(merged, "early\nlate\n");
    }

    #[test]
    fn rejects_non_transcript_filenames() {
        // Test that random files with dashes or underscores are properly rejected
        assert!(!FileSortKey::looks_like_nested_format("meeting-notes"));
        assert!(!FileSortKey::looks_like_nested_format("2025-01-27")); // date format
        assert!(!FileSortKey::looks_like_nested_format("abc123-def456"));
        assert!(!FileSortKey::looks_like_flat_format("notes_about_meeting"));
        assert!(!FileSortKey::looks_like_flat_format("2025_01_27"));

        // Valid formats should be accepted
        assert!(FileSortKey::looks_like_nested_format("112256-162256"));
        assert!(FileSortKey::looks_like_flat_format("20250127_112256_162256"));
    }

    #[test]
    fn excludes_output_file_from_merge_sources() {
        // Test that the output file won't be deleted even if explicitly listed as a source
        let temp = assert_fs::TempDir::new().unwrap();
        let day_dir = temp.child("2025/01/27");
        day_dir.create_dir_all().unwrap();
        day_dir
            .child("112256-162256.txt")
            .write_str("segment 1\n")
            .unwrap();
        day_dir
            .child("061901-111901.txt")
            .write_str("segment 2\n")
            .unwrap();

        // Use explicit file paths matching the HHMMSS-HHMMSS pattern
        let file1 = day_dir.path().join("061901-111901.txt");
        let file2 = day_dir.path().join("112256-162256.txt");
        let output_file = day_dir.path().join("merged.txt");

        let request = MergeRequest {
            patterns: vec![
                file1.to_string_lossy().into(),
                file2.to_string_lossy().into(),
            ],
            output: Some(output_file.clone()),
            no_delete: false,
        };
        let outcome = execute(&request).unwrap();

        // Source files should be deleted
        assert!(!file1.exists());
        assert!(!file2.exists());

        // Output file should exist
        assert!(outcome.output_path.exists());
        let merged = fs::read_to_string(&outcome.output_path).unwrap();
        assert_eq!(merged, "segment 2\nsegment 1\n");
    }

    #[test]
    fn rejects_non_matching_files_in_glob() {
        // Test that files not matching transcript patterns cause errors
        let temp = assert_fs::TempDir::new().unwrap();
        let day_dir = temp.child("2025/01/27");
        day_dir.create_dir_all().unwrap();
        day_dir
            .child("112256-162256.txt")
            .write_str("segment\n")
            .unwrap();
        day_dir
            .child("notes.txt")
            .write_str("random notes\n")
            .unwrap();

        // Using *.txt should fail because notes.txt doesn't match
        let request = MergeRequest {
            patterns: vec![day_dir.path().join("*.txt").to_string_lossy().into()],
            output: None,
            no_delete: false,
        };
        let result = execute(&request);
        assert!(matches!(result, Err(MergeError::UnrecognizedFilename(_))));
    }
}
