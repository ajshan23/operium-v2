import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { randomBytes } from "node:crypto";

const VERSION = "0.2.0";
const DEFAULT_URL = "http://localhost:4000/mcp";
const START = "<!-- operium:start -->";
const END = "<!-- operium:end -->";
const HELP = `Operium — private, branch-aware memory for coding agents

Usage: operium <command> [options]

Commands:
  init                 Link project, write instructions, and configure MCP clients
  status               Show active repo, endpoint, clients, and credential source
  doctor               Diagnose project/client/MCP readiness
  resume               Print the branch-aware startup brief (requires OPERIUM_TOKEN)
  connect              Repair client MCP configuration
  disconnect           Remove only Operium MCP configuration
  login                Start Codex MCP OAuth login
  config path          Print .operium/config.json
  uninstall            Remove only Operium-owned project files/markers

Options: --client <codex|claude|both> --mcp-url <url> --cwd <dir> --yes
         --dry-run --json --verify --skip-connect --debug --help --version

Precedence: --mcp-url → OPERIUM_MCP_URL → .operium/config.json → ${DEFAULT_URL}
Credentials are never written to project files. Use OAuth or OPERIUM_TOKEN.`;

function parse(argv) {
  const opt = { yes: false, dryRun: false, json: false, verify: false, skipConnect: false };
  const words = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("-")) { words.push(a); continue; }
    if (["--yes", "--non-interactive", "-y"].includes(a)) { opt.yes = true; continue; }
    if (a === "--dry-run") { opt.dryRun = true; continue; }
    if (a === "--json") { opt.json = true; continue; }
    if (a === "--verify") { opt.verify = true; continue; }
    if (a === "--skip-connect") { opt.skipConnect = true; continue; }
    if (["--help", "-h"].includes(a)) { opt.help = true; continue; }
    if (["--version", "-v"].includes(a)) { opt.version = true; continue; }
    const [name, inline] = a.split("=", 2);
    if (["--client", "--mcp-url", "--cwd"].includes(name)) {
      const value = inline ?? argv[++i];
      if (!value) throw new Error(`${name} requires a value`);
      opt[name.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
      continue;
    }
    throw new Error(`Unknown option: ${a}`);
  }
  return { command: words[0] ?? "help", subcommand: words[1], opt };
}

