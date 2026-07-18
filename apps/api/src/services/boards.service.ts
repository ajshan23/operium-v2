import { User } from "@operium/db";
import {
  AzureBoardsClient,
  AzureBoardsError,
  buildTree,
  type BoardItem,
  type BoardItemNode,
  type BoardProject,
  type BoardTeam,
  type BoardIteration,
  type BoardWorkItemType,
  type BoardMember,
  type UpdateWorkItemPatch,
  type CreateWorkItemFields,
} from "@operium/core";
import { ApiError } from "../utils/ApiError.js";

const CLIENT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const IDENTITY_TTL_MS = 10 * 60 * 1000; // 10 minutes
const READ_CACHE_TTL_MS = 45 * 1000; // 45 seconds
const FETCH_TIMEOUT_MS = 20_000;

// ─── per-user client cache (5 min TTL) ──────────────────────────────────────

interface CachedClient {
  client: AzureBoardsClient;
  org: string;
  expiresAt: number;
}

const clientCache = new Map<string, CachedClient>();

// ─── identity cache (10 min TTL) ────────────────────────────────────────────

interface CachedIdentity {
  identity: string;
  expiresAt: number;
}

const identityCache = new Map<string, CachedIdentity>();

// ─── read-result cache (45s TTL), keyed `${userId}:${cacheKey}` ────────────

interface CachedRead {
  value: unknown;
  expiresAt: number;
}

const readCache = new Map<string, CachedRead>();

function readCacheGet<T>(key: string): T | undefined {
  const hit = readCache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    readCache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function readCacheSet(key: string, value: unknown): void {
  readCache.set(key, { value, expiresAt: Date.now() + READ_CACHE_TTL_MS });
}

/** Invalidate every cached read for this user + project after a write. */
function invalidateProjectCache(userId: string, project: string): void {
  const prefix = `${userId}:${project}:`;
  for (const key of readCache.keys()) {
    if (key.startsWith(prefix)) readCache.delete(key);
  }
}

// ─── auth header helper (mirrors history.service.ts azureBasicHeaders) ─────

function azureBasicHeaders(pat: string) {
  const b64 = Buffer.from(":" + pat).toString("base64");
  return {
    Authorization: `Basic ${b64}`,
    Accept: "application/json",
  };
}

function withTimeout(): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) };
}

// ─── error mapping ───────────────────────────────────────────────────────────

function mapAzureError(err: unknown): ApiError {
  if (err instanceof AzureBoardsError) {
    if (err.status === 401 || err.status === 403) {
      return new ApiError(
        400,
        "Azure PAT is invalid, expired, or missing the Work Items (read & write) scope",
      );
    }
    if (err.status === 409) {
      return new ApiError(409, "Work item was changed in Azure Boards — refresh and retry");
    }
    if (err.status === 429 || err.status === 503) {
      return new ApiError(429, `Azure DevOps is throttling — retry in ${err.retryAfterSec ?? 30}s`);
    }
    return new ApiError(502, err.message);
  }
  if (err instanceof ApiError) return err;
  return new ApiError(502, err instanceof Error ? err.message : String(err));
}

export interface WorkItemsQueryOpts {
  team?: string;
  iterationPath?: string;
  assignedToMe?: boolean;
  types?: string[];
  stateCategories?: string[];
}

export class BoardsService {
  // ── connection / client bootstrap ─────────────────────────────────────────

  async status(userId: string): Promise<{ connected: boolean; org: string | null }> {
    const user = await User.findById(userId).select("+azureDevOpsToken azureDevOpsOrg").lean() as any;
    const connected = Boolean(user?.azureDevOpsToken && user?.azureDevOpsOrg);
    return { connected, org: user?.azureDevOpsOrg ?? null };
  }

  private async getClient(userId: string): Promise<{ client: AzureBoardsClient; org: string }> {
    const cached = clientCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return { client: cached.client, org: cached.org };
    }

    const user = await User.findById(userId).select("+azureDevOpsToken azureDevOpsOrg").lean() as any;
    const pat = user?.azureDevOpsToken as string | undefined;
    const org = user?.azureDevOpsOrg as string | undefined;
    if (!pat || !org) {
      throw new ApiError(400, "Azure DevOps is not connected — add your organisation and PAT in Settings");
    }

