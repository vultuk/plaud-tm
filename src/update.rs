use crate::cli::UpdateArgs;
use crate::constants::{DATE_FORMAT_COMPACT, DAY_FORMAT, MAX_FILE_SIZE, MONTH_FORMAT, YEAR_FORMAT};
use crate::transcript::{TranscriptError, TranscriptProcessor};
use chrono::{NaiveDate, NaiveDateTime, NaiveTime, Timelike};
use std::env;
use std::fs;
use std::io::Write;
#[cfg(test)]
use std::path::Path;
use std::path::PathBuf;
use tempfile::NamedTempFile;

#[derive(Debug, Clone)]
pub struct UpdateRequest {
    pub input_file: PathBuf,
    pub output_dir: PathBuf,
    pub flatten_output: bool,
    pub start_time: NaiveTime,
    pub date: NaiveDate,
}

impl From<UpdateArgs> for UpdateRequest {
    fn from(args: UpdateArgs) -> Self {
        UpdateRequest {
            input_file: args.file,
            output_dir: args.output_dir.unwrap_or_default(),
            flatten_output: args.flat,
            start_time: args.time,
            date: args.date,
        }
    }
}

#[derive(Debug)]
pub struct UpdateOutcome {
    pub output_path: PathBuf,
    /// Warning: timestamps in the input were not in chronological order
    pub has_out_of_order_timestamps: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum UpdateError {
    #[error("Transcript update failed: {0}")]
    Transcript(#[from] TranscriptError),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("File too large: {0} bytes exceeds maximum of {1} bytes")]
    FileTooLarge(u64, u64),
}

/// Execute the update operation on a transcript file.
pub fn execute(request: &UpdateRequest) -> Result<UpdateOutcome, UpdateError> {
    // Check file size before reading to prevent OOM
    let metadata = fs::metadata(&request.input_file)?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(UpdateError::FileTooLarge(metadata.len(), MAX_FILE_SIZE));
    }

    let contents = fs::read_to_string(&request.input_file)?;
    let transcript = TranscriptProcessor::adjust(&contents, request.start_time, request.date)?;
    let output_path = resolve_output_path(
        request,
        transcript.first_timestamp,
        transcript.last_timestamp,
    )?;
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)?;
    }

    // Atomic write: write to temp file then rename
    atomic_write(&output_path, transcript.body.as_bytes())?;
    Ok(UpdateOutcome {
        output_path,
        has_out_of_order_timestamps: transcript.has_out_of_order_timestamps,
    })
}

/// Write content atomically by writing to a temp file and renaming.
/// This prevents partial writes on crash.
fn atomic_write(path: &std::path::Path, content: &[u8]) -> std::io::Result<()> {
    let parent = path.parent().unwrap_or(std::path::Path::new("."));
    let mut temp = NamedTempFile::new_in(parent)?;
    temp.write_all(content)?;
    temp.flush()?;
    temp.persist(path).map_err(|e| e.error)?;
    Ok(())
}

fn resolve_output_path(
    request: &UpdateRequest,
    first: NaiveDateTime,
    last: NaiveDateTime,
) -> Result<PathBuf, UpdateError> {
    // Use the actual date from the last timestamp (handles midnight overflow)
    let effective_date = last.date();

    if request.flatten_output {
        let filename = format!(
            "{}_{:02}{:02}{:02}_{:02}{:02}{:02}.txt",
            effective_date.format(DATE_FORMAT_COMPACT),
            first.time().hour(),
            first.time().minute(),
            first.time().second(),
            last.time().hour(),
            last.time().minute(),
            last.time().second()
        );
        Ok(env::current_dir()?.join(filename))
    } else {
        let filename = format!(
            "{:02}{:02}{:02}-{:02}{:02}{:02}.txt",
            first.time().hour(),
            first.time().minute(),
            first.time().second(),
            last.time().hour(),
            last.time().minute(),
            last.time().second()
        );
        let date_dir = PathBuf::from(effective_date.format(YEAR_FORMAT).to_string())
            .join(effective_date.format(MONTH_FORMAT).to_string())
            .join(effective_date.format(DAY_FORMAT).to_string());
        Ok(request.output_dir.join(date_dir).join(filename))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_request(flatten: bool) -> UpdateRequest {
        UpdateRequest {
            input_file: PathBuf::from("input.txt"),
            output_dir: PathBuf::from("output"),
            flatten_output: flatten,
            start_time: NaiveTime::from_hms_opt(18, 1, 12).unwrap(),
            date: NaiveDate::from_ymd_opt(2024, 12, 25).unwrap(),
        }
    }

    fn make_datetime(date: NaiveDate, h: u32, m: u32, s: u32) -> NaiveDateTime {
        date.and_hms_opt(h, m, s).unwrap()
    }

    #[test]
    fn builds_nested_output_path() {
        let request = sample_request(false);
        let date = NaiveDate::from_ymd_opt(2024, 12, 25).unwrap();
        let first = make_datetime(date, 18, 1, 13);
        let last = make_datetime(date, 18, 37, 36);
        let path = resolve_output_path(&request, first, last).unwrap();
        assert_eq!(path, Path::new("output/2024/12/25/180113-183736.txt"));
    }

    #[test]
    fn builds_flat_output_path() {
        let request = sample_request(true);
        let date = NaiveDate::from_ymd_opt(2024, 12, 25).unwrap();
        let first = make_datetime(date, 18, 1, 13);
        let last = make_datetime(date, 18, 37, 36);
        let path = resolve_output_path(&request, first, last).unwrap();
        // path begins with cwd - ignore, ensure file name correct
        assert!(
            path.ends_with(Path::new("20241225_180113_183736.txt")),
            "path {:?} did not end with expected filename",
            path
        );
    }

    #[test]
    fn handles_midnight_overflow_in_path() {
        let request = sample_request(false);
        let date = NaiveDate::from_ymd_opt(2024, 12, 25).unwrap();
        let next_day = NaiveDate::from_ymd_opt(2024, 12, 26).unwrap();
        let first = make_datetime(date, 23, 30, 0);
        let last = make_datetime(next_day, 0, 30, 0);
        let path = resolve_output_path(&request, first, last).unwrap();
        // Should use the date from the last timestamp (Dec 26)
        assert_eq!(path, Path::new("output/2024/12/26/233000-003000.txt"));
    }
}
