import { plugin as shadcn } from "@shadcn/lint"
import tsParser from "@typescript-eslint/parser"
import { defineConfig, globalIgnores } from "eslint/config"

export default defineConfig([
  globalIgnores([".next/**", "next-env.d.ts", "src/env.ts"]),
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { shadcn },
    settings: {
      shadcn: {
        // Components live in the shared workspace package, not in this app.
        ui: "@onirix/ui/components",
      },
    },
    rules: {
      // Pages may place and size components, but not restyle them.
      "shadcn/no-restyle": [
        "error",
        {
          allow: ["layout"],
          contracts: [
            // CardContent owns the card's padding, but arranging its own
            // children is the page's call. Gap only -- padding stays closed.
            { pattern: "^CardContent$", allow: ["layout", "gap-*"] },
            // The chat column sets its own reading rhythm: wider gutters and
            // a tighter message gap than the ai-elements default.
            {
              pattern: "^ConversationContent$",
              allow: ["layout", "gap-*", "px-*", "py-*"],
            },
            // The footer sits flush against the rail's bottom edge when the
            // user menu is its last child.
            { pattern: "^SidebarFooter$", allow: ["layout", "pb-*"] },
          ],
        },
      ],
      "shadcn/no-raw-colors": "error",
      "shadcn/no-arbitrary-values": [
        "error",
        {
          // Grid templates have no theme scale to draw from.
          allow: ["grid-rows-*", "grid-cols-*"],
        },
      ],
      "shadcn/no-inline-styles": "error",
      "shadcn/no-unknown-classes": "error",
      "shadcn/require-static-classes": "error",
    },
  },
])
