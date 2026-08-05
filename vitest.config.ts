import path from "node:path"
import { defineConfig } from "vitest/config"

const alias = {
  "@": path.resolve(import.meta.dirname, "frontend"),
}

const coverage = {
  provider: "v8" as const,
  reporter: ["text", "html"] as const,
  include: ["frontend/**/*.{ts,tsx}"],
  exclude: [
    "frontend/lib/generated/**",
    "frontend/components/ui/**",
    "frontend/**/*.d.ts",
    "frontend/next-env.d.ts",
    "frontend/next.config.ts",
    "frontend/**/*.{test,spec}.{ts,tsx}",
    "frontend/test/**",
    "frontend/**/index.ts",
    "frontend/.next/**",
  ],
}

export default defineConfig({
  resolve: { alias },
  test: {
    setupFiles: ["frontend/test/setup.ts"],
    coverage,
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["frontend/**/*.{test,spec}.ts"],
          setupFiles: ["frontend/test/setup.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["frontend/**/*.{test,spec}.tsx"],
          setupFiles: ["frontend/test/setup.ts"],
        },
      },
    ],
  },
})
