/**
 * Markdown-aware text chunking.
 *
 * Agents save rich Markdown (headings, fenced code blocks); chunks are stored
 * individually and re-rendered as Markdown in the web app, so a chunk boundary
 * must never fall inside a code fence or mid-word.
 */

interface Block {
  text: string;
  fence: boolean;
  lang: string; // info string of a fence ("" for prose blocks)
}

/** Split text into prose paragraphs and atomic fenced-code blocks. */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const pushProse = (s: string) => {
    for (const p of s.split(/\n{2,}/)) {
      if (p.trim()) blocks.push({ text: p.trim(), fence: false, lang: "" });
    }
  };

  // Matches a fence to its closer, or (last resort) to end-of-text when unterminated.
  const fenceRe = /```([^\n]*)\n[\s\S]*?(?:\n```|$)/g;
  let last = 0;
  for (const m of text.matchAll(fenceRe)) {
    pushProse(text.slice(last, m.index));
    let fenceText = m[0];
    if (!/\n```\s*$/.test(fenceText)) fenceText += "\n```"; // close unterminated fence
    blocks.push({ text: fenceText.trim(), fence: true, lang: (m[1] ?? "").trim() });
    last = m.index! + m[0].length;
  }
  pushProse(text.slice(last));
  return blocks;
}

/** Split an oversized fenced block on line boundaries, re-fencing each piece. */
function splitFence(block: Block, maxLen: number): string[] {
  const open = "```" + block.lang;
  const inner = block.text
    .replace(/^```[^\n]*\n?/, "")
    .replace(/\n?```\s*$/, "");
  const budget = Math.max(maxLen - open.length - 8, 200);

  const pieces: string[] = [];
  let cur = "";
  for (const line of inner.split("\n")) {
    if (cur && cur.length + line.length + 1 > budget) {
      pieces.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n${line}` : line;
  }
  if (cur) pieces.push(cur);
  return pieces.map(p => `${open}\n${p}\n\`\`\``);
}

/** Split oversized prose at word boundaries with a sliding-window overlap. */
function splitProse(text: string, maxLen: number, overlap = 150): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLen, text.length);
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(" ", end);
      if (lastSpace > start + maxLen / 2) end = lastSpace;
    }
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean);
}

const HEADING_RE = /^#{1,6}\s/;

export interface ChunkOptions {
  /**
   * Start a new chunk at every Markdown heading, so each chunk is one topical
   * section (heading + its content) rather than several unrelated paragraphs
   * packed together. Sharper embeddings / better retrieval precision. Used for
   * cowork sessions, whose findings/summaries are heading-structured.
   */
  breakOnHeadings?: boolean;
}

/**
 * Split Markdown into chunks of roughly `maxLen` characters without ever
 * breaking inside a code fence or mid-word. Paragraphs are greedily packed
 * (unless `breakOnHeadings` forces a break at each heading); oversized fences
 * are re-fenced per piece with their language tag preserved, so every emitted
 * chunk is independently valid Markdown.
 */
export function splitMarkdownChunks(text: string, maxLen = 1200, opts: ChunkOptions = {}): string[] {
  const t = text.trim();
  if (!t) return [];
  // Small text is a single chunk — unless we're sectioning, where a short
  // multi-heading doc should still split one-topic-per-chunk.
  if (t.length <= maxLen && !opts.breakOnHeadings) return [t];

  const chunks: string[] = [];
  let cur = "";
  const flush = () => { if (cur) { chunks.push(cur); cur = ""; } };

  for (const block of toBlocks(t)) {
    // A heading opens a new section — flush whatever preceded it so the heading
    // stays attached to its own content in a single chunk.
    if (opts.breakOnHeadings && !block.fence && HEADING_RE.test(block.text)) flush();

    const parts = block.text.length > maxLen
      ? (block.fence ? splitFence(block, maxLen) : splitProse(block.text, maxLen))
      : [block.text];

    for (const part of parts) {
      if (cur && cur.length + part.length + 2 > maxLen) flush();
      cur = cur ? `${cur}\n\n${part}` : part;
    }
  }
  flush();
  return chunks;
}

/**
 * Returns a gentle formatting reminder when a long save looks like an
 * unstructured wall of text (or contains code outside fences), else null.
 * Advisory only — callers must never reject the save.
 */
export function markdownQualityNudge(text: string): string | null {
  if (text.length < 400) return null;

  const structured =
    /(^|\n)(#{1,4} |[-*] |\d+\. |> )/.test(text) ||
    text.includes("```") ||
    /\n\n/.test(text);
  const looksLikeCode =
    /(\bconst |\bfunction |\bimport |\bexport |\bdef |\bclass |=> |\bSELECT \b|\bawait )/.test(text);
  const unfencedCode = looksLikeCode && !text.includes("```");

  const issues: string[] = [];
  if (!structured) issues.push("no headings, bullets, or paragraph breaks");
  if (unfencedCode) issues.push("code detected outside ``` fences");

  return issues.length
    ? `⚠️ Formatting: ${issues.join("; ")}. Saves render as Markdown in the web app and are read back by other agents — use ## headings, bullet lists, and fenced code blocks with language tags next time.`
    : null;
}

/**
 * Truncate for display: cut at the last newline (preferred) or word boundary
 * before `max`, so Markdown snippets don't end mid-line or mid-fence.
 */
export function snippet(text: string, max = 300): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const window = t.slice(0, max);
  const cutAt = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(" "));
  return (cutAt > max / 2 ? window.slice(0, cutAt) : window).trimEnd() + " …";
}
