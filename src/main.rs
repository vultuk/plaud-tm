fn main() {
    if let Err(err) = plaud_timestamp::run() {
        eprintln!("Error: {err}");
        std::process::exit(1);
    }
}