    const client = new AzureBoardsClient({ org, pat });
    clientCache.set(userId, { client, org, expiresAt: Date.now() + CLIENT_TTL_MS });
    return { client, org };
  }

  /** Resolves the caller's Azure identity (for assignedTo filters), cached 10 min. */
  private async resolveMyIdentity(userId: string, org: string): Promise<string> {
    const cached = identityCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.identity;

    const user = await User.findById(userId).select("+azureDevOpsToken").lean() as any;
    const pat = user?.azureDevOpsToken as string | undefined;
    if (!pat) {
      throw new ApiError(400, "Azure DevOps is not connected — add your organisation and PAT in Settings");
    }

    const { signal, clear } = withTimeout();
    let identity: string;
    try {
      const res = await fetch(`https://dev.azure.com/${encodeURIComponent(org)}/_apis/connectiondata`, {
        headers: azureBasicHeaders(pat),
        signal,
      });
      if (!res.ok) {
        throw new AzureBoardsError(res.status, `Azure connectiondata error: ${res.statusText}`);
      }
      const data = (await res.json()) as any;
      const authenticatedUser = data?.authenticatedUser;
      identity =
        authenticatedUser?.properties?.Account?.$value ??
        authenticatedUser?.providerDisplayName ??
        "";
      if (!identity) {
        throw new ApiError(502, "Could not resolve your Azure DevOps identity");
      }
    } catch (err) {
      clear();
      throw mapAzureError(err);
    }
    clear();

    identityCache.set(userId, { identity, expiresAt: Date.now() + IDENTITY_TTL_MS });
    return identity;
  }

  // ── metadata reads (45s cache) ────────────────────────────────────────────

  async projects(userId: string): Promise<BoardProject[]> {
    const cacheKey = `${userId}:_:projects`;
    const cached = readCacheGet<BoardProject[]>(cacheKey);
    if (cached) return cached;

    const { client } = await this.getClient(userId);
    try {
      const result = await client.listProjects();
      readCacheSet(cacheKey, result);
      return result;
    } catch (err) {
      throw mapAzureError(err);
    }
  }

  async teams(userId: string, project: string): Promise<BoardTeam[]> {
    const cacheKey = `${userId}:${project}:teams`;
    const cached = readCacheGet<BoardTeam[]>(cacheKey);
    if (cached) return cached;

    const { client } = await this.getClient(userId);
    try {
      const result = await client.listTeams(project);
      readCacheSet(cacheKey, result);
      return result;
    } catch (err) {
      throw mapAzureError(err);
    }
  }

  async iterations(userId: string, project: string, team: string): Promise<BoardIteration[]> {
    const cacheKey = `${userId}:${project}:iterations:${team}`;
    const cached = readCacheGet<BoardIteration[]>(cacheKey);
    if (cached) return cached;

    const { client } = await this.getClient(userId);
    try {
      const result = await client.listIterations(project, team);
      readCacheSet(cacheKey, result);
      return result;
    } catch (err) {
      throw mapAzureError(err);
    }
  }

  async meta(
    userId: string,
    project: string,
    team?: string,
  ): Promise<{ types: BoardWorkItemType[]; members: BoardMember[] }> {
    const cacheKey = `${userId}:${project}:meta:${team ?? "_"}`;
    const cached = readCacheGet<{ types: BoardWorkItemType[]; members: BoardMember[] }>(cacheKey);
    if (cached) return cached;

    const { client } = await this.getClient(userId);
    try {
      const [types, members] = await Promise.all([
        client.getWorkItemTypes(project),
        team ? client.getTeamMembers(project, team) : Promise.resolve([]),
      ]);
      const result = { types, members };
      readCacheSet(cacheKey, result);
      return result;
    } catch (err) {
      throw mapAzureError(err);
    }
  }

  async workItems(
    userId: string,
    project: string,
    opts: WorkItemsQueryOpts,
  ): Promise<{ items: BoardItemNode[]; count: number }> {
    const cacheKey = `${userId}:${project}:workitems:${JSON.stringify({
      team: opts.team,
      iterationPath: opts.iterationPath,
      assignedToMe: opts.assignedToMe,
      types: opts.types,
      stateCategories: opts.stateCategories,
    })}`;
    const cached = readCacheGet<{ items: BoardItemNode[]; count: number }>(cacheKey);
    if (cached) return cached;

    const { client, org } = await this.getClient(userId);
    try {
      let assignedTo: string | undefined;
      if (opts.assignedToMe) {
        assignedTo = await this.resolveMyIdentity(userId, org);
      }

      const flat = await client.queryWorkItems({
        project,
        iterationPath: opts.iterationPath,
        assignedTo,
        types: opts.types,
        stateCategories: opts.stateCategories,
      });

      const result = { items: buildTree(flat), count: flat.length };
      readCacheSet(cacheKey, result);
      return result;
    } catch (err) {
      throw mapAzureError(err);
    }
  }

  // ── writes (invalidate project cache) ─────────────────────────────────────

  async updateItem(
    userId: string,
    project: string,
    id: number,
    patch: UpdateWorkItemPatch & { rev?: number },
  ): Promise<BoardItem> {
    const { client } = await this.getClient(userId);
    try {
      const { rev, ...rest } = patch;
      const result = await client.updateWorkItem(project, id, rest, rev);
      invalidateProjectCache(userId, project);
      return result;
    } catch (err) {
      throw mapAzureError(err);
    }
  }

  async createItem(
    userId: string,
    project: string,
    body: CreateWorkItemFields & { type: string },
  ): Promise<BoardItem> {
    const { client } = await this.getClient(userId);
    try {
      const { type, ...fields } = body;
      if (!type?.trim()) throw new ApiError(400, "Work item type is required");
      const result = await client.createWorkItem(project, type, fields);
      invalidateProjectCache(userId, project);
      return result;
    } catch (err) {
      throw mapAzureError(err);
    }
  }

  /** Moves the work item to Azure's Recycle Bin (recoverable in Azure DevOps). */
  async deleteItem(userId: string, project: string, id: number): Promise<{ deleted: true }> {
    const { client } = await this.getClient(userId);
    try {
      await client.deleteWorkItem(project, id);
      invalidateProjectCache(userId, project);
      return { deleted: true };
    } catch (err) {
      throw mapAzureError(err);
    }
  }
}

export const boardsService = new BoardsService();
