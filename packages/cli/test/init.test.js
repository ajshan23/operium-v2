import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const cli = resolve(process.cwd(), "packages/cli/bin/operium.js");

function run(args, cwd) {
  return execFileSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
}

test("init writes Codex instructions and a branch-aware workspace file idempotently", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "operium-cli-"));
  try {
    execFileSync("git", ["init", "-q", "-b", "feature/resume"], { cwd: dir });
    execFileSync("git", ["remote", "add", "origin", "git@github.com:acme/widget.git"], { cwd: dir });

    run(["init", "--client", "codex", "--yes", "--skip-connect"], dir);
    run(["init", "--client", "codex", "--yes", "--skip-connect"], dir);

    const workspace = JSON.parse(readFileSync(resolve(dir, ".operium/workspace.json"), "utf8"));
    const instructions = readFileSync(resolve(dir, "AGENTS.md"), "utf8");
    assert.equal(workspace.repoUrl, "git@github.com:acme/widget.git");
    assert.equal(workspace.branch, "feature/resume");
    assert.match(instructions, /get_startup_context/);
    assert.equal((instructions.match(/<!-- operium:start -->/g) ?? []).length, 1);
    assert.equal(existsSync(resolve(dir, "CLAUDE.md")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("init rejects an unsupported client before changing the workspace", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "operium-cli-"));
  try {
    const result = spawnSync(process.execPath, [cli, "init", "--client", "cursor"], { cwd: dir, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--client must be/);
    assert.equal(existsSync(resolve(dir, ".operium")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dry runs are non-mutating and Claude setup preserves a token-free MCP entry", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "operium-cli-"));
  try {
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
    const dryRun = run(["init", "--client", "claude", "--dry-run", "--json"], dir);
    assert.match(dryRun, /"applied": false/);
    assert.equal(existsSync(resolve(dir, ".mcp.json")), false);

    run(["init", "--client", "claude", "--yes", "--skip-connect"], dir);
    const mcp = JSON.parse(readFileSync(resolve(dir, ".mcp.json"), "utf8"));
    assert.equal(mcp.mcpServers.operium.type, "http");
    assert.equal(mcp.mcpServers.operium.headers.Authorization, "Bearer ${OPERIUM_TOKEN}");
    assert.equal(JSON.stringify(mcp).includes("OPERIUM_TOKEN"), true);
    assert.equal(JSON.stringify(mcp).includes("eyJ"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
