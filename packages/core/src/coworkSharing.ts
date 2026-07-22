/**
 * Decide whether a cowork session should be shared with the org, given the
 * repos it touches and the user's per-repo preferences.
 *
 * Rule: shared only if EVERY repo the session touches is shared. A repo with no
 * explicit preference falls back to `defaultShared` (the user's global setting).
 * Conservative on purpose — a session spanning a private repo stays private so
 * its context can't leak via a multi-repo save.
 */
export interface RepoSharePref {
  repoKey: string;
  shared: boolean;
}

export function resolveCoworkShared(
  repoKeys: string[],
  prefs: RepoSharePref[] | undefined | null,
  defaultShared: boolean,
): boolean {
  if (!repoKeys || repoKeys.length === 0) return defaultShared;
  const map = new Map((prefs ?? []).map(p => [p.repoKey, p.shared]));
  return repoKeys.every(k => map.get(k) ?? defaultShared);
}
