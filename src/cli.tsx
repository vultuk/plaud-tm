#!/usr/bin/env bun
/**
 * CLI entry point for plaud-tm using Ink.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import App from './components/App.js';

const cli = meow(
  `
  Usage
    $ plaud-tm <command> [options]

  Commands
    update <file>     Update timestamps in transcript
    merge <patterns>  Merge multiple transcripts

  Options for update:
    --time <time>     Start time (HH:MM:SS) [required]
    --date <date>     Start date (YYYY-MM-DD) [required]
    --output-dir <dir> Output directory prefix
    --flat            Use flat format

  Options for merge:
    --output <file>   Output file path
    --no-delete       Keep source files

  Examples
    $ plaud-tm update transcript.txt --time 18:06:13 --date 2024-03-15
    $ plaud-tm merge "2024/03/15/*.txt" --output merged.txt
`,
  {
    importMeta: import.meta,
    flags: {
      time: {
        type: 'string',
      },
      date: {
        type: 'string',
      },
      outputDir: {
        type: 'string',
      },
      flat: {
        type: 'boolean',
        default: false,
      },
      output: {
        type: 'string',
      },
      delete: {
        type: 'boolean',
        default: true,
      },
    },
  }
);

// Extract command and arguments
const command = cli.input[0];
const args = cli.input.slice(1);

render(<App command={command} args={args} flags={cli.flags} />);
