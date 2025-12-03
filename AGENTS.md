# AGENTS.md - AI Assistant Guide for plaud-tm

This file provides context and guidance for AI assistants working on the plaud-tm project.

> **Note:** `CLAUDE.md` is a symlink to this file for compatibility with Claude-specific tooling.

## Project Overview

**plaud-tm** (Plaud Timestamp Manager) is a CLI tool for managing timestamped transcript files from Plaud recording devices. It's built with TypeScript, uses Bun as the runtime/package manager, and features a rich CLI UI built with Ink (React for terminals).

## Technology Stack

- **Runtime**: Bun (≥1.0.0) - Fast JavaScript runtime and package manager
- **Language**: TypeScript 5.3
- **CLI Framework**: Ink 4.4 (React for CLIs) + meow (argument parsing)
- **Date/Time**: date-fns 3.x
- **File Operations**: Node.js fs/promises + glob
- **Testing**: Bun's native test runner

## Project Structure

```
plaud-tm/
├── src/                      # Source code
│   ├── cli.tsx              # Entry point with Ink app and meow CLI parser
│   ├── constants.ts         # Format strings, regex patterns, file size limits
│   ├── types.ts             # TypeScript interfaces and type definitions
│   ├── errors.ts            # Custom error classes (AppError, UpdateError, etc.)
│   ├── transcript.ts        # Core transcript processing logic
│   ├── components/          # Ink UI components
│   │   ├── App.tsx         # Main routing component
│   │   ├── UpdateCommand.tsx  # Update command UI with spinner
│   │   └── MergeCommand.tsx   # Merge command UI with progress
│   ├── commands/            # Business logic
│   │   ├── update.ts       # Update operation implementation
│   │   └── merge.ts        # Merge operation implementation
│   └── utils/               # Utility functions
│       ├── fileio.ts       # Atomic write operations, file reading
│       └── validation.ts   # Input validation helpers
├── tests/                   # Test files
│   └── transcript.test.ts  # Tests using bun:test
├── scripts/
│   └── make-executable.js  # Post-build script to chmod +x
├── dist/                    # Compiled output (git ignored)
└── node_modules/           # Dependencies (git ignored)
```

## Core Functionality

### 1. Update Command
Adjusts timestamps in a transcript file based on a start time and date.

**Key Features:**
- Parses lines with `HH:MM:SS` timestamps at the start
- Adjusts timestamps relative to a base time and date
- Handles midnight overflow (transcripts spanning multiple days)
- Detects out-of-order timestamps
- Supports two output formats:
  - **Nested**: `YYYY/MM/DD/HHMMSS-HHMMSS.txt`
  - **Flat**: `YYYYMMDD_HHMMSS_HHMMSS.txt`
- Atomic writes to prevent file corruption

**Implementation Details:**
- Uses `date-fns` for date/time manipulation
- 10MB file size limit for safety
- Preserves non-timestamped lines as-is
- Maintains trailing newline presence

### 2. Merge Command
Combines multiple transcript segments in chronological order.

**Key Features:**
- Accepts glob patterns for file selection
- Extracts timestamps from two filename formats:
  - Nested: `HHMMSS-HHMMSS.txt` with `YYYY/MM/DD/` directory structure
  - Flat: `YYYYMMDD_HHMMSS_HHMMSS.txt`
- Sorts files chronologically by extracted timestamps
- Intelligently determines output path based on common directory/date
- Optionally deletes source files after merging (default behavior)
- Self-deletion protection via path canonicalization

**Implementation Details:**
- Uses `glob` library for pattern matching
- Validates all files are under 10MB before processing
- Atomic writes for merge output
- Handles mixed date scenarios

## Development Guidelines

### Building
```bash
bun run build        # TypeScript compilation + make executable
bun run typecheck    # Type checking only (no emit)
```

### Testing
```bash
bun test            # Run all tests
bun test --watch    # Watch mode
```

### Running
```bash
bun run dev -- <command> [args]  # Development mode
bun dist/cli.js <command> [args] # Run built version
```

## Important Patterns & Conventions

