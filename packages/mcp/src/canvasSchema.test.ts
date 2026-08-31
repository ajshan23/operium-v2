import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildMcpServer } from "./index.js";

let client: Client | undefined;
let server: McpServer | undefined;

afterEach(async () => {
  await client?.close();
  await server?.close();
  client = undefined;
  server = undefined;
});

function arrayValuedItemsPaths(value: unknown, path = "$"): string[] {
  if (!value || typeof value !== "object") return [];

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => arrayValuedItemsPaths(entry, `${path}[${index}]`));
  }

  return Object.entries(value).flatMap(([key, entry]) => {
    const entryPath = `${path}.${key}`;
    const current = key === "items" && Array.isArray(entry) ? [entryPath] : [];
    return [...current, ...arrayValuedItemsPaths(entry, entryPath)];
  });
}

describe("canvas MCP tool schemas", () => {
  it("uses a Codex-compatible schema while preserving two-number connector points", async () => {
    server = buildMcpServer({ userId: "000000000000000000000000", orgId: null });
    client = new Client({ name: "canvas-schema-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const { tools } = await client.listTools();
    const canvasTools = ["create_canvas_note", "update_canvas_note"].map(name => {
      const tool = tools.find(candidate => candidate.name === name);
      expect(tool, `${name} should be listed`).toBeDefined();
      return tool!;
    });

    for (const tool of canvasTools) {
      expect(arrayValuedItemsPaths(tool.inputSchema)).toEqual([]);

      const input = tool.inputSchema as any;
      const point = input.properties.elements.items.properties.points.items;
      expect(point).toMatchObject({
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: { type: "number" },
      });
    }
  });
});
