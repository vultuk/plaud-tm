#!/usr/bin/env node
/**
 * Main entry point for the plaud-tm CLI.
 */

import { createProgram } from './cli.js';
import { executeUpdate, type UpdateRequest } from './update.js';
import { executeMerge, type MergeRequest } from './merge.js';
import { NoTimestampsError } from './transcript.js';

async function main(): Promise<void> {
  const program = createProgram();

  try {
    await program.parseAsync(process.argv);

    // Handle update command
    if (program.updateArgs) {
      const args = program.updateArgs;
      const request: UpdateRequest = {
        inputFile: args.file,
        outputDir: args.outputDir || '',
        flattenOutput: args.flat,
        startTime: args.time,
        date: args.date,
      };

      const outcome = executeUpdate(request);

      if (outcome.hasOutOfOrderTimestamps) {
        console.error('Warning: timestamps in input were not in chronological order');
      }
      console.log(`Wrote ${outcome.outputPath}`);
      return;
    }

    // Handle merge command
    if (program.mergeArgs) {
      const args = program.mergeArgs;
      const request: MergeRequest = {
        patterns: args.patterns,
        output: args.output,
        noDelete: args.noDelete,
      };

      const outcome = await executeMerge(request);

      for (const file of outcome.files) {
        console.log(file);
      }
      console.log(`Merged into ${outcome.outputPath}`);
      return;
    }

    // No command specified - show help
    if (process.argv.length <= 2) {
      program.help();
    }
  } catch (error) {
    if (error instanceof NoTimestampsError) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    console.error('Error: An unknown error occurred');
    process.exit(1);
  }
}

main();
