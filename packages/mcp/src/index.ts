import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { contentHash, sanitize } from "@operium/core";
import { checkpointInput } from "@operium/shared";

/** Per-request context: who is calling and which org they're scoped to. */
export interface McpContext {
  userId: string;
  orgId: string | null;
}

/**
 * Build a user-scoped MCP server. The same factory backs both the HTTP transport
 * (Claude.ai / web clients) and the stdio transport (editor plugins). Tool handlers
 * are thin adapters over @operium/core + @operium/db.
 */
export function buildMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer({
    name: "operium",
    version: "0.0.0",
  });

  // Smoke-test tool — confirms transport + auth wiring end to end.
  server.tool("ping", "Health check for the Operium MCP server.", async () => ({
    content: [{ type: "text", text: `pong (user ${ctx.userId})` }],
  }));

  // M1 will wire this to the write-time pipeline + DB. For now it validates input
  // and exercises the core sanitize/hash path so the contract is locked.
  server.tool(
    "checkpoint_cowork",
    "Save an incremental finding, fix, or decision to memory.",
    checkpointInput.shape,
    async (args) => {
      const clean = sanitize(args.finding);
      const hash = contentHash(clean);
      return {
        content: [
          {
            type: "text",
            text: `checkpoint received: "${args.title}" (hash ${hash.slice(0, 8)})`,
          },
        ],
      };
    },
  );

  return server;
}
