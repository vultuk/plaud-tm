import { describe, it, expect } from 'vitest';
import {
  parseTime,
  formatTime,
  formatDateDashed,
  formatDateCompact,
  adjustTranscript,
  NoTimestampsError,
  timeToSeconds,
  createDateTime,
  compareDateTime,
  type Time,
  type DateOnly,
} from '../src/transcript.js';

describe('parseTime', () => {
  it('parses valid time strings', () => {
    expect(parseTime('00:00:00')).toEqual({ hours: 0, minutes: 0, seconds: 0 });
    expect(parseTime('18:01:12')).toEqual({ hours: 18, minutes: 1, seconds: 12 });
    expect(parseTime('23:59:59')).toEqual({ hours: 23, minutes: 59, seconds: 59 });
  });

  it('returns null for invalid time strings', () => {
    expect(parseTime('24:00:00')).toBeNull();
    expect(parseTime('00:60:00')).toBeNull();
    expect(parseTime('00:00:60')).toBeNull();
    expect(parseTime('invalid')).toBeNull();
    expect(parseTime('1:2:3')).toBeNull();
    expect(parseTime('')).toBeNull();
  });
});

describe('formatTime', () => {
  it('formats time with leading zeros', () => {
    expect(formatTime({ hours: 0, minutes: 0, seconds: 0 })).toBe('00:00:00');
    expect(formatTime({ hours: 18, minutes: 1, seconds: 12 })).toBe('18:01:12');
    expect(formatTime({ hours: 9, minutes: 5, seconds: 3 })).toBe('09:05:03');
  });
});

describe('formatDateDashed', () => {
  it('formats date with dashes', () => {
    expect(formatDateDashed({ year: 2024, month: 12, day: 25 })).toBe('2024-12-25');
    expect(formatDateDashed({ year: 2025, month: 1, day: 5 })).toBe('2025-01-05');
  });
});

describe('formatDateCompact', () => {
  it('formats date without separators', () => {
    expect(formatDateCompact({ year: 2024, month: 12, day: 25 })).toBe('20241225');
    expect(formatDateCompact({ year: 2025, month: 1, day: 5 })).toBe('20250105');
  });
});

describe('timeToSeconds', () => {
  it('converts time to seconds from midnight', () => {
    expect(timeToSeconds({ hours: 0, minutes: 0, seconds: 0 })).toBe(0);
    expect(timeToSeconds({ hours: 1, minutes: 0, seconds: 0 })).toBe(3600);
    expect(timeToSeconds({ hours: 0, minutes: 1, seconds: 0 })).toBe(60);
    expect(timeToSeconds({ hours: 0, minutes: 0, seconds: 1 })).toBe(1);
    expect(timeToSeconds({ hours: 18, minutes: 1, seconds: 12 })).toBe(64872);
  });
});

describe('compareDateTime', () => {
  it('compares datetimes correctly', () => {
    const dt1 = createDateTime({ year: 2024, month: 12, day: 25 }, { hours: 10, minutes: 0, seconds: 0 });
    const dt2 = createDateTime({ year: 2024, month: 12, day: 25 }, { hours: 11, minutes: 0, seconds: 0 });
    const dt3 = createDateTime({ year: 2024, month: 12, day: 26 }, { hours: 10, minutes: 0, seconds: 0 });

    expect(compareDateTime(dt1, dt1)).toBe(0);
    expect(compareDateTime(dt1, dt2)).toBeLessThan(0);
    expect(compareDateTime(dt2, dt1)).toBeGreaterThan(0);
    expect(compareDateTime(dt1, dt3)).toBeLessThan(0);
  });
});

describe('adjustTranscript', () => {
  const baseTime: Time = { hours: 18, minutes: 1, seconds: 12 };
  const date: DateOnly = { year: 2024, month: 12, day: 25 };

  it('adjusts timestamp lines and preserves non-timestamp text', () => {
    const input = `00:00:01 Speaker 1
Line without timestamp
00:00:03 Speaker 2
`;
    const result = adjustTranscript(input, baseTime, date);

    expect(result.body).toBe(`18:01:13 Speaker 1
Line without timestamp
18:01:15 Speaker 2
`);
    expect(formatTime(result.firstTimestamp)).toBe('18:01:13');
    expect(formatTime(result.lastTimestamp)).toBe('18:01:15');
  });

  it('reports error when no timestamp lines exist', () => {
    const input = 'No timestamps here\n';
    expect(() => adjustTranscript(input, baseTime, date)).toThrow(NoTimestampsError);
  });

  it('preserves trailing newline presence', () => {
    const inputWithoutNewline = '00:00:01 Foo';
    const resultWithout = adjustTranscript(inputWithoutNewline, baseTime, date);
    expect(resultWithout.body.endsWith('\n')).toBe(false);

    const inputWithNewline = '00:00:01 Foo\n';
    const resultWith = adjustTranscript(inputWithNewline, baseTime, date);
    expect(resultWith.body.endsWith('\n')).toBe(true);
  });

  it('non-ASCII lines without timestamps are untouched', () => {
    const input = 'Mindy-já. I love you.\n00:00:01 Speaker 1\nLine\n';
    const result = adjustTranscript(input, baseTime, date);
    expect(result.body.startsWith('Mindy-já. I love you.\n18:01:13 Speaker 1')).toBe(true);
  });

  it('handles midnight overflow', () => {
    const input = '00:00:01 Start\n01:00:00 One hour later\n';
    const lateStart: Time = { hours: 23, minutes: 30, seconds: 0 };
    const result = adjustTranscript(input, lateStart, date);

    // First timestamp: 23:30:00 + 00:00:01 = 23:30:01 (same day)
    expect(result.firstTimestamp.year).toBe(2024);
    expect(result.firstTimestamp.month).toBe(12);
    expect(result.firstTimestamp.day).toBe(25);
    expect(formatTime(result.firstTimestamp)).toBe('23:30:01');

    // Last timestamp: 23:30:00 + 01:00:00 = 00:30:00 (next day)
    expect(result.lastTimestamp.year).toBe(2024);
    expect(result.lastTimestamp.month).toBe(12);
    expect(result.lastTimestamp.day).toBe(26);
    expect(formatTime(result.lastTimestamp)).toBe('00:30:00');

    // The body should have the correct times
    expect(result.body).toContain('23:30:01 Start');
    expect(result.body).toContain('00:30:00 One hour later');
  });

  it('detects out-of-order timestamps', () => {
    // Timestamps go backward: 00:00:05 then 00:00:02
    const input = '00:00:05 Later\n00:00:02 Earlier\n';
    const result = adjustTranscript(input, baseTime, date);
    expect(result.hasOutOfOrderTimestamps).toBe(true);
  });

  it('does not flag in-order timestamps', () => {
    const input = '00:00:01 First\n00:00:03 Second\n00:00:05 Third\n';
    const result = adjustTranscript(input, baseTime, date);
    expect(result.hasOutOfOrderTimestamps).toBe(false);
  });
});
