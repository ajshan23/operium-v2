/**
 * Azure DevOps Boards REST client — pure, dependency-free (Node 18+ global fetch).
 *
 * No imports from @operium/db or any persistence layer: this module is consumed by
 * both apps/api services and packages/mcp tools, so it stays a thin, self-contained
 * wrapper over the Azure DevOps REST API (api-version 7.1). Auth is a PAT carried via
 * HTTP Basic (`Authorization: Basic base64(":" + pat)`), mirroring the existing pattern
 * in apps/api/src/services/history.service.ts.
 */

// ─── auth & errors ─────────────────────────────────────────────────────────────

export interface AzureBoardsAuth {
  org: string;
  pat: string;
}

export class AzureBoardsError extends Error {
  status: number;
  retryAfterSec?: number;

  constructor(status: number, message: string, retryAfterSec?: number) {
    super(message);
    this.name = "AzureBoardsError";
    this.status = status;
    this.retryAfterSec = retryAfterSec;
    // Keep instanceof working across the TS/ESM transpile boundary.
    Object.setPrototypeOf(this, AzureBoardsError.prototype);
  }
}

// ─── public shapes ─────────────────────────────────────────────────────────────

export interface BoardProject {
  id: string;
  name: string;
}

export interface BoardTeam {
  id: string;
  name: string;
}

export interface BoardIteration {
  id: string;
  name: string;
  path: string; // System.IterationPath value
  startDate?: string;
  finishDate?: string;
  timeFrame: "past" | "current" | "future" | "unknown";
}

/** category: Proposed | InProgress | Resolved | Completed | Removed (or "Unknown"). */
export interface BoardStateInfo {
  name: string;
  category: string;
  color?: string;
}

export interface BoardWorkItemType {
  name: string;
  icon?: string;
  color?: string;
  states: BoardStateInfo[];
}

export interface BoardMember {
  displayName: string;
  uniqueName: string;
  imageUrl?: string;
}

export interface BoardItem {
  id: number;
  rev: number;
  type: string;
  title: string;
  state: string;
  stateCategory: string;
  assignee?: BoardMember;
  iterationPath: string;
  areaPath: string;
  priority?: number;
  tags: string[];
  parentId?: number;
  /** plain-text, HTML stripped, truncated ~500 chars */
  description?: string;
  /** human web URL: https://dev.azure.com/{org}/{project}/_workitems/edit/{id} */
  url: string;
  changedDate: string;
  createdDate: string;
}

export interface BoardItemNode extends BoardItem {
  children: BoardItemNode[];
}

export interface QueryWorkItemsOpts {
  project: string;
  /** UNDER match on System.IterationPath. */
  iterationPath?: string;
  /** uniqueName/email → exact match on System.AssignedTo. */
  assignedTo?: string;
  /** System.WorkItemType IN (...) */
  types?: string[];
  /** filtered client-side after fetch (WIQL can't filter by category). */
  stateCategories?: string[];
  /** exact match on System.Parent — direct children of this work item. */
  parentId?: number;
  /** default true; when false drops Completed/Removed categories client-side. */
  includeCompleted?: boolean;
  /** safety cap, default 400. */
  top?: number;
}

export interface UpdateWorkItemPatch {
  title?: string;
  state?: string;
  iterationPath?: string;
  /** uniqueName/email; null → unassign (remove field). */
  assignee?: string | null;
  priority?: number;
  description?: string;
  tags?: string[];
}

export interface CreateWorkItemFields {
  title: string;
  description?: string;
  iterationPath?: string;
  assignee?: string;
  priority?: number;
  tags?: string[];
  /** adds System.LinkTypes.Hierarchy-Reverse relation to parent. */
  parentId?: number;
}

export interface BoardComment {
  id: number;
  /** plain text (HTML stripped). */
  text: string;
  createdBy?: BoardMember;
  createdDate: string;
}

// ─── internal shapes ───────────────────────────────────────────────────────────

