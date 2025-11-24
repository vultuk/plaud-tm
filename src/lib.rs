pub mod cli;
pub mod merge;
pub mod transcript;
pub mod update;

use clap::Parser;
use cli::{Cli, Commands};
use merge::{MergeRequest, MergeService};
use update::{UpdateRequest, UpdateService};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Update(#[from] update::UpdateError),
    #[error("{0}")]
    Merge(#[from] merge::MergeError),
}

pub fn run() -> Result<(), AppError> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Update(args) => {
            let request = UpdateRequest::from(args);
            let outcome = UpdateService.execute(&request)?;
            println!("Wrote {}", outcome.output_path.display());
            Ok(())
        }
        Commands::Merge(args) => {
            let request = MergeRequest::from(args);
            let outcome = MergeService.execute(&request)?;
            for file in &outcome.files {
                println!("{}", file.display());
            }
            println!("Merged into {}", outcome.output_path.display());
            Ok(())
        }
    }
}
