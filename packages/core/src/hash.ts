import { createHash } from "node:crypto";

/** Normalize then MD5-hash chunk text for write-time deduplication. */
export function contentHash(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ").toLowerCase();
  return createHash("md5").update(normalized).digest("hex");
}
