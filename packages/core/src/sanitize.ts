/**
 * Sanitize text before it is ever stored in the cloud. Cloud memory lives or dies
 * on trust, so this runs at the ingestion chokepoint for every MCP save path that
 * persists free-text content (cowork checkpoints/summaries/handoffs, notes, plans,
 * work history, rules) — and before any of it is sent off-site for embedding.
 *
 *  - strips `<private>…</private>` blocks (an explicit opt-out authors can wrap
 *    around anything they never want stored)
 *  - redacts high-confidence secrets: PEM private keys, AWS/Google/Slack/Stripe
 *    keys, OpenAI/Anthropic/GitHub tokens, JWTs, `Authorization: Bearer` values,
 *    and `KEY=value` env dumps
 *
 * Precision over recall: patterns target shapes that are unambiguously secrets,
 * so ordinary prose and code survive. The one broad rule (`KEY=value`) skips a
 * small allowlist of obviously-benign values (`NODE_ENV=production`, ports, log
 * levels) to avoid mangling legitimate config notes.
 */

const PRIVATE_BLOCK = /<private>[\s\S]*?<\/private>/gi;

// `KEY=value` values that are plainly not secrets — keep them readable.
const ENV_SAFE = new Set([
  "production", "development", "staging", "test", "testing", "local", "localhost",
  "true", "false", "debug", "info", "warn", "warning", "error", "verbose", "silent", "trace",
]);

const SECRET_PATTERNS: Array<{ re: RegExp; label: string }> = [
  // PEM private-key blocks (RSA/EC/OPENSSH/PGP/…) — match first, they're multiline.
  { re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/g, label: "PRIVATE_KEY" },
  { re: /AKIA[0-9A-Z]{16}/g, label: "AWS_KEY" },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/g, label: "GOOGLE_API_KEY" },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, label: "JWT" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, label: "SLACK_TOKEN" },
  { re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g, label: "STRIPE_KEY" },
  { re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, label: "ANTHROPIC_KEY" },
  { re: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}\b/g, label: "OPENAI_KEY" },
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, label: "GITHUB_TOKEN" },
  { re: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g, label: "BEARER" },
  // KEY=secret style lines (env dumps) — redact the value, keep the key name.
  { re: /\b([A-Z][A-Z0-9_]{3,})\s*=\s*['"]?([^\s'"]{8,})['"]?/g, label: "ENV_VALUE" },
];

export function sanitize(input: string): string {
  let out = input.replace(PRIVATE_BLOCK, "[private]");
  for (const { re, label } of SECRET_PATTERNS) {
    if (label === "ENV_VALUE") {
      out = out.replace(re, (m, key: string, val: string) =>
        ENV_SAFE.has(val.toLowerCase()) || /^\d+(?:\.\d+)*$/.test(val) ? m : `${key}=[redacted]`);
    } else if (label === "BEARER") {
      out = out.replace(re, "Bearer [redacted]");
    } else {
      out = out.replace(re, `[redacted:${label}]`);
    }
  }
  return out;
}