export interface JsonPatchOp {
  op: "add" | "remove" | "replace" | "test";
  path: string;
  value?: unknown;
}

interface RawWorkItem {
  id: number;
  rev: number;
  fields?: Record<string, unknown>;
  relations?: Array<{ rel?: string; url?: string }>;
  url?: string;
}

const API_VERSION = "7.1";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRY_AFTER_SEC = 15;
const BATCH_SIZE = 200;
const DEFAULT_TOP = 400;
const DESCRIPTION_MAX = 500;

const enc = encodeURIComponent;

// ─── pure helpers (exported for testing) ────────────────────────────────────────

/** Double single quotes so a value is safe inside a WIQL string literal. */
function escapeWiql(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Build the WIQL query string for queryWorkItems. stateCategories / includeCompleted
 * are NOT expressible in WIQL and are applied client-side, so they are ignored here.
 */
export function buildWiql(opts: QueryWorkItemsOpts): string {
  const where: string[] = ["[System.TeamProject] = @project"];

  if (opts.iterationPath) {
    where.push(`[System.IterationPath] UNDER '${escapeWiql(opts.iterationPath)}'`);
  }
  if (opts.assignedTo) {
    where.push(`[System.AssignedTo] = '${escapeWiql(opts.assignedTo)}'`);
  }
  if (opts.types && opts.types.length > 0) {
    const list = opts.types.map((t) => `'${escapeWiql(t)}'`).join(", ");
    where.push(`[System.WorkItemType] IN (${list})`);
  }
  if (opts.parentId !== undefined) {
    where.push(`[System.Parent] = ${opts.parentId}`);
  }

  return (
    `SELECT [System.Id] FROM WorkItems WHERE ${where.join(" AND ")} ` +
    `ORDER BY [System.ChangedDate] DESC`
  );
}

/** Strip HTML → collapsed plain text (decodes the common entities). */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build the json-patch op array for updateWorkItem. */
export function buildPatchOps(patch: UpdateWorkItemPatch, expectedRev?: number): JsonPatchOp[] {
  const ops: JsonPatchOp[] = [];

  if (expectedRev !== undefined) {
    ops.push({ op: "test", path: "/rev", value: expectedRev });
  }
  if (patch.title !== undefined) {
    ops.push({ op: "add", path: "/fields/System.Title", value: patch.title });
  }
  if (patch.state !== undefined) {
    ops.push({ op: "add", path: "/fields/System.State", value: patch.state });
  }
  if (patch.iterationPath !== undefined) {
    ops.push({ op: "add", path: "/fields/System.IterationPath", value: patch.iterationPath });
  }
  if (patch.assignee !== undefined) {
    if (patch.assignee === null) {
      ops.push({ op: "remove", path: "/fields/System.AssignedTo" });
    } else {
      ops.push({ op: "add", path: "/fields/System.AssignedTo", value: patch.assignee });
    }
  }
  if (patch.priority !== undefined) {
    ops.push({ op: "add", path: "/fields/Microsoft.VSTS.Common.Priority", value: patch.priority });
  }
  if (patch.description !== undefined) {
    ops.push({ op: "add", path: "/fields/System.Description", value: patch.description });
  }
  if (patch.tags !== undefined) {
    ops.push({ op: "add", path: "/fields/System.Tags", value: patch.tags.join("; ") });
  }

  return ops;
}

function typeRank(type: string): number {
  switch (type.trim().toLowerCase()) {
    case "epic":
      return 0;
    case "feature":
      return 1;
    case "user story":
    case "product backlog item":
    case "issue":
      return 2;
    case "task":
      return 3;
    case "bug":
      return 4;
    default:
      return 5;
  }
}

/**
 * Nest children under parents present in the set; orphans stay at root.
 * Stable sort at every level: by type rank (Epic, Feature, Story/PBI/Issue, Task, Bug,
 * other) then by id ascending.
 */
export function buildTree(items: BoardItem[]): BoardItemNode[] {
  const nodes = new Map<number, BoardItemNode>();
  for (const it of items) nodes.set(it.id, { ...it, children: [] });

  const roots: BoardItemNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId !== undefined ? nodes.get(node.parentId) : undefined;
    if (parent && parent.id !== node.id) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const cmp = (a: BoardItemNode, b: BoardItemNode): number => {
    const r = typeRank(a.type) - typeRank(b.type);
    return r !== 0 ? r : a.id - b.id;
  };
  const sortRec = (arr: BoardItemNode[]): void => {
    arr.sort(cmp);
    for (const n of arr) sortRec(n.children);
  };
  sortRec(roots);

  return roots;
}

// ─── mapping helpers ───────────────────────────────────────────────────────────

function mapMember(raw: unknown): BoardMember | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const links = o["_links"] as { avatar?: { href?: string } } | undefined;
  const displayName = o["displayName"] ?? o["uniqueName"];
  const uniqueName = o["uniqueName"] ?? o["displayName"];
  if (!displayName && !uniqueName) return undefined;
  return {
    displayName: String(displayName ?? ""),
    uniqueName: String(uniqueName ?? ""),
    imageUrl: (o["imageUrl"] as string | undefined) ?? links?.avatar?.href,
  };
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs);
  // HTTP-date form → convert to a delay in seconds.
  const when = Date.parse(header);
  if (Number.isFinite(when)) return Math.max(0, Math.round((when - Date.now()) / 1000));
  return undefined;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type CategoryResolver = (type: string, state: string) => string;

