import { Router, IRouter } from "express";
import { randomUUID } from "crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import jwt from "jsonwebtoken";
import { buildMcpServer } from "@operium/mcp";
import { User, Membership, McpUsageLog } from "@operium/db";
import { embeddingService } from "../services/embedding.service.js";
import { gitService } from "../services/git.service.js";
import { JWT_SECRET } from "../utils/jwtSecret.js";

const router: IRouter = Router();

interface SessionEntry {
  transport:      StreamableHTTPServerTransport;
  userId:         string;
  orgId:          string | null;
  geminiKey:      string | undefined;
  shareByDefault: boolean;
}

// In-memory session store (good for single-instance deployments)
const sessions = new Map<string, SessionEntry>();

// ── Auth resolution ───────────────────────────────────────────────────────────

async function resolveUser(req: any): Promise<{ userId: string; orgId: string | null; geminiKey?: string; shareByDefault: boolean; repoPrefs?: { repoKey: string; shared: boolean }[] } | null> {
  let token: string | undefined;

  // 1. Cookie
  token = req.cookies?.["auth-token"];

  // 2. Bearer header
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const userId  = decoded.userId as string;

    // Fetch user to get gemini key, block status, and sharing preference
    const user = await User.findById(userId).select("isBlocked geminiApiKey preferences coworkRepoPrefs").lean() as any;
    if (!user || user.isBlocked) return null;

    // Resolve the user's org so shared-memory tools stay tenant-scoped.
    // Users can hold multiple memberships — pick the oldest deterministically
    // (their primary org) instead of whatever the index returns first.
    const membership = await Membership.findOne({ userId }).sort({ createdAt: 1 }).lean() as any;
    const orgId = membership ? String(membership.orgId) : null;

    // Default to shared when the preference has never been set (legacy users).
    const shareByDefault = user.preferences?.shareCoworkByDefault !== false;

    return { userId, orgId, geminiKey: user.geminiApiKey ?? undefined, shareByDefault, repoPrefs: user.coworkRepoPrefs ?? undefined };
  } catch {
    return null;
  }
}

function sendUnauthorized(res: any) {
  // Point clients (Claude/Codex/Cursor) at the OAuth discovery doc so they can
  // run the authorization flow. Per RFC 9728 / the MCP auth spec.
  const base = process.env.SERVER_URL ?? "";
  res.setHeader(
    "WWW-Authenticate",
    `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`,
  );
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32600, message: "Unauthorized — provide a valid Bearer token." },
    id: null,
  });
}

// Settings uses this to show time-to-first-value without logging content or
// inspecting agent prompts. It is authenticated with the same cookie/Bearer
// resolution as the MCP transport.
router.get("/status", async (req: any, res: any) => {
  const resolved = await resolveUser(req);
  if (!resolved) { sendUnauthorized(res); return; }
  const [last, initialized, startup, capture, resume] = await Promise.all([
    McpUsageLog.findOne({ userId: resolved.userId, success: true }).sort({ createdAt: -1 }).lean(),
    McpUsageLog.findOne({ userId: resolved.userId, toolName: "initialize", success: true }).sort({ createdAt: -1 }).lean(),
    McpUsageLog.findOne({ userId: resolved.userId, toolName: "get_startup_context", success: true }).sort({ createdAt: -1 }).lean(),
    McpUsageLog.findOne({ userId: resolved.userId, toolName: { $in: ["capture_work", "checkpoint_cowork", "save_chat"] }, success: true }).sort({ createdAt: -1 }).lean(),
    McpUsageLog.findOne({ userId: resolved.userId, toolName: "resume_session_open", success: true }).sort({ createdAt: -1 }).lean(),
  ]);
  res.json({ connected: !!last, lastInitializationAt: initialized?.createdAt ?? null, lastSuccessfulCallAt: last?.createdAt ?? null, lastStartupAt: startup?.createdAt ?? null, lastCaptureAt: capture?.createdAt ?? null, lastResumeAt: resume?.createdAt ?? null });
});

// ── POST /mcp — all JSON-RPC requests ────────────────────────────────────────

router.post("/", async (req: any, res: any) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // Existing session
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    // Re-verify block status periodically
    const user = await User.findById(session.userId).select("isBlocked").lean() as any;
    if (!user || user.isBlocked) {
      session.transport.close();
      sessions.delete(sessionId);
      sendUnauthorized(res);
      return;
    }
    await session.transport.handleRequest(req, res, req.body);
    return;
  }

  // New session — must be initialize
  if (!isInitializeRequest(req.body)) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Expected initialize request for new session." },
      id: null,
    });
    return;
  }

  const resolved = await resolveUser(req);
  if (!resolved) {
    sendUnauthorized(res);
    return;
  }

  const embedFn = resolved.geminiKey
    ? (text: string) => embeddingService.embed(text, resolved.geminiKey)
    : undefined;

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, {
        transport,
        userId:         resolved.userId,
        orgId:          resolved.orgId,
        geminiKey:      resolved.geminiKey,
        shareByDefault: resolved.shareByDefault,
      });
      // Lifecycle telemetry deliberately stores no client prompt, repository,
      // or code — only that an authenticated MCP initialization completed.
      void McpUsageLog.create({ userId: resolved.userId, toolName: "initialize", success: true, durationMs: 0 }).catch(() => {});
    },
  });

  transport.onclose = () => {
    const id = transport.sessionId;
    if (id) sessions.delete(id);
  };

  const mcpServer = buildMcpServer({
    userId:         resolved.userId,
    orgId:          resolved.orgId,
    geminiKey:      resolved.geminiKey,
    embedFn,
    syncGitFn:      (full: boolean) => gitService.sync(resolved.userId, full),
    shareByDefault: resolved.shareByDefault,
    repoPrefs:      resolved.repoPrefs,
  });

  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// ── GET /mcp — SSE stream for server-sent events ─────────────────────────────

router.get("/", async (req: any, res: any) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const session = sessions.get(sessionId)!;
  await session.transport.handleRequest(req, res);
});

// ── DELETE /mcp — terminate session ──────────────────────────────────────────

router.delete("/", async (req: any, res: any) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    session.transport.close();
    sessions.delete(sessionId);
  }
  res.status(204).send();
});

export { router as mcpRouter };
