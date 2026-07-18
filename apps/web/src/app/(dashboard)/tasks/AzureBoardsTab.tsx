"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  boardsApi,
  BoardProject,
  BoardTeam,
  BoardIteration,
  BoardsMeta,
  BoardMember,
  BoardStateMeta,
  BoardItemNode,
  CreateWorkItemData,
  UpdateWorkItemData,
} from "@/api/boards.api";
import { ApiError } from "@/api/client";
import {
  Loader2, RefreshCw, ChevronRight, ChevronDown, Plus, X, User, Calendar,
  AlertTriangle, Search, CloudOff, ExternalLink, ListTree, Settings,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Constants & helpers                                                 */
/* ------------------------------------------------------------------ */

const LS_PROJECT = "operium.boards.project";
const LS_TEAM = "operium.boards.team";
const LS_SPRINT = "operium.boards.sprint";

const SPRINT_CURRENT = "__current__";
const SPRINT_ALL = "__all__";

const ACTIVE_CATEGORIES = ["Proposed", "InProgress", "Resolved"];

const TYPE_FALLBACK_COLORS: Record<string, string> = {
  "Epic": "#e06c00",
  "Feature": "#773b93",
  "User Story": "#009ccc",
  "Product Backlog Item": "#009ccc",
  "Issue": "#009ccc",
  "Task": "#f2cb1d",
  "Bug": "#cc293d",
};

const CATEGORY_COLORS: Record<string, string> = {
  Proposed: "#9ca3af",
  InProgress: "#8b5cf6",
  Resolved: "#f59e0b",
  Completed: "#22c55e",
  Removed: "#ef4444",
};

function normalizeColor(color?: string): string | null {
  if (!color) return null;
  const c = color.trim();
  if (!c) return null;
  return c.startsWith("#") ? c : `#${c}`;
}

function typeColor(type: string, meta: BoardsMeta | null): string {
  const fromMeta = normalizeColor(meta?.types.find(t => t.name === type)?.color);
  return fromMeta ?? TYPE_FALLBACK_COLORS[type] ?? "#63637a";
}

function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? "#9ca3af";
}

