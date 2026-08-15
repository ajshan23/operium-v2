# Operium CLI

Initialize a repository once so Claude Code and Codex receive a branch-aware
Operium startup brief and save private checkpoints without a developer ritual.

```bash
npx @operium/cli init --client codex --mcp-url https://operium.example.com/mcp --token "$OPERIUM_TOKEN"
```

The command discovers the current git remote, branch, and commit; writes the
matching project instructions (`AGENTS.md` and/or `CLAUDE.md`); and records the
workspace in `.operium/workspace.json`. With a token it verifies the server via
MCP `ping` and loads the startup brief. The command never uploads source code,
and automatic checkpoints remain private.

Use `--client claude`, `--client codex`, or `--client both` (the default).
