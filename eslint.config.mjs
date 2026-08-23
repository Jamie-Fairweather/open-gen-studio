import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import jsdoc from "eslint-plugin-jsdoc"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: {
        rootDir: "frontend/",
      },
    },
  },
  {
    files: ["frontend/lib/**/*.{ts,tsx}", "frontend/components/**/*.{ts,tsx}"],
    ignores: ["frontend/lib/generated/**", "frontend/components/ui/**"],
    plugins: { jsdoc },
    settings: {
      jsdoc: { mode: "typescript" },
    },
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          enableFixer: false,
          require: {
            ArrowFunctionExpression: true,
            ClassDeclaration: true,
            FunctionDeclaration: true,
            FunctionExpression: true,
            MethodDefinition: false,
          },
          contexts: [
            "TSTypeAliasDeclaration",
            "TSInterfaceDeclaration",
            "TSEnumDeclaration",
          ],
        },
      ],
      "jsdoc/require-description": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "frontend/.next/**",
    "out/**",
    "frontend/out/**",
    "build/**",
    "frontend/next-env.d.ts",
    "backend/**",
    // Specta / tauri-specta generated bindings
    "frontend/lib/generated/**",
    // Vitest suites — typechecked loosely; not part of app lint gate
    "frontend/**/*.test.ts",
    "frontend/**/*.test.tsx",
    "frontend/**/*.spec.ts",
    "frontend/**/*.spec.tsx",
    "frontend/test/**",
    "graphify-out/**",
    ".cursor/**",
    ".agents/**",
    ".github/**",
    ".vscode/**",
    ".husky/**",
    ".impeccable/**",
  ]),
])

export default eslintConfig
