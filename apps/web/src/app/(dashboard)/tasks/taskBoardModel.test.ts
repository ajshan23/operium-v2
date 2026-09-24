import { expect, it } from 'vitest';
import { boardTasks, isOverdue } from './taskBoardModel';
import type { Task } from '@/api/tasks.api';
const base: Task = { _id: '1', title: 'First', status: 'todo', priority: 'low', tags: ['api'], createdAt: '2026-09-24', updatedAt: '2026-09-24' };
it('filters across title, description, tags and priority without mutating input', () => {
  const tasks = [base, { ...base, _id: '2', title: 'Second', description: 'Details', tags: [], priority: 'urgent' as const }];
  expect(boardTasks(tasks, '', 'all').map(t => t._id)).toEqual(['2', '1']);
  expect(tasks[0]).toBe(base);
  expect(boardTasks(tasks, ' API ', 'all')).toEqual([base]);
  expect(boardTasks(tasks, 'details', 'urgent')).toEqual([tasks[1]]);
  expect(boardTasks(tasks, 'First', 'urgent')).toEqual([]);
});
it('uses local calendar days for overdue, excluding completed and cancelled tasks', () => {
  const now = new Date(2026, 8, 24, 23, 0);
  expect(isOverdue({ ...base, dueDate: '2026-09-24T00:00:00Z' }, now)).toBe(false);
  expect(isOverdue({ ...base, dueDate: '2026-09-23T00:00:00Z' }, now)).toBe(true);
  for (const status of ['done', 'cancelled'] as const) expect(isOverdue({ ...base, dueDate: '2026-09-23', status }, now)).toBe(false);
});
