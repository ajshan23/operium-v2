import { describe, expect, it } from "vitest";
import { splitMarkdownChunks, markdownQualityNudge, snippet } from "./chunk";
import { parseQueryHints } from "./queryHints";

const fenceCount = (s: string) => (s.match(/```/g) ?? []).length;

describe("splitMarkdownChunks", () => {
  it("returns empty for blank input", () => {
    expect(splitMarkdownChunks("")).toEqual([]);
    expect(splitMarkdownChunks("   \n  ")).toEqual([]);
  });

  it("passes short text through as a single chunk", () => {
    expect(splitMarkdownChunks("## Small\n\nfine")).toEqual(["## Small\n\nfine"]);
  });

  it("never splits inside a code fence", () => {
    const code = "```ts\n" + Array.from({ length: 30 }, (_, i) => `const line${i} = ${i};`).join("\n") + "\n```";
    const text = `## Finding\n\n${"prose ".repeat(150)}\n\n${code}\n\n${"more prose ".repeat(100)}`;
    const chunks = splitMarkdownChunks(text, 1200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(fenceCount(c) % 2).toBe(0); // fence integrity: fences open AND close in every chunk
    }
  });

  it("re-fences oversized code blocks preserving the language tag", () => {
    const bigCode = "```python\n" + Array.from({ length: 200 }, (_, i) => `x_${i} = compute_${i}()`).join("\n") + "\n```";
    const chunks = splitMarkdownChunks(bigCode, 800);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.startsWith("```python\n")).toBe(true);
      expect(c.endsWith("\n```")).toBe(true);
      expect(c.length).toBeLessThanOrEqual(900);
    }
  });

  it("closes an unterminated trailing fence", () => {
    const text = "## Cut off\n\n" + "p ".repeat(700) + "\n\n```js\nconst a = 1;\nconst b = 2;";
    const chunks = splitMarkdownChunks(text, 1200);
    for (const c of chunks) expect(fenceCount(c) % 2).toBe(0);
    expect(chunks.join("\n\n")).toContain("const b = 2;");
  });

  it("packs paragraphs on \\n\\n boundaries and never splits words in packed prose", () => {
    const paras = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} ${"word ".repeat(40)}`.trim());
    const chunks = splitMarkdownChunks(paras.join("\n\n"), 1200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(1200);
      expect(c.startsWith("Paragraph")).toBe(true); // chunks start at paragraph boundaries
    }
  });

  it("falls back to word-boundary windows for one giant paragraph", () => {
    const giant = "word ".repeat(800).trim();
    const chunks = splitMarkdownChunks(giant, 1200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.startsWith("word")).toBe(true);
      expect(c.endsWith("word")).toBe(true); // no mid-word cuts
    }
  });
});

describe("markdownQualityNudge", () => {
  it("ignores short saves", () => {
    expect(markdownQualityNudge("quick note about the fix")).toBeNull();
  });

  it("nudges a long wall of text", () => {
    const wall = "then we looked at the middleware and it turned out the header was missing so ".repeat(10);
    expect(markdownQualityNudge(wall)).toMatch(/Formatting/);
  });

  it("nudges unfenced code", () => {
    const text = ("some explanation here and more words to pad this out beyond limits. ").repeat(8) +
      "\n\nconst broken = await fetch(url); function handle() {}";
    expect(markdownQualityNudge(text)).toMatch(/outside ``` fences/);
  });

  it("accepts well-structured markdown", () => {
    const good = "## What happened\n\n- point one\n- point two\n\n```ts\nconst x = 1;\n```\n\n" +
      "**Files:** `a.ts`\n\n" + "more detail here. ".repeat(30);
    expect(markdownQualityNudge(good)).toBeNull();
  });
});

describe("snippet", () => {
  it("cuts at a newline, not mid-line", () => {
    const text = "line one is here\nline two is much longer and keeps going\nline three";
    const s = snippet(text, 40);
    expect(s.endsWith("…")).toBe(true);
    expect(s).not.toContain("keeps go …");
  });

  it("returns short text unchanged", () => {
    expect(snippet("short", 300)).toBe("short");
  });
});

describe("parseQueryHints", () => {
  it("detects intent and tags", () => {
    const h = parseQueryHints("how did we fix the auth bug", {});
    expect(h.intent).toBe("bug-fix");
    expect(h.tags).toContain("auth");
  });

  it("does not treat imperative 'fix' as an outcome", () => {
    expect(parseQueryHints("fix the login bug", {}).outcome).toBeUndefined();
    expect(parseQueryHints("we fixed the login bug", {}).outcome).toBe("fixed");
  });

  it("maps time phrases to day windows", () => {
    expect(parseQueryHints("what did I do yesterday", {}).days).toBe(2);
    expect(parseQueryHints("summarize last 14 days", {}).days).toBe(14);
  });

  it("never overrides explicit args", () => {
    const h = parseQueryHints("fixed the bug yesterday", { intent: "feature", outcome: "blocked", days: 30 });
    expect(h.intent).toBeUndefined();
    expect(h.outcome).toBeUndefined();
    expect(h.days).toBeUndefined();
  });
});
