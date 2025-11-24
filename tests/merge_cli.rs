use assert_cmd::cargo::cargo_bin_cmd;
use assert_fs::prelude::*;
use predicates::prelude::*;
use std::fs;

fn setup_files(temp: &assert_fs::TempDir) {
    let day_dir = temp.child("2025/01/27");
    day_dir.create_dir_all().unwrap();
    day_dir
        .child("112256-162256.txt")
        .write_str("late segment\n")
        .unwrap();
    day_dir
        .child("061901-111901.txt")
        .write_str("early segment\n")
        .unwrap();
}

#[test]
fn merge_with_explicit_list_outputs_sorted_paths() {
    let temp = assert_fs::TempDir::new().unwrap();
    setup_files(&temp);
    let early = temp.child("2025/01/27/061901-111901.txt");
    let late = temp.child("2025/01/27/112256-162256.txt");

    let mut cmd = cargo_bin_cmd!("plaud-timestamp");
    cmd.current_dir(temp.path());
    cmd.args([
        "merge",
        "2025/01/27/112256-162256.txt",
        "2025/01/27/061901-111901.txt",
    ]);

    let expected_list = "2025/01/27/061901-111901.txt
2025/01/27/112256-162256.txt
";

    cmd.assert()
        .success()
        .stdout(predicate::str::contains(expected_list))
        .stdout(predicate::str::contains(
            "Merged into 2025/01/27/2025-01-27.txt",
        ));

    let merged = temp.child("2025/01/27/2025-01-27.txt");
    merged.assert(predicate::path::exists());
    assert!(!early.path().exists());
    assert!(!late.path().exists());
    let contents = fs::read_to_string(merged.path()).expect("read merged");
    assert_eq!(contents, "early segment\nlate segment\n");
}

#[test]
fn merge_with_glob_pattern_expands_and_orders() {
    let temp = assert_fs::TempDir::new().unwrap();
    setup_files(&temp);
    let early = temp.child("2025/01/27/061901-111901.txt");
    let late = temp.child("2025/01/27/112256-162256.txt");

    let mut cmd = cargo_bin_cmd!("plaud-timestamp");
    cmd.current_dir(temp.path());
    cmd.args(["merge", "2025/01/27/*"]);

    let expected_order = "2025/01/27/061901-111901.txt
2025/01/27/112256-162256.txt
";

    cmd.assert()
        .success()
        .stdout(predicate::str::contains(expected_order))
        .stdout(predicate::str::contains(
            "Merged into 2025/01/27/2025-01-27.txt",
        ));

    let merged = temp.child("2025/01/27/2025-01-27.txt");
    merged.assert(predicate::path::exists());
    assert!(!early.path().exists(), "early segment should be deleted");
    assert!(!late.path().exists(), "late segment should be deleted");
    let contents = fs::read_to_string(merged.path()).expect("read merged");
    assert_eq!(contents, "early segment\nlate segment\n");
}

#[test]
fn merge_respects_custom_output_argument() {
    let temp = assert_fs::TempDir::new().unwrap();
    setup_files(&temp);

    let mut cmd = cargo_bin_cmd!("plaud-timestamp");
    cmd.current_dir(temp.path());
    cmd.args([
        "merge",
        "2025/01/27/*",
        "--output",
        "combined.txt",
        "--no-delete",
    ]);

    cmd.assert()
        .success()
        .stdout(predicate::str::contains("2025/01/27/061901-111901.txt"))
        .stdout(predicate::str::contains("2025/01/27/112256-162256.txt"))
        .stdout(predicate::str::contains("Merged into combined.txt"));

    let merged = temp.child("combined.txt");
    merged.assert(predicate::path::exists());
    assert!(temp.child("2025/01/27/061901-111901.txt").path().exists());
    assert!(temp.child("2025/01/27/112256-162256.txt").path().exists());
    let contents = fs::read_to_string(merged.path()).expect("read merged");
    assert_eq!(contents, "early segment\nlate segment\n");
}
