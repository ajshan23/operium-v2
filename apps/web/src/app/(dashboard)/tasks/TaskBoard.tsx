"use client";

import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, useDraggable, useDroppable, pointerWithin, closestCenter,
  type DragEndEvent, type CollisionDetection, type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { CalendarDays, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Task } from '@/api/tasks.api';
import { TASK_COLUMNS, isOverdue } from './taskBoardModel';

interface Props {
  tasks: Task[]; allTasks: Task[]; busy: boolean;
  onMove: (id: string, status: Task['status']) => void;
  onEdit: (task: Task) => void; onDelete: (task: Task) => void;
  onCreate: (status: Task['status']) => void;
}
const collisions: CollisionDetection = args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);
const keyboardColumns: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') return undefined;
  event.preventDefault();
  const status = context.over?.id ?? context.active?.data.current?.status;
  const index = TASK_COLUMNS.findIndex(column => column.status === status);
  const next = TASK_COLUMNS[index + (event.code === 'ArrowRight' ? 1 : -1)];
  const target = next && context.droppableRects.get(next.status);
  const current = context.collisionRect;
  if (!target || !current) return undefined;
  return { x: currentCoordinates.x + target.left + target.width / 2 - current.left - current.width / 2,
    y: currentCoordinates.y + target.top + Math.min(100, target.height / 2) - current.top - current.height / 2 };
};

function TaskCard({ task, busy, onMove, onEdit, onDelete }: Pick<Props, 'busy' | 'onMove' | 'onEdit' | 'onDelete'> & { task: Task }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: task._id, data: { status: task.status }, disabled: busy });
  const priorityClass = task.priority === 'urgent' ? 'text-status-error bg-status-error/10' : task.priority === 'high' ? 'text-status-warning bg-status-warning/10' : 'text-content-secondary bg-surface-hover';
  return <article ref={setNodeRef} data-task-id={task._id} aria-label={task.title} className={`rounded-xl border border-line bg-surface-panel p-3 shadow-sm transition-shadow hover:shadow-md ${isDragging ? 'opacity-30' : ''}`}>
    <div className="mb-3 flex items-center justify-between gap-2">
      <span className={`rounded-md px-2 py-1 text-xs font-medium capitalize ${priorityClass}`}>{task.priority}</span>
      <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} disabled={busy} aria-label={`Move ${task.title}`} title="Drag to another status column, or use Space and arrow keys" className="touch-none rounded p-1 text-content-muted hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"><GripVertical size={17} /></button>
    </div>
    <h3 className={`break-words text-sm font-semibold leading-6 ${task.status === 'done' ? 'text-content-muted line-through' : 'text-content-primary'}`}>{task.title}</h3>
    {task.description && <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-5 text-content-secondary">{task.description}</p>}
    {task.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{task.tags.map(tag => <span key={tag} className="max-w-full truncate rounded-md bg-accent/10 px-2 py-1 text-xs text-accent-text">#{tag}</span>)}</div>}
    {task.dueDate && <div className={`mt-3 flex items-center gap-1.5 text-xs ${isOverdue(task) ? 'text-status-error' : 'text-content-muted'}`}><CalendarDays size={13} /><time dateTime={task.dueDate.slice(0, 10)}>{task.dueDate.slice(0, 10)}</time>{isOverdue(task) && <span>Overdue</span>}</div>}
    <div className="mt-3 border-t border-line-subtle pt-3">
      <label className="sr-only" htmlFor={`status-${task._id}`}>Status for {task.title}</label>
      <select id={`status-${task._id}`} value={task.status} disabled={busy} onChange={event => onMove(task._id, event.target.value as Task['status'])} className="w-full rounded-lg border border-line bg-surface-raised p-2 text-xs text-content-primary disabled:opacity-50">
        {TASK_COLUMNS.map(column => <option key={column.status} value={column.status}>{column.label}</option>)}
      </select>
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy} aria-label={`Edit ${task.title}`} onClick={() => onEdit(task)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs text-content-secondary hover:bg-surface-hover disabled:opacity-50"><Pencil size={13} />Edit</button>
        <button type="button" disabled={busy} aria-label={`Delete ${task.title}`} onClick={() => onDelete(task)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs text-status-error hover:bg-status-error/10 disabled:opacity-50"><Trash2 size={13} />Delete</button>
      </div>
    </div>
  </article>;
}

function Column({ column, ...props }: Props & { column: typeof TASK_COLUMNS[number] }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status, disabled: props.busy });
  const tasks = props.tasks.filter(task => task.status === column.status);
  const count = props.allTasks.filter(task => task.status === column.status).length;
  return <section ref={setNodeRef} aria-label={`${column.label} column`} className={`flex min-h-64 w-[290px] min-w-[270px] flex-1 flex-col rounded-2xl border bg-surface-raised ${isOver ? 'border-accent ring-2 ring-accent/30' : 'border-line-subtle'}`}>
    <header className="flex items-center gap-2 border-b border-line-subtle p-4">
      <span className={`h-2 w-2 rounded-full ${column.color}`} /><h2 className="text-sm font-semibold text-content-primary">{column.label}</h2>
      <span className="rounded-md bg-surface-hover px-2 py-0.5 text-xs text-content-secondary" aria-label={`${count} tasks`}>{tasks.length === count ? count : `${tasks.length}/${count}`}</span>
      <button type="button" disabled={props.busy} aria-label={`Add task to ${column.label}`} onClick={() => props.onCreate(column.status)} className="ml-auto rounded-md p-1 text-content-muted hover:bg-surface-hover disabled:opacity-50"><Plus size={16} /></button>
    </header>
    <div className="flex-1 space-y-3 p-3">
      {tasks.map(task => <TaskCard key={task._id} task={task} {...props} />)}
      {tasks.length === 0 && <p className="rounded-xl border border-dashed border-line p-6 text-center text-xs leading-5 text-content-muted">{count > 0 ? 'No tasks match your filters.' : 'No tasks here yet. Add one or drag a task into this column.'}</p>}
    </div>
  </section>;
}

export default function TaskBoard(props: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: keyboardColumns }));
  const activeTask = props.tasks.find(task => task._id === activeId);
  const end = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || props.busy) return;
    const target = TASK_COLUMNS.find(column => column.status === over.id);
    const task = props.tasks.find(item => item._id === active.id);
    if (task && target && task.status !== target.status) props.onMove(task._id, target.status);
  };
  return <DndContext sensors={sensors} collisionDetection={collisions} onDragStart={({ active }) => setActiveId(String(active.id))} onDragEnd={end} onDragCancel={() => setActiveId(null)} accessibility={{ screenReaderInstructions: { draggable: 'Press Space to pick up a task, Left or Right to choose a status column, Space to drop, or Escape to cancel. You can also use the status select on each card.' } }}>
    <div className="flex min-h-full min-w-max items-stretch gap-4 p-4 md:p-6">{TASK_COLUMNS.map(column => <Column key={column.status} column={column} {...props} />)}</div>
    {typeof document !== 'undefined' && createPortal(<DragOverlay>{activeTask && <div className="w-[260px] rounded-xl border border-accent bg-surface-panel p-4 text-sm font-semibold text-content-primary shadow-2xl">{activeTask.title}</div>}</DragOverlay>, document.body)}
  </DndContext>;
}
