import { describe, it, expect } from "vitest";
import { repoWebUrl, branchWebUrl, commitWebUrl } from "./repoLinks";

describe("repo web links", () => {
  it("github", () => {
    expect(repoWebUrl("github.com/acme/widget")).toBe("https://github.com/acme/widget");
    expect(branchWebUrl("github.com/acme/widget", "feature/x")).toBe("https://github.com/acme/widget/tree/feature/x");
    expect(commitWebUrl("github.com/acme/widget", "abc123")).toBe("https://github.com/acme/widget/commit/abc123");
  });

  it("gitlab (incl. nested groups + self-hosted)", () => {
    expect(branchWebUrl("gitlab.com/group/sub/proj", "main")).toBe("https://gitlab.com/group/sub/proj/-/tree/main");
    expect(commitWebUrl("gitlab.example.io/team/proj", "abc")).toBe("https://gitlab.example.io/team/proj/-/commit/abc");
  });

  it("bitbucket", () => {
    expect(branchWebUrl("bitbucket.org/acme/widget", "main")).toBe("https://bitbucket.org/acme/widget/src/main");
    expect(commitWebUrl("bitbucket.org/acme/widget", "abc")).toBe("https://bitbucket.org/acme/widget/commits/abc");
  });

  it("azure devops", () => {
    expect(repoWebUrl("dev.azure.com/org/project/repo")).toBe("https://dev.azure.com/org/project/_git/repo");
    expect(branchWebUrl("dev.azure.com/org/project/repo", "feature/x"))
      .toBe("https://dev.azure.com/org/project/_git/repo?version=GBfeature%2Fx");
    expect(commitWebUrl("dev.azure.com/org/project/repo", "abc"))
      .toBe("https://dev.azure.com/org/project/_git/repo/commit/abc");
  });

  it("unknown hosts: repo link only, no deep links", () => {
    expect(repoWebUrl("git.corp.example/Team/Repo")).toBe("https://git.corp.example/Team/Repo");
    expect(branchWebUrl("git.corp.example/Team/Repo", "main")).toBe("https://git.corp.example/Team/Repo");
    expect(commitWebUrl("git.corp.example/Team/Repo", "abc")).toBeNull();
  });

  it("garbage in, null out", () => {
    expect(repoWebUrl("nohost")).toBeNull();
    expect(commitWebUrl("github.com/a/b", "")).toBeNull();
  });
});
