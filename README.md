# Operium

> Persistent secondary memory for AI coding assistants — for you and your team.

Operium captures your AI coding sessions, learns your team's conventions, and recalls
the right context the next time you (or a teammate) work on the same code — over the
Model Context Protocol (MCP).

This is the **v2 clean rebuild**: Next.js + Express + MongoDB, in a pnpm
monorepo with a framework-free core.

## Stack

- **Frontend** — Next.js (App Router) + TypeScript + Tailwind
- **Backend** — Express + TypeScript (REST + MCP HTTP transport + embed worker)
- **Database** — MongoDB (Mongoose models; text search + embeddings stored per-chunk)
- **AI** — Google Gemini (768-dim embeddings + Flash summarization)
- **Monorepo** — pnpm workspaces + Turborepo

## Layout

```
apps/
  web/   Next.js — landing + dashboard
  api/   Express — REST, MCP, embed worker
packages/
  shared/  types + zod schemas (web ↔ api)
  db/      Mongoose models + connectDB (MongoDB)
  core/    framework-free domain logic (memory pipeline, embeddings, ranking)
  mcp/     MCP server built on @modelcontextprotocol/sdk
```

**Layering rule:** `core` has no framework/HTTP deps; `api` and `mcp` are thin adapters
over it. Same logic serves REST, MCP-HTTP, and MCP-stdio.

## Develop

```bash
nvm use                 # Node 24
corepack enable         # pnpm
pnpm install
cp .env.example .env     # fill MONGODB_URI, JWT_SECRET, etc.
cp .env.example apps/api/.env

pnpm dev                # run web + api
```

`pnpm typecheck` and `pnpm test` must be green before committing.

## Deploy (recommended)

| Layer | Service |
|---|---|
| MongoDB | [Atlas](https://www.mongodb.com/atlas) |
| Frontend (web) | [Vercel](https://vercel.com) |
| Backend (api) | [Railway](https://railway.app) / [Render](https://render.com) |

The backend needs a long-running host (MCP SSE + the embed worker), so a serverless
function won't do for `api`.
