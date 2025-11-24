use crate::cli::UpdateArgs;
use crate::transcript::{TranscriptError, TranscriptProcessor};
use chrono::{NaiveDate, NaiveTime, Timelike};
use std::env;
use std::fs;
#[cfg(test)]
use std::path::Path;
use std::path::PathBuf;

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
}

#[derive(Debug, thiserror::Error)]
pub enum UpdateError {
    #[error("Transcript update failed: {0}")]
    Transcript(#[from] TranscriptError),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Default)]
pub struct UpdateService;

impl UpdateService {
    pub fn execute(&self, request: &UpdateRequest) -> Result<UpdateOutcome, UpdateError> {
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
        fs::write(&output_path, transcript.body)?;
        Ok(UpdateOutcome { output_path })
    }
}

fn resolve_output_path(
    request: &UpdateRequest,
    first: NaiveTime,
    last: NaiveTime,
) -> Result<PathBuf, UpdateError> {
    if request.flatten_output {
        let filename = format!(
            "{}_{:02}{:02}{:02}_{:02}{:02}{:02}.txt",
            request.date.format("%Y%m%d"),
            first.hour(),
            first.minute(),
            first.second(),
            last.hour(),
            last.minute(),
            last.second()
        );
        Ok(env::current_dir()?.join(filename))
    } else {
        let filename = format!(
            "{:02}{:02}{:02}-{:02}{:02}{:02}.txt",
            first.hour(),
            first.minute(),
            first.second(),
            last.hour(),
            last.minute(),
            last.second()
        );
        let date_dir = PathBuf::from(request.date.format("%Y").to_string())
            .join(request.date.format("%m").to_string())
            .join(request.date.format("%d").to_string());
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

    #[test]
    fn builds_nested_output_path() {
        let request = sample_request(false);
        let first = NaiveTime::from_hms_opt(18, 1, 13).unwrap();
        let last = NaiveTime::from_hms_opt(18, 37, 36).unwrap();
        let path = resolve_output_path(&request, first, last).unwrap();
        assert_eq!(path, Path::new("output/2024/12/25/180113-183736.txt"));
    }

    #[test]
    fn builds_flat_output_path() {
        let request = sample_request(true);
        let first = NaiveTime::from_hms_opt(18, 1, 13).unwrap();
        let last = NaiveTime::from_hms_opt(18, 37, 36).unwrap();
        let path = resolve_output_path(&request, first, last).unwrap();
        // path begins with cwd - ignore, ensure file name correct
        assert!(
            path.ends_with(Path::new("20241225_180113_183736.txt")),
            "path {:?} did not end with expected filename",
            path
        );
    }
}
