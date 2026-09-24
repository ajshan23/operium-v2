import type { Task } from '@/api/tasks.api';

export const TASK_COLUMNS = [
  { status: 'todo', label: 'To Do', color: 'bg-content-muted' },
  { status: 'in_progress', label: 'In Progress', color: 'bg-accent' },
  { status: 'done', label: 'Done', color: 'bg-status-success' },
  { status: 'cancelled', label: 'Cancelled', color: 'bg-status-error' },
] as const;
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };

export function boardTasks(tasks: Task[], search: string, priority: string) {
  const query = search.trim().toLowerCase();
  return tasks.filter(task => (priority === 'all' || task.priority === priority) &&
    (!query || [task.title, task.description ?? '', ...task.tags].join(' ').toLowerCase().includes(query)))
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || b.createdAt.localeCompare(a.createdAt) || a._id.localeCompare(b._id));
}

export function isOverdue(task: Task, now = new Date()) {
  if (!task.dueDate || task.status === 'done' || task.status === 'cancelled') return false;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return task.dueDate.slice(0, 10) < today;
}
