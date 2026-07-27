/**
 * Run recipe Rust unit tests.
 *
 * On Windows, skip before invoking cargo: `cargo test --lib` loads Tauri/WebView2
 * and dies with STATUS_ENTRYPOINT_NOT_FOUND (0xC0000139). Tests still run on
 * Linux/mac where that link works.
 */
import { spawnSync } from "node:child_process"

if (process.platform === "win32") {
  console.log(
    "[test:rust] Skipped on Windows (cargo lib tests hit STATUS_ENTRYPOINT_NOT_FOUND via Tauri/WebView2).\n" +
      "  Recipe tests run on Linux/mac. Local gate here: `bun run check`."
  )
  process.exit(0)
}

const result = spawnSync(
  "cargo",
  ["test", "--manifest-path", "src-tauri/Cargo.toml", "recipe::"],
  { stdio: "inherit", shell: true }
)

process.exit(result.status ?? 1)
