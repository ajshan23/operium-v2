import { describe, it, expect } from "vitest";
import { extractFileHints, parseQueryHints } from "./queryHints";

describe("extractFileHints", () => {
  it("finds bare filenames and paths", () => {
    expect(extractFileHints("why does client.ts throw ApiError")).toEqual(["client.ts"]);
    expect(extractFileHints("the bug in src/api/client.ts and globals.css"))
      .toEqual(["src/api/client.ts", "globals.css"]);
  });

  it("ignores non-file dotted tokens", () => {
    expect(extractFileHints("version 3.14 was released e.g. yesterday")).toEqual([]);
    expect(extractFileHints("visit example.com for docs")).toEqual([]);
  });

  it("preserves case and dedupes", () => {
    expect(extractFileHints("CanvasEditor.tsx broke, fix CanvasEditor.tsx")).toEqual(["CanvasEditor.tsx"]);
  });

  it("flows through parseQueryHints", () => {
    expect(parseQueryHints("fix the crash in notes.service.ts").files).toEqual(["notes.service.ts"]);
    expect(parseQueryHints("how did we do auth").files).toEqual([]);
  });
});
