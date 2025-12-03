/**
 * File I/O utilities for atomic write operations.
 */

import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

/**
 * Writes content to a file atomically using a temporary file and rename.
 * @param outputPath The final output path
 * @param content The content to write
 */
export async function atomicWrite(outputPath: string, content: string): Promise<void> {
  // Create parent directories if they don't exist
  const dir = dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });

  // Create a temporary file in the same directory for atomic rename
  const tempFileName = `.tmp-${randomBytes(8).toString('hex')}`;
  const tempPath = join(dir, tempFileName);

  try {
    // Write to temp file
    await fs.writeFile(tempPath, content, 'utf-8');

    // Atomically rename to final destination
    await fs.rename(tempPath, outputPath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Reads a file and validates its size.
 * @param filePath The file to read
 * @param maxSize Maximum allowed file size in bytes
 * @returns The file contents
 * @throws Error if file is too large
 */
export async function readFileWithSizeLimit(filePath: string, maxSize: number): Promise<string> {
  const stats = await fs.stat(filePath);

  if (stats.size > maxSize) {
    throw new Error(`File too large: ${stats.size} bytes exceeds maximum of ${maxSize} bytes`);
  }

  return await fs.readFile(filePath, 'utf-8');
}

/**
 * Safely deletes a file if it exists.
 * @param filePath The file to delete
 */
export async function safeDelete(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    // Ignore if file doesn't exist
  }
}
