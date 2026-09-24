"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Task, UpdateTaskData } from '@/api/tasks.api';
import { PRIORITIES, TASK_COLUMNS } from './taskBoardModel';

export function TaskDialog({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const element = ref.current;
    element?.showModal(); document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = previousOverflow; if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  return createPortal(<dialog ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border border-line bg-surface-panel p-5 text-content-primary shadow-2xl backdrop:bg-overlay/70">
    <h2 className="mb-4 text-lg font-semibold">{title}</h2>{children}
  </dialog>, document.body);
}
const inputClass = 'w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent';

export function TaskForm({ task, status, busy, error, onSave, onClose }: {
  task?: Task; status: Task['status']; busy: boolean; error: string | null;
  onSave: (data: UpdateTaskData & { title: string }) => void; onClose: () => void;
}) {
  const formId = useId();
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState<Task['priority']>(task?.priority ?? 'medium');
  const [taskStatus, setTaskStatus] = useState(task?.status ?? status);
  const [dueDate, setDueDate] = useState(task?.dueDate?.slice(0, 10) ?? '');
  const [tags, setTags] = useState(task?.tags.join(', ') ?? '');
  return <form onSubmit={event => {
    event.preventDefault();
    if (!busy && title.trim()) onSave({ title: title.trim(), description: description.trim(), status: taskStatus, priority, dueDate: dueDate || null, tags: [...new Set(tags.split(',').map(tag => tag.trim()).filter(Boolean))] });
  }}>
    <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
      <label className="block space-y-1 text-xs text-content-secondary"><span>Title</span><input autoFocus required maxLength={300} value={title} onChange={event => setTitle(event.target.value)} className={inputClass} /></label>
      <label className="block space-y-1 text-xs text-content-secondary"><span id={`${formId}-description`}>Description</span><textarea aria-labelledby={`${formId}-description`} maxLength={20000} rows={4} value={description} onChange={event => setDescription(event.target.value)} className={inputClass} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1 text-xs text-content-secondary"><span>Status</span><select value={taskStatus} onChange={event => setTaskStatus(event.target.value as Task['status'])} className={inputClass}>{TASK_COLUMNS.map(column => <option key={column.status} value={column.status}>{column.label}</option>)}</select></label>
        <label className="block space-y-1 text-xs text-content-secondary"><span>Priority</span><select value={priority} onChange={event => setPriority(event.target.value as Task['priority'])} className={inputClass}>{PRIORITIES.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
      </div>
      <label className="block space-y-1 text-xs text-content-secondary"><span>Due date</span><input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className={inputClass} /></label>
      <label className="block space-y-1 text-xs text-content-secondary"><span>Tags (comma-separated)</span><input value={tags} onChange={event => setTags(event.target.value)} className={inputClass} /></label>
    </fieldset>
    {error && <p role="alert" className="mt-3 text-sm text-status-error">{error}</p>}
    <div className="mt-5 flex justify-end gap-2">
      <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-line px-4 py-2 text-sm text-content-secondary disabled:opacity-50">Cancel</button>
      <button type="submit" disabled={busy || !title.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-content-inverse hover:bg-accent-hover disabled:opacity-50">{busy ? 'Saving…' : task ? 'Save changes' : 'Create task'}</button>
    </div>
  </form>;
}
