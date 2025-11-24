use crate::constants::TIME_FORMAT;
use chrono::{NaiveDate, NaiveTime};
use clap::{value_parser, Args, Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Update timestamps in a file and emit an adjusted transcript.
    Update(UpdateArgs),
    /// Merge multiple transcript segments in chronological order.
    Merge(MergeArgs),
}

#[derive(Args, Debug)]
pub struct UpdateArgs {
    /// File whose timestamps will be adjusted.
    #[arg(value_name = "FILE")]
    pub file: PathBuf,

    /// Optional prefix directory where updated output should be written.
    #[arg(long = "output-dir", value_name = "DIR")]
    pub output_dir: Option<PathBuf>,

    /// When set, write output in flat mode (no subdirectories) to the current working directory.
    #[arg(long)]
    pub flat: bool,

    /// Timestamp that will eventually adjust file entries.
    #[arg(long, value_parser = parse_hms)]
    pub time: NaiveTime,

    /// Calendar date associated with the update (YYYY-MM-DD).
    #[arg(long, value_parser = value_parser!(NaiveDate))]
    pub date: NaiveDate,
}

#[derive(Args, Debug)]
pub struct MergeArgs {
    /// One or more files or glob patterns to merge, e.g. 2025/01/27/*.
    #[arg(required = true, value_name = "PATTERN")]
    pub patterns: Vec<String>,

    /// Optional explicit output file to override the inferred location.
    #[arg(long, value_name = "FILE")]
    pub output: Option<PathBuf>,

    /// Preserve the original segments instead of deleting them after merging.
    #[arg(long = "no-delete")]
    pub no_delete: bool,
}

fn parse_hms(value: &str) -> Result<NaiveTime, String> {
    NaiveTime::parse_from_str(value, TIME_FORMAT)
        .map_err(|_| format!("Invalid time '{value}'. Use HH:MM:SS (e.g. 18:06:13)."))
}
