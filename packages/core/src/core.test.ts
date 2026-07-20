import { describe, expect, it } from "vitest";
import { contentHash } from "./hash";
import { compositeScore, recencyDecay } from "./ranking";
import { sanitize } from "./sanitize";

describe("sanitize", () => {
  it("strips private blocks", () => {
    expect(sanitize("keep <private>secret plan</private> done")).toBe("keep [private] done");
  });

  it("redacts an AWS key", () => {
    expect(sanitize("id AKIAIOSFODNN7EXAMPLE here")).toContain("[redacted:AWS_KEY]");
  });

  it("redacts a GitHub token", () => {
    const out = sanitize("token ghp_1234567890abcdefABCDEF1234567890abcd");
    expect(out).toContain("[redacted:GITHUB_TOKEN]");
    expect(out).not.toContain("ghp_1234567890");
  });

  it("redacts env values but keeps the key name", () => {
    expect(sanitize("DATABASE_URL=postgres://supersecretvalue")).toBe(
      "DATABASE_URL=[redacted]",
    );
  });
});

describe("contentHash", () => {
  it("is stable across whitespace and case", () => {
    expect(contentHash("Hello   World")).toBe(contentHash("hello world"));
  });

  it("differs for different content", () => {
    expect(contentHash("a")).not.toBe(contentHash("b"));
  });
});

describe("ranking", () => {
  const now = new Date("2026-06-13T00:00:00Z");

  it("recencyDecay halves at the half-life", () => {
    const old = new Date(now.getTime() - 60 * 86_400_000);
    expect(recencyDecay(old, now, 60)).toBeCloseTo(0.5, 5);
  });

  it("recent + helpful outranks old + unhelpful at equal relevance", () => {
    const recentHelpful = compositeScore(
      {
        relevance: 0.8,
        createdAt: now,
        helpfulCount: 5,
        notHelpfulCount: 0,
        useCount: 8,
      },
      { now },
    );
    const oldUnhelpful = compositeScore(
      {
        relevance: 0.8,
        createdAt: new Date(now.getTime() - 180 * 86_400_000),
        helpfulCount: 0,
        notHelpfulCount: 3,
        useCount: 3,
      },
      { now },
    );
    expect(recentHelpful).toBeGreaterThan(oldUnhelpful);
  });
});
