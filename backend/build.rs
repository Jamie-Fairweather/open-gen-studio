//! Generate Tauri context (capabilities, icons) before the app crate compiles.

fn main() {
    tauri_build::build()
}
