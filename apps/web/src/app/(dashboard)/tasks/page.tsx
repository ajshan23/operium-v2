"use client";

import React, { useState, useEffect, useCallback } from "react";
import AzureBoardsTab from "./AzureBoardsTab";
import { tasksApi, Task, CreateTaskData } from "@/api/tasks.api";
import { orgApi, OrgMember } from "@/api/org.api";
import { getActiveOrgId, setActiveOrgId, removeActiveOrgId } from "@/lib/org";
import { getUser } from "@/lib/auth";
import {
  Plus, CheckSquare, Circle, Clock, AlertTriangle, X, Edit2, Trash2,
  Calendar, Tag, ChevronDown, Loader2, Flag, User, Building2
} from "lucide-react";

type Status = Task["status"];
type Priority = Task["priority"];

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  todo:        { label: "To Do",       color: "var(--text-muted)", bg: "bg-surface-hover", icon: <Circle size={14} /> },
  in_progress: { label: "In Progress", color: "var(--accent-text)", bg: "bg-accent/10", icon: <Clock size={14} /> },
  done:        { label: "Done",        color: "var(--success)", bg: "bg-status-success/10", icon: <CheckSquare size={14} /> },
  cancelled:   { label: "Cancelled",   color: "var(--error)", bg: "bg-status-error/10", icon: <X size={14} /> },
};

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
  low:    { label: "Low",    color: "var(--text-muted)" },
  medium: { label: "Medium", color: "var(--warning)" },
  high:   { label: "High",   color: "var(--warning)" },
  urgent: { label: "Urgent", color: "var(--error)" },
};

