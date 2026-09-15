import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        surface: {
          page: "rgb(var(--surface-page-rgb) / <alpha-value>)",
          panel: "rgb(var(--surface-panel-rgb) / <alpha-value>)",
          raised: "rgb(var(--surface-raised-rgb) / <alpha-value>)",
          hover: "rgb(var(--surface-hover-rgb) / <alpha-value>)",
        },
        content: {
          primary: "rgb(var(--text-primary-rgb) / <alpha-value>)",
          secondary: "rgb(var(--text-secondary-rgb) / <alpha-value>)",
          muted: "rgb(var(--text-muted-rgb) / <alpha-value>)",
          inverse: "rgb(var(--text-inverse-rgb) / <alpha-value>)",
        },
        line: {
          subtle: "rgb(var(--border-subtle-rgb) / <alpha-value>)",
          DEFAULT: "rgb(var(--border-default-rgb) / <alpha-value>)",
          strong: "rgb(var(--border-strong-rgb) / <alpha-value>)",
          control: "rgb(var(--border-control-rgb) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent-solid-rgb) / <alpha-value>)",
          hover: "rgb(var(--accent-hover-rgb) / <alpha-value>)",
          text: "rgb(var(--accent-text-rgb) / <alpha-value>)",
        },
        status: {
          success: "rgb(var(--success-rgb) / <alpha-value>)",
          error: "rgb(var(--error-rgb) / <alpha-value>)",
          warning: "rgb(var(--warning-rgb) / <alpha-value>)",
          info: "rgb(var(--info-rgb) / <alpha-value>)",
        },
        overlay: "rgb(var(--overlay-rgb) / <alpha-value>)",
      },
      boxShadow: {
        soft: "0 12px 36px var(--shadow-color)",
      },
    },
  },
  plugins: [],
};

export default config;
