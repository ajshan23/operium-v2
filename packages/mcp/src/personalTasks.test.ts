import { afterEach, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer } from './index.js';
const db = vi.hoisted(() => {
  const rows = [
    { _id: 'mine', title: 'Personal task', userId: 'other', assigneeId: 'me', orgId: 'org', status: 'todo', priority: 'high' },
    { _id: 'secret', title: 'PRIVATE OTHER TASK', userId: 'me', assigneeId: 'other', orgId: 'org', status: 'todo', priority: 'high' },
    { _id: 'tenant', title: 'PRIVATE OTHER ORG', userId: 'me', assigneeId: 'me', orgId: 'elsewhere', status: 'todo', priority: 'high' },
  ];
  const matches = (row: any, filter: any): boolean => Object.entries(filter).every(([key, value]: any) => key === '$and'
    ? value.every((f: any) => matches(row, f)) : key === '$or' ? value.some((f: any) => matches(row, f)) : value === null ? row[key] == null : row[key] === value);
  const query = (value: any): any => ({ sort: () => query(value), limit: () => query(value), populate: () => query(value), lean: async () => value });
  return { rows, User: {}, Membership: {}, McpUsageLog: { create: async () => {} }, Task: {
    find: (filter: any) => query(rows.filter(row => matches(row, filter))),
    findOneAndUpdate: (filter: any, update: any) => {
      const row = rows.find(row => matches(row, filter)); if (row) Object.assign(row, update); return query(row);
    },
  } };
});
vi.mock('@operium/db', () => db);
let client: Client;
let server: ReturnType<typeof buildMcpServer>;
afterEach(async () => { await client?.close(); await server?.close(); });
it('MCP cannot bypass ownership using mine=false or another task ID', async () => {
  server = buildMcpServer({ userId: 'me', orgId: 'org' });
  client = new Client({ name: 'personal-task-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b); await client.connect(a);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true); return JSON.stringify(result.content);
  };
  for (const mine of [false, true]) {
    const text = await call('list_tasks', { mine });
    expect(text).toContain('Personal task'); expect(text).not.toContain('PRIVATE');
  }
  for (const taskId of ['secret', 'tenant']) {
    expect(await call('update_task', { taskId, title: 'attack' })).toContain('not yours');
    expect(db.rows.find(row => row._id === taskId)?.title).not.toBe('attack');
  }
  expect(await call('update_task', { taskId: 'mine', status: 'done' })).toContain('[done]');
  expect(db.rows[0]?.status).toBe('done');
});
