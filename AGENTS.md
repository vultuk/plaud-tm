# AGENT HANDBOOK

This project is a TypeScript CLI that rewrites timestamped transcripts. Agentic
collaborators should use this guide to quickly understand structure, coding
standards, and operational routines.

---

## 1. Command Interface

Run the CLI via npm/npx. The key subcommands are `update` and `merge`.

```bash
# Install globally
npm install -g plaud-tm

# Or run directly with npx
npx plaud-tm update test.txt --time 18:01:12 --date 2024-12-25

# Default nested output
plaud-tm update test.txt --time 18:01:12 --date 2024-12-25

# Flat output in the current directory
plaud-tm update test.txt --time 18:01:12 --date 2024-12-25 --flat

# Custom root output directory
plaud-tm update test.txt --time 18:01:12 --date 2024-12-25 --output-dir logs

# Merge segments (explicit list)
plaud-tm merge 2025/01/27/061901-111901.txt 2025/01/27/112256-162256.txt

# Merge segments (glob expansion handled inside the CLI)
plaud-tm merge "2025/01/27/*"

# Merge segments into a user-selected file and keep originals
plaud-tm merge "2025/01/27/*" --output merged.txt --no-delete
```

`update` argument semantics:

| Flag                | Required | Description                                                          |
|---------------------|----------|----------------------------------------------------------------------|
| `FILE` (positional) | Yes      | Transcript with `HH:MM:SS <text>` lines.                             |
| `--time`            | Yes      | Start time (`HH:MM:SS`) that anchors relative offsets.               |
| `--date`            | Yes      | Effective date (`YYYY-MM-DD`), used in the output file name.         |
| `--output-dir`      | No       | Root folder for nested output. Defaults to current directory.        |
| `--flat`            | No       | When set, emit `YYYYMMDD_HHMMSS_*.txt` in current working directory. |

Output naming:

- **Nested (default)**: `YYYY/MM/DD/HHMMSS-HHMMSS.txt` (relative to the current directory).
- **Flat**: `YYYYMMDD_HHMMSS_HHMMSS.txt`

Use `--output-dir <DIR>` on `update` if you want to nest outputs under a prefix (e.g. `output/`).
Each run prints `Wrote <path>` to allow other tools to find the artifact.

`merge` accepts one or more file paths or glob patterns. The CLI expands patterns
internally (no shell required), prints the matched files in chronological order,
and writes the combined transcript to disk:

- Nested layout inputs (`YYYY/MM/DD/*.txt`) produce `YYYY/MM/DD/YYYY-MM-DD.txt` and delete
  the source segments once the merge succeeds (omit deletion with `--no-delete`).
- Flat files (`YYYYMMDD_start_end.txt`) produce `YYYY-MM-DD.txt` beside the source files.
- Use `--output <path>` to override the inferred destination or when files don't
  share a single date.

---

## 2. Code Organization

```
src/
├── index.ts        # CLI entry point with shebang
├── cli.ts          # Commander.js definitions, parsing & validation
├── constants.ts    # Centralized configuration constants
├── merge.ts        # Merge command orchestration + glob expansion
├── transcript.ts   # Pure transcript transformation logic
└── update.ts       # Update command orchestration & filesystem interactions
tests/
├── cli.test.ts     # Integration tests for CLI
├── merge.test.ts   # Tests for merge command
├── transcript.test.ts  # Tests for transcript transformation
└── update.test.ts  # Tests for update command
```

### `cli.ts`
Defines CLI commands using Commander.js with custom validators for `Time` and `DateOnly` types.

### `transcript.ts`
`adjustTranscript()` is pure & deterministic:

1. Parse `HH:MM:SS` prefixes.
2. Shift by the base time/date.
3. Preserve non-timestamp lines and trailing newline presence.
4. Return `TranscriptUpdate { body, firstTimestamp, lastTimestamp, hasOutOfOrderTimestamps }`.

Errors surface as `NoTimestampsError`.

