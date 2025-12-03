# plaud-tm (Plaud Timestamp Manager)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-ff69b4.svg)](https://bun.sh/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A command-line utility for managing and processing timestamped Plaud transcript files. Built with TypeScript and Bun for blazing-fast performance.

## Features

- **Update timestamps**: Adjust timestamps in transcript files based on a start time and date
- **Merge transcripts**: Combine multiple transcript segments in chronological order
- **Two output formats**: Nested directory structure (`YYYY/MM/DD/HHMMSS-HHMMSS.txt`) or flat format (`YYYYMMDD_HHMMSS_HHMMSS.txt`)
- **Smart file handling**: Atomic writes, file size limits, and out-of-order timestamp detection
- **Rich CLI UI**: Built with Ink for a modern command-line experience

## Installation

### Global Installation (Recommended)

```bash
bun install -g plaud-tm
```

Or with npm:

```bash
npm install -g plaud-tm
```

### Local Development

```bash
git clone <repository-url>
cd plaud-tm
bun install
bun run build
bun link
```

## Usage

### Update Command

Adjusts timestamps in a transcript file and creates an adjusted output file.

```bash
plaud-tm update <file> --time <HH:MM:SS> --date <YYYY-MM-DD> [options]
```

**Required Options:**
- `--time <time>`: Start time in HH:MM:SS format (e.g., `18:06:13`)
- `--date <date>`: Start date in YYYY-MM-DD format (e.g., `2024-03-15`)

**Optional Options:**
- `--output-dir <dir>`: Output directory prefix (default: current directory)
- `--flat`: Use flat format output instead of nested directories

**Examples:**

```bash
# Basic usage with nested output
plaud-tm update transcript.txt --time 18:06:13 --date 2024-03-15

# Output to specific directory
plaud-tm update transcript.txt --time 18:06:13 --date 2024-03-15 --output-dir /path/to/output

# Use flat format in current directory
plaud-tm update transcript.txt --time 18:06:13 --date 2024-03-15 --flat
```

**Output Formats:**
- **Nested** (default): `output-dir/2024/03/15/180613-181530.txt`
- **Flat**: `20240315_180613_181530.txt` (in current directory)

### Merge Command

Combines multiple transcript segments in chronological order.

```bash
plaud-tm merge <patterns...> [options]
```

**Required Arguments:**
- `<patterns...>`: One or more file paths or glob patterns

**Optional Options:**
- `--output <file>`: Explicit output file path
- `--no-delete`: Keep source files after merging (default: delete sources)

**Examples:**

```bash
# Merge all files in a directory
plaud-tm merge "2024/03/15/*.txt"

# Merge specific files with explicit output
plaud-tm merge file1.txt file2.txt --output merged.txt

# Merge without deleting source files
plaud-tm merge "2024/03/15/*.txt" --no-delete

# Merge multiple glob patterns
plaud-tm merge "2024/03/15/*.txt" "2024/03/16/*.txt"
```

**Output Determination:**
- If `--output` is specified, uses that path
- If all files share a common nested directory, outputs to `YYYY-MM-DD.txt` in that directory
- If all files have the same date in flat format, outputs to `YYYY-MM-DD.txt` in the parent directory
- Otherwise, requires explicit `--output` flag

## File Formats

### Transcript Format

Transcript files should have timestamps in `HH:MM:SS` format at the beginning of lines:

```
00:00:01 Speaker A: Hello
00:00:05 Speaker B: Hi there
Non-timestamped lines are preserved as-is
00:00:10 Speaker A: Goodbye
```

### Filename Formats

**Nested Format:** `HHMMSS-HHMMSS.txt` in `YYYY/MM/DD/` directory structure
- Example: `2024/03/15/180613-181530.txt`

**Flat Format:** `YYYYMMDD_HHMMSS_HHMMSS.txt`
- Example: `20240315_180613_181530.txt`

## Features & Safety

- **Atomic Writes**: Files are written atomically to prevent corruption on crashes
- **File Size Limits**: 10MB maximum file size to prevent out-of-memory errors
- **Out-of-Order Detection**: Warns when timestamps are not in chronological order
- **Midnight Overflow**: Correctly handles transcripts that span past midnight
- **Self-Deletion Protection**: Merge operation prevents accidental deletion of output file

## Development

### Build

```bash
bun run build
```

### Run in Development Mode

```bash
bun run dev -- <command> [args]
```

### Type Checking

```bash
bun run typecheck
```

### Run Tests

```bash
bun test
```

## Technology Stack

- **TypeScript**: Type-safe implementation
- **Bun**: Fast JavaScript runtime and package manager
- **Ink**: React for CLIs - rich interactive terminal UIs
- **date-fns**: Date/time manipulation
- **meow**: CLI argument parsing
- **glob**: File pattern matching
- **Bun Test**: Native Bun test runner

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
