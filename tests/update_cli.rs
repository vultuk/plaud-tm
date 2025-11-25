use assert_cmd::cargo::cargo_bin_cmd;
use assert_fs::prelude::*;
use predicates::prelude::*;
use std::fs;

const SAMPLE_TRANSCRIPT: &str = "\
00:00:01 Speaker 1
Line
00:00:05 Speaker 2
";

const EXPECTED_TRANSCRIPT: &str = "\
18:01:13 Speaker 1
Line
18:01:17 Speaker 2
";

#[test]
fn writes_nested_output_by_default() {
    let temp = assert_fs::TempDir::new().expect("temp dir");
    let input = temp.child("input.txt");
    input.write_str(SAMPLE_TRANSCRIPT).expect("write input");

    let mut cmd = cargo_bin_cmd!("plaud-tm");
    cmd.current_dir(temp.path());
    cmd.args([
        "update",
        "input.txt",
        "--time",
        "18:01:12",
        "--date",
        "2024-12-25",
    ]);

    cmd.assert()
        .success()
        .stdout(predicate::str::contains("2024/12/25/180113-180117.txt"));

    let output_path = temp.child("2024/12/25/180113-180117.txt");
    output_path.assert(predicate::path::exists());
    let contents = fs::read_to_string(output_path.path()).expect("read output");
    assert_eq!(contents, EXPECTED_TRANSCRIPT);
}

#[test]
fn supports_flat_output() {
    let temp = assert_fs::TempDir::new().expect("temp dir");
    let input = temp.child("input.txt");
    input.write_str(SAMPLE_TRANSCRIPT).expect("write input");

    let mut cmd = cargo_bin_cmd!("plaud-tm");
    cmd.current_dir(temp.path());
    cmd.args([
        "update",
        "input.txt",
        "--time",
        "18:01:12",
        "--date",
        "2024-12-25",
        "--flat",
    ]);

    cmd.assert()
        .success()
        .stdout(predicate::str::contains("20241225_180113_180117.txt"));

    let output_path = temp.child("20241225_180113_180117.txt");
    output_path.assert(predicate::path::exists());
    let contents = fs::read_to_string(output_path.path()).expect("read output");
    assert_eq!(contents, EXPECTED_TRANSCRIPT);
}
