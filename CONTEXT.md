# Operium — Project Context for New Chat

## What Is This Project?

**Operium** is a persistent secondary memory layer for AI coding assistants (Claude Code, Cursor, etc.). It captures work sessions, code decisions, bug fixes, and team knowledge, then surfaces that memory back to AI tools via the **Model Context Protocol (MCP)** so the AI always has context about past work.

**One-liner**: "Persistent memory for your AI coding assistant — for you and your team."

**Brand**: Bioluminescent neural networks — dark UI, violet/indigo glows (#8b5cf6), ultra-dark blacks (#050505).

---

## Projects on Disk

### Current Project (Active Development)
```
/Users/fcsastlap029/Desktop/experia/operium/
```
This is a clean monorepo rebuild. Production-quality code, fully typed TypeScript.

### Old Project (Reference Only)
```
/Users/fcsastlap029/Desktop/experia/op_in/
```
The original prototype. Has many features not yet ported to the new project. Use it as reference when building new features — **do not run or deploy it**.

---

## Current Project — Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind (layout only), vanilla CSS components |
| Backend | Express.js + TypeScript, port 4000 |
| Database | MongoDB + Mongoose (NOT PostgreSQL despite the .env.example — ignore that) |
| Auth | JWT (httpOnly cookie `auth-token` + `Authorization: Bearer` header), GitHub OAuth, Google OAuth |
| AI | Google Gemini (key in User settings — NOT yet wired to any pipeline) |
| Monorepo | pnpm workspaces + Turborepo |
| Dev ports | Frontend: 3000, Backend: 4000 |

**Key architectural rules:**
- Frontend calls `/api/*` — Next.js rewrites proxy to `http://localhost:4000/api/*`
- `apiClient` is in `apps/web/src/api/client.ts` — reads `localStorage.operium_token` for Bearer token
- Backend pattern: `routes/X.ts` → `controllers/X.controller.ts` → `services/X.service.ts`
- `req.user.userId` is set by `requireAuth` middleware (JWT)
- TypeScript has `noUncheckedIndexedAccess: true` — always use `String(req.params["id"])` not `req.params.id`
- `uid(req)` and `pid(req)` helpers in every controller
- `ApiResponse` and `ApiError` utilities in `apps/api/src/utils/`
- MongoDB `$unset` required for clearing sparse/optional fields (not `$set: { field: undefined }`)

---

## Current Project — Directory Structure

```
operium/
├── apps/
│   ├── api/                          ← Express backend
│   │   └── src/
│   │       ├── index.ts              ← Route registration + server start
│   │       ├── routes/
│   │       │   ├── auth.ts
│   │       │   ├── cowork.ts         ✅ done
│   │       │   ├── history.ts
│   │       │   ├── notes.ts
│   │       │   ├── org.ts
│   │       │   └── spaces.ts
│   │       ├── controllers/
│   │       │   ├── cowork.controller.ts   ✅
│   │       │   ├── notes.controller.ts    ✅
│   │       │   └── (history/auth/org in service files)
│   │       ├── services/
│   │       │   ├── auth.service.ts        ✅
│   │       │   ├── cowork.service.ts      ✅
│   │       │   ├── email.service.ts       ✅
│   │       │   ├── history.service.ts     ✅ (GitHub sync, Azure sync, custom webhooks)
│   │       │   ├── notes.service.ts       ✅
│   │       │   └── org.service.ts         ✅
│   │       ├── middlewares/
│   │       │   └── auth.middleware.ts     ✅
│   │       └── utils/
│   │           ├── ApiError.ts
│   │           └── ApiResponse.ts
│   │
│   └── web/                          ← Next.js 15 frontend
│       └── src/
│           ├── api/                  ← API client modules
│           │   ├── client.ts         ← Base apiClient (adds Bearer, handles errors)
│           │   ├── auth.api.ts       ✅
│           │   ├── cowork.api.ts     ✅
│           │   ├── history.api.ts    ✅
│           │   ├── notes.api.ts      ✅
│           │   └── org.api.ts        ✅
│           ├── app/
│           │   ├── (auth)/
│           │   │   ├── login/page.tsx      ✅
│           │   │   └── signup/page.tsx     ✅
│           │   ├── (dashboard)/
│           │   │   ├── layout.tsx          ✅ (80px sidebar, nav links)
│           │   │   ├── page.tsx            ✅ (home dashboard)
│           │   │   ├── history/page.tsx    ✅ (work history feed + filters)
│           │   │   ├── cowork/
│           │   │   │   ├── page.tsx        ✅ (session list, search, mock chat)
│           │   │   │   └── [id]/page.tsx   ✅ (detail, chunks, vote, related)
│           │   │   ├── spaces/page.tsx     ✅ (notes + TipTap editor)
│           │   │   ├── settings/page.tsx   ✅ (GitHub/Azure/webhooks/profile)
│           │   │   ├── git/page.tsx        (shell only — not wired)
│           │   │   ├── projects/page.tsx   (shell only — not wired)
│           │   │   ├── terminal/page.tsx   (shell only — not wired)
│           │   │   ├── notification/page.tsx (shell only)
│           │   │   └── cowork/[id]/        ✅
│           │   └── public-onboarding/      ✅
│           ├── components/
│           │   ├── UserMenu.tsx            ✅
│           │   └── MarkdownViewer.tsx      ✅
│           ├── lib/
│           └── middleware.ts               ✅ (auth redirect)
│
└── packages/
    └── db/                           ← Shared Mongoose models
        └── src/
            ├── index.ts              ← Exports all models
            └── models/
                ├── User.ts           ✅
                ├── Org.ts            ✅
                ├── Team.ts           ✅
                ├── Membership.ts     ✅
                ├── OTP.ts            ✅
                ├── WorkHistory.ts    ✅
                ├── MyTask.ts         ✅ (model only — no routes yet)
                ├── Space.ts          ✅
                ├── Note.ts           ✅
                ├── NoteBlock.ts      ✅
                ├── CoworkSession.ts  ✅
                └── CoworkChunk.ts    ✅
```

---

## API Endpoints — What's Live

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/otp/verify
GET    /api/auth/github                  (OAuth)
GET    /api/auth/github/callback
GET    /api/auth/google
GET    /api/auth/google/callback
GET    /api/auth/me

GET    /api/history                      (filters: category, source, milestone, blocker, important, timeframe)
POST   /api/history
PUT    /api/history/:id
DELETE /api/history/:id
GET    /api/history/stats
GET    /api/history/live
POST   /api/history/sync                 (GitHub sync)
POST   /api/history/sync-azure           (Azure DevOps sync)
POST   /api/history/sync-custom          (custom webhooks)
GET    /api/history/integrations
PUT    /api/history/integrations

GET    /api/spaces
POST   /api/spaces
GET    /api/spaces/:id
PUT    /api/spaces/:id
DELETE /api/spaces/:id

GET    /api/notes
POST   /api/notes
GET    /api/notes/:id
PUT    /api/notes/:id
DELETE /api/notes/:id
POST   /api/notes/:id/star
POST   /api/notes/:id/sharing

GET    /api/cowork                       (filters: scope, source, tag, limit, page)
GET    /api/cowork/search?q=             (MongoDB text search)
POST   /api/cowork
GET    /api/cowork/:id
GET    /api/cowork/:id/related
POST   /api/cowork/:id/feedback          (helpful/notHelpful voting)
DELETE /api/cowork/:id

GET    /api/orgs
POST   /api/orgs
```

---

## What Has Been Built (Completed Work)

| Feature | Status | Notes |
|---|---|---|
| Auth (email/OTP + GitHub/Google OAuth) | ✅ | JWT + cookie |
| Work History CRUD | ✅ | 11 categories, 6 sources |
| GitHub sync | ✅ | PAT-based, 30s timeout |
| Azure DevOps sync | ✅ | org+token, 30s timeout |
| Custom webhook sync | ✅ | POST endpoints, arrayPath mapping |
| Spaces + Notes (rich editor) | ✅ | TipTap, blocks, star, share |
| Cowork sessions (CRUD) | ✅ | tag-based related, helpful votes |
| /history page | ✅ | filters, heatmap, memory cards |
| /cowork page | ✅ | list, search, filter, detail view |
| /spaces page | ✅ | 3-column: spaces / note list / editor |
| /settings page | ✅ | profile, GitHub, Azure, webhooks, edit window |
| Delete confirmation modals | ✅ | spaces, notes, cowork sessions |
| Auth middleware + redirect | ✅ | Next.js middleware + Express requireAuth |
| fetchWithTimeout (30s) | ✅ | all external API calls |

---

## What's NOT Built Yet (Gap from Old Project)

### High Priority — Core Product Value

#### 1. MCP Server (The Main Differentiator)
The old project had 40+ MCP tools. The new project has a stub placeholder only.
- **File to check**: `apps/api/src/index.ts` line 49 (commented out `mcpTransport`)
- **Old project reference**: `/Users/fcsastlap029/Desktop/experia/op_in/server/src/mcp/tools.ts`
- **Key tools needed**: `get_startup_context`, `recall_context`, `search`, `create_history`, `save_cowork`, `create_note`, `search_notes`
- **Transport**: SSE + Stdio (old project has both in `server/src/mcp/httpRouter.ts`)
- **Auth**: MCP auth uses Bearer token from user settings (Gemini API key or dedicated MCP key)

#### 2. Query Intelligence (`parseQueryHints`)
Natural language → structured filters. e.g. "what did we fix last week about auth" → `{ intent: "bug-fix", tags: ["auth"], timeframe: 7 }`.
- **Old project**: `/Users/fcsastlap029/Desktop/experia/op_in/server/src/mcp/tools.ts` lines 50–132

#### 3. Memory Pipeline (ADD/UPDATE/SUPERSEDE/NOOP)
When MCP saves a memory, decide: is this new? An update to existing? A correction that supersedes? Skip duplicate?
- **Deduplication**: MD5 `contentHash` on content
- **Temporal validity**: `validFrom`, `validUntil`, `supersededBy` fields (not yet on `WorkHistory` model)
- **Old project**: `MEMORY_UPGRADE_PLAN.md` + `server/src/routes/history.ts`

#### 4. Semantic / Vector Search
- Gemini 768-dim embeddings on history + notes + cowork chunks
- MongoDB Atlas vector index (or local `mongot`)
- Hybrid search: vector + full-text combined
- **Old project**: `server/src/models/NoteBlockChunk.ts`, `CoworkChunk.ts` (has `embedding` field)
- **Status in new**: `CoworkChunk` has `embeddingDirty: true` placeholder, no embedding generation yet

#### 5. Usefulness Boost / Composite Scoring
- `helpfulCount`, `notHelpfulCount` on CoworkSession ✅ (tracking started)
- Composite score = relevance × recency decay × (1 + helpfulness ratio) — not yet computed anywhere
- `useCount`, `lastUsedAt` tracked but not used for ranking

### Medium Priority — Team Features

#### 6. Channels & Real-time Messaging (Fully in old project)
- `Channel.ts`, `ChannelMessage.ts`, `Message.ts` models
- `/api/channels` CRUD
- WebSocket or SSE for real-time
- **Old project**: `server/src/routes/channels.ts`, `server/src/routes/messages.ts`

#### 7. Tasks System (`MyTask`)
- Model exists in new project (`packages/db/src/models/MyTask.ts`)
- **No routes, no controller, no frontend page**
- **Old project**: `server/src/routes/user.ts` (tasks section)

#### 8. Knowledge Base (Admin)
- Admin-uploaded documents chunked and embedded for RAG
- `KnowledgeChunk` model in old project
- `/api/knowledge/ingest` endpoint
- **Old project**: `server/src/routes/knowledge.ts`, `server/src/models/KnowledgeChunk.ts`

#### 9. Public Note Sharing
- Backend done: `POST /api/notes/:id/sharing` generates `shareId`
- **Missing**: `/shared/:shareId` public-facing Next.js page (no auth required)
- **Old project**: `server/src/routes/shared.ts`

### Lower Priority — Nice to Have

#### 10. Org / Multi-tenant Scoping
- Org model exists, org routes exist
- Most queries in new project scope by `userId` only
- Should scope by `orgId` where applicable (cowork uses `isShared` workaround)

#### 11. Context Rules (`save_rule` MCP tool)
- `ContextRule` model in old project
- Rules like "always use TypeScript strict mode" persisted and injected into AI context
- **Old project**: `server/src/routes/contextRules.ts`, `server/src/models/ContextRule.ts`

#### 12. AI Chat in Cowork (currently mock)
- `POST /api/cowork/chat` endpoint needed
- Embed query with Gemini → vector search chunks → generate response with Gemini Flash
- **Old project**: `server/src/routes/cowork.ts` (POST /api/cowork/chat)

#### 13. Git / Projects / Terminal Pages
- `/git`, `/projects`, `/terminal` pages exist as shells with no backend wiring
- Old project had dashboard aggregation routes

---

## Environment Variables (`.env` in `apps/api/`)

```env
MONGODB_URI=mongodb+srv://...         # Required
JWT_SECRET=...                         # Required
ENCRYPTION_SECRET=...                  # Required (32+ chars, for token encryption)
GOOGLE_API_KEY=...                     # For Gemini embeddings (optional until AI features built)
API_PORT=4000
APP_URL=http://localhost:3000
GITHUB_CLIENT_ID=...                   # For GitHub OAuth
GITHUB_CLIENT_SECRET=...
```

> **Note**: The `.env.example` mentions `DATABASE_URL` (Postgres) — ignore that. The actual project uses `MONGODB_URI`.

---

## Running the Project

```bash
cd /Users/fcsastlap029/Desktop/experia/operium

# Install
pnpm install

# Start both frontend and backend
pnpm dev

# Frontend: http://localhost:3000
# Backend:  http://localhost:4000
# Health:   http://localhost:4000/health
```

**Common issue**: If port 4000 gives 404s on all routes, check for zombie processes:
```bash
lsof -i :4000          # look for a PID from days ago
kill -9 <PID>
```

---

## Key Patterns to Follow

### Backend controller
```typescript
// Always use handle() wrapper, uid(), pid()
export const myHandler = handle(async (req, res) => {
  const result = await myService.doThing(uid(req), pid(req), req.body);
  res.json(new ApiResponse(200, result, "Done"));
});
```

### Frontend API call
```typescript
// apiClient returns the full response body; data is nested inside
const res = await coworkApi.list({ scope: "team" });
const list = (res as any).data as CoworkSession[]; // or { sessions, pagination }
```

### MongoDB disconnect a sparse field
```typescript
// Don't use $set: { field: undefined } — MongoDB ignores it
await User.findByIdAndUpdate(id, {
  $unset: { githubToken: "" },
  $set:   { githubConnected: false },
});
```

### Delete confirmation pattern
All deletes use a modal (matching spaces/cowork pattern) — no `window.confirm()`.

---

## Old Project Reference Quick Map

| Feature you're building | Old project file to read |
|---|---|
| MCP tools | `/op_in/server/src/mcp/tools.ts` |
| MCP HTTP transport | `/op_in/server/src/mcp/httpRouter.ts` |
| Query intelligence | `/op_in/server/src/mcp/tools.ts` lines 50–132 |
| Channels/messaging | `/op_in/server/src/routes/channels.ts` + `messages.ts` |
| Knowledge base | `/op_in/server/src/routes/knowledge.ts` |
| Context rules | `/op_in/server/src/routes/contextRules.ts` |
| Public sharing | `/op_in/server/src/routes/shared.ts` |
| Tasks | `/op_in/server/src/routes/user.ts` |
| AI chat (cowork) | `/op_in/server/src/routes/cowork.ts` (POST /chat) |
| Memory pipeline plan | `/op_in/MEMORY_UPGRADE_PLAN.md` |
| Full rebuild plan | `/op_in/REBUILD_PLAN.md` |

---

## Recommended Next Steps (Priority Order)

1. **MCP Server** — core product value; without it the app can't serve AI assistants
2. **`/api/cowork/chat`** — wire real Gemini AI to the chat panel (Gemini key is in user settings)
3. **Tasks page** — model exists, just needs routes + frontend page
4. **Public share page** — `/shared/:shareId` for sharing notes
5. **Semantic search** — Gemini embeddings on history + notes (requires Google API key)
6. **Channels** — team messaging; adds collaboration layer
7. **`/git`, `/projects`, `/terminal` pages** — wire to existing GitHub integration data
