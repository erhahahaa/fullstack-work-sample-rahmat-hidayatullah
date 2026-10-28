import { defineConfig } from "vite-plus";

const generated = [
  "node_modules/**",
  "**/node_modules/**",
  "apps/**/dist/**",
  "apps/**/.tanstack/**",
  "apps/**/src/routeTree.gen.ts",
  "apps/**/src/env.ts",
  "**/coverage/**",
];

export default defineConfig({
  lint: {
    plugins: ["typescript", "unicorn", "oxc", "import"],
    categories: {
      correctness: "error",
      suspicious: "warn",
    },
    ignorePatterns: generated,
    options: {
      typeAware: false,
      typeCheck: false,
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "typescript/no-explicit-any": "error",
      "unicorn/prefer-node-protocol": "error",
      "import/no-unassigned-import": ["warn", { allow: ["**/*.css"] }],
    },
    overrides: [
      {
        // Vendored shadcn primitives, not application code.
        files: ["packages/ui/**"],
        plugins: ["react", "jsx-a11y"],
        env: { browser: true },
        rules: {
          "react/react-in-jsx-scope": "off",
          "jsx-a11y/click-events-have-key-events": "off",
          "jsx-a11y/no-noninteractive-element-interactions": "off",
          "jsx-a11y/prefer-tag-over-role": "off",
          "jsx-a11y/label-has-associated-control": "off",
          "eslint/no-underscore-dangle": "off",
        },
      },
      {
        files: ["apps/frontend/**"],
        plugins: ["react", "react-perf", "jsx-a11y"],
        env: { browser: true },
        rules: {
          "react/react-in-jsx-scope": "off",
          "react/jsx-key": "error",
          "react/no-array-index-key": "warn",
          // These two rules flag every inline handler and style object, which is
          // normal React. Memoization is applied where identity actually matters.
          "react-perf/jsx-no-new-function-as-prop": "off",
          "react-perf/jsx-no-new-object-as-prop": "off",
        },
      },
      {
        files: ["apps/backend/**"],
        plugins: ["node"],
        env: { node: true, es2024: true },
      },
      {
        // Demo scripts print their results by design.
        files: ["apps/backend/src/scripts/**"],
        rules: { "no-console": "off" },
      },
      {
        files: ["apps/frontend/src/test/**"],
        rules: { "import/no-unassigned-import": "off" },
      },
      {
        files: ["**/*.test.ts", "**/*.test.tsx"],
        plugins: ["vitest"],
      },
    ],
  },
  fmt: {
    ignorePatterns: generated,
    singleQuote: false,
    semi: true,
    sortPackageJson: true,
    overrides: [
      {
        files: ["**/*.md"],
        options: { proseWrap: "preserve" },
      },
    ],
  },
  staged: {
    "*.{js,ts,jsx,tsx,vue,svelte,json,jsonc,css,md}": "vp check --fix",
  },
});
