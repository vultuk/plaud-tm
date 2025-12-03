/**
 * Tests for transcript processing.
 */

import { describe, it, expect } from 'bun:test';
import { TranscriptProcessor } from '../src/transcript.js';
import { parse } from 'date-fns';

describe('TranscriptProcessor', () => {
  const baseTime = parse('18:01:12', 'HH:mm:ss', new Date(0));
  const baseDate = new Date(2024, 11, 25); // December 25, 2024

  it('should adjust timestamp lines and preserve non-timestamp text', () => {
    const input = `00:00:01 Speaker 1
Line without timestamp
00:00:03 Speaker 2
`;

    const result = TranscriptProcessor.adjust(input, baseTime, baseDate);

    expect(result.body).toContain('18:01:13 Speaker 1');
    expect(result.body).toContain('Line without timestamp');
    expect(result.body).toContain('18:01:15 Speaker 2');
  });

  it('should throw error when no timestamp lines exist', () => {
    const input = 'No timestamps here\n';

    expect(() => {
      TranscriptProcessor.adjust(input, baseTime, baseDate);
    }).toThrow('No timestamped lines were found');
  });

  it('should preserve trailing newline presence', () => {
    const inputWithoutNewline = '00:00:01 Foo';
    const resultWithoutNewline = TranscriptProcessor.adjust(inputWithoutNewline, baseTime, baseDate);
    expect(resultWithoutNewline.body.endsWith('\n')).toBe(false);

    const inputWithNewline = '00:00:01 Foo\n';
    const resultWithNewline = TranscriptProcessor.adjust(inputWithNewline, baseTime, baseDate);
    expect(resultWithNewline.body.endsWith('\n')).toBe(true);
  });

  it('should detect out-of-order timestamps', () => {
    const input = '00:00:05 Later\n00:00:02 Earlier\n';
    const result = TranscriptProcessor.adjust(input, baseTime, baseDate);

    expect(result.hasOutOfOrderTimestamps).toBe(true);
  });

  it('should not flag in-order timestamps', () => {
    const input = '00:00:01 First\n00:00:03 Second\n00:00:05 Third\n';
    const result = TranscriptProcessor.adjust(input, baseTime, baseDate);

    expect(result.hasOutOfOrderTimestamps).toBe(false);
  });
});