### 1. Error Handling
- Custom error classes in `src/errors.ts`
- All errors extend `AppError` base class
- Static factory methods for common errors (e.g., `UpdateError.fileTooLarge()`)
- Errors are caught and displayed nicely in Ink components

### 2. File Operations
- Always use atomic writes via `utils/fileio.ts`
- Write to temp file first, then rename atomically
- Create parent directories recursively as needed
- Check file sizes before reading (10MB limit)

### 3. Ink Components
- Separate UI (components) from business logic (commands)
- Use React hooks (useState, useEffect) for state management
- Display spinners during processing
- Show colored output (green for success, red for errors, yellow for warnings)

### 4. Testing
- Import from `bun:test` (not vitest)
- Use `describe`, `it`, `expect` for test structure
- Tests should be comprehensive but focused
- Mock file operations when appropriate

### 5. TypeScript Configuration
- Strict mode enabled
- Target ES2022
- Module resolution: bundler
- Types: `["bun-types", "node"]`
- JSX: react (required for Ink)

## Common Tasks

### Adding a New Command
1. Create command logic in `src/commands/<command>.ts`
2. Create UI component in `src/components/<Command>Command.tsx`
3. Add route in `src/components/App.tsx`
4. Update meow CLI definition in `src/cli.tsx`
5. Add tests in `tests/<command>.test.ts`
6. Update README.md with usage examples

### Modifying Transcript Processing
- Core logic in `src/transcript.ts`
- Uses regex pattern from `src/constants.ts`
- Returns `TranscriptUpdate` object with metadata
- Preserve backward compatibility when changing formats

### Adding Dependencies
```bash
bun add <package>           # Production dependency
bun add -d <package>        # Dev dependency
```

## Migration History

This project was migrated from Rust to TypeScript:
- **Original**: Rust with clap CLI framework
- **Current**: TypeScript with Bun runtime and Ink CLI framework
- **Why**: Better integration with JavaScript ecosystem, easier contribution, Ink provides richer UI
- **Feature Parity**: All original Rust features are maintained

## Code Quality Standards

- **TypeScript**: Strict mode, no `any` types without justification
- **Formatting**: Consistent with project conventions
- **Comments**: Use JSDoc for public APIs, inline comments for complex logic
- **Imports**: Use `.js` extensions in imports (required for ESM)
- **Error Messages**: Clear, actionable, user-friendly

## Known Limitations

- 10MB file size limit (configurable in `constants.ts`)
- Requires timestamps in `HH:MM:SS` format at line start
- Only supports specific filename formats for merge operation
- No support for compressed transcript files

## Troubleshooting

### Common Issues

1. **"Cannot find module" errors**: Ensure `.js` extensions in imports
2. **Type errors with Ink**: Make sure `@types/react` is installed
3. **Tests failing**: Check that imports use `bun:test` not `vitest`
4. **Build errors**: Run `bun install` to ensure dependencies are up to date

### Debug Mode
No formal debug mode, but you can:
- Use `console.log()` in command logic
- Add debug output in Ink components with `<Text>`
- Run with `bun --bun` for Bun's faster runtime

## Performance Considerations

- Bun is significantly faster than Node.js for most operations
- File operations are async to avoid blocking
- Large transcripts are still limited by 10MB size limit
- Glob operations can be slow with many files (consider limiting patterns)

## Security Notes

- File size limits prevent out-of-memory attacks
- Atomic writes prevent partial file corruption
- No execution of user-provided code
- Glob patterns are safely handled by the glob library
- Self-deletion protection in merge prevents accidental data loss

## Future Considerations

Potential enhancements (not currently implemented):
- Streaming for files >10MB
- Interactive mode for selecting files to merge
- JSON output format
- Watch mode for auto-processing
- Configuration file support
- Plugin system for custom processors

## Questions?

If you need clarification on any aspect of the codebase:
1. Check the inline comments in the relevant source files
2. Review the comprehensive tests in `tests/`
3. Consult this CLAUDE.md file
4. Check the README.md for user-facing documentation
