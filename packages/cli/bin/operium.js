#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const value = (name) => args[args.indexOf(name) + 1];

if (args[0] !== "init") {
  console.log("Usage: operium init [--client claude|codex|both] [--mcp-url URL] [--token TOKEN]");
  process.exit(args[0] ? 1 : 0);
}

const root = process.cwd();
const client = value("--client") || "both";
const mcpUrl = value("--mcp-url") || process.env.OPERIUM_MCP_URL || "http://localhost:4000/mcp";
const token = value("--token") || process.env.OPERIUM_TOKEN;
if (!["claude", "codex", "both"].includes(client)) {
  console.error("--client must be claude, codex, or both");
  process.exit(1);
}
const git = (command) => {
  try { return execFileSync("git", command, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
};
const repoUrl = git(["remote", "get-url", "origin"]);
const branch = git(["branch", "--show-current"]);
const commitSha = git(["rev-parse", "HEAD"]);

mkdirSync(resolve(root, ".operium"), { recursive: true });
writeFileSync(resolve(root, ".operium", "workspace.json"), `${JSON.stringify({ repoUrl: repoUrl || undefined, branch: branch || undefined, commitSha: commitSha || undefined, mcpUrl }, null, 2)}\n`);

const instructions = `\n<!-- operium:start -->
## Operium workflow

Operium is available for this repository. At the start of every coding task, call \`get_startup_context\` with the repository/worktree from \`.operium/workspace.json\`. Then use \`capture_work\` privately at start, after meaningful progress or a blocker, and at finish with the next concrete action. Do not ask the developer to manage this workflow. Use detailed or shared tools only when they explicitly ask.
<!-- operium:end -->
`;
const writeInstructions = (name) => {
  const path = resolve(root, name);
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const next = current.includes("<!-- operium:start -->")
    ? current.replace(/<!-- operium:start -->[\s\S]*?<!-- operium:end -->/, instructions.trim())
    : `${current.trimEnd()}${instructions}`;
  writeFileSync(path, `${next.trimEnd()}\n`);
  console.log(`✓ ${name} updated`);
};
if (client === "claude" || client === "both") writeInstructions("CLAUDE.md");
if (client === "codex" || client === "both") writeInstructions("AGENTS.md");

const mcpRequest = async (body, sessionId) => {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const response = await fetch(mcpUrl, { method: "POST", headers, body: JSON.stringify(body) });
  const result = await response.json().catch(() => null);
  return { ok: response.ok && !result?.error, result, sessionId: response.headers.get("mcp-session-id") || sessionId };
};

let verified = false;
let contextFound = false;
if (token) {
  try {
    const initialized = await mcpRequest({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "operium-cli", version: "0.0.0" } },
    });
    if (initialized.ok && initialized.sessionId) {
      const ping = await mcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "ping", arguments: {} } }, initialized.sessionId);
      verified = ping.ok;
      if (verified) {
        const startup = await mcpRequest({
          jsonrpc: "2.0", id: 3, method: "tools/call",
          params: { name: "get_startup_context", arguments: { repos: repoUrl ? [{ repoUrl, branch: branch || undefined, commitSha: commitSha || undefined }] : [] } },
        }, initialized.sessionId);
        const brief = JSON.stringify(startup.result ?? "");
        contextFound = startup.ok && !brief.includes("No Relevant Memory Yet");
      }
    }
  } catch { /* connection guidance below */ }
}
console.log(`✓ Workspace: ${repoUrl || "no git remote"}${branch ? ` @ ${branch}` : ""}`);
console.log(`✓ Private capture enabled; automatic records are never shared by this setup.`);
console.log(verified
  ? `✓ MCP connection verified; ${contextFound ? "relevant context found" : "no context yet"}.`
  : `! MCP configuration written. ${token ? "Could not verify the MCP endpoint." : "Pass --token or OPERIUM_TOKEN to verify it now."}`);