function exec(command, args, cwd) {
  try { return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; }
}
function available(command) { return Boolean(exec(process.platform === "win32" ? "where" : "which", [command], process.cwd())); }
function json(path, fallback = null) { if (!existsSync(path)) return fallback; try { return JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error(`Invalid JSON: ${path}`); } }
function write(path, value, backup, changes) {
  const before = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (before === value) return;
  changes.push({ path, action: before === null ? "create" : "update" });
  mkdirSync(dirname(path), { recursive: true });
  if (before !== null) { mkdirSync(backup, { recursive: true }); writeFileSync(join(backup, `${Date.now()}-${path.split("/").pop()}.bak`), before, { mode: 0o600 }); }
  const temp = `${path}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
  writeFileSync(temp, value, { mode: 0o600 }); renameSync(temp, path);
}
function workspace(cwd) {
  const root = resolve(exec("git", ["rev-parse", "--show-toplevel"], cwd) || cwd);
  return { root, repoUrl: exec("git", ["remote", "get-url", "origin"], root) || undefined, branch: exec("git", ["branch", "--show-current"], root) || undefined, commitSha: exec("git", ["rev-parse", "HEAD"], root) || undefined };
}
function endpoint(opt, config) {
  const value = opt.mcpUrl || process.env.OPERIUM_MCP_URL || config?.mcpUrl || DEFAULT_URL;
  const source = opt.mcpUrl ? "flag" : process.env.OPERIUM_MCP_URL ? "OPERIUM_MCP_URL" : config?.mcpUrl ? "project config" : "default";
  let parsed; try { parsed = new URL(value); } catch { throw new Error(`Invalid MCP URL: ${value}`); }
  if (!/^https?:$/.test(parsed.protocol) || (parsed.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname))) throw new Error("Use HTTPS for non-local MCP endpoints.");
  return { value: parsed.toString().replace(/\/$/, ""), source };
}
function clients(value) { if (!value || value === "both") return ["codex", "claude"]; if (["codex", "claude"].includes(value)) return [value]; throw new Error("--client must be codex, claude, or both"); }
function instructions() { return `${START}\n## Operium workflow\n\nAt task start, call \`get_startup_context\` with \`.operium/workspace.json\`. Use private \`capture_work\` at start, meaningful progress/blockers, and finish with the next action. Do not ask the developer to manage this workflow.\n${END}`; }
function mergeInstruction(previous) { const block = instructions(); return previous.includes(START) ? `${previous.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block).trimEnd()}\n` : `${previous.trimEnd()}${previous.trim() ? "\n\n" : ""}${block}\n`; }
function claudeMcp(url, current) { return { ...(current ?? {}), mcpServers: { ...(current?.mcpServers ?? {}), operium: { type: "http", url, headers: { Authorization: "Bearer ${OPERIUM_TOKEN}" } } } }; }
function state(ctx) {
  const mcp = json(join(ctx.root, ".mcp.json"), null);
  const codex = available("codex");
  const codexConfigured = codex && spawnSync("codex", ["mcp", "get", "operium", "--json"], { stdio: "ignore" }).status === 0;
  return { codex: { installed: codex, configured: codexConfigured }, claude: { installed: available("claude"), configured: Boolean(mcp?.mcpServers?.operium) } };
}
function print(payload, opt, lines) { process.stdout.write(opt.json ? `${JSON.stringify(payload, null, 2)}\n` : `${lines.join("\n")}\n`); }
async function confirm(message, opt) {
  if (opt.yes) return true;
  if (!process.stdin.isTTY) return false;
  const { createInterface } = await import("node:readline/promises"); const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${message} [y/N] `); rl.close(); return /^(y|yes)$/i.test(answer.trim());
}
async function request(url, body, sid) {
  const headers = { "content-type": "application/json" }; if (process.env.OPERIUM_TOKEN) headers.authorization = `Bearer ${process.env.OPERIUM_TOKEN}`; if (sid) headers["mcp-session-id"] = sid;
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) }); const result = await response.json().catch(() => null);
  return { ok: response.ok && !result?.error, result, status: response.status, sid: response.headers.get("mcp-session-id") || sid };
}
async function verify(url) {
  if (!process.env.OPERIUM_TOKEN) return { ok: false, detail: "Set OPERIUM_TOKEN or complete client OAuth." };
  try { const init = await request(url, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "operium-cli", version: VERSION } } }); if (!init.ok || !init.sid) return { ok: false, detail: `Initialize failed (${init.status})` }; const ping = await request(url, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "ping", arguments: {} } }, init.sid); return ping.ok ? { ok: true, sid: init.sid } : { ok: false, detail: `Ping failed (${ping.status})` }; } catch (error) { return { ok: false, detail: error instanceof Error ? error.message : String(error) }; }
}
function codexConnect(url, opt, actions) {
  if (!available("codex")) return "Codex not installed.";
  if (spawnSync("codex", ["mcp", "get", "operium", "--json"], { stdio: "ignore" }).status === 0) return "Codex already configured.";
  const args = ["mcp", "add", "operium", "--url", url, "--bearer-token-env-var", "OPERIUM_TOKEN"]; actions.push(`codex ${args.join(" ")}`);
  if (!opt.dryRun) { const result = spawnSync("codex", args, { encoding: "utf8" }); if (result.status !== 0) throw new Error(`Codex setup failed: ${(result.stderr || result.stdout).trim()}`); }
  return opt.dryRun ? "Would configure Codex." : "Configured Codex.";
}
function context(opt) { const ws = workspace(opt.cwd ? resolve(opt.cwd) : process.cwd()); const dir = join(ws.root, ".operium"); const configPath = join(dir, "config.json"); const legacy = json(join(dir, "workspace.json"), null); const config = json(configPath, legacy?.mcpUrl ? { schemaVersion: 1, mcpUrl: legacy.mcpUrl } : null); return { ...ws, dir, configPath, workspacePath: join(dir, "workspace.json"), config, endpoint: endpoint(opt, config) }; }

export async function run(argv) {
  const { command, subcommand, opt } = parse(argv);
  if (opt.version) return print({}, opt, [VERSION]); if (opt.help || command === "help") return print({}, opt, [HELP]);
  const ctx = context(opt); const configuredClients = clients(opt.client || (ctx.config?.clients?.length === 2 ? "both" : ctx.config?.clients?.[0]) || "both");
  if (command === "status") { const clientsState = state(ctx); return print({ version: VERSION, workspace: workspace(ctx.root), endpoint: ctx.endpoint, configPath: ctx.configPath, clients: clientsState, credentialSource: process.env.OPERIUM_TOKEN ? "OPERIUM_TOKEN" : "OAuth/not available to CLI" }, opt, [`Operium status — ${ctx.root}`, `Repository: ${ctx.repoUrl ?? "none"}${ctx.branch ? ` @ ${ctx.branch}` : ""}`, `Endpoint: ${ctx.endpoint.value} (${ctx.endpoint.source})`, `Codex: ${clientsState.codex.installed ? clientsState.codex.configured ? "configured" : "installed, not configured" : "not installed"}`, `Claude Code: ${clientsState.claude.configured ? "project config ready" : clientsState.claude.installed ? "installed, not configured" : "not installed"}`, `Credentials: ${process.env.OPERIUM_TOKEN ? "OPERIUM_TOKEN" : "OAuth/not available to CLI"}`]); }
  if (command === "doctor") { const c = state(ctx); const checks = [{ name: "Git remote", ok: Boolean(ctx.repoUrl), detail: ctx.repoUrl ?? "No remote" }, { name: "Project config", ok: Boolean(ctx.config), detail: ctx.configPath }, { name: "Codex", ok: !configuredClients.includes("codex") || c.codex.configured, detail: c.codex.configured ? "configured" : "run operium connect --client codex" }, { name: "Claude Code", ok: !configuredClients.includes("claude") || c.claude.configured, detail: c.claude.configured ? "configured" : "run operium connect --client claude" }]; if (opt.verify || process.env.OPERIUM_TOKEN) { const v = await verify(ctx.endpoint.value); checks.push({ name: "MCP handshake", ok: v.ok, detail: v.ok ? "initialize + ping passed" : v.detail }); } else checks.push({ name: "MCP handshake", ok: false, detail: "set OPERIUM_TOKEN or complete OAuth, then use --verify" }); const healthy = checks.every(x => x.ok); print({ healthy, checks }, opt, [`Operium doctor — ${ctx.root}`, "", ...checks.map(x => `${x.ok ? "✓" : "✗"} ${x.name}: ${x.detail}`), "", healthy ? "All checks passed." : "Run operium init --yes or operium connect --yes to repair."]); return healthy ? 0 : 2; }
  if (command === "init" || command === "connect") { const changes = []; const actions = []; if (command === "init") { const ok = opt.dryRun || await confirm("Operium will update project files and client configuration.", opt); if (!ok) { print({ applied: false }, opt, ["No changes made. Re-run with --yes after reviewing the plan."]); return 2; } const config = { schemaVersion: 1, mcpUrl: ctx.endpoint.value, clients: configuredClients, configuredAt: new Date().toISOString() }; const ws = { repoUrl: ctx.repoUrl, branch: ctx.branch, commitSha: ctx.commitSha, root: ctx.root, mcpUrl: ctx.endpoint.value }; const gitignore = existsSync(join(ctx.root, ".gitignore")) ? readFileSync(join(ctx.root, ".gitignore"), "utf8") : ""; const ignored = gitignore.includes(".operium/workspace.json") ? gitignore : `${gitignore.trimEnd()}\n\n# Operium local state\n.operium/workspace.json\n.operium/backups/\n.operium/diagnostics.json\n`; const files = [[ctx.configPath, `${JSON.stringify(config, null, 2)}\n`], [ctx.workspacePath, `${JSON.stringify(ws, null, 2)}\n`], [join(ctx.root, ".gitignore"), ignored]]; if (configuredClients.includes("codex")) files.push([join(ctx.root, "AGENTS.md"), mergeInstruction(existsSync(join(ctx.root, "AGENTS.md")) ? readFileSync(join(ctx.root, "AGENTS.md"), "utf8") : "")]); if (configuredClients.includes("claude")) { files.push([join(ctx.root, "CLAUDE.md"), mergeInstruction(existsSync(join(ctx.root, "CLAUDE.md")) ? readFileSync(join(ctx.root, "CLAUDE.md"), "utf8") : "")]); files.push([join(ctx.root, ".mcp.json"), `${JSON.stringify(claudeMcp(ctx.endpoint.value, json(join(ctx.root, ".mcp.json"), null)), null, 2)}\n`]); } if (opt.dryRun) files.forEach(([path]) => changes.push({ path, action: existsSync(path) ? "update" : "create" })); else files.forEach(([path, text]) => write(path, text, join(ctx.dir, "backups"), changes)); }
    if (!opt.skipConnect && configuredClients.includes("codex")) codexConnect(ctx.endpoint.value, opt, actions); const v = opt.dryRun ? null : await verify(ctx.endpoint.value); print({ applied: !opt.dryRun, changes, actions, verification: v }, opt, [`Operium ${command}`, ...changes.map(x => `  ${x.action === "create" ? "+" : "~"} ${relative(ctx.root, x.path)}`), ...actions.map(x => `  → ${x}`), opt.dryRun ? "Dry run only — no changes made." : v?.ok ? "✓ Connected, startup-ready, private capture enabled." : `! Setup saved. ${v?.detail ?? "Complete OAuth or set OPERIUM_TOKEN to verify."}`]); return 0; }
  if (command === "disconnect") { const changes = []; const actions = []; const ok = opt.dryRun || await confirm("Remove only Operium MCP configuration?", opt); if (!ok) return 2; const path = join(ctx.root, ".mcp.json"); const mcp = json(path, null); if (mcp?.mcpServers?.operium) { delete mcp.mcpServers.operium; if (opt.dryRun) changes.push({ path, action: "update" }); else write(path, `${JSON.stringify(mcp, null, 2)}\n`, join(ctx.dir, "backups"), changes); } if (configuredClients.includes("codex") && available("codex")) { actions.push("codex mcp remove operium"); if (!opt.dryRun) spawnSync("codex", ["mcp", "remove", "operium"], { stdio: "ignore" }); } print({ changes, actions }, opt, [...changes.map(x => `  ~ ${relative(ctx.root, x.path)}`), ...actions.map(x => `  → ${x}`), "Operium connections removed."]); return 0; }
  if (command === "resume") { if (!process.env.OPERIUM_TOKEN) throw new Error("Set OPERIUM_TOKEN for CLI resume; OAuth clients can resume in the agent."); const init = await request(ctx.endpoint.value, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "operium-cli", version: VERSION } } }); if (!init.ok || !init.sid) throw new Error(`MCP initialize failed (${init.status})`); const start = await request(ctx.endpoint.value, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_startup_context", arguments: { repos: ctx.repoUrl ? [{ repoUrl: ctx.repoUrl, branch: ctx.branch, commitSha: ctx.commitSha }] : [] } } }, init.sid); if (!start.ok) throw new Error(`Startup brief failed (${start.status})`); const brief = start.result?.result?.content?.map?.(x => x.text).join("\n") ?? start.result?.content?.map?.(x => x.text).join("\n") ?? JSON.stringify(start.result); return print({ brief, workspace: workspace(ctx.root) }, opt, [`Operium resume — ${ctx.branch ?? "detached HEAD"}`, "", brief]); }
  if (command === "login") { if (!available("codex")) throw new Error("Install Codex, or use OPERIUM_TOKEN in CI."); if (opt.dryRun) return print({ command: "codex mcp login operium" }, opt, ["Would run: codex mcp login operium"]); return process.exitCode = spawnSync("codex", ["mcp", "login", "operium"], { stdio: "inherit" }).status ?? 1; }
  if (command === "config" && subcommand === "path") return print({ path: ctx.configPath }, opt, [ctx.configPath]);
  if (command === "uninstall") { const ok = await confirm("Remove only Operium-owned project files and instruction blocks?", opt); if (!ok) return 2; const changes = []; for (const name of ["AGENTS.md", "CLAUDE.md"]) { const path = join(ctx.root, name); if (!existsSync(path)) continue; const next = readFileSync(path, "utf8").replace(new RegExp(`\\n?${START}[\\s\\S]*?${END}\\n?`), "").trimEnd(); if (next) write(path, `${next}\n`, join(ctx.dir, "backups"), changes); else { changes.push({ path, action: "remove" }); if (!opt.dryRun) rmSync(path); } } for (const path of [ctx.configPath, ctx.workspacePath]) if (existsSync(path)) { changes.push({ path, action: "remove" }); if (!opt.dryRun) rmSync(path); } return print({ changes }, opt, [...changes.map(x => `  - ${relative(ctx.root, x.path)}`), "Operium project files removed. Remote memory was not deleted."]); }
  throw new Error(`Unknown command: ${command}. Run operium --help.`);
}
