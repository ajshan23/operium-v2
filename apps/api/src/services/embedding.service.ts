import { GoogleGenAI } from "@google/genai";

const EMBEDDING_MODEL = "gemini-embedding-001";
const DIMS = 768;

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
    const ai  = new GoogleGenAI({ apiKey: key });

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
      const msg: string = err?.message || "";
      if (err?.status === 429 || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate limit")) {
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
