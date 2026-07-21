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

  it("keeps benign env values readable", () => {
    expect(sanitize("run with NODE_ENV=production")).toBe("run with NODE_ENV=production");
    expect(sanitize("set PORT=4000")).toBe("set PORT=4000");
  });

  it("redacts a Google/Gemini API key", () => {
    // Google keys are AIza + exactly 35 chars
    const out = sanitize("key AIzaabcdefghijklmnopqrstuvwxyz012345678 end");
    expect(out).toContain("[redacted:GOOGLE_API_KEY]");
    expect(out).not.toContain("AIzaabc");
  });

  it("redacts a Slack token", () => {
    expect(sanitize("xoxb-123456789012-abcdefGHIJKL")).toContain("[redacted:SLACK_TOKEN]");
  });

  it("redacts a Stripe secret key", () => {
    expect(sanitize("sk_live_abcdef0123456789ABCDEF")).toContain("[redacted:STRIPE_KEY]");
  });

  it("redacts an OpenAI project key with hyphens", () => {
    const out = sanitize("sk-proj-abcdefghij0123456789KLMNOP");
    expect(out).toContain("[redacted:OPENAI_KEY]");
    expect(out).not.toContain("sk-proj-abcdef");
  });

  it("redacts a PEM private key block", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\nabc123\n-----END RSA PRIVATE KEY-----";
    expect(sanitize(`here it is ${pem} done`)).toBe("here it is [redacted:PRIVATE_KEY] done");
  });

  it("redacts a Bearer token but keeps the scheme", () => {
    const out = sanitize("Authorization: Bearer abcdef0123456789ghijkl");
    expect(out).toContain("Bearer [redacted]");
    expect(out).not.toContain("abcdef0123456789");
  });

  it("leaves ordinary prose and code untouched", () => {
    const text = "We fixed the bug in `auth.middleware.ts` — see commit a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2.";
    expect(sanitize(text)).toBe(text);
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
