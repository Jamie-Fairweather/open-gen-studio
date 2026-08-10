/**
 * Production Next build without frontend/.env*.local.
 * Those files are for `bun run desktop` / `next dev` only.
 */
import { existsSync, renameSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const dir = "frontend"
const locals = [".env.local", ".env.production.local"]
const moved = []

for (const name of locals) {
  const live = join(dir, name)
  const bak = join(dir, `${name}.build-bak`)
  // Recover if a previous build was killed mid-run.
  if (existsSync(bak) && !existsSync(live)) renameSync(bak, live)
  if (existsSync(live)) {
    renameSync(live, bak)
    moved.push([bak, live])
  }
}

try {
  const result = spawnSync("next", ["build", "frontend"], {
    stdio: "inherit",
    shell: true,
  })
  process.exit(result.status ?? 1)
} finally {
  for (const [bak, live] of moved) {
    if (existsSync(bak)) renameSync(bak, live)
  }
}
