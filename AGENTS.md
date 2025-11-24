# AGENT HANDBOOK

This project is a Rust CLI that rewrites timestamped transcripts. Agentic
collaborators should use this guide to quickly understand structure, coding
standards, and operational routines.

---

## 1. Command Interface

Run the CLI via Cargo. The key subcommands are `update` and `merge`.

```bash
# Default nested output
cargo run -- update test.txt --time 18:01:12 --date 2024-12-25

# Flat output in the current directory
cargo run -- update test.txt --time 18:01:12 --date 2024-12-25 --flat

# Custom root output directory
cargo run -- update test.txt --time 18:01:12 --date 2024-12-25 --output-dir logs

# Merge segments (explicit list)
cargo run -- merge 2025/01/27/061901-111901.txt 2025/01/27/112256-162256.txt

# Merge segments (glob expansion handled inside the CLI)
cargo run -- merge 2025/01/27/*

# Merge segments into a user-selected file and keep originals
cargo run -- merge 2025/01/27/* --output merged.txt --no-delete
```

`update` argument semantics:

| Flag                | Required | Description                                                          |
|---------------------|----------|----------------------------------------------------------------------|
| `FILE` (positional) | Yes      | Transcript with `HH:MM:SS <text>` lines.                             |
| `--time`            | Yes      | Start time (`HH:MM:SS`) that anchors relative offsets.               |
| `--date`            | Yes      | Effective date (`YYYY-MM-DD`), used in the output file name.         |
| `--output-dir`      | No       | Root folder for nested output. Defaults to `output`.                 |
| `--flat`            | No       | When set, ignore `--output-dir` and emit `YYYYMMDD_HHMMSS_*.txt` beside the binary. |

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
├── main.rs         # Thin entry point calling plaud_timestamp::run()
├── lib.rs          # App orchestration and error mapping
├── cli.rs          # clap definitions, parsing & validation
├── merge.rs        # Merge command orchestration + glob expansion
├── transcript.rs   # Pure transcript transformation logic
└── update.rs       # Use-case orchestration & filesystem interactions
tests/
├── merge_cli.rs    # Integration test for `merge`
└── update_cli.rs   # Integration tests for `update`
```

### `cli.rs`
Defines `Cli`, `Commands`, and `UpdateArgs`. Uses clap validators to parse `NaiveDate`
and `NaiveTime`, enforcing input shape at the boundary.

### `transcript.rs`
`TranscriptProcessor::adjust()` is pure & deterministic:

1. Parse `HH:MM:SS` prefixes.
2. Shift by the base time/date.
3. Preserve non-timestamp lines and trailing newline presence.
4. Return `TranscriptUpdate { body, first_timestamp, last_timestamp }`.

Errors surface as `TranscriptError::NoTimestamps`.

### `update.rs`
`UpdateService` wires IO to the pure logic:

- Reads the source file.
- Invokes `TranscriptProcessor`.
- Chooses a filename via `resolve_output_path()` based on `flatten_output`.
- Writes the new transcript and returns `UpdateOutcome`.

`UpdateRequest` can be constructed in tests or other tooling without touching clap.

### `merge.rs`
`MergeService` handles:

- Expanding file & glob patterns (using the `glob` crate).
- Inferring chronological sort keys from filenames (supports nested, flat, and mixed layouts).
- Deduplicating overlaps and writing the merged transcript to disk using either
  the inferred date-specific location or an explicit `--output`.

It returns the ordered list and the final output path so the CLI can report both.

### `lib.rs`
Parses CLI arguments, dispatches to the update service, and prints the resulting path.
The library exposes `run()` so other binaries or tests can reuse the workflow.

---

## 3. Development Workflow

1. **Formatting & linting**  
   ```bash
   source "$HOME/.cargo/env"
   cargo fmt
   cargo clippy --all-targets --all-features
   ```

2. **Test suite**  
   ```bash
   cargo test
   ```
   - Unit tests live alongside source modules (e.g., `transcript.rs`, `update.rs`).
   - Integration tests live in `tests/` and leverage `assert_cmd` + `assert_fs`.

3. **Adding features**  
   - Touch CLI args in `cli.rs`.
   - Extend `UpdateRequest`/`UpdateService` for new behaviours.
   - Keep transcript adjustments pure; add unit tests for edge cases.
   - Update integration tests when observable CLI behaviour changes.

4. **Error handling**  
   - Use `thiserror` to enrich domain errors.
   - Surface recoverable issues as user-friendly messages (e.g., parse failures, IO).

5. **File IO**  
   - Always respect `output_dir`/`--flat` semantics.
   - Create directories proactively (`fs::create_dir_all`).
   - Preserve newline endings in transformed transcripts.

---

## 4. Testing Strategy

| Layer       | Location                | Purpose                                     |
|-------------|-------------------------|---------------------------------------------|
| Unit        | `src/transcript.rs`     | Parse & shift timestamps, newline handling. |
| Unit        | `src/update.rs`         | Output-path decisions (flat vs nested).     |
| Unit        | `src/merge.rs`          | Pattern expansion & chronological ordering. |
| Integration | `tests/update_cli.rs`   | CLI argument parsing, file IO, output names.|
| Integration | `tests/merge_cli.rs`    | CLI pattern expansion & ordering.           |

Agents should add regression tests when modifying parsing, time handling, or IO.

---

## 5. Extension Tips

- Need more commands? Add variants to `Commands` in `cli.rs` and match them in `run()`.
- Want pluggable IO? Introduce traits in `update.rs` so services can be mocked.
- Large transcripts? Consider streaming transforms or memory-mapped IO (future work).

Keep the codebase SOLID/DRY by:

- Isolating pure logic (`transcript.rs`) from side effects (`update.rs`).
- Passing dependencies via structs instead of global state.
- Reusing helper functions (e.g., `resolve_output_path`) instead of duplicating logic.

---

## 6. Quick Reference

| Action                    | Command                                      |
|--------------------------|----------------------------------------------|
| Format code              | `cargo fmt`                                  |
| Run unit + integration   | `cargo test`                                 |
| Execute CLI              | `cargo run -- update …`                      |
| Flat output              | `cargo run -- update … --flat`               |
| Custom output directory  | `cargo run -- update … --output-dir logs`    |
| Merge transcripts        | `cargo run -- merge YYYY/MM/DD/*`            |
| Force merge destination  | `cargo run -- merge … --output merged.txt`   |
| Preserve source segments | `cargo run -- merge … --no-delete`           |

This handbook should make it trivial for autonomous agents to navigate, extend,
and test the Plaud Timestamp CLI. Keep it updated as the system evolves.
