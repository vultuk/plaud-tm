use crate::constants::TIME_FORMAT;
use chrono::{Duration, NaiveDate, NaiveDateTime, NaiveTime, Timelike};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranscriptUpdate {
    pub body: String,
    pub first_timestamp: NaiveDateTime,
    pub last_timestamp: NaiveDateTime,
    /// True if timestamps were found out of chronological order
    pub has_out_of_order_timestamps: bool,
}

#[derive(Debug)]
pub enum TranscriptError {
    NoTimestamps,
}

impl std::fmt::Display for TranscriptError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TranscriptError::NoTimestamps => {
                write!(f, "No timestamped lines were found in the input file")
            }
        }
    }
}

impl std::error::Error for TranscriptError {}

pub struct TranscriptProcessor;

impl TranscriptProcessor {
    pub fn adjust(
        contents: &str,
        base_time: NaiveTime,
        effective_date: NaiveDate,
    ) -> Result<TranscriptUpdate, TranscriptError> {
        let mut adjusted_lines = Vec::new();
        let mut first_timestamp: Option<NaiveDateTime> = None;
        let mut last_timestamp: Option<NaiveDateTime> = None;
        let mut previous_timestamp: Option<NaiveDateTime> = None;
        let mut has_out_of_order = false;

        for line in contents.lines() {
            if let Some((relative_time, rest)) = parse_timestamp_line(line) {
                let adjusted = apply_offset(base_time, effective_date, relative_time);
                if first_timestamp.is_none() {
                    first_timestamp = Some(adjusted);
                }

                // Check for out-of-order timestamps
                if let Some(prev) = previous_timestamp {
                    if adjusted < prev {
                        has_out_of_order = true;
                    }
                }
                previous_timestamp = Some(adjusted);

                last_timestamp = Some(adjusted);
                adjusted_lines.push(format!("{}{}", adjusted.time().format(TIME_FORMAT), rest));
            } else {
                adjusted_lines.push(line.to_string());
            }
        }

        let first_timestamp = first_timestamp.ok_or(TranscriptError::NoTimestamps)?;
        let last_timestamp = last_timestamp.unwrap_or(first_timestamp);

        let mut body = adjusted_lines.join("\n");
        if contents.ends_with('\n') {
            body.push('\n');
        }

        Ok(TranscriptUpdate {
            body,
            first_timestamp,
            last_timestamp,
            has_out_of_order_timestamps: has_out_of_order,
        })
    }
}

fn parse_timestamp_line(line: &str) -> Option<(NaiveTime, &str)> {
    if line.len() < 8 {
        return None;
    }
    if !line.is_char_boundary(8) {
        return None;
    }
    let (timestamp_part, rest) = line.split_at(8);
    let time = NaiveTime::parse_from_str(timestamp_part, TIME_FORMAT).ok()?;
    Some((time, rest))
}

