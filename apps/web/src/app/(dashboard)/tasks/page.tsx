"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LockKeyhole, Plus, RefreshCw, Search } from 'lucide-react';
import AzureBoardsTab from './AzureBoardsTab';
import TaskBoard from './TaskBoard';
import { TaskDialog, TaskForm } from './TaskDialog';
import { boardTasks, PRIORITIES } from './taskBoardModel';
import { tasksApi, type Task, type UpdateTaskData } from '@/api/tasks.api';
import { ApiError } from '@/api/client';
import { orgApi } from '@/api/org.api';
import { getActiveOrgId, setActiveOrgId, removeActiveOrgId } from '@/lib/org';

const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export default function TasksPage() {
  // Always default to My Tasks, including when an old session saved "boards".
  const [tab, setTab] = useState<'local' | 'boards'>('local');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const generation = useRef(0);
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('all');
  const [form, setForm] = useState<{ task?: Task; status: Task['status'] } | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true); setError(null); setTasks([]);
    try {
      const resolveOrg = async () => {
        if (getActiveOrgId()) return;
        const res = await orgApi.getOrgs();
        const first = res.data?.[0]?.orgId;
        const id = typeof first === 'string' ? first : first?._id;
        if (id) setActiveOrgId(id);
      };
      await resolveOrg();
      let response;
      try { response = await tasksApi.list(); }
      catch (err) {
        if (!(err instanceof ApiError) || err.status !== 403 || !getActiveOrgId()) throw err;
        removeActiveOrgId(); await resolveOrg(); response = await tasksApi.list();
      }
      if (request === generation.current) setTasks(response.data ?? []);
    } catch (err) { if (request === generation.current) setError(message(err)); }
    finally { if (request === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    const requests = generation;
    void load();
    return () => { requests.current++; };
  }, [load]);

  const start = () => {
    if (operation.current) return false;
    operation.current = true; setBusy(true); setError(null); setFormError(null); setNotice('');
    return true;
  };
  const finish = () => { operation.current = false; setBusy(false); };
  const update = async (id: string, data: UpdateTaskData) => {
    if (!start()) return;
    const previous = tasks.find(task => task._id === id);
    if (data.status) setTasks(items => items.map(task => task._id === id ? { ...task, status: data.status! } : task));
    try {
      const result = await tasksApi.update(id, data);
      setTasks(items => items.map(task => task._id === id ? result.data : task));
      setForm(null); setNotice('Task updated.');
    } catch (err) {
      if (previous) setTasks(items => items.map(task => task._id === id ? previous : task));
      if (form) setFormError(message(err)); else setError(message(err));
    } finally { finish(); }
  };
  const save = async (data: UpdateTaskData & { title: string }) => {
    if (form?.task) { await update(form.task._id, data); return; }
    if (!start()) return;
    try {
      const response = await tasksApi.create({ ...data, assigneeId: undefined, dueDate: data.dueDate || undefined });
      setTasks(items => [response.data, ...items]); setForm(null); setNotice('Task created.');
    } catch (err) { setFormError(message(err)); }
    finally { finish(); }
  };
  const remove = async () => {
    if (!deleting || !start()) return;
    try {
      await tasksApi.delete(deleting._id);
      setTasks(items => items.filter(task => task._id !== deleting._id)); setDeleting(null); setNotice('Task deleted.');
    } catch (err) { setFormError(message(err)); }
    finally { finish(); }
  };
  const visible = useMemo(() => boardTasks(tasks, search, priority), [tasks, search, priority]);
  const completed = tasks.filter(task => task.status === 'done').length;
  const progress = tasks.length ? Math.round(completed / tasks.length * 100) : 0;

  return <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-page">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-line-subtle px-4 py-5 md:px-6">
      <div><h1 className="text-xl font-semibold text-content-primary">{tab === 'local' ? 'My Tasks' : 'Azure Boards'}</h1><p className="mt-1 text-xs text-content-muted">{tab === 'local' ? `${tasks.length} tasks · ${completed} done · ${progress}% complete` : 'Azure DevOps work items'}</p></div>
      <div role="tablist" aria-label="Task sources" className="flex rounded-xl border border-line bg-surface-raised p-1">
        {(['local', 'boards'] as const).map(value => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`rounded-lg px-3 py-2 text-xs font-medium ${tab === value ? 'bg-accent/15 text-accent-text' : 'text-content-secondary hover:bg-surface-hover'}`}>{value === 'local' ? 'My Tasks' : 'Azure Boards'}</button>)}
      </div>
      {tab === 'local' && <button disabled={loading || busy || !!error && tasks.length === 0} onClick={() => { setFormError(null); setForm({ status: 'todo' }); }} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-content-inverse hover:bg-accent-hover disabled:opacity-50"><Plus size={16} />New task</button>}
    </header>
    {tab === 'boards' ? <AzureBoardsTab /> : <>
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line-subtle px-4 py-3 md:px-6">
        <label className="relative min-w-40 flex-1"><span className="sr-only">Search my tasks</span><Search size={15} className="absolute left-3 top-2.5 text-content-muted" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search your tasks…" className="w-full rounded-lg border border-line bg-surface-panel py-2 pl-9 pr-3 text-xs text-content-primary" /></label>
        <label className="flex items-center gap-2 text-xs text-content-secondary">Priority<select value={priority} onChange={event => setPriority(event.target.value)} className="rounded-lg border border-line bg-surface-panel px-2 py-2 text-content-primary"><option value="all">All priorities</option>{PRIORITIES.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
        <button disabled={busy || loading} onClick={() => void load()} aria-label="Refresh tasks" className="rounded-lg border border-line p-2 text-content-secondary disabled:opacity-40"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 pt-3 text-xs text-content-muted md:px-6"><span className="flex items-center gap-1.5"><LockKeyhole size={12} />Only your assigned and unassigned tasks</span><span>Drag to change status · Sorted by priority</span></div>
      {notice && <p role="status" className="px-6 pt-3 text-xs text-status-success">{notice}</p>}
      {error && <div role="alert" className="mx-4 mt-3 rounded-xl border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">{error}<button disabled={busy} onClick={() => void load()} className="ml-3 underline">Retry</button></div>}
      {loading ? <p role="status" className="p-8 text-sm text-content-muted">Loading your tasks…</p> : <div className="min-h-0 flex-1 overflow-auto">
        <TaskBoard tasks={visible} allTasks={tasks} busy={busy || !!error && tasks.length === 0} onMove={(id, status) => void update(id, { status })} onEdit={task => { setFormError(null); setForm({ task, status: task.status }); }} onDelete={task => { setFormError(null); setDeleting(task); }} onCreate={status => { setFormError(null); setForm({ status }); }} />
      </div>}
    </>}
    {form && <TaskDialog title={form.task ? 'Edit task' : 'New task'} busy={busy} onClose={() => setForm(null)}><TaskForm task={form.task} status={form.status} busy={busy} error={formError} onSave={data => void save(data)} onClose={() => setForm(null)} /></TaskDialog>}
    {deleting && <TaskDialog title="Delete task" busy={busy} onClose={() => setDeleting(null)}>
      <p className="break-words text-sm text-content-secondary">Delete “{deleting.title}”? This cannot be undone.</p>
      {formError && <p role="alert" className="mt-3 text-sm text-status-error">{formError}</p>}
      <div className="mt-5 flex justify-end gap-2"><button disabled={busy} onClick={() => setDeleting(null)} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button><button disabled={busy} onClick={() => void remove()} className="rounded-lg bg-status-error px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? 'Deleting…' : 'Delete task'}</button></div>
    </TaskDialog>}
  </div>;
}
