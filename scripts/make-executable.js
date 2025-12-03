#!/usr/bin/env bun
import { chmod } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cliPath = join(__dirname, '..', 'dist', 'cli.js');

try {
  await chmod(cliPath, '755');
  console.log('✓ Made dist/cli.js executable');
} catch (error) {
  console.error('Failed to make CLI executable:', error.message);
  process.exit(1);
}
