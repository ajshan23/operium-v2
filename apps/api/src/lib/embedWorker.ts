import { CoworkChunk, User } from "@operium/db";
import { embeddingService } from "../services/embedding.service.js";

/**
 * Background backfill for cowork-chunk embeddings.
 *
 * Chunks are written with `embeddingDirty: true`; the MCP tool call embeds a
 * few inline when the caller has a personal Gemini key, and this worker sweeps
 * up the rest. Per product decision, embeddings are generated ONLY with the
 * chunk owner's own Gemini key — chunks of keyless users are skipped (their
 * memory stays keyword-searchable) and nothing is sent under a server key.
 */

const MAX_ATTEMPTS = 5;
const BATCH = 16;
const RATE_SPACING_MS = 400;
const RATE_LIMIT_BACKOFF_MS = 60_000;

let timer: NodeJS.Timeout | null = null;
let running = false;
let backoffUntil = 0;

async function cycle(): Promise<void> {
  if (running || Date.now() < backoffUntil) return;
  running = true;
  try {
    const dirty = await CoworkChunk.find({
      embeddingDirty: true,
      embeddingAttempts: { $lt: MAX_ATTEMPTS },
    })
      .sort({ createdAt: 1 })
      .limit(BATCH)
      .select("_id userId text sessionTitle sessionSource")
      .lean();
    if (dirty.length === 0) return;

    // Resolve owners' personal keys once per cycle
    const userIds = [...new Set(dirty.map(c => String(c.userId)))];
    const users = await User.find({ _id: { $in: userIds } })
      .select("+geminiApiKey")
      .lean() as any[];
    const keyByUser = new Map(users.map(u => [String(u._id), u.geminiApiKey as string | undefined]));

    for (const chunk of dirty) {
      const key = keyByUser.get(String(chunk.userId));
      if (!key) continue; // owner has no personal key — leave dirty, never counts as an attempt

      if (!chunk.text?.trim()) {
        await CoworkChunk.updateOne({ _id: chunk._id }, { embeddingDirty: false });
        continue;
      }

      try {
        const embedding = await embeddingService.embed(
          `[${chunk.sessionSource}] ${chunk.sessionTitle}\n\n${chunk.text}`,
          key,
        );
        await CoworkChunk.updateOne(
          { _id: chunk._id },
          { embedding, embeddingDirty: false },
        );
        await new Promise(r => setTimeout(r, RATE_SPACING_MS));
      } catch (err: any) {
        if (err?.code === "RATE_LIMIT") {
          backoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
          break;
        }
        await CoworkChunk.updateOne({ _id: chunk._id }, { $inc: { embeddingAttempts: 1 } });
        console.error(`[EmbedWorker] chunk ${chunk._id}:`, err?.message ?? err);
      }
    }
  } catch (err: any) {
    console.error("[EmbedWorker] cycle failed:", err?.message ?? err);
  } finally {
    running = false;
  }
}

export function startEmbedWorker(intervalMs = 10_000): void {
  if (timer) return;
  console.log(`🟣 EmbedWorker started (every ${intervalMs / 1000}s, own-key only)`);
  void cycle();
  timer = setInterval(() => void cycle(), intervalMs);
  timer.unref?.();
}

export function stopEmbedWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
