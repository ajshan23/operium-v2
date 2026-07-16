/**
 * Heuristic query understanding for memory search.
 *
 * Hints are SOFT signals: callers use them as ranking boosts (and optional
 * recency windows), never as hard database filters — a wrong guess must not
 * hide relevant results. Explicit arguments always win.
 */

export interface QueryHints {
  intent?: string;
  outcome?: string;
  days?: number;
  tags: string[];
}

export interface ExplicitFilters {
  intent?: string;
  outcome?: string;
  days?: number;
  tags?: string[];
}

export function parseQueryHints(query: string, explicit: ExplicitFilters = {}): QueryHints {
  const q = query.toLowerCase();
  const hints: QueryHints = { tags: [] };

  if (!explicit.intent) {
    if (/\b(fix|fixed|bug|broke|crash|error|issue|debug)\b/.test(q)) hints.intent = "bug-fix";
    else if (/\b(feature|implement|add|built|build|create|ship)\b/.test(q)) hints.intent = "feature";
    else if (/\b(refactor|restructur|clean|reorganiz|migrat)\b/.test(q)) hints.intent = "refactor";
    else if (/\b(investigat|research|explor|look into|dig into)\b/.test(q)) hints.intent = "investigation";
    else if (/\b(plan|design|architect|proposal)\b/.test(q)) hints.intent = "planning";
    else if (/\b(review|pr review|code review)\b/.test(q)) hints.intent = "review";
    else if (/\b(doc|docs|document|readme|wiki)\b/.test(q)) hints.intent = "docs";
  }

  if (!explicit.outcome) {
    // Past tense only — "fix the login bug" is an intent, not an outcome.
    if (/\b(fixed|solved|resolved)\b/.test(q)) hints.outcome = "fixed";
    else if (/\b(implemented|shipped|completed)\b/.test(q)) hints.outcome = "implemented";
    else if (/\b(blocked|stuck)\b/.test(q)) hints.outcome = "blocked";
  }

  if (!explicit.days) {
    if (/\b(today|this morning)\b/.test(q)) hints.days = 1;
    else if (/\byesterday\b/.test(q)) hints.days = 2;
    else if (/\b(recent|recently|last few days)\b/.test(q)) hints.days = 7;
    else if (/\b(this week|past week|last week)\b/.test(q)) hints.days = 7;
    else if (/\b(this month|past month|last month)\b/.test(q)) hints.days = 30;
    else { const m = q.match(/last (\d+) days?/); if (m) hints.days = parseInt(m[1]!, 10); }
  }

  const existingTags = new Set((explicit.tags || []).map(t => t.toLowerCase()));
  const patterns: [RegExp, string][] = [
    [/\b(auth|authentication|login|oauth|jwt|token|session)\b/, "auth"],
    [/\b(database|db|mongo|mongodb|postgres|sql|migration|schema)\b/, "database"],
    [/\b(api|endpoint|route|rest|graphql)\b/, "api"],
    [/\b(frontend|ui|ux|react|next|css|component)\b/, "frontend"],
    [/\b(backend|server|express|node|middleware)\b/, "backend"],
    [/\b(deploy|ci|cd|docker|k8s|pipeline)\b/, "deployment"],
    [/\b(test|testing|jest|vitest|e2e|unit)\b/, "testing"],
    [/\b(perf|performance|speed|latency|cache|optimization)\b/, "performance"],
    [/\b(security|xss|csrf|cors|injection|vulnerability)\b/, "security"],
    [/\b(websocket|realtime|sse|streaming)\b/, "realtime"],
    [/\b(search|vector|embedding|rag|ai|llm|gemini|openai)\b/, "ai"],
    [/\b(payment|stripe|billing|subscription)\b/, "payments"],
    [/\b(upload|file|s3|storage|image|media)\b/, "storage"],
    [/\b(mcp|cowork|tool|plugin)\b/, "mcp"],
  ];

  for (const [pattern, tag] of patterns) {
    if (pattern.test(q) && !existingTags.has(tag)) hints.tags.push(tag);
  }

  return hints;
}
