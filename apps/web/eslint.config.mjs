import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

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