fn apply_offset(start: NaiveTime, effective_date: NaiveDate, relative: NaiveTime) -> NaiveDateTime {
    let base = effective_date.and_time(start);
    let delta = Duration::seconds(relative.num_seconds_from_midnight() as i64);
    base + delta
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn base_time() -> NaiveTime {
        NaiveTime::parse_from_str("18:01:12", "%H:%M:%S").unwrap()
    }

    #[test]
    fn adjusts_timestamp_lines_and_preserves_non_timestamp_text() {
        let input = "\
00:00:01 Speaker 1
Line without timestamp
00:00:03 Speaker 2
";
        let result = TranscriptProcessor::adjust(
            input,
            base_time(),
            NaiveDate::from_ymd_opt(2024, 12, 25).unwrap(),
        )
        .unwrap();
        assert_eq!(
            result.body,
            "\
18:01:13 Speaker 1
Line without timestamp
18:01:15 Speaker 2
"
        );
        assert_eq!(
            result.first_timestamp.time().format("%H:%M:%S").to_string(),
            "18:01:13"
        );
        assert_eq!(
            result.last_timestamp.time().format("%H:%M:%S").to_string(),
            "18:01:15"
        );
    }

    #[test]
    fn reports_error_when_no_timestamp_lines_exist() {
        let input = "No timestamps here\n";
        let err = TranscriptProcessor::adjust(
            input,
            base_time(),
            NaiveDate::from_ymd_opt(2024, 12, 25).unwrap(),
        )
        .unwrap_err();
        assert!(matches!(err, TranscriptError::NoTimestamps));
    }

    #[test]
    fn preserves_trailing_newline_presence() {
        let input = "00:00:01 Foo";
        let result = TranscriptProcessor::adjust(
            input,
            base_time(),
            NaiveDate::from_ymd_opt(2024, 12, 25).unwrap(),
        )
        .unwrap();
        assert!(!result.body.ends_with('\n'));
        let input_with_newline = "00:00:01 Foo\n";
        let result_with_newline = TranscriptProcessor::adjust(
            input_with_newline,
            base_time(),
            NaiveDate::from_ymd_opt(2024, 12, 25).unwrap(),
        )
        .unwrap();
        assert!(result_with_newline.body.ends_with('\n'));
    }

    #[test]
    fn non_ascii_lines_without_timestamps_are_untouched() {
        let input = "Mindy-já. I love you.\n00:00:01 Speaker 1\nLine\n";
        let result = TranscriptProcessor::adjust(
            input,
            base_time(),
            NaiveDate::from_ymd_opt(2024, 12, 25).unwrap(),
        )
        .unwrap();
        assert!(result
            .body
            .starts_with("Mindy-já. I love you.\n18:01:13 Speaker 1"));
    }

    #[test]
    fn handles_midnight_overflow() {
        let input = "00:00:01 Start\n01:00:00 One hour later\n";
        let late_start = NaiveTime::from_hms_opt(23, 30, 0).unwrap();
        let date = NaiveDate::from_ymd_opt(2024, 12, 25).unwrap();
        let result = TranscriptProcessor::adjust(input, late_start, date).unwrap();

        // First timestamp: 23:30:00 + 00:00:01 = 23:30:01 (same day)
        assert_eq!(result.first_timestamp.date(), date);
        assert_eq!(
            result.first_timestamp.time().format("%H:%M:%S").to_string(),
            "23:30:01"
        );

        // Last timestamp: 23:30:00 + 01:00:00 = 00:30:00 (next day)
        let next_day = NaiveDate::from_ymd_opt(2024, 12, 26).unwrap();
        assert_eq!(result.last_timestamp.date(), next_day);
        assert_eq!(
            result.last_timestamp.time().format("%H:%M:%S").to_string(),
            "00:30:00"
        );

        // The body should have the correct times
        assert!(result.body.contains("23:30:01 Start"));
        assert!(result.body.contains("00:30:00 One hour later"));
    }

    #[test]
    fn detects_out_of_order_timestamps() {
        // Timestamps go backward: 00:00:05 then 00:00:02
        let input = "00:00:05 Later\n00:00:02 Earlier\n";
        let result = TranscriptProcessor::adjust(
            input,
            base_time(),
            NaiveDate::from_ymd_opt(2024, 12, 25).unwrap(),
        )
        .unwrap();
        assert!(
            result.has_out_of_order_timestamps,
            "should detect out-of-order timestamps"
        );
    }

    #[test]
    fn in_order_timestamps_not_flagged() {
        let input = "00:00:01 First\n00:00:03 Second\n00:00:05 Third\n";
        let result = TranscriptProcessor::adjust(
            input,
            base_time(),
            NaiveDate::from_ymd_opt(2024, 12, 25).unwrap(),
        )
        .unwrap();
        assert!(
            !result.has_out_of_order_timestamps,
            "should not flag in-order timestamps"
        );
    }
}
