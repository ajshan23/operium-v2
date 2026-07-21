/**
 * PM2 process definitions for the Operium v2 monorepo.
 *
 * This monorepo is TypeScript-source-first: every workspace package exports
 * `./src/index.ts`, so the api runs through tsx at runtime (there is no JS
 * emit — `build` for the api is only a typecheck). Only the web app produces a
 * real build artifact (.next).
 *
 * Prereqs on the server:
 *   pnpm install
 *   pnpm --filter @operium/web build     # produces apps/web/.next (the api needs no build)
 *   # point v2 at the migrated DB: set MONGODB_URI=".../operiumnew" in apps/api/.env
 *
 * Run:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup              # survive reboots
 *
 * Paths are resolved from THIS file's location (repo root), so it works no
 * matter which directory you launch pm2 from.
 */
const path = require("path");

module.exports = {
  apps: [
    {
      // Express REST + MCP HTTP transport + embed worker, run via tsx (the
      // workspace packages are consumed as TS source). Reads secrets from
      // apps/api/.env via `import "dotenv/config"` (cwd-relative), so
      // MONGODB_URI / JWT_SECRET / GOOGLE_API_KEY / APP_URL / etc. live there.
      name: "operium-api",
      cwd: path.join(__dirname, "apps/api"),
      script: "node_modules/.bin/tsx",
      args: "src/index.ts",
      interpreter: "none",   // exec the tsx binary directly
      instances: 1,          // single instance — the embed worker must not run in parallel
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production", API_PORT: 4000 },
    },
    {
      // Next.js (App Router). NEXT_PUBLIC_* were baked at build time from
      // apps/web/.env.local — change them → rebuild, not just restart.
      name: "operium-web",
      cwd: path.join(__dirname, "apps/web"),
      script: "node_modules/next/dist/bin/next",
      args: "start -p 5000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
    },
  ],
};
