import { describe, it, expect } from "vitest";
import { normalizeRepoKey, repoNameFromKey, normalizeRepoRefs, stripCredentials } from "./repoKey";

describe("normalizeRepoKey", () => {
  it("normalizes https URLs", () => {
    expect(normalizeRepoKey("https://github.com/Acme/Widget.git")).toBe("github.com/acme/widget");
    expect(normalizeRepoKey("https://github.com/acme/widget/")).toBe("github.com/acme/widget");
  });

  it("normalizes scp-style ssh remotes", () => {
    expect(normalizeRepoKey("git@github.com:Acme/Widget.git")).toBe("github.com/acme/widget");
    expect(normalizeRepoKey("ssh://git@github.com/acme/widget.git")).toBe("github.com/acme/widget");
  });

  it("all spellings of the same repo agree", () => {
    const spellings = [
      "https://github.com/acme/widget",
      "https://github.com/Acme/Widget.git",
      "git@github.com:acme/widget.git",
      "github.com/acme/widget",
    ];
    const keys = new Set(spellings.map(normalizeRepoKey));
    expect(keys.size).toBe(1);
  });

  it("strips embedded credentials", () => {
    expect(normalizeRepoKey("https://user:ghp_token123@github.com/acme/widget.git"))
      .toBe("github.com/acme/widget");
  });

  it("handles Azure DevOps _git segment", () => {
    expect(normalizeRepoKey("https://dev.azure.com/org/Project/_git/Repo"))
      .toBe("dev.azure.com/org/project/repo");
  });

  it("preserves path case for unknown hosts", () => {
    expect(normalizeRepoKey("https://git.corp.example/Team/Repo.git")).toBe("git.corp.example/Team/Repo");
  });

  it("maps ssh config aliases to their real host", () => {
    expect(normalizeRepoKey("git@github-personal:reviewbit/moleculer-flowflex.git"))
      .toBe("github.com/reviewbit/moleculer-flowflex");
    expect(normalizeRepoKey("github-personal/reviewbit/moleculer-flowflex"))
      .toBe("github.com/reviewbit/moleculer-flowflex");
    expect(normalizeRepoKey("git@gitlab-work:team/proj.git")).toBe("gitlab.com/team/proj");
  });

  it("keeps unknown ssh aliases instead of dropping them", () => {
    expect(normalizeRepoKey("git@mygit:org/repo.git")).toBe("mygit/org/repo");
  });

  it("rejects things that are not repo refs", () => {
    expect(normalizeRepoKey("")).toBeNull();
    expect(normalizeRepoKey("not a url")).toBeNull();
    expect(normalizeRepoKey("localhost")).toBeNull();
    expect(normalizeRepoKey("https://github.com/")).toBeNull();
    expect(normalizeRepoKey("https://github.com/onlyowner")).toBeNull();
  });
});

describe("repoNameFromKey", () => {
  it("returns the last segment", () => {
    expect(repoNameFromKey("github.com/acme/widget")).toBe("widget");
  });
});

describe("stripCredentials", () => {
  it("removes user:token@", () => {
    expect(stripCredentials("https://x:tok@github.com/a/b.git")).toBe("https://github.com/a/b.git");
    expect(stripCredentials("https://github.com/a/b.git")).toBe("https://github.com/a/b.git");
  });
});

describe("normalizeRepoRefs", () => {
  it("derives keys and names, drops junk", () => {
    const out = normalizeRepoRefs([
      { repoUrl: "git@github.com:acme/widget.git", branch: "main" },
      { repoUrl: "garbage" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ repoKey: "github.com/acme/widget", repoName: "widget", branch: "main" });
  });

  it("dedupes by (repoKey, branch), merging details", () => {
    const out = normalizeRepoRefs([
      { repoUrl: "https://github.com/acme/widget", branch: "main", filesTouched: ["a.ts"] },
      { repoUrl: "git@github.com:acme/widget.git", branch: "main", commitSha: "abc123", filesTouched: ["b.ts"] },
      { repoUrl: "https://github.com/acme/widget", branch: "feature/x" },
    ]);
    expect(out).toHaveLength(2);
    const main = out.find(r => r.branch === "main")!;
    expect(main.commitSha).toBe("abc123");
    expect(main.filesTouched).toEqual(["a.ts", "b.ts"]);
  });

  it("same repo on two branches stays two entries", () => {
    const out = normalizeRepoRefs([
      { repoUrl: "https://github.com/acme/widget", branch: "main" },
      { repoUrl: "https://github.com/acme/widget", branch: "wt/fix" },
    ]);
    expect(out.map(r => r.branch).sort()).toEqual(["main", "wt/fix"]);
  });

  it("strips credentials from the stored URL", () => {
    const out = normalizeRepoRefs([{ repoUrl: "https://x:tok@github.com/a/b.git" }]);
    expect(out[0]!.repoUrl).toBe("https://github.com/a/b.git");
  });
});
