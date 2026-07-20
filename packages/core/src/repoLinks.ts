// Web URLs for a canonical repoKey ("host/owner/repo" — see repoKey.ts).
// Supports GitHub, GitLab (incl. self-hosted "gitlab.*" hosts and nested
// groups), Bitbucket, and Azure DevOps; unknown hosts get a best-effort
// repo URL and no deep links.

type Provider = "github" | "gitlab" | "bitbucket" | "azure" | "unknown";

function providerOf(host: string): Provider {
  if (host === "github.com" || host.startsWith("github.")) return "github";
  if (host === "gitlab.com" || host.startsWith("gitlab.")) return "gitlab";
  if (host === "bitbucket.org" || host.startsWith("bitbucket.")) return "bitbucket";
  if (host === "dev.azure.com" || host.endsWith(".visualstudio.com")) return "azure";
  return "unknown";
}

function parts(repoKey: string): { host: string; path: string; provider: Provider } | null {
  const i = repoKey.indexOf("/");
  if (i <= 0 || i === repoKey.length - 1) return null;
  const host = repoKey.slice(0, i);
  const path = repoKey.slice(i + 1);
  return { host, path, provider: providerOf(host) };
}

/** Repo home page. Azure keys are "dev.azure.com/org/project/repo" → .../_git/repo. */
export function repoWebUrl(repoKey: string): string | null {
  const p = parts(repoKey);
  if (!p) return null;
  if (p.provider === "azure") {
    const segs = p.path.split("/");
    if (segs.length < 3) return `https://${p.host}/${p.path}`;
    const repo = segs.pop()!;
    return `https://${p.host}/${segs.join("/")}/_git/${repo}`;
  }
  return `https://${p.host}/${p.path}`;
}

export function branchWebUrl(repoKey: string, branch: string): string | null {
  const base = repoWebUrl(repoKey);
  const p = parts(repoKey);
  if (!base || !p || !branch) return base;
  const b = encodeURIComponent(branch).replace(/%2F/gi, "/");
  switch (p.provider) {
    case "github":    return `${base}/tree/${b}`;
    case "gitlab":    return `${base}/-/tree/${b}`;
    case "bitbucket": return `${base}/src/${b}`;
    case "azure":     return `${base}?version=GB${encodeURIComponent(branch)}`;
    default:          return base;
  }
}

export function commitWebUrl(repoKey: string, sha: string): string | null {
  const base = repoWebUrl(repoKey);
  const p = parts(repoKey);
  if (!base || !p || !sha) return null;
  switch (p.provider) {
    case "github":    return `${base}/commit/${sha}`;
    case "gitlab":    return `${base}/-/commit/${sha}`;
    case "bitbucket": return `${base}/commits/${sha}`;
    case "azure":     return `${base}/commit/${sha}`;
    default:          return null;
  }
}
