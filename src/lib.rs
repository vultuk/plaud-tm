pub mod cli;
pub mod merge;
pub mod transcript;
pub mod update;

use clap::Parser;
use cli::{Cli, Commands};
use merge::{MergeRequest, MergeService};
use update::{UpdateRequest, UpdateService};

#[derive(Debug)]
pub enum AppError {
    Update(update::UpdateError),
    Merge(merge::MergeError),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::Update(err) => write!(f, "{err}"),
            AppError::Merge(err) => write!(f, "{err}"),
        }
    }
}

impl std::error::Error for AppError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            AppError::Update(err) => Some(err),
            AppError::Merge(err) => Some(err),
        }
    }
}

pub fn run() -> Result<(), AppError> {
    let cli = Cli::parse();
    match cli.command {
        Some(Commands::Update(args)) => {
            let request = UpdateRequest::from(args);
            UpdateService
                .execute(&request)
                .map(|outcome| {
                    println!("Wrote {}", outcome.output_path.display());
                })
                .map_err(AppError::Update)
        }
        Some(Commands::Merge(args)) => {
            let request = MergeRequest::from(args);
            MergeService
                .execute(&request)
                .map(|outcome| {
                    for file in &outcome.files {
                        println!("{}", file.display());
                    }
                    println!("Merged into {}", outcome.output_path.display());
                })
                .map_err(AppError::Merge)
        }
        None => {
            match cli.name {
                Some(name) => println!("Hello, {}!", name),
                None => println!("Hello, world!"),
            }
            Ok(())
        }
    }
}