function TaskCard({ task, onUpdate, onDelete }: {
  task: Task;
  onUpdate: (id: string, data: any) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [showMenu, setShowMenu] = useState(false);

  const status  = STATUS_CONFIG[task.status];
  const priority = PRIORITY_CONFIG[task.priority];

  const cycleStatus = () => {
    const order: Status[] = ["todo", "in_progress", "done", "cancelled"];
    const idx = order.indexOf(task.status as Status);
    const next = order[(idx + 1) % order.length] ?? "todo";
    onUpdate(task._id, { status: next });
  };

  const handleEditSave = () => {
    if (editTitle.trim() && editTitle !== task.title) {
      onUpdate(task._id, { title: editTitle.trim() });
    }
    setEditing(false);
  };

  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = dueDate && dueDate < new Date() && task.status !== "done";
  const assignee = task.assigneeId && typeof task.assigneeId === "object" ? task.assigneeId : null;
  const assigneeName = assignee ? (assignee.name || assignee.email || "Unknown") : null;

  return (
    <div
      className={`group relative rounded-xl border transition-all duration-200 ${status.bg} ${
        task.status === "in_progress" ? "border-accent/30" : "border-line-subtle"
      }`}
      style={{
        boxShadow: task.status === "in_progress" ? "0 0 0 1px rgba(139,92,246,0.15), 0 4px 20px rgba(139,92,246,0.05)" : undefined,
      }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Status toggle */}
          <button
            onClick={cycleStatus}
            className="mt-0.5 shrink-0 transition-transform hover:scale-110"
            style={{ color: status.color }}
            title={`Status: ${status.label} — click to cycle`}
          >
            {status.icon}
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                autoFocus
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onBlur={handleEditSave}
                onKeyDown={e => { if (e.key === "Enter") handleEditSave(); if (e.key === "Escape") setEditing(false); }}
                className="w-full bg-transparent text-content-primary text-sm font-medium outline-none border-b border-accent pb-0.5"
              />
            ) : (
              <p
                className={`text-sm font-medium leading-snug cursor-pointer ${task.status === "done" ? "line-through text-content-muted" : "text-content-primary"}`}
                onDoubleClick={() => setEditing(true)}
              >
                {task.title}
              </p>
            )}

            {task.description && (
              <p className="mt-1 text-xs text-content-muted leading-relaxed line-clamp-2">{task.description}</p>
            )}

            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {/* Priority badge */}
              <span
                className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md border"
                style={{ color: priority.color, borderColor: `${priority.color}30`, background: `${priority.color}10` }}
              >
                <Flag size={9} />
                {priority.label}
              </span>

              {/* Due date */}
              {dueDate && (
                <span
                  className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md ${
                    isOverdue ? "text-status-error bg-status-error/10" : "text-content-muted bg-surface-raised"
                  }`}
                >
                  <Calendar size={9} />
                  {dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {isOverdue && " (overdue)"}
                </span>
              )}

              {/* Assignee */}
              {assignee && assigneeName && (
                <span
                  className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md border border-line-subtle bg-surface-raised text-content-secondary"
                  title={`Assigned to ${assigneeName}`}
                >
                  {assignee.avatar ? (
                    <img src={assignee.avatar} alt="" className="w-3 h-3 rounded-full object-cover" />
                  ) : (
                    <span className="w-3 h-3 rounded-full bg-accent/20 text-accent-text text-[7px] font-semibold flex items-center justify-center uppercase">
                      {assigneeName.charAt(0)}
                    </span>
                  )}
                  {assigneeName}
                </span>
              )}

              {/* Tags */}
              {task.tags?.slice(0, 2).map(t => (
                <span key={t} className="text-xs text-accent-text bg-accent/10 px-1.5 py-0.5 rounded-md">
                  #{t}
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-content-muted hover:text-content-primary hover:bg-surface-hover transition-colors"
            >
              <Edit2 size={13} />
            </button>
            <button
              onClick={() => onDelete(task._id)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-content-muted hover:text-status-error hover:bg-status-error/10 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewTaskForm({ members, currentUserId, onSave, onCancel }: {
  members: OrgMember[];
  currentUserId: string | null;
  onSave: (data: CreateTaskData) => void;
  onCancel: () => void;
}) {
  const [title, setTitle]       = useState("");
  const [desc, setDesc]         = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate]   = useState("");
  const [tags, setTags]         = useState("");
  const [assignee, setAssignee] = useState(currentUserId ?? "");

  const save = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: desc.trim() || undefined,
      priority,
      dueDate: dueDate || undefined,
      tags: tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      assigneeId: assignee || undefined,
    });
  };

  return (
    <div className="rounded-xl border border-accent/30 bg-surface-raised p-4 space-y-3">
      <input
        autoFocus
        placeholder="Task title…"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }}
        className="w-full bg-transparent text-content-primary text-sm placeholder:text-content-muted border-b border-line-subtle pb-2 focus:border-accent transition-colors"
      />
      <textarea
        placeholder="Description (optional)…"
        value={desc}
        onChange={e => setDesc(e.target.value)}
        rows={2}
        className="w-full bg-transparent text-content-secondary text-xs placeholder:text-content-muted resize-none border-b border-line-subtle pb-2 focus:border-accent transition-colors"
      />
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Flag size={12} className="text-content-muted" />
          <select
            value={priority}
            onChange={e => setPriority(e.target.value as Priority)}
            className="bg-surface-raised text-content-primary text-xs rounded-lg px-2 py-1 border border-line-subtle outline-none cursor-pointer"
          >
            {(Object.keys(PRIORITY_CONFIG) as Priority[]).map(p => (
              <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <User size={12} className="text-content-muted" />
          <select
            value={assignee}
            onChange={e => setAssignee(e.target.value)}
            className="bg-surface-raised text-content-primary text-xs rounded-lg px-2 py-1 border border-line-subtle outline-none cursor-pointer max-w-40"
          >
            <option value="">Unassigned</option>
            {members.map(m => (
              <option key={m.userId._id} value={m.userId._id}>
                {(m.userId.name || m.userId.email || "Unknown") + (m.userId._id === currentUserId ? " (me)" : "")}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={12} className="text-content-muted" />
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="bg-surface-raised text-content-primary text-xs rounded-lg px-2 py-1 border border-line-subtle outline-none cursor-pointer"
          />
        </div>
        <div className="flex items-center gap-2">
          <Tag size={12} className="text-content-muted" />
          <input
            placeholder="tags, comma separated"
            value={tags}
            onChange={e => setTags(e.target.value)}
            className="bg-surface-raised text-content-primary text-xs rounded-lg px-2 py-1 border border-line-subtle outline-none w-44"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          disabled={!title.trim()}
          className="px-4 py-1.5 rounded-lg bg-accent text-content-inverse text-xs font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Add Task
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 rounded-lg bg-surface-hover text-content-muted text-xs hover:bg-surface-hover transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

type TasksTab = "local" | "boards";
const TAB_STORAGE_KEY = "operium.tasks.tab";

export default function TasksPage() {
  const [tab, setTab]             = useState<TasksTab>("local");
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [loading, setLoading]     = useState(true);
  const [stats, setStats]         = useState<Record<string, number>>({});
  const [showNew, setShowNew]     = useState(false);
  const [filter, setFilter]       = useState<Status | "all">("all");
  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const [members, setMembers]     = useState<OrgMember[]>([]);
  const [noOrg, setNoOrg]         = useState(false);

  const currentUserId = getUser()?.userId ?? null;

  const resolveOrg = useCallback(async (): Promise<string | null> => {
    const stored = getActiveOrgId();
    if (stored) return stored;
    const res = await orgApi.getOrgs();
    const memberships = ((res as any).data ?? []) as Array<{ orgId: { _id: string } | string }>;
    const first = memberships[0]?.orgId;
    const orgId = typeof first === "object" && first !== null ? first._id : first;
    if (!orgId) return null;
    setActiveOrgId(orgId);
    return orgId;
  }, []);

  const load = useCallback(async (retried = false) => {
    setLoading(true);
    try {
      const orgId = await resolveOrg();
      if (!orgId) {
        setNoOrg(true);
        return;
      }
      setNoOrg(false);
      const [listRes, statsRes, membersRes] = await Promise.all([
        tasksApi.list(),
        tasksApi.stats(),
        orgApi.getMembers(),
      ]);
      setTasks((listRes as any).data as Task[]);
      setStats((statsRes as any).data as Record<string, number>);
      setMembers(((membersRes as any).data ?? []) as OrgMember[]);
    } catch (e) {
      console.error(e);
      // A stale stored org (e.g. membership revoked) makes every call fail;
      // clear it and retry once so the first valid membership is re-resolved.
      if (!retried && getActiveOrgId()) {
        removeActiveOrgId();
        await load(true);
        return;
      }
    } finally {
      setLoading(false);
    }
  }, [resolveOrg]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const stored = localStorage.getItem(TAB_STORAGE_KEY);
    if (stored === "local" || stored === "boards") setTab(stored);
  }, []);

  const switchTab = (next: TasksTab) => {
    setTab(next);
    localStorage.setItem(TAB_STORAGE_KEY, next);
  };

  const handleCreate = async (data: CreateTaskData) => {
    try {
      const res = await tasksApi.create(data);
      setTasks(prev => [(res as any).data as Task, ...prev]);
      setStats(prev => ({ ...prev, [data.status ?? "todo"]: (prev[data.status ?? "todo"] ?? 0) + 1 }));
      setShowNew(false);
    } catch (e) { console.error(e); }
  };

  const handleUpdate = async (id: string, data: any) => {
    try {
      const res = await tasksApi.update(id, data);
      const updated = (res as any).data as Task;
      setTasks(prev => prev.map(t => t._id === id ? updated : t));
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: string) => {
    try {
      await tasksApi.delete(id);
      setTasks(prev => {
        const task = prev.find(t => t._id === id);
        if (task) setStats(s => ({ ...s, [task.status]: Math.max(0, (s[task.status] ?? 1) - 1) }));
        return prev.filter(t => t._id !== id);
      });
      setDeleteId(null);
    } catch (e) { console.error(e); }
  };

  const filtered = filter === "all" ? tasks : tasks.filter(t => t.status === filter);
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  const done  = stats["done"] ?? 0;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-line-subtle px-8 py-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-5">
          <div>
            <h1 className="text-lg font-semibold text-content-primary">Tasks</h1>
            <p className="text-xs text-content-muted mt-0.5">
              {tab === "local" ? `${total} tasks · ${progress}% complete` : "Azure DevOps work items"}
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 rounded-xl border border-line-subtle bg-surface-raised p-1">
            {([["local", "My Tasks"], ["boards", "Azure Boards"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => switchTab(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  tab === key
                    ? "bg-accent/20 text-accent-text border border-accent/30"
                    : "text-content-muted hover:text-content-primary hover:bg-surface-hover border border-transparent"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Progress bar (local tasks only) */}
        {tab === "local" && (
          <div className="flex items-center gap-4">
            <div className="w-32 h-1.5 rounded-full bg-surface-hover overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-status-success transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-content-inverse text-sm font-medium transition-colors"
            >
              <Plus size={15} />
              New Task
            </button>
          </div>
        )}
      </div>

      {tab === "boards" ? (
        <AzureBoardsTab />
      ) : (
      <>
      {/* Filters */}
      <div className="px-8 py-3 border-b border-line-subtle flex gap-2 shrink-0">
        {(["all", "todo", "in_progress", "done", "cancelled"] as const).map(s => {
          const cfg = s === "all" ? null : STATUS_CONFIG[s];
          const count = s === "all" ? total : (stats[s] ?? 0);
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                filter === s
                  ? "bg-accent/20 text-accent-text border border-accent/30"
                  : "text-content-muted hover:text-content-primary hover:bg-surface-hover border border-transparent"
              }`}
            >
              {cfg ? <span style={{ color: cfg.color }}>{cfg.icon}</span> : null}
              {s === "all" ? "All" : STATUS_CONFIG[s as Status].label}
              <span className={`ml-0.5 ${filter === s ? "text-accent-text" : "text-content-muted"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={24} className="text-accent-text animate-spin" />
          </div>
        ) : noOrg ? (
          <div className="text-center py-16">
            <Building2 size={32} className="mx-auto text-content-muted mb-3" />
            <p className="text-content-primary text-sm font-medium">You&apos;re not in an organization yet</p>
            <p className="text-content-muted text-sm mt-1">
              Create or join an organization to start managing team tasks.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {showNew && (
              <NewTaskForm
                members={members}
                currentUserId={currentUserId}
                onSave={handleCreate}
                onCancel={() => setShowNew(false)}
              />
            )}

            {filtered.length === 0 && !showNew && (
              <div className="text-center py-16">
                <CheckSquare size={32} className="mx-auto text-content-muted mb-3" />
                <p className="text-content-muted text-sm">
                  {filter === "all" ? "No tasks yet. Create your first task!" : `No ${STATUS_CONFIG[filter as Status]?.label ?? ""} tasks.`}
                </p>
                {filter === "all" && (
                  <button
                    onClick={() => setShowNew(true)}
                    className="mt-4 text-accent-text text-sm hover:underline"
                  >
                    + Add a task
                  </button>
                )}
              </div>
            )}

            {filtered.map(task => (
              <TaskCard
                key={task._id}
                task={task}
                onUpdate={handleUpdate}
                onDelete={(id) => setDeleteId(id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 backdrop-blur-sm">
          <div className="bg-surface-raised rounded-2xl border border-line-subtle p-6 w-80 shadow-2xl">
            <h3 className="text-content-primary font-semibold mb-2">Delete Task</h3>
            <p className="text-content-muted text-sm mb-6">This task will be permanently deleted.</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteId)}
                className="flex-1 py-2 rounded-xl bg-status-error/20 border border-status-error/25 text-status-error text-sm font-medium hover:bg-status-error/25 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2 rounded-xl bg-surface-hover text-content-muted text-sm hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
