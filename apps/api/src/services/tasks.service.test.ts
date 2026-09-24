import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TasksService } from './tasks.service.js';
const db = vi.hoisted(() => {
  const rows: any[] = [];
  const matches = (row: any, filter: any): boolean => Object.entries(filter).every(([key, value]: any) =>
    key === '$and' ? value.every((f: any) => matches(row, f)) : key === '$or' ? value.some((f: any) => matches(row, f)) : value === null ? row[key] == null : row[key] === value);
  const query = (value: any): any => ({ sort: () => query(value), populate: () => Promise.resolve(value), select: () => query(value), lean: async () => value });
  return { rows, Task: {
    find: (filter: any) => ({ ...query(rows.filter(row => matches(row, filter))), sort: () => ({ populate: () => query(rows.filter(row => matches(row, filter))) }) }),
    findOneAndUpdate: (filter: any, update: any) => {
      const row = rows.find(row => matches(row, filter));
      if (row) { const { $unset, ...fields } = update; Object.assign(row, fields); for (const key of Object.keys($unset ?? {})) delete row[key]; }
      return query(row);
    },
    findOneAndDelete: async (filter: any) => { const index = rows.findIndex(row => matches(row, filter)); return index < 0 ? null : rows.splice(index, 1)[0]; },
    create: async (value: any) => { rows.push(value); return { populate: async () => value }; },
  } };
});
vi.mock('@operium/db', () => db);
vi.mock('../repositories/membership.repository.js', () => ({ membershipRepository: { findByOrgAndUser: async () => null } }));
const service = new TasksService();
beforeEach(() => {
  db.rows.splice(0, db.rows.length,
    { _id: 'mine', userId: 'other', assigneeId: 'me', orgId: 'org', status: 'todo' },
    { _id: 'legacy', userId: 'me', status: 'todo' },
    { _id: 'delegated', userId: 'me', assigneeId: 'other', orgId: 'org', status: 'done' },
    { _id: 'foreign', userId: 'me', assigneeId: 'me', orgId: 'foreign', status: 'done' });
});
describe('TasksService ownership', () => {
  it('lists and counts only personal tasks', async () => {
    expect((await service.list('me', 'org')).map((t: any) => t._id)).toEqual(['mine', 'legacy']);
    expect(await service.stats('me', 'org')).toEqual({ todo: 2, in_progress: 0, done: 0, cancelled: 0 });
    expect((await service.list('me', undefined)).map((t: any) => t._id)).toEqual(['legacy']);
  });
  it.each(['delegated', 'foreign'])('denies update and delete of %s', async id => {
    await expect(service.update(id, 'me', 'org', { title: 'attack' })).rejects.toThrow('Task not found');
    await expect(service.delete(id, 'me', 'org')).rejects.toThrow('Task not found');
    expect(db.rows.find(t => t._id === id)?.title).toBeUndefined();
  });
  it('updates status, clears date, and deletes own tasks', async () => {
    expect(await service.update('mine', 'me', 'org', { status: 'done' })).toHaveProperty('completedAt');
    const updated = await service.update('mine', 'me', 'org', { status: 'todo', dueDate: null });
    expect(updated).not.toHaveProperty('completedAt');
    expect(updated).not.toHaveProperty('dueDate');
    await service.delete('mine', 'me', 'org');
    expect(db.rows.some(t => t._id === 'mine')).toBe(false);
  });
  it('creates personal tasks without an organization and rejects foreign assignees', async () => {
    expect(await service.create('me', undefined, { title: ' personal ', status: 'done' })).toMatchObject({ title: 'personal', assigneeId: 'me', status: 'done' });
    await expect(service.create('me', 'org', { title: 'x', assigneeId: 'other' })).rejects.toThrow('not a member');
    await expect(service.create('me', undefined, { title: 'x', assigneeId: 'other' })).rejects.toThrow('organization is required');
  });
});