function lastPathSegment(path: string): string {
  const parts = path.split("\\").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function getErrorStatus(e: unknown): number | null {
  return e instanceof ApiError ? e.status : null;
}

function flattenTree(nodes: BoardItemNode[], out: BoardItemNode[] = []): BoardItemNode[] {
  for (const n of nodes) {
    out.push(n);
    flattenTree(n.children, out);
  }
  return out;
}

function mutateTree(
  nodes: BoardItemNode[],
  id: number,
  fn: (n: BoardItemNode) => BoardItemNode
): BoardItemNode[] {
  return nodes.map(n =>
    n.id === id ? fn(n) : n.children.length ? { ...n, children: mutateTree(n.children, id, fn) } : n
  );
}

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                 */
/* ------------------------------------------------------------------ */

function MemberAvatar({ member, size = 16 }: { member: BoardMember | null; size?: number }) {
  if (!member) {
    return (
      <span
        className="rounded-full bg-[#1a1a22] text-[#63637a] flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        <User size={size * 0.6} />
      </span>
    );
  }
  if (member.imageUrl) {
    return (
      <img
        src={member.imageUrl}
        alt=""
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="rounded-full bg-[#8b5cf6]/20 text-[#8b5cf6] font-semibold flex items-center justify-center uppercase shrink-0"
      style={{ width: size, height: size, fontSize: Math.max(7, size * 0.45) }}
    >
      {member.displayName.charAt(0)}
    </span>
  );
}

/** Generic dropdown: click-outside and Escape both close it. */
function Menu({
  button,
  buttonClassName,
  buttonTitle,
  align = "left",
  menuWidth = "w-56",
  children,
}: {
  button: React.ReactNode;
  buttonClassName?: string;
  buttonTitle?: string;
  align?: "left" | "right";
  menuWidth?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        title={buttonTitle}
        onClick={() => setOpen(o => !o)}
        className={buttonClassName}
      >
        {button}
      </button>
      {open && (
        <div
          className={`absolute z-40 mt-1 ${align === "right" ? "right-0" : "left-0"} ${menuWidth} max-h-64 overflow-y-auto rounded-xl border border-[#1a1a22] bg-[#0d0b16] shadow-2xl py-1`}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  active,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
        active ? "text-[#8b5cf6] bg-[#8b5cf6]/10" : "text-[#a1a1b5] hover:text-[#fafafa] hover:bg-[#1a1a22]"
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Work item row (recursive)                                           */
/* ------------------------------------------------------------------ */

interface RowActions {
  onChangeState: (node: BoardItemNode, state: BoardStateMeta) => void;
  onChangeSprint: (node: BoardItemNode, iterationPath: string) => void;
  onChangeAssignee: (node: BoardItemNode, member: BoardMember | null) => void;
}

function WorkItemRow({
  node,
  depth,
  meta,
  iterations,
  expanded,
  onToggle,
  actions,
}: {
  node: BoardItemNode;
  depth: number;
  meta: BoardsMeta;
  iterations: BoardIteration[];
  expanded: Record<number, boolean>;
  onToggle: (id: number, next: boolean) => void;
  actions: RowActions;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded[node.id] ?? depth < 2;
  const tColor = typeColor(node.type, meta);
  const states = meta.types.find(t => t.name === node.type)?.states ?? [];
  const stateColor = categoryColor(node.stateCategory);
  const sprintLabel = node.iterationPath ? lastPathSegment(node.iterationPath) : "No sprint";

  return (
    <>
      <div
        className="group flex items-center gap-2 py-1.5 pr-3 rounded-lg border border-transparent hover:border-[#1a1a22] hover:bg-[#111115] transition-colors"
        style={{ paddingLeft: 8 + depth * 22 }}
      >
        {/* Expand / collapse */}
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id, !isExpanded)}
            className="w-5 h-5 rounded flex items-center justify-center text-[#63637a] hover:text-[#fafafa] hover:bg-[#1a1a22] transition-colors shrink-0"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="w-5 h-5 shrink-0" />
        )}

        {/* Type badge */}
        <span
          className="inline-flex items-center gap-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md border shrink-0"
          style={{ color: tColor, borderColor: `${tColor}35`, background: `${tColor}12` }}
          title={node.type}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: tColor }} />
          {node.type}
        </span>

        {/* Id link */}
        <a
          href={node.url}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] font-mono text-[#63637a] hover:text-[#8b5cf6] transition-colors shrink-0 inline-flex items-center gap-0.5"
          title="Open in Azure DevOps"
        >
          #{node.id}
          <ExternalLink size={9} className="opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>

        {/* Title */}
        <span
          className={`flex-1 min-w-0 truncate text-sm ${
            node.stateCategory === "Completed" ? "text-[#63637a] line-through" : "text-[#fafafa]"
          }`}
          title={node.title}
        >
          {node.title}
        </span>

        {/* State dropdown */}
        <Menu
          buttonTitle={`State: ${node.state}`}
          align="right"
          menuWidth="w-48"
          buttonClassName="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border border-[#1a1a22] bg-[#111115] hover:border-[#2a2a35] transition-colors max-w-36"
          button={
            <>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: stateColor }} />
              <span className="truncate" style={{ color: stateColor }}>{node.state}</span>
              <ChevronDown size={10} className="text-[#63637a] shrink-0" />
            </>
          }
        >
          {close =>
            states.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[#63637a]">No states available</p>
            ) : (
              states.map(s => (
                <MenuItem
                  key={s.name}
                  active={s.name === node.state}
                  onClick={() => { close(); if (s.name !== node.state) actions.onChangeState(node, s); }}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: categoryColor(s.category) }} />
                  <span className="truncate">{s.name}</span>
                </MenuItem>
              ))
            )
          }
        </Menu>

        {/* Sprint menu */}
        {iterations.length > 0 && (
          <Menu
            buttonTitle={`Sprint: ${node.iterationPath || "none"}`}
            align="right"
            menuWidth="w-56"
            buttonClassName="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border border-[#1a1a22] bg-[#111115] text-[#a1a1b5] hover:border-[#2a2a35] transition-colors max-w-36"
            button={
              <>
                <Calendar size={10} className="text-[#63637a] shrink-0" />
                <span className="truncate">{sprintLabel}</span>
                <ChevronDown size={10} className="text-[#63637a] shrink-0" />
              </>
            }
          >
            {close =>
              iterations.map(it => (
                <MenuItem
                  key={it.id}
                  active={it.path === node.iterationPath}
                  onClick={() => { close(); if (it.path !== node.iterationPath) actions.onChangeSprint(node, it.path); }}
                >
                  <span className="truncate flex-1">{it.name}</span>
                  {it.timeFrame === "current" && (
                    <span className="text-[9px] text-[#22c55e] bg-[#22c55e]/10 px-1.5 py-0.5 rounded shrink-0">current</span>
                  )}
                </MenuItem>
              ))
            }
          </Menu>
        )}

        {/* Assignee menu */}
        <Menu
          buttonTitle={node.assignee ? `Assigned to ${node.assignee.displayName}` : "Unassigned"}
          align="right"
          menuWidth="w-60"
          buttonClassName="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-[#1a1a22] bg-[#111115] hover:border-[#2a2a35] transition-colors"
          button={<MemberAvatar member={node.assignee ?? null} size={18} />}
        >
          {close => (
            <>
              <MenuItem
                active={!node.assignee}
                onClick={() => { close(); if (node.assignee) actions.onChangeAssignee(node, null); }}
              >
                <MemberAvatar member={null} size={16} />
                Unassigned
              </MenuItem>
              {meta.members.map(m => (
                <MenuItem
                  key={m.uniqueName}
                  active={node.assignee?.uniqueName === m.uniqueName}
                  onClick={() => {
                    close();
                    if (node.assignee?.uniqueName !== m.uniqueName) actions.onChangeAssignee(node, m);
                  }}
                >
                  <MemberAvatar member={m} size={16} />
                  <span className="truncate">{m.displayName}</span>
                </MenuItem>
              ))}
            </>
          )}
        </Menu>
      </div>

      {hasChildren && isExpanded &&
        node.children.map(child => (
          <WorkItemRow
            key={child.id}
            node={child}
            depth={depth + 1}
            meta={meta}
            iterations={iterations}
            expanded={expanded}
            onToggle={onToggle}
            actions={actions}
          />
        ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* New item form                                                       */
/* ------------------------------------------------------------------ */

function NewItemForm({
  meta,
  iterations,
  loadedItems,
  defaultIterationPath,
  busy,
  onSave,
  onCancel,
}: {
  meta: BoardsMeta;
  iterations: BoardIteration[];
  loadedItems: BoardItemNode[];
  defaultIterationPath: string;
  busy: boolean;
  onSave: (data: CreateWorkItemData) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState(meta.types[0]?.name ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [iterationPath, setIterationPath] = useState(defaultIterationPath);
  const [assignee, setAssignee] = useState("");
  const [parent, setParent] = useState<BoardItemNode | null>(null);
  const [parentQuery, setParentQuery] = useState("");
  const [parentOpen, setParentOpen] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!parentOpen) return;
    const onDown = (e: MouseEvent) => {
      if (parentRef.current && !parentRef.current.contains(e.target as Node)) setParentOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setParentOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [parentOpen]);

  const parentMatches = useMemo(() => {
    const q = parentQuery.trim().toLowerCase();
    const pool = loadedItems.filter(i => i.id !== parent?.id);
    if (!q) return pool.slice(0, 20);
    return pool
      .filter(i => i.title.toLowerCase().includes(q) || String(i.id).includes(q))
      .slice(0, 20);
  }, [parentQuery, loadedItems, parent]);

  const save = () => {
    if (!title.trim() || !type || busy) return;
    onSave({
      type,
      title: title.trim(),
      description: description.trim() || undefined,
      iterationPath: iterationPath || undefined,
      assignee: assignee || undefined,
      parentId: parent?.id,
    });
  };

  const selectClass =
    "bg-[#111115] text-[#fafafa] text-xs rounded-lg px-2 py-1 border border-[#1a1a22] outline-none cursor-pointer";

  return (
    <div className="rounded-xl border border-[#8b5cf6]/30 bg-[#0d0b16] p-4 space-y-3 mb-3">
      <div className="flex items-center gap-3">
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          className={selectClass}
          disabled={busy}
        >
          {meta.types.map(t => (
            <option key={t.name} value={t.name}>{t.name}</option>
          ))}
        </select>
        <input
          autoFocus
          placeholder="Work item title…"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }}
          disabled={busy}
          className="flex-1 bg-transparent text-[#fafafa] text-sm placeholder-[#3a3a4a] outline-none border-b border-[#1a1a22] pb-1 focus:border-[#8b5cf6]/50 transition-colors"
        />
      </div>

      <textarea
        placeholder="Description (optional)…"
        value={description}
        onChange={e => setDescription(e.target.value)}
        rows={2}
        disabled={busy}
        className="w-full bg-transparent text-[#fafafa]/70 text-xs placeholder-[#3a3a4a] outline-none resize-none border-b border-[#1a1a22] pb-2 focus:border-[#8b5cf6]/30 transition-colors"
      />

      <div className="flex items-center gap-3 flex-wrap">
        {iterations.length > 0 && (
          <div className="flex items-center gap-2">
            <Calendar size={12} className="text-[#63637a]" />
            <select
              value={iterationPath}
              onChange={e => setIterationPath(e.target.value)}
              className={selectClass}
              disabled={busy}
            >
              <option value="">No sprint</option>
              {iterations.map(it => (
                <option key={it.id} value={it.path}>
                  {it.name}{it.timeFrame === "current" ? " (current)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2">
          <User size={12} className="text-[#63637a]" />
          <select
            value={assignee}
            onChange={e => setAssignee(e.target.value)}
            className={`${selectClass} max-w-44`}
            disabled={busy}
          >
            <option value="">Unassigned</option>
            {meta.members.map(m => (
              <option key={m.uniqueName} value={m.uniqueName}>{m.displayName}</option>
            ))}
          </select>
        </div>

        {/* Parent picker */}
        <div ref={parentRef} className="relative flex items-center gap-2">
          <ListTree size={12} className="text-[#63637a]" />
          {parent ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-[#a1a1b5] bg-[#111115] border border-[#1a1a22] rounded-lg px-2 py-1 max-w-56">
              <span className="text-[#63637a] font-mono text-[10px] shrink-0">#{parent.id}</span>
              <span className="truncate">{parent.title}</span>
              <button
                type="button"
                onClick={() => setParent(null)}
                className="text-[#63637a] hover:text-[#fafafa] transition-colors shrink-0"
                title="Remove parent"
              >
                <X size={11} />
              </button>
            </span>
          ) : (
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#3a3a4a]" />
              <input
                placeholder="Parent (optional)…"
                value={parentQuery}
                onChange={e => { setParentQuery(e.target.value); setParentOpen(true); }}
                onFocus={() => setParentOpen(true)}
                disabled={busy}
                className="bg-[#111115] text-[#fafafa] text-xs rounded-lg pl-7 pr-2 py-1 border border-[#1a1a22] outline-none w-48 placeholder-[#3a3a4a] focus:border-[#8b5cf6]/40 transition-colors"
              />
            </div>
          )}
          {parentOpen && !parent && (
            <div className="absolute z-40 top-full left-5 mt-1 w-72 max-h-56 overflow-y-auto rounded-xl border border-[#1a1a22] bg-[#0d0b16] shadow-2xl py-1">
              {parentMatches.length === 0 ? (
                <p className="px-3 py-2 text-xs text-[#63637a]">No matching items</p>
              ) : (
                parentMatches.map(i => (
                  <MenuItem
                    key={i.id}
                    onClick={() => { setParent(i); setParentOpen(false); setParentQuery(""); }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: typeColor(i.type, meta) }} />
                    <span className="text-[#63637a] font-mono text-[10px] shrink-0">#{i.id}</span>
                    <span className="truncate">{i.title}</span>
                  </MenuItem>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={!title.trim() || !type || busy}
          className="px-4 py-1.5 rounded-lg bg-[#8b5cf6] text-white text-xs font-medium hover:bg-[#7c3aed] disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
        >
          {busy && <Loader2 size={11} className="animate-spin" />}
          Create Item
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-4 py-1.5 rounded-lg bg-[#1a1a22] text-[#63637a] text-xs hover:bg-[#222228] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main tab                                                            */
/* ------------------------------------------------------------------ */

type Phase = "init" | "notConnected" | "ready" | "error";

export default function AzureBoardsTab() {
  const [phase, setPhase] = useState<Phase>("init");
  const [phaseError, setPhaseError] = useState<string | null>(null);
  const [bootKey, setBootKey] = useState(0);

  const [projects, setProjects] = useState<BoardProject[]>([]);
  const [project, setProject] = useState("");
  const [teams, setTeams] = useState<BoardTeam[] | null>(null);
  const [team, setTeam] = useState("");
  const [iterations, setIterations] = useState<BoardIteration[] | null>(null);
  const [meta, setMeta] = useState<BoardsMeta | null>(null);
  const [sprint, setSprint] = useState("");

  const [items, setItems] = useState<BoardItemNode[]>([]);
  const [count, setCount] = useState(0);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [assignedToMe, setAssignedToMe] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [hideCompleted, setHideCompleted] = useState(true);

  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "error" | "info" } | null>(null);

  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string, kind: "error" | "info" = "error") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, kind });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  /* -------- boot: status + projects -------- */
  useEffect(() => {
    let alive = true;
    setPhase("init");
    setPhaseError(null);
    (async () => {
      try {
        const status = (await boardsApi.status()).data;
        if (!alive) return;
        if (!status.connected) {
          setPhase("notConnected");
          return;
        }
        const ps = (await boardsApi.projects()).data;
        if (!alive) return;
        setProjects(ps);
        const stored = localStorage.getItem(LS_PROJECT);
        setProject(ps.find(p => p.id === stored)?.id ?? ps[0]?.id ?? "");
        setPhase("ready");
      } catch (e) {
        if (!alive) return;
        setPhaseError(getErrorMessage(e));
        setPhase("error");
      }
    })();
    return () => { alive = false; };
  }, [bootKey]);

  /* -------- project changed: fetch teams -------- */
  useEffect(() => {
    if (!project) return;
    localStorage.setItem(LS_PROJECT, project);
    let alive = true;
    setTeams(null);
    setTeam("");
    setIterations(null);
    setMeta(null);
    setSprint("");
    setItems([]);
    setItemsError(null);
    setExpanded({});
    (async () => {
      try {
        const ts = (await boardsApi.teams(project)).data;
        if (!alive) return;
        setTeams(ts);
        const stored = localStorage.getItem(LS_TEAM);
        setTeam(ts.find(t => t.id === stored)?.id ?? ts[0]?.id ?? "");
      } catch (e) {
        if (alive) setItemsError(getErrorMessage(e));
      }
    })();
    return () => { alive = false; };
    // bootKey re-runs the whole fetch chain when Retry is pressed after a
    // teams/meta failure (project itself may not change value).
  }, [project, bootKey]);

  /* -------- team resolved: fetch iterations + meta -------- */
  useEffect(() => {
    if (!project || teams === null) return;
    if (teams.length > 0 && !team) return;
    if (team) localStorage.setItem(LS_TEAM, team);
    let alive = true;
    setIterations(null);
    setMeta(null);
    setSprint("");
    setItemsError(null);
    (async () => {
      try {
        const [iterRes, metaRes] = await Promise.all([
          team
            ? boardsApi.iterations(project, team)
            : Promise.resolve({ data: [] as BoardIteration[] }),
          boardsApi.meta(project, team || undefined),
        ]);
        if (!alive) return;
        const iters = iterRes.data;
        setIterations(iters);
        setMeta(metaRes.data);

        // Resolve the sprint selection: stored value if still valid, else
        // "current" when one exists, else "all items".
        const hasCurrent = iters.some(i => i.timeFrame === "current");
        const stored = localStorage.getItem(LS_SPRINT);
        let selection: string;
        if (iters.length === 0) selection = SPRINT_ALL;
        else if (stored === SPRINT_ALL) selection = SPRINT_ALL;
        else if (stored === SPRINT_CURRENT) selection = hasCurrent ? SPRINT_CURRENT : SPRINT_ALL;
        else if (stored && iters.some(i => i.path === stored)) selection = stored;
        else selection = hasCurrent ? SPRINT_CURRENT : SPRINT_ALL;
        setSprint(selection);
      } catch (e) {
        if (alive) setItemsError(getErrorMessage(e));
      }
    })();
    return () => { alive = false; };
  }, [project, team, teams]);

  /* -------- persist sprint choice -------- */
  useEffect(() => {
    if (sprint) localStorage.setItem(LS_SPRINT, sprint);
  }, [sprint]);

  /* -------- fetch work items -------- */
  const currentIteration = useMemo(
    () => iterations?.find(i => i.timeFrame === "current") ?? null,
    [iterations]
  );

  useEffect(() => {
    if (!project || !meta || iterations === null || !sprint) return;
    let alive = true;
    setItemsLoading(true);
    setItemsError(null);
    (async () => {
      try {
        const iterationPath =
          sprint === SPRINT_ALL
            ? undefined
            : sprint === SPRINT_CURRENT
              ? currentIteration?.path
              : sprint;
        const res = await boardsApi.workItems(project, {
          team: team || undefined,
          iterationPath,
          assignedToMe,
          types: typeFilter.length ? typeFilter : undefined,
          stateCategories: hideCompleted ? ACTIVE_CATEGORIES : undefined,
        });
        if (!alive) return;
        setItems(res.data.items);
        setCount(res.data.count);
      } catch (e) {
        if (alive) setItemsError(getErrorMessage(e));
      } finally {
        if (alive) setItemsLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, team, meta, iterations, sprint, assignedToMe, typeFilter, hideCompleted, refreshKey]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  /** Retry after an error: re-run the whole fetch chain if the team/meta
   *  context never loaded, otherwise just refetch the work items. */
  const retryAfterError = useCallback(() => {
    setItemsError(null);
    if (teams === null || meta === null || iterations === null) {
      setBootKey(k => k + 1);
    } else {
      setRefreshKey(k => k + 1);
    }
  }, [teams, meta, iterations]);

  /* -------- optimistic updates -------- */
  const applyPatch = useCallback(
    async (node: BoardItemNode, localPatch: Partial<BoardItemNode>, body: UpdateWorkItemData) => {
      const prev = itemsRef.current;
      setItems(t => mutateTree(t, node.id, n => ({ ...n, ...localPatch })));
      try {
        const res = await boardsApi.updateWorkItem(project, node.id, { ...body, rev: node.rev });
        const updated = res.data;
        setItems(t => mutateTree(t, node.id, n => ({ ...n, ...updated, children: n.children })));
      } catch (e) {
        setItems(prev);
        const status = getErrorStatus(e);
        if (status === 409) {
          showToast("Updated in Azure by someone else — refreshing…", "info");
          refresh();
        } else if (status === 429) {
          showToast(getErrorMessage(e) || "Azure DevOps throttled the request — try again shortly.");
        } else {
          showToast(getErrorMessage(e));
        }
      }
    },
    [project, refresh, showToast]
  );

  const actions: RowActions = useMemo(
    () => ({
      onChangeState: (node, state) =>
        applyPatch(node, { state: state.name, stateCategory: state.category }, { state: state.name }),
      onChangeSprint: (node, iterationPath) =>
        applyPatch(node, { iterationPath }, { iterationPath }),
      onChangeAssignee: (node, member) =>
        applyPatch(
          node,
          { assignee: member ?? undefined },
          { assignee: member ? member.uniqueName : null }
        ),
    }),
    [applyPatch]
  );

  const handleCreate = useCallback(
    async (data: CreateWorkItemData) => {
      setCreating(true);
      try {
        await boardsApi.createWorkItem(project, data);
        setShowNew(false);
        refresh();
      } catch (e) {
        showToast(getErrorMessage(e));
      } finally {
        setCreating(false);
      }
    },
    [project, refresh, showToast]
  );

  const toggleExpanded = useCallback((id: number, next: boolean) => {
    setExpanded(prev => ({ ...prev, [id]: next }));
  }, []);

  const toggleTypeFilter = useCallback((name: string) => {
    setTypeFilter(prev => (prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]));
  }, []);

  const flatItems = useMemo(() => flattenTree(items), [items]);

  const defaultIterationPath = useMemo(() => {
    if (!iterations || iterations.length === 0) return "";
    if (sprint === SPRINT_CURRENT) return currentIteration?.path ?? "";
    if (sprint === SPRINT_ALL) return currentIteration?.path ?? "";
    return sprint;
  }, [iterations, sprint, currentIteration]);

  /* -------- render: top-level states -------- */
  if (phase === "init") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="text-[#8b5cf6] animate-spin" />
      </div>
    );
  }

  if (phase === "notConnected") {
    return (
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="text-center py-16">
          <CloudOff size={32} className="mx-auto text-[#2a2a35] mb-3" />
          <p className="text-[#fafafa] text-sm font-medium">Azure DevOps is not connected</p>
          <p className="text-[#63637a] text-sm mt-1">
            Add your organization and personal access token to browse boards here.
          </p>
          <Link
            href="/settings"
            className="mt-4 inline-flex items-center gap-1.5 text-[#8b5cf6] text-sm hover:underline"
          >
            <Settings size={13} />
            Connect Azure DevOps in Settings
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="text-center py-16">
          <AlertTriangle size={32} className="mx-auto text-[#ef4444]/60 mb-3" />
          <p className="text-[#fafafa] text-sm font-medium">Couldn&apos;t reach Azure Boards</p>
          <p className="text-[#63637a] text-sm mt-1 max-w-sm mx-auto">{phaseError}</p>
          <button
            type="button"
            onClick={() => setBootKey(k => k + 1)}
            className="mt-4 px-4 py-1.5 rounded-lg bg-[#8b5cf6] text-white text-xs font-medium hover:bg-[#7c3aed] transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const selectClass =
    "bg-[#111115] text-[#fafafa] text-xs rounded-lg px-2 py-1.5 border border-[#1a1a22] outline-none cursor-pointer max-w-44 focus:border-[#8b5cf6]/40 transition-colors";
  const chipBase = "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border";
  const chipOn = "bg-[#8b5cf6]/20 text-[#8b5cf6] border-[#8b5cf6]/30";
  const chipOff = "text-[#63637a] hover:text-[#fafafa] hover:bg-[#1a1a22] border-transparent";

  const contextLoading = teams === null || meta === null || iterations === null || !sprint;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-8 py-3 border-b border-[#1a1a22] flex items-center gap-2 flex-wrap shrink-0">
        <select
          value={project}
          onChange={e => setProject(e.target.value)}
          className={selectClass}
          title="Project"
        >
          {projects.length === 0 && <option value="">No projects</option>}
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {teams !== null && teams.length > 0 && (
          <select
            value={team}
            onChange={e => setTeam(e.target.value)}
            className={selectClass}
            title="Team"
          >
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}

        {iterations !== null && iterations.length > 0 && sprint && (
          <select
            value={sprint}
            onChange={e => setSprint(e.target.value)}
            className={selectClass}
            title="Sprint"
          >
            {currentIteration && (
              <option value={SPRINT_CURRENT}>Current Sprint ({currentIteration.name})</option>
            )}
            {iterations.map(it => (
              <option key={it.id} value={it.path}>{it.name}</option>
            ))}
            <option value={SPRINT_ALL}>All items</option>
          </select>
        )}

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setAssignedToMe(v => !v)}
          className={`${chipBase} ${assignedToMe ? chipOn : chipOff} inline-flex items-center gap-1.5`}
        >
          <User size={11} />
          Assigned to me
        </button>

        {meta && meta.types.map(t => {
          const active = typeFilter.includes(t.name);
          const color = typeColor(t.name, meta);
          return (
            <button
              key={t.name}
              type="button"
              onClick={() => toggleTypeFilter(t.name)}
              className={`${chipBase} ${active ? chipOn : chipOff} inline-flex items-center gap-1.5`}
              title={active ? `Showing ${t.name} — click to remove filter` : `Filter to ${t.name}`}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              {t.name}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setHideCompleted(v => !v)}
          className={`${chipBase} ${hideCompleted ? chipOn : chipOff}`}
        >
          Hide completed
        </button>

        <button
          type="button"
          onClick={refresh}
          disabled={itemsLoading}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#63637a] hover:text-[#fafafa] hover:bg-[#1a1a22] transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={13} className={itemsLoading ? "animate-spin" : ""} />
        </button>

        <button
          type="button"
          onClick={() => setShowNew(true)}
          disabled={!meta || !project}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={13} />
          New Item
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-4">
        {projects.length === 0 ? (
          <div className="text-center py-16">
            <ListTree size={32} className="mx-auto text-[#2a2a35] mb-3" />
            <p className="text-[#3a3a4a] text-sm">No projects found in this organization.</p>
          </div>
        ) : itemsError ? (
          <div className="text-center py-16">
            <AlertTriangle size={32} className="mx-auto text-[#ef4444]/60 mb-3" />
            <p className="text-[#fafafa] text-sm font-medium">Couldn&apos;t load work items</p>
            <p className="text-[#63637a] text-sm mt-1 max-w-sm mx-auto">{itemsError}</p>
            <button
              type="button"
              onClick={retryAfterError}
              className="mt-4 px-4 py-1.5 rounded-lg bg-[#8b5cf6] text-white text-xs font-medium hover:bg-[#7c3aed] transition-colors"
            >
              Retry
            </button>
          </div>
        ) : contextLoading || (itemsLoading && items.length === 0) ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={24} className="text-[#8b5cf6] animate-spin" />
          </div>
        ) : (
          <>
            {showNew && meta && (
              <NewItemForm
                meta={meta}
                iterations={iterations ?? []}
                loadedItems={flatItems}
                defaultIterationPath={defaultIterationPath}
                busy={creating}
                onSave={handleCreate}
                onCancel={() => setShowNew(false)}
              />
            )}

            {items.length === 0 && !showNew ? (
              <div className="text-center py-16">
                <ListTree size={32} className="mx-auto text-[#2a2a35] mb-3" />
                <p className="text-[#3a3a4a] text-sm">No work items match the current filters.</p>
                <button
                  type="button"
                  onClick={() => setShowNew(true)}
                  className="mt-4 text-[#8b5cf6] text-sm hover:underline"
                >
                  + Add a work item
                </button>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-[#63637a] mb-2 px-1">
                  {count} work item{count === 1 ? "" : "s"}
                  {iterations && iterations.length === 0 ? " · backlog (no sprints configured)" : ""}
                </p>
                <div className="space-y-0.5">
                  {items.map(node => meta && (
                    <WorkItemRow
                      key={node.id}
                      node={node}
                      depth={0}
                      meta={meta}
                      iterations={iterations ?? []}
                      expanded={expanded}
                      onToggle={toggleExpanded}
                      actions={actions}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-50">
          <div
            className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs shadow-2xl bg-[#0d0b16] ${
              toast.kind === "error"
                ? "border-red-500/30 text-red-400"
                : "border-[#8b5cf6]/30 text-[#8b5cf6]"
            }`}
          >
            {toast.kind === "error" ? <AlertTriangle size={13} /> : <RefreshCw size={13} />}
            <span className="max-w-xs">{toast.msg}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-1 text-[#63637a] hover:text-[#fafafa] transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
