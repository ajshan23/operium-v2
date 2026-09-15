import { FlatCompat } from "@eslint/eslintrc";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  // pnpm keeps Next's plugins beside eslint-config-next, not at the app root.
  resolvePluginsRelativeTo: dirname(require.resolve("eslint-config-next/package.json")),
});

const config = [
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      // The codebase leans on `any` at API boundaries; tighten later.
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;
