/**
 * CLI interface using Commander.js
 */

import { Command, InvalidArgumentError } from 'commander';
import { parseTime, type Time, type DateOnly } from './transcript.js';
import { DATE_REGEX } from './constants.js';

/** Parse and validate a time string in HH:MM:SS format. */
function parseTimeArg(value: string): Time {
  const time = parseTime(value);
  if (!time) {
    throw new InvalidArgumentError(`Invalid time '${value}'. Use HH:MM:SS (e.g. 18:06:13).`);
  }
  return time;
}

/** Parse and validate a date string in YYYY-MM-DD format. */
function parseDateArg(value: string): DateOnly {
  const match = DATE_REGEX.exec(value);
  if (!match) {
    throw new InvalidArgumentError(`Invalid date '${value}'. Use YYYY-MM-DD (e.g. 2024-12-25).`);
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  // Basic validation
  if (month < 1 || month > 12) {
    throw new InvalidArgumentError(`Invalid month in date '${value}'.`);
  }
  if (day < 1 || day > 31) {
    throw new InvalidArgumentError(`Invalid day in date '${value}'.`);
  }

  return { year, month, day };
}

/** Parsed arguments for the update command. */
export interface UpdateArgs {
  file: string;
  time: Time;
  date: DateOnly;
  outputDir?: string;
  flat: boolean;
}

/** Parsed arguments for the merge command. */
export interface MergeArgs {
  patterns: string[];
  output?: string;
  noDelete: boolean;
}

/** Create and configure the CLI program. */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('plaud-tm')
    .description('A CLI tool that rewrites timestamped transcripts by adjusting timestamps and merging multiple transcript segments in chronological order')
    .version('0.1.0');

  program
    .command('update')
    .description('Update timestamps in a file and emit an adjusted transcript')
    .argument('<file>', 'File whose timestamps will be adjusted')
    .requiredOption('--time <time>', 'Timestamp that will adjust file entries (HH:MM:SS)', parseTimeArg)
    .requiredOption('--date <date>', 'Calendar date associated with the update (YYYY-MM-DD)', parseDateArg)
    .option('--output-dir <dir>', 'Optional prefix directory where updated output should be written')
    .option('--flat', 'Write output in flat mode (no subdirectories) to the current working directory', false)
    .action((file: string, options: { time: Time; date: DateOnly; outputDir?: string; flat: boolean }) => {
      // Store parsed args for later retrieval
      program.updateArgs = {
        file,
        time: options.time,
        date: options.date,
        outputDir: options.outputDir,
        flat: options.flat,
      };
    });

  program
    .command('merge')
    .description('Merge multiple transcript segments in chronological order')
    .argument('<patterns...>', 'One or more files or glob patterns to merge')
    .option('--output <file>', 'Optional explicit output file to override the inferred location')
    .option('--no-delete', 'Preserve the original segments instead of deleting them after merging')
    .action((patterns: string[], options: { output?: string; delete: boolean }) => {
      // Store parsed args for later retrieval
      program.mergeArgs = {
        patterns,
        output: options.output,
        noDelete: !options.delete,
      };
    });

  return program;
}

// Extend Command type to include our custom properties
declare module 'commander' {
  interface Command {
    updateArgs?: UpdateArgs;
    mergeArgs?: MergeArgs;
  }
}
