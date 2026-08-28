import { describe, expect, it } from "vitest";
import {
  buildCanvasScene,
  canvasPreview,
  normalizeCanvasElements,
  parseCanvasScene,
} from "./canvas";

describe("canvas scenes", () => {
  it("normalizes labeled shapes and bound arrows", () => {
    const elements = normalizeCanvasElements([
      { id: "client", type: "rectangle", x: 0, y: 0, label: "Client" },
      { id: "api", type: "ellipse", x: 300, y: 0, label: "API" },
      { id: "request", type: "arrow", fromId: "client", toId: "api", label: "HTTPS" },
    ]);

    expect(elements.map(element => element.id)).toEqual([
      "client", "client-label", "api", "api-label", "request", "request-label",
    ]);
    expect(elements.find(element => element.id === "request")).toMatchObject({
      type: "arrow",
      startBinding: { elementId: "client" },
      endBinding: { elementId: "api" },
      endArrowhead: "arrow",
      points: [[0, 0], [84, 0]],
      groupIds: ["request-group"],
    });
    expect(elements.find(element => element.id === "client")?.boundElements).toEqual(
      expect.arrayContaining([{ id: "client-label", type: "text" }, { id: "request", type: "arrow" }]),
    );
    expect(elements.find(element => element.id === "request-label")).toMatchObject({
      containerId: null,
      groupIds: ["request-group"],
    });
  });

  it("sanitizes text before it is serialized", () => {
    const scene = buildCanvasScene([
      { type: "text", text: "Authorization: Bearer abcdef0123456789ghijkl" },
    ]);
    expect(JSON.stringify(scene)).toContain("Bearer [redacted]");
    expect(JSON.stringify(scene)).not.toContain("abcdef0123456789");
  });

  it("round-trips through stored JSON and creates a useful preview", () => {
    const scene = buildCanvasScene([
      { type: "diamond", label: "Approved?", x: 50, y: 50 },
    ], "#ffffff");
    const restored = parseCanvasScene(JSON.stringify(scene));
    expect(restored.appState.viewBackgroundColor).toBe("#ffffff");
    expect(restored.elements).toHaveLength(2);
    expect(canvasPreview(restored)).toContain("Approved?");
  });

  it("rejects duplicate IDs and dangling connector references", () => {
    expect(() => normalizeCanvasElements([
      { id: "same", type: "rectangle" },
      { id: "same", type: "ellipse" },
    ])).toThrow(/unique/);
    expect(() => normalizeCanvasElements([
      { id: "edge", type: "arrow", fromId: "missing", endX: 100, endY: 100 },
    ])).toThrow(/unknown fromId/);
    expect(() => normalizeCanvasElements([
      { id: "a", type: "rectangle" },
      { id: "edge", type: "arrow", fromId: "a", points: [[0, 0], [100, 0]] },
    ])).toThrow(/cannot combine points/);
  });

  it("rejects invalid colors before serialization", () => {
    expect(() => buildCanvasScene([], "red")).toThrow(/hex color/);
    expect(() => buildCanvasScene([
      { type: "rectangle", backgroundColor: "url(javascript:bad)" },
    ])).toThrow(/hex color/);
  });

  it("rejects malformed stored scenes", () => {
    expect(() => parseCanvasScene("not json")).toThrow(/valid JSON/);
    expect(() => parseCanvasScene("{}")).toThrow(/elements array/);
  });
});
