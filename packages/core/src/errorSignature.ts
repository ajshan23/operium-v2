/**
 * Error-text normalization for cross-session error matching.
 *
 * Two runs of the same bug rarely produce byte-identical output: line numbers
 * shift, addresses and ids differ, timestamps change. normalizeErrorText()
 * strips those volatile parts so a stored stack trace and a fresh one match
 * both textually ($text search) and semantically (embeddings).
 */

/** Strip volatile tokens (line/col numbers, hex addresses, ids, timestamps, paths' user prefixes). */
export function normalizeErrorText(raw: string): string {
  return raw
    // ISO / common timestamps
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/g, "<ts>")
    .replace(/\b\d{2}:\d{2}:\d{2}(\.\d+)?\b/g, "<ts>")
    // hex addresses & long hex ids (0x1a2b..., 40-char shas, uuids)
    .replace(/\b0x[0-9a-fA-F]+\b/g, "<addr>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\b[0-9a-f]{24,64}\b/gi, "<id>")
    // file:line:col → file (keep the file name — it's the signal)
    .replace(/(:\d+){1,2}(?=[)\s\]]|$)/gm, "")
    // user-specific absolute path prefixes (keep the project-relative tail)
    .replace(/(?:[A-Za-z]:)?[\\/](?:Users|home)[\\/][^\\/\s]+[\\/]/g, "~/")
    // memory sizes / durations that vary run to run
    .replace(/\b\d+(\.\d+)?\s?(ms|s|MB|KB|GiB|MiB|bytes)\b/g, "<n>")
    // collapse whitespace
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Distill an error text into its searchable core: the error type/code lines
 * and the first few meaningful frames — the parts that stay stable across
 * reruns and machines. Used as the $text / embedding query.
 */
export function errorSignature(raw: string, maxChars = 500): string {
  const normalized = normalizeErrorText(raw);
  const lines = normalized.split("\n").map(l => l.trim()).filter(Boolean);

  // Error-y lines first (Error:, Exception, ECONNREFUSED, TS2345, panic:, etc.)
  const errorLines = lines.filter(l =>
    /\b([A-Z][a-z]+)*(Error|Exception|Panic|Fault)\b|error\s+[A-Z]{1,4}\d{2,5}\b|\bE[A-Z]{2,}\b|panic:|fatal:/i.test(l)
  );
  // First stack frames ("at ...", "File ...", indented frames)
  const frameLines = lines.filter(l => /^(at |File |from |#\d+ )/.test(l)).slice(0, 4);

  const picked = [...new Set([...errorLines.slice(0, 5), ...frameLines])];
  const sig = (picked.length ? picked : lines.slice(0, 5)).join("\n");
  return sig.length > maxChars ? sig.slice(0, maxChars) : sig;
}