// ─── client ────────────────────────────────────────────────────────────────────

export class AzureBoardsClient {
  private readonly base: string;
  private readonly authHeader: string;
  private readonly typesCache = new Map<string, Promise<BoardWorkItemType[]>>();
  private readonly resolverCache = new Map<string, Promise<CategoryResolver>>();

  constructor(auth: AzureBoardsAuth) {
    if (!auth?.org) throw new AzureBoardsError(0, "Azure Boards: missing organisation");
    if (!auth?.pat) throw new AzureBoardsError(0, "Azure Boards: missing PAT");
    this.base = `https://dev.azure.com/${enc(auth.org)}`;
    this.authHeader = `Basic ${Buffer.from(":" + auth.pat).toString("base64")}`;
  }

  // ── HTTP core ─────────────────────────────────────────────────────────────

  private async request(
    method: string,
    url: string,
    body?: unknown,
    contentType = "application/json",
    retried = false,
  ): Promise<any> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": contentType } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } catch (err) {
      const aborted = (err as { name?: string })?.name === "AbortError";
      throw new AzureBoardsError(
        aborted ? 408 : 0,
        aborted
          ? `Azure request timed out after ${REQUEST_TIMEOUT_MS}ms: ${method} ${url}`
          : `Azure request failed: ${method} ${url} — ${String((err as Error)?.message ?? err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) {
      const text = await res.text();
      return text ? JSON.parse(text) : undefined;
    }

    if (res.status === 429 || res.status === 503) {
      const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
      if (!retried && retryAfter !== undefined && retryAfter <= MAX_RETRY_AFTER_SEC) {
        await delay(retryAfter * 1000);
        return this.request(method, url, body, contentType, true);
      }
      throw new AzureBoardsError(
        res.status,
        `Azure throttled (${res.status}): ${method} ${url}`,
        retryAfter,
      );
    }

    const snippet = (await res.text().catch(() => "")).slice(0, 200);
    throw new AzureBoardsError(
      res.status,
      `Azure API error ${res.status}: ${method} ${url}${snippet ? ` — ${snippet}` : ""}`,
    );
  }

  // ── metadata ──────────────────────────────────────────────────────────────

  async listProjects(): Promise<BoardProject[]> {
    const data = await this.request(
      "GET",
      `${this.base}/_apis/projects?$top=500&api-version=${API_VERSION}`,
    );
    return (data?.value ?? []).map((p: any) => ({ id: String(p.id), name: String(p.name) }));
  }

  async listTeams(project: string): Promise<BoardTeam[]> {
    const data = await this.request(
      "GET",
      `${this.base}/_apis/projects/${enc(project)}/teams?api-version=${API_VERSION}`,
    );
    return (data?.value ?? []).map((t: any) => ({ id: String(t.id), name: String(t.name) }));
  }

  async listIterations(project: string, team: string): Promise<BoardIteration[]> {
    const data = await this.request(
      "GET",
      `${this.base}/${enc(project)}/${enc(team)}/_apis/work/teamsettings/iterations?api-version=${API_VERSION}`,
    );
    return (data?.value ?? []).map((it: any): BoardIteration => {
      const tf = String(it.attributes?.timeFrame ?? "").toLowerCase();
      return {
        id: String(it.id),
        name: String(it.name),
        path: String(it.path ?? ""),
        startDate: it.attributes?.startDate ?? undefined,
        finishDate: it.attributes?.finishDate ?? undefined,
        timeFrame:
          tf === "past" || tf === "current" || tf === "future" ? tf : "unknown",
      };
    });
  }

  async getTeamMembers(project: string, team: string): Promise<BoardMember[]> {
    const data = await this.request(
      "GET",
      `${this.base}/_apis/projects/${enc(project)}/teams/${enc(team)}/members?api-version=${API_VERSION}`,
    );
    return (data?.value ?? [])
      .map((m: any) => mapMember(m.identity ?? m))
      .filter((m: BoardMember | undefined): m is BoardMember => m !== undefined);
  }

  async getWorkItemTypes(project: string): Promise<BoardWorkItemType[]> {
    let p = this.typesCache.get(project);
    if (!p) {
      p = this.fetchWorkItemTypes(project);
      this.typesCache.set(project, p);
    }
    return p;
  }

  private async fetchWorkItemTypes(project: string): Promise<BoardWorkItemType[]> {
    const data = await this.request(
      "GET",
      `${this.base}/${enc(project)}/_apis/wit/workitemtypes?api-version=${API_VERSION}`,
    );
    const rawTypes = (data?.value ?? []).filter((t: any) => t?.isDisabled !== true);

    const out: BoardWorkItemType[] = [];
    for (const t of rawTypes) {
      const name = String(t.name);
      let states: BoardStateInfo[] = [];
      try {
        const sd = await this.request(
          "GET",
          `${this.base}/${enc(project)}/_apis/wit/workitemtypes/${enc(name)}/states?api-version=${API_VERSION}`,
        );
        states = (sd?.value ?? []).map((s: any): BoardStateInfo => ({
          name: String(s.name),
          category: String(s.category ?? s.stateCategory ?? "Unknown"),
          color: s.color ? String(s.color) : undefined,
        }));
      } catch {
        states = [];
      }
      // Fall back to any states inlined on the type payload.
      if (states.length === 0 && Array.isArray(t.states)) {
        states = t.states.map((s: any): BoardStateInfo => ({
          name: String(s.name),
          category: String(s.category ?? s.stateCategory ?? "Unknown"),
          color: s.color ? String(s.color) : undefined,
        }));
      }
      out.push({
        name,
        icon: t.icon?.url ?? t.icon?.id ?? undefined,
        color: t.color ? String(t.color) : undefined,
        states,
      });
    }
    return out;
  }

  /** Lazy, cached per project: state → category resolver. */
  private categoryResolver(project: string): Promise<CategoryResolver> {
    let p = this.resolverCache.get(project);
    if (!p) {
      p = this.getWorkItemTypes(project).then((types) => {
        const byTypeState = new Map<string, string>();
        const byState = new Map<string, string>();
        for (const t of types) {
          for (const s of t.states) {
            byTypeState.set(`${t.name} ${s.name}`, s.category);
            if (!byState.has(s.name)) byState.set(s.name, s.category);
          }
        }
        return (type: string, state: string): string =>
          byTypeState.get(`${type} ${state}`) ?? byState.get(state) ?? "Unknown";
      });
      this.resolverCache.set(project, p);
    }
    return p;
  }

  // ── work items ────────────────────────────────────────────────────────────

  private mapWorkItem(raw: RawWorkItem, project: string, resolve: CategoryResolver): BoardItem {
    const f = raw.fields ?? {};
    const type = String(f["System.WorkItemType"] ?? "");
    const state = String(f["System.State"] ?? "");

    const tagsRaw = f["System.Tags"];
    const tags =
      typeof tagsRaw === "string"
        ? tagsRaw.split(";").map((s) => s.trim()).filter(Boolean)
        : [];

    let parentId: number | undefined;
    for (const rel of raw.relations ?? []) {
      if (rel.rel === "System.LinkTypes.Hierarchy-Reverse") {
        const digits = /(\d+)\s*$/.exec(rel.url ?? "")?.[1];
        if (digits) parentId = Number(digits);
        break;
      }
    }

    const priorityRaw = f["Microsoft.VSTS.Common.Priority"];
    const desc = stripHtml(f["System.Description"] as string | undefined);

    return {
      id: raw.id,
      rev: raw.rev,
      type,
      title: String(f["System.Title"] ?? ""),
      state,
      stateCategory: resolve(type, state),
      assignee: mapMember(f["System.AssignedTo"]),
      iterationPath: String(f["System.IterationPath"] ?? ""),
      areaPath: String(f["System.AreaPath"] ?? ""),
      priority: typeof priorityRaw === "number" ? priorityRaw : undefined,
      tags,
      parentId,
      description: desc ? desc.slice(0, DESCRIPTION_MAX) : undefined,
      url: `${this.base}/${enc(project)}/_workitems/edit/${raw.id}`,
      changedDate: String(f["System.ChangedDate"] ?? ""),
      createdDate: String(f["System.CreatedDate"] ?? ""),
    };
  }

  async getWorkItems(project: string, ids: number[]): Promise<BoardItem[]> {
    if (ids.length === 0) return [];
    const resolve = await this.categoryResolver(project);

    const results: BoardItem[] = [];
    for (const group of chunk(ids, BATCH_SIZE)) {
      const data = await this.request(
        "POST",
        `${this.base}/_apis/wit/workitemsbatch?api-version=${API_VERSION}`,
        { ids: group, $expand: "relations" },
      );
      for (const raw of (data?.value ?? []) as RawWorkItem[]) {
        results.push(this.mapWorkItem(raw, project, resolve));
      }
    }
    return results;
  }

  async queryWorkItems(opts: QueryWorkItemsOpts): Promise<BoardItem[]> {
    const top = opts.top ?? DEFAULT_TOP;
    const query = buildWiql(opts);

    const data = await this.request(
      "POST",
      `${this.base}/${enc(opts.project)}/_apis/wit/wiql?api-version=${API_VERSION}&$top=${top}`,
      { query },
    );

    const ids: number[] = ((data?.workItems ?? []) as Array<{ id: number }>)
      .map((w) => w.id)
      .slice(0, top);
    if (ids.length === 0) return [];

    const items = await this.getWorkItems(opts.project, ids);

    // Preserve the WIQL ordering (ChangedDate DESC) that the batch read loses.
    const order = new Map(ids.map((id, i) => [id, i]));
    items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    const includeCompleted = opts.includeCompleted ?? true;
    const cats =
      opts.stateCategories && opts.stateCategories.length > 0
        ? new Set(opts.stateCategories)
        : undefined;

    return items.filter((it) => {
      if (!includeCompleted && (it.stateCategory === "Completed" || it.stateCategory === "Removed")) {
        return false;
      }
      if (cats && !cats.has(it.stateCategory)) return false;
      return true;
    });
  }

  async updateWorkItem(
    project: string,
    id: number,
    patch: UpdateWorkItemPatch,
    expectedRev?: number,
  ): Promise<BoardItem> {
    const ops = buildPatchOps(patch, expectedRev);
    const url = `${this.base}/${enc(project)}/_apis/wit/workitems/${id}?api-version=${API_VERSION}&$expand=relations`;

    let raw: RawWorkItem;
    try {
      raw = await this.request("PATCH", url, ops, "application/json-patch+json");
    } catch (err) {
      // Normalise a failed optimistic-concurrency rev test to a 409.
      if (
        err instanceof AzureBoardsError &&
        expectedRev !== undefined &&
        (err.status === 409 ||
          (err.status === 400 && /test operation|\/rev\b|\brev\b/i.test(err.message)))
      ) {
        throw new AzureBoardsError(
          409,
          `Work item ${id} was modified concurrently (expected rev ${expectedRev}).`,
        );
      }
      throw err;
    }

    const resolve = await this.categoryResolver(project);
    return this.mapWorkItem(raw, project, resolve);
  }

  async createWorkItem(
    project: string,
    type: string,
    fields: CreateWorkItemFields,
  ): Promise<BoardItem> {
    const ops: JsonPatchOp[] = [
      { op: "add", path: "/fields/System.Title", value: fields.title },
    ];
    if (fields.description !== undefined) {
      ops.push({ op: "add", path: "/fields/System.Description", value: fields.description });
    }
    if (fields.iterationPath !== undefined) {
      ops.push({ op: "add", path: "/fields/System.IterationPath", value: fields.iterationPath });
    }
    if (fields.assignee !== undefined) {
      ops.push({ op: "add", path: "/fields/System.AssignedTo", value: fields.assignee });
    }
    if (fields.priority !== undefined) {
      ops.push({ op: "add", path: "/fields/Microsoft.VSTS.Common.Priority", value: fields.priority });
    }
    if (fields.tags !== undefined) {
      ops.push({ op: "add", path: "/fields/System.Tags", value: fields.tags.join("; ") });
    }
    if (fields.parentId !== undefined) {
      ops.push({
        op: "add",
        path: "/relations/-",
        value: {
          rel: "System.LinkTypes.Hierarchy-Reverse",
          url: `${this.base}/_apis/wit/workItems/${fields.parentId}`,
        },
      });
    }

    const url = `${this.base}/${enc(project)}/_apis/wit/workitems/$${enc(type)}?api-version=${API_VERSION}&$expand=relations`;
    const raw: RawWorkItem = await this.request("POST", url, ops, "application/json-patch+json");

    const resolve = await this.categoryResolver(project);
    return this.mapWorkItem(raw, project, resolve);
  }

  /** Moves the work item to the project's Recycle Bin (recoverable in Azure DevOps). */
  async deleteWorkItem(project: string, id: number): Promise<void> {
    await this.request(
      "DELETE",
      `${this.base}/${enc(project)}/_apis/wit/workitems/${id}?api-version=${API_VERSION}`,
    );
  }

  // Comments are still a preview API surface in Azure DevOps.
  private commentsUrl(project: string, id: number): string {
    return `${this.base}/${enc(project)}/_apis/wit/workItems/${id}/comments`;
  }

  private mapComment(raw: any): BoardComment {
    return {
      id: Number(raw?.id ?? 0),
      text: stripHtml(String(raw?.text ?? "")),
      createdBy: mapMember(raw?.createdBy),
      createdDate: String(raw?.createdDate ?? ""),
    };
  }

  /** Most recent comments first. */
  async getWorkItemComments(project: string, id: number, top = 5): Promise<BoardComment[]> {
    const data = await this.request(
      "GET",
      `${this.commentsUrl(project, id)}?$top=${top}&order=desc&api-version=7.1-preview.3`,
    );
    return ((data?.comments ?? []) as any[]).map((c) => this.mapComment(c));
  }

  async addWorkItemComment(project: string, id: number, text: string): Promise<BoardComment> {
    const raw = await this.request(
      "POST",
      `${this.commentsUrl(project, id)}?api-version=7.1-preview.3`,
      { text },
    );
    return this.mapComment(raw);
  }
}
