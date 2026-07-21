import { GoogleGenAI } from "@google/genai";

const EMBEDDING_MODEL = "gemini-embedding-001";
const DIMS = 768;

// ── Per-key rate limiting ─────────────────────────────────────────────────────
// gemini-embedding-001 has a low per-key request/minute cap (free tier ~10-20).
// Throttle PROACTIVELY per API key (sliding 60s window) so we never fire past
// the quota — the reactive 429 backoff is only a safety net. Keyed by the key
// itself, so it holds across the worker and the MCP inline-embed path (same
// process). Override the cap with EMBED_KEY_RPM.
const KEY_RPM   = Number(process.env.EMBED_KEY_RPM) || 15;
const WINDOW_MS = 60_000;
const keyHits = new Map<string, number[]>();

function recentHits(key: string): number[] {
  const now = Date.now();
  const hits = (keyHits.get(key) ?? []).filter(t => now - t < WINDOW_MS);
  if (hits.length) keyHits.set(key, hits);
  else keyHits.delete(key);
  return hits;
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na  += a[i]! * a[i]!;
    nb  += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  return cosine(a, b);
}

export function rankBySimilarity<T extends { embedding?: number[] }>(
  query: number[],
  docs: T[],
  limit = 10,
): (T & { _score: number })[] {
  return docs
    .filter(d => Array.isArray(d.embedding) && d.embedding.length === DIMS)
    .map(d => ({ ...d, _score: cosine(query, d.embedding!) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);
}

export class EmbeddingService {
  private getKey(): string {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) throw Object.assign(new Error("No GOOGLE_API_KEY configured"), { code: "NO_GEMINI_KEY" });
    return key;
  }

  async embed(text: string, apiKey?: string): Promise<number[]> {
    const key = apiKey || this.getKey();

    // Proactive per-key throttle: refuse before hitting the API when this key
    // is already at its per-minute cap. Callers (worker, MCP inline) treat
    // KEY_RATE_LIMITED as "skip, leave dirty, retry next cycle" — not a failure.
    const hits = recentHits(key);
    if (hits.length >= KEY_RPM) {
      throw Object.assign(new Error("Per-key embedding rate limit reached"), { code: "KEY_RATE_LIMITED" });
    }
    hits.push(Date.now());        // reserve the slot (counts even if the call 429s)
    keyHits.set(key, hits);

    const ai = new GoogleGenAI({ apiKey: key });

    try {
      const res = await ai.models.embedContent({
        model:    EMBEDDING_MODEL,
        contents: text.slice(0, 8192),
        config:   { outputDimensionality: DIMS },
      });

      const values = res.embeddings?.[0]?.values;
      if (!values || values.length === 0) throw new Error("No embedding values returned");
      return values;
    } catch (err: any) {
      const msg = (err?.message || "").toLowerCase();
      if (
        err?.status === 429 ||
        msg.includes("429") ||
        msg.includes("quota") ||
        msg.includes("rate limit") ||
        msg.includes("resource has been exhausted")
      ) {
        throw Object.assign(new Error("Gemini embedding rate limit reached"), { code: "RATE_LIMIT" });
      }
      throw err;
    }
  }

  async embedMany(texts: string[], apiKey?: string): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      try {
        results.push(await this.embed(text, apiKey));
      } catch {
        results.push([]);
      }
    }
    return results;
  }
}

export const embeddingService = new EmbeddingService();
