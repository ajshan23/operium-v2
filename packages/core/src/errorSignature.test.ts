import { describe, it, expect } from "vitest";
import { normalizeErrorText, errorSignature } from "./errorSignature";

describe("normalizeErrorText", () => {
  it("strips line/column numbers but keeps file names", () => {
    const a = normalizeErrorText("at handler (src/api/client.ts:42:13)");
    const b = normalizeErrorText("at handler (src/api/client.ts:97:5)");
    expect(a).toBe(b);
    expect(a).toContain("client.ts");
    expect(a).not.toContain("42");
  });

  it("strips hex addresses, uuids, and long ids", () => {
    const out = normalizeErrorText(
      "Segfault at 0x7fff5fbff8c0 in request 550e8400-e29b-41d4-a716-446655440000 doc 6a4cf5a3335daceb11d48eb1"
    );
    expect(out).toContain("<addr>");
    expect(out).toContain("<uuid>");
    expect(out).toContain("<id>");
  });

  it("strips timestamps", () => {
    const a = normalizeErrorText("2026-07-19T10:15:22.123Z ECONNREFUSED 127.0.0.1");
    const b = normalizeErrorText("2026-07-20 08:01:59 ECONNREFUSED 127.0.0.1");
    expect(a).toBe(b);
    expect(a).toContain("ECONNREFUSED");
  });

  it("anonymizes user home paths but keeps the tail", () => {
    const a = normalizeErrorText("Error in /Users/alice/project/src/db.ts");
    const b = normalizeErrorText("Error in /home/bob/project/src/db.ts");
    expect(a).toBe(b);
    expect(a).toContain("project/src/db.ts");
  });

  it("two runs of the same stack normalize identically", () => {
    const run1 = `TypeError: Cannot read properties of undefined (reading 'map')
    at buildFilter (src/services/history.service.ts:33:19)
    at async getHistory (src/services/history.service.ts:126:22) 812ms`;
    const run2 = `TypeError: Cannot read properties of undefined (reading 'map')
    at buildFilter (src/services/history.service.ts:41:19)
    at async getHistory (src/services/history.service.ts:150:22) 25ms`;
    expect(normalizeErrorText(run1)).toBe(normalizeErrorText(run2));
  });
});

describe("errorSignature", () => {
  it("prefers error lines and first frames", () => {
    const sig = errorSignature(`some preamble log noise
TypeError: Cannot read properties of undefined (reading 'map')
    at buildFilter (src/services/history.service.ts:33:19)
    at async getHistory (src/services/history.service.ts:126:22)
    at async runner (node:internal/x:1:1)
    at async more (node:internal/y:1:1)
    at async even (node:internal/z:1:1)
random trailing line`);
    expect(sig).toContain("TypeError");
    expect(sig).toContain("buildFilter");
    expect(sig).not.toContain("random trailing line");
  });

  it("matches error codes (TS, E-codes)", () => {
    const sig = errorSignature("error TS2345: Argument of type 'string' is not assignable");
    expect(sig).toContain("TS2345");
    const sig2 = errorSignature("connect ECONNREFUSED 127.0.0.1:27017");
    expect(sig2).toContain("ECONNREFUSED");
  });

  it("falls back to first lines when nothing error-shaped", () => {
    const sig = errorSignature("the build just hangs forever\nno output at all");
    expect(sig).toContain("build just hangs");
  });

  it("caps length", () => {
    const sig = errorSignature("Error: " + "x".repeat(2000));
    expect(sig.length).toBeLessThanOrEqual(500);
  });
});
