//! Regenerate `lib/generated/bindings.ts` — run via `npm run ipc:types`.

fn main() {
    if let Err(e) = app_lib::ipc::export_typescript_bindings() {
        eprintln!("export failed: {e}");
        std::process::exit(1);
    }
    println!("Wrote lib/generated/bindings.ts (+ RECIPE_ARCHES)");
}
