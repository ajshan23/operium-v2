import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TasksPage from './page';
const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }));
vi.mock('@/api/tasks.api', () => ({ tasksApi: api }));
vi.mock('@/api/org.api', () => ({ orgApi: { getOrgs: async () => ({ data: [] }) } }));
vi.mock('./AzureBoardsTab', () => ({ default: () => <div>External boards</div> }));
let root: Root;
let host: HTMLDivElement;
const task = { _id: 'mine', title: 'First task', description: 'Details', priority: 'high', status: 'todo', tags: [], dueDate: '2026-09-24', createdAt: '2026-09-24', updatedAt: '2026-09-24' };
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); localStorage.setItem('operium.tasks.tab', 'boards');
  api.list.mockResolvedValue({ data: [{ ...task }] });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render() { await act(async () => root.render(<TasksPage />)); }
async function click(selector: string) { await act(async () => (document.querySelector(selector) as HTMLButtonElement).click()); }
async function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value); element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
}
it('defaults to My Tasks, renders four columns and visible edit/delete controls', async () => {
  await render();
  expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('My Tasks');
  expect(document.querySelectorAll('section[aria-label$="column"]')).toHaveLength(4);
  expect(document.querySelector('[aria-label="Edit First task"]')?.textContent).toBe('Edit');
  expect(document.querySelector('[aria-label="Delete First task"]')?.textContent).toBe('Delete');
});
it('edits all fields, clears date, preserves edits on failure and retries', async () => {
  await render(); await click('[aria-label="Edit First task"]');
  const title = document.querySelector('dialog input') as HTMLInputElement;
  await change(title, 'Revised'); await change(document.querySelector('dialog input[type="date"]')!, '');
  api.update.mockRejectedValueOnce(new Error('Save failed'));
  await click('dialog button[type="submit"]');
  expect(document.querySelector('dialog [role="alert"]')?.textContent).toBe('Save failed');
  expect(title.value).toBe('Revised');
  expect(api.update).toHaveBeenCalledWith('mine', expect.objectContaining({ title: 'Revised', dueDate: null, description: 'Details', priority: 'high', status: 'todo', tags: [] }));
  api.update.mockResolvedValueOnce({ data: { ...task, title: 'Revised' } });
  await click('dialog button[type="submit"]');
  expect(document.querySelector('dialog')).toBeNull();
  expect(document.querySelector('article h3')?.textContent).toBe('Revised');
});
it('rolls back a failed status move then updates column and completion count', async () => {
  await render(); api.update.mockRejectedValueOnce(new Error('Move failed'));
  await change(document.querySelector('article select')!, 'done');
  expect(document.querySelector('section[aria-label="To Do column"] article')).not.toBeNull();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Move failed');
  api.update.mockResolvedValueOnce({ data: { ...task, status: 'done' } });
  await change(document.querySelector('article select')!, 'done');
  expect(document.querySelector('section[aria-label="Done column"] article')).not.toBeNull();
  expect(host.textContent).toContain('1 done · 100% complete');
});
it('requires confirmation, keeps failed delete open, and removes after success', async () => {
  await render(); await click('[aria-label="Delete First task"]');
  expect(api.delete).not.toHaveBeenCalled();
  await click('dialog button'); expect(document.querySelector('dialog')).toBeNull();
  await click('[aria-label="Delete First task"]'); api.delete.mockRejectedValueOnce(new Error('Delete failed'));
  await click('dialog button:last-child'); expect(document.querySelector('dialog [role="alert"]')?.textContent).toBe('Delete failed');
  api.delete.mockResolvedValueOnce({ data: null }); await click('dialog button:last-child');
  expect(document.querySelector('article')).toBeNull(); expect(document.querySelector('dialog')).toBeNull();
});
it('creates a task in the selected column without needing an organization', async () => {
  await render(); await click('[aria-label="Add task to In Progress"]');
  await change(document.querySelector('dialog input')!, 'New task');
  api.create.mockResolvedValueOnce({ data: { ...task, _id: 'new', title: 'New task', status: 'in_progress' } });
  await click('dialog button[type="submit"]');
  expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'New task', status: 'in_progress', dueDate: undefined }));
  expect(document.querySelector('section[aria-label="In Progress column"] article h3')?.textContent).toBe('New task');
});
