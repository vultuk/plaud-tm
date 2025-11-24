use chrono::{Duration, NaiveDate, NaiveTime, Timelike};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranscriptUpdate {
    pub body: String,
    pub first_timestamp: NaiveTime,
    pub last_timestamp: NaiveTime,
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
        let mut first_timestamp: Option<NaiveTime> = None;
        let mut last_timestamp: Option<NaiveTime> = None;

        for line in contents.lines() {
            if let Some((relative_time, rest)) = parse_timestamp_line(line) {
                let adjusted = apply_offset(base_time, effective_date, relative_time);
                if first_timestamp.is_none() {
                    first_timestamp = Some(adjusted);
                }
                last_timestamp = Some(adjusted);
                adjusted_lines.push(format!("{}{}", adjusted.format("%H:%M:%S"), rest));
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
    let time = NaiveTime::parse_from_str(timestamp_part, "%H:%M:%S").ok()?;
    Some((time, rest))
}

fn apply_offset(start: NaiveTime, effective_date: NaiveDate, relative: NaiveTime) -> NaiveTime {
    let base = effective_date.and_time(start);
    let delta = Duration::seconds(relative.num_seconds_from_midnight() as i64);
    (base + delta).time()
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
            result.first_timestamp.format("%H:%M:%S").to_string(),
            "18:01:13"
        );
        assert_eq!(
            result.last_timestamp.format("%H:%M:%S").to_string(),
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
        matches!(err, TranscriptError::NoTimestamps);
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
}
