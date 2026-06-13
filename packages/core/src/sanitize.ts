/**
 * Sanitize text before it is ever stored in the cloud. Cloud memory lives or dies
 * on trust, so this runs at the single ingestion chokepoint for every save path.
 *
 *  - strips `<private>…</private>` blocks
 *  - redacts obvious secrets (AWS keys, JWTs, OpenAI/Anthropic/GitHub tokens, KEY=val)
 */

const PRIVATE_BLOCK = /<private>[\s\S]*?<\/private>/gi;

const SECRET_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /AKIA[0-9A-Z]{16}/g, label: "AWS_KEY" },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, label: "JWT" },
  { re: /\bsk-[A-Za-z0-9]{20,}\b/g, label: "OPENAI_KEY" },
  { re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, label: "ANTHROPIC_KEY" },
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, label: "GITHUB_TOKEN" },
  // KEY=secret style lines (env dumps) — redact the value, keep the key name.
  {
    re: /\b([A-Z][A-Z0-9_]{3,})\s*=\s*['"]?[^\s'"]{8,}['"]?/g,
    label: "ENV_VALUE",
  },
];

export function sanitize(input: string): string {
  let out = input.replace(PRIVATE_BLOCK, "[private]");
  for (const { re, label } of SECRET_PATTERNS) {
    if (label === "ENV_VALUE") {
      out = out.replace(re, (_m, key: string) => `${key}=[redacted]`);
    } else {
      out = out.replace(re, `[redacted:${label}]`);
    }
  }
  return out;
}
