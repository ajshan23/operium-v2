import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { buildMcpServer } from './index.js';

const db = vi.hoisted(() => {
  const notes: any[] = [];
  const blocks: any[] = [];
  const query = (value: unknown) => Object.assign(Promise.resolve(value), { lean: async () => value });
  return {
    notes, blocks,
    Space: { findOne: () => query({ _id: 'space', name: 'Notes' }) },
    Note: {
      create: async (note: any) => { const doc = { ...note, _id: 'note' }; notes.push(doc); return doc; },
      findOne: (filter: any) => query(notes.find(n => n._id === filter._id && n.userId === filter.userId)),
      updateOne: async (filter: any, update: any) => Object.assign(notes.find(n => n._id === filter._id), update),
    },
    NoteBlock: {
      insertMany: async (items: any[]) => blocks.push(...items),
      countDocuments: async () => blocks.length,
      deleteMany: async () => blocks.splice(0),
      find: () => ({ sort: () => query([...blocks].sort((a, b) => a.order - b.order)) }),
    },
    McpUsageLog: { create: async () => {} },
  };
});
vi.mock('@operium/db', () => db);

let client: Client | undefined;
let server: McpServer | undefined;
afterEach(async () => {
  await client?.close();
  await server?.close();
  db.notes.length = 0;
  db.blocks.length = 0;
});

describe('Mermaid source through MCP note tools', () => {
  it('round-trips large diagrams through create, append, replace and get without a schema change', async () => {
    server = buildMcpServer({ userId: 'owner', orgId: null });
    client = new Client({ name: 'mermaid-notes-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const diagram = '```mermaid\nflowchart LR\n' + Array.from({ length: 180 }, (_, i) => `n${i}[Step ${i}] --> n${i + 1}`).join('\n') + '\n```';
    const original = `## Overview\n\nSome prose.\n\n${diagram}\n\n\`\`\`ts\nconst count = 1;\n\`\`\``;
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client!.callTool({ name, arguments: args });
      expect(result.isError).not.toBe(true);
      return result;
    };
    const read = async () => {
      const result = await call('get_note', { noteId: 'note' });
      return (result.content as { type: string; text: string }[])[0]!.text;
    };
    await call('create_note', { title: 'Diagrams', content: original });
    expect(await read()).toBe(`# Diagrams\n\n${original}`);
    expect(db.blocks.some(b => b.content === diagram)).toBe(true);
    const appended = `## Another diagram\n\n${diagram.replace('flowchart LR', 'flowchart TD')}`;
    await call('append_note', { noteId: 'note', content: appended });
    expect(await read()).toBe(`# Diagrams\n\n${original}\n\n${appended}`);
    const replacement = original.replace('Step 42', 'Revised step');
    await call('update_note', { noteId: 'note', content: replacement });
    expect(await read()).toBe(`# Diagrams\n\n${replacement}`);
    expect(db.notes[0].type).toBeUndefined();

    // The normal privacy sanitizer still applies to diagram-containing notes.
    await call('append_note', { noteId: 'note', content: '## Private\n\n<private>remove me</private>' });
    expect(await read()).not.toContain('remove me');

    db.notes[0].userId = 'another-owner';
    const denied = await call('update_note', { noteId: 'note', content: 'must not replace' });
    expect(JSON.stringify(denied)).toContain('not yours');
    expect(db.blocks.some(b => b.content.includes('Revised step'))).toBe(true);
  });
});
