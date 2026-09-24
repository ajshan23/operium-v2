import { beforeEach, expect, it, vi } from 'vitest';
import { createTask, updateTask, deleteTask, listTasks } from './tasks.controller.js';
const service = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), delete: vi.fn(), list: vi.fn() }));
vi.mock('../services/tasks.service.js', () => ({ tasksService: service }));
beforeEach(() => vi.clearAllMocks());
const request = (body: unknown, id = 'a'.repeat(24)): any => ({ body, params: { id }, user: { userId: 'me' }, orgId: 'org', query: {} });
const response = (): any => { const res = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res); return res; };
it.each([{ title: ' ' }, { title: 'x', userId: 'other' }, { title: 'x', orgId: 'other' }, { title: 'x', status: 'bad' }, { title: 'x', dueDate: '2026-02-30' }, { title: 'x', assigneeId: 'bad' }])('rejects invalid creation %j', async body => {
  const res = response(); await createTask(request(body), res);
  expect(res.status).toHaveBeenCalledWith(400); expect(service.create).not.toHaveBeenCalled();
});
it('rejects malformed IDs, empty patches and invalid status filters', async () => {
  for (const [handler, req] of [[updateTask, request({ title: 'x' }, 'bad')], [deleteTask, request({}, 'bad')], [updateTask, request({})], [listTasks, { ...request({}), query: { status: 'bad' } }]] as const) {
    const res = response(); await handler(req, res); expect(res.status).toHaveBeenCalledWith(400);
  }
  expect(service.update).not.toHaveBeenCalled(); expect(service.delete).not.toHaveBeenCalled(); expect(service.list).not.toHaveBeenCalled();
});
it('accepts full edits including clearing a date', async () => {
  await updateTask(request({ title: ' New title ', description: 'Details', status: 'done', priority: 'high', dueDate: null, tags: ['api'] }), response());
  expect(service.update).toHaveBeenCalledWith('a'.repeat(24), 'me', 'org', { title: 'New title', description: 'Details', status: 'done', priority: 'high', dueDate: null, tags: ['api'] });
});
