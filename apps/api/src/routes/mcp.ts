import { Router, IRouter } from "express";
import { randomUUID } from "crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import jwt from "jsonwebtoken";
import { buildMcpServer } from "@operium/mcp";
import { User } from "@operium/db";
import { embeddingService } from "../services/embedding.service.js";

const router: IRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-do-not-use-in-prod";

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  userId:    string;
  orgId:     string | null;
  geminiKey: string | undefined;
}

// In-memory session store (good for single-instance deployments)
const sessions = new Map<string, SessionEntry>();

// ── Auth resolution ───────────────────────────────────────────────────────────

async function resolveUser(req: any): Promise<{ userId: string; orgId: string | null; geminiKey?: string } | null> {
  let token: string | undefined;

  // 1. Cookie
  token = req.cookies?.["auth-token"];

  // 2. Bearer header
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  // 3. ?token= query param (for editors that don't support custom headers)
  if (!token && req.query?.token) {
    token = String(req.query.token);
  }

  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const userId  = decoded.userId as string;

    // Fetch user to get gemini key and block status
    const user = await User.findById(userId).select("isBlocked geminiApiKey").lean() as any;
    if (!user || user.isBlocked) return null;

    return { userId, orgId: null, geminiKey: user.geminiApiKey ?? undefined };
  } catch {
    return null;
  }
}

function sendUnauthorized(res: any) {
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32600, message: "Unauthorized — provide a valid Bearer token." },
    id: null,
  });
}

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
        userId:    resolved.userId,
        orgId:     resolved.orgId,
        geminiKey: resolved.geminiKey,
      });
    },
  });

  transport.onclose = () => {
    const id = transport.sessionId;
    if (id) sessions.delete(id);
  };

  const mcpServer = buildMcpServer({
    userId:    resolved.userId,
    orgId:     resolved.orgId,
    geminiKey: resolved.geminiKey,
    embedFn,
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