### `update.ts`
`executeUpdate()` wires IO to the pure logic:

- Reads the source file.
- Invokes `adjustTranscript()`.
- Chooses a filename via `resolveOutputPath()` based on `flattenOutput`.
- Writes the new transcript atomically and returns `UpdateOutcome`.

`UpdateRequest` can be constructed in tests or other tooling without touching the CLI.

### `merge.ts`
`executeMerge()` handles:

- Expanding file & glob patterns (using the `glob` package).
- Inferring chronological sort keys from filenames (supports nested, flat, and mixed layouts).
- Deduplicating overlaps and writing the merged transcript to disk using either
  the inferred date-specific location or an explicit `--output`.

It returns the ordered list and the final output path so the CLI can report both.

### `index.ts`
Entry point that parses CLI arguments, dispatches to the appropriate command handler, and prints results.

---

## 3. Development Workflow

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Build**
   ```bash
   npm run build
   ```

3. **Run tests**
   ```bash
   npm test
   ```
   - Unit tests and integration tests are in `tests/` using Vitest.
   - Run with coverage: `npm run test:coverage`

4. **Run the CLI locally**
   ```bash
   node dist/index.js update test.txt --time 18:01:12 --date 2024-12-25
   ```

5. **Adding features**
   - Touch CLI args in `cli.ts`.
   - Extend `UpdateRequest`/`executeUpdate()` for new behaviours.
   - Keep transcript adjustments pure; add unit tests for edge cases.
   - Update tests when observable CLI behaviour changes.

6. **Error handling**
   - Use custom error classes extending `Error`.
   - Surface recoverable issues as user-friendly messages (e.g., parse failures, IO).

7. **File IO**
   - Always respect `outputDir`/`--flat` semantics.
   - Create directories proactively (`fs.mkdirSync` with `recursive: true`).
   - Use atomic writes (temp file + rename) to prevent corruption.
   - Preserve newline endings in transformed transcripts.

---

## 4. Testing Strategy

| Layer       | Location                 | Purpose                                     |
|-------------|--------------------------|---------------------------------------------|
| Unit        | `tests/transcript.test.ts` | Parse & shift timestamps, newline handling.|
| Unit        | `tests/update.test.ts`    | Output-path decisions (flat vs nested).    |
| Unit        | `tests/merge.test.ts`     | Pattern expansion & chronological ordering.|
| Integration | `tests/cli.test.ts`       | CLI argument parsing, file IO, output names.|

Agents should add regression tests when modifying parsing, time handling, or IO.

---

## 5. Extension Tips

- Need more commands? Add new command definitions in `cli.ts` and handlers in `index.ts`.
- Want pluggable IO? Introduce interfaces so services can be mocked in tests.
- Large transcripts? Consider streaming transforms (future work).

Keep the codebase clean by:

- Isolating pure logic (`transcript.ts`) from side effects (`update.ts`).
- Passing dependencies via parameters instead of global state.
- Reusing helper functions instead of duplicating logic.

---

## 6. Quick Reference

| Action                    | Command                                           |
|--------------------------|---------------------------------------------------|
| Install dependencies     | `npm install`                                     |
| Build                    | `npm run build`                                   |
| Run tests                | `npm test`                                        |
| Run with coverage        | `npm run test:coverage`                           |
| Execute CLI              | `node dist/index.js update …`                     |
| Execute via npx          | `npx plaud-tm update …`                           |
| Flat output              | `plaud-tm update … --flat`                        |
| Custom output directory  | `plaud-tm update … --output-dir logs`             |
| Merge transcripts        | `plaud-tm merge "YYYY/MM/DD/*"`                   |
| Force merge destination  | `plaud-tm merge … --output merged.txt`            |
| Preserve source segments | `plaud-tm merge … --no-delete`                    |

This handbook should make it trivial for autonomous agents to navigate, extend,
and test the Plaud Timestamp CLI. Keep it updated as the system evolves.
