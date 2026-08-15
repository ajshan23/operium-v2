# Operium CLI

Initialize a repository once so Claude Code and Codex receive a branch-aware
Operium startup brief and save private checkpoints without a developer ritual.

```bash
npx @operium/cli init --client codex --mcp-url https://operium.example.com/mcp
```

The command discovers the current git remote, branch, and commit; previews and
atomically writes matching project instructions (`AGENTS.md` and/or `CLAUDE.md`);
creates a token-free MCP configuration; and records branch-local state in
`.operium/workspace.json`. It never uploads source code, writes a credential to
the repository, or overwrites unrelated MCP configuration.

Useful follow-up commands:

```bash
operium status --json
operium doctor --verify
operium resume
operium connect --dry-run
operium disconnect --yes
```

Use client OAuth where available. For CI or direct CLI verification, set
`OPERIUM_TOKEN` in the environment; never put it in a project config file.

Use `--client claude`, `--client codex`, or `--client both` (the default).
