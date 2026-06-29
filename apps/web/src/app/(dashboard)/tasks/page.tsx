"use client";

import React, { useState, useEffect, useCallback } from "react";
import { tasksApi, Task, CreateTaskData } from "@/api/tasks.api";
import {
  Plus, CheckSquare, Circle, Clock, AlertTriangle, X, Edit2, Trash2,
  Calendar, Tag, ChevronDown, Loader2, Flag
} from "lucide-react";

type Status = Task["status"];
type Priority = Task["priority"];

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  todo:        { label: "To Do",       color: "#63637a", bg: "#1a1a22", icon: <Circle size={14} /> },
  in_progress: { label: "In Progress", color: "#8b5cf6", bg: "#1a1228", icon: <Clock size={14} /> },
  done:        { label: "Done",        color: "#22c55e", bg: "#0a1f0e", icon: <CheckSquare size={14} /> },
  cancelled:   { label: "Cancelled",   color: "#ef4444", bg: "#1f0a0a", icon: <X size={14} /> },
};

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
  low:    { label: "Low",    color: "#63637a" },
  medium: { label: "Medium", color: "#f59e0b" },
  high:   { label: "High",   color: "#f97316" },
  urgent: { label: "Urgent", color: "#ef4444" },
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
    const order: Status[] = ["todo", "in_progress", "done"];
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

  return (
    <div
      className="group relative rounded-xl border transition-all duration-200"
      style={{
        background: `${status.bg}`,
        borderColor: task.status === "in_progress" ? "#8b5cf6/30" : "#1a1a22",
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
                className="w-full bg-transparent text-[#fafafa] text-sm font-medium outline-none border-b border-[#8b5cf6] pb-0.5"
              />
            ) : (
              <p
                className={`text-sm font-medium leading-snug cursor-pointer ${task.status === "done" ? "line-through text-[#63637a]" : "text-[#fafafa]"}`}
                onDoubleClick={() => setEditing(true)}
              >
                {task.title}
              </p>
            )}

            {task.description && (
              <p className="mt-1 text-xs text-[#63637a] leading-relaxed line-clamp-2">{task.description}</p>
            )}

            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {/* Priority badge */}
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border"
                style={{ color: priority.color, borderColor: `${priority.color}30`, background: `${priority.color}10` }}
              >
                <Flag size={9} />
                {priority.label}
              </span>

              {/* Due date */}
              {dueDate && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md"
                  style={{
                    color: isOverdue ? "#ef4444" : "#63637a",
                    background: isOverdue ? "#1f0a0a" : "#111115",
                  }}
                >
                  <Calendar size={9} />
                  {dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {isOverdue && " (overdue)"}
                </span>
              )}

              {/* Tags */}
              {task.tags?.slice(0, 2).map(t => (
                <span key={t} className="text-[10px] text-[#8b5cf6] bg-[#8b5cf6]/10 px-1.5 py-0.5 rounded-md">
                  #{t}
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#63637a] hover:text-[#fafafa] hover:bg-[#1a1a22] transition-colors"
            >
              <Edit2 size={13} />
            </button>
            <button
              onClick={() => onDelete(task._id)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#63637a] hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewTaskForm({ onSave, onCancel }: { onSave: (data: CreateTaskData) => void; onCancel: () => void }) {
  const [title, setTitle]       = useState("");
  const [desc, setDesc]         = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate]   = useState("");
  const [tags, setTags]         = useState("");

  const save = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: desc.trim() || undefined,
      priority,
      dueDate: dueDate || undefined,
      tags: tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : [],
    });
  };

  return (
    <div className="rounded-xl border border-[#8b5cf6]/30 bg-[#0d0b16] p-4 space-y-3">
      <input
        autoFocus
        placeholder="Task title…"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }}
        className="w-full bg-transparent text-[#fafafa] text-sm placeholder-[#3a3a4a] outline-none border-b border-[#1a1a22] pb-2 focus:border-[#8b5cf6]/50 transition-colors"
      />
      <textarea
        placeholder="Description (optional)…"
        value={desc}
        onChange={e => setDesc(e.target.value)}
        rows={2}
        className="w-full bg-transparent text-[#fafafa]/70 text-xs placeholder-[#3a3a4a] outline-none resize-none border-b border-[#1a1a22] pb-2 focus:border-[#8b5cf6]/30 transition-colors"
      />
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Flag size={12} className="text-[#63637a]" />
          <select
            value={priority}
            onChange={e => setPriority(e.target.value as Priority)}
            className="bg-[#111115] text-[#fafafa] text-xs rounded-lg px-2 py-1 border border-[#1a1a22] outline-none cursor-pointer"
          >
            {(Object.keys(PRIORITY_CONFIG) as Priority[]).map(p => (
              <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={12} className="text-[#63637a]" />
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="bg-[#111115] text-[#fafafa] text-xs rounded-lg px-2 py-1 border border-[#1a1a22] outline-none cursor-pointer"
          />
        </div>
        <div className="flex items-center gap-2">
          <Tag size={12} className="text-[#63637a]" />
          <input
            placeholder="tags, comma separated"
            value={tags}
            onChange={e => setTags(e.target.value)}
            className="bg-[#111115] text-[#fafafa] text-xs rounded-lg px-2 py-1 border border-[#1a1a22] outline-none w-44"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          disabled={!title.trim()}
          className="px-4 py-1.5 rounded-lg bg-[#8b5cf6] text-white text-xs font-medium hover:bg-[#7c3aed] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Add Task
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 rounded-lg bg-[#1a1a22] text-[#63637a] text-xs hover:bg-[#222228] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [loading, setLoading]     = useState(true);
  const [stats, setStats]         = useState<Record<string, number>>({});
  const [showNew, setShowNew]     = useState(false);
  const [filter, setFilter]       = useState<Status | "all">("all");
  const [deleteId, setDeleteId]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        tasksApi.list(),
        tasksApi.stats(),
      ]);
      setTasks((listRes as any).data as Task[]);
      setStats((statsRes as any).data as Record<string, number>);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
      <div className="border-b border-[#1a1a22] px-8 py-5 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-[#fafafa]">Tasks</h1>
          <p className="text-xs text-[#63637a] mt-0.5">
            {total} tasks · {progress}% complete
          </p>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-4">
          <div className="w-32 h-1.5 rounded-full bg-[#1a1a22] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#8b5cf6] to-[#22c55e] transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-sm font-medium transition-colors"
          >
            <Plus size={15} />
            New Task
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-8 py-3 border-b border-[#1a1a22] flex gap-2 shrink-0">
        {(["all", "todo", "in_progress", "done", "cancelled"] as const).map(s => {
          const cfg = s === "all" ? null : STATUS_CONFIG[s];
          const count = s === "all" ? total : (stats[s] ?? 0);
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                filter === s
                  ? "bg-[#8b5cf6]/20 text-[#8b5cf6] border border-[#8b5cf6]/30"
                  : "text-[#63637a] hover:text-[#fafafa] hover:bg-[#1a1a22] border border-transparent"
              }`}
            >
              {cfg ? <span style={{ color: cfg.color }}>{cfg.icon}</span> : null}
              {s === "all" ? "All" : STATUS_CONFIG[s as Status].label}
              <span className={`ml-0.5 ${filter === s ? "text-[#8b5cf6]" : "text-[#3a3a4a]"}`}>
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
            <Loader2 size={24} className="text-[#8b5cf6] animate-spin" />
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {showNew && (
              <NewTaskForm
                onSave={handleCreate}
                onCancel={() => setShowNew(false)}
              />
            )}

            {filtered.length === 0 && !showNew && (
              <div className="text-center py-16">
                <CheckSquare size={32} className="mx-auto text-[#2a2a35] mb-3" />
                <p className="text-[#3a3a4a] text-sm">
                  {filter === "all" ? "No tasks yet. Create your first task!" : `No ${STATUS_CONFIG[filter as Status]?.label ?? ""} tasks.`}
                </p>
                {filter === "all" && (
                  <button
                    onClick={() => setShowNew(true)}
                    className="mt-4 text-[#8b5cf6] text-sm hover:underline"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0d0b16] rounded-2xl border border-[#1a1a22] p-6 w-80 shadow-2xl">
            <h3 className="text-[#fafafa] font-semibold mb-2">Delete Task</h3>
            <p className="text-[#63637a] text-sm mb-6">This task will be permanently deleted.</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteId)}
                className="flex-1 py-2 rounded-xl bg-red-500/15 border border-red-500/25 text-red-400 text-sm font-medium hover:bg-red-500/25 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2 rounded-xl bg-[#1a1a22] text-[#63637a] text-sm hover:bg-[#222228] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
