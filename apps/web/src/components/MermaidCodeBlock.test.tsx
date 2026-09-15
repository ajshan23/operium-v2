import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Editor, EditorContent } from '@tiptap/react';
import { closeHistory } from '@tiptap/pm/history';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { noteExtensions } from './noteExtensions';
import { STARTER_DIAGRAM } from '../lib/mermaid';

vi.mock('../lib/mermaid', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/mermaid')>(),
  renderDiagram: vi.fn(async () => ({ svg: '<svg viewBox="0 0 200 100"><text>Diagram</text></svg>', width: 200, height: 100 })),
}));

let editor: Editor;
let root: Root;
let container: HTMLDivElement;
afterEach(async () => {
  await act(async () => { root?.unmount(); editor?.destroy(); });
  container?.remove();
});

async function mount(content: string, editable = true) {
  container = document.createElement('div');
  document.body.appendChild(container);
  editor = new Editor({ extensions: noteExtensions({ editable }), content, editable });
  root = createRoot(container);
  await act(async () => { root.render(<EditorContent editor={editor} />); });
}
const markdown = () => (editor.storage as any).markdown.getMarkdown() as string;
const button = (text: string, scope: ParentNode = container) => Array.from(scope.querySelectorAll('button')).find(b => b.textContent === text)!;

describe('Mermaid Markdown blocks', () => {
  it('round-trips mixed notes and keeps ordinary code highlighting', async () => {
    const source = `## Architecture\n\nA normal paragraph.\n\n\`\`\`mermaid\n${STARTER_DIAGRAM}\n\`\`\`\n\n\`\`\`ts\nconst count = 1;\n\`\`\`\n\n\`\`\`mermaid\nsequenceDiagram\n  Alice->>Bob: Hi\n\`\`\``;
    await mount(source);
    expect(markdown()).toBe(source);
    expect(container.querySelectorAll('[data-mermaid-block]')).toHaveLength(2);
    expect(container.querySelector('.language-ts .hljs-keyword')).not.toBeNull();
    expect(container.querySelector('[data-mermaid-block] [data-node-view-content]')?.hasAttribute('hidden')).toBe(true);
    await act(async () => { button('Code').click(); });
    expect(container.querySelector('[data-mermaid-block] [data-node-view-content]')?.hasAttribute('hidden')).toBe(false);
    expect(markdown()).toBe(source);
    await act(async () => { editor.commands.setContent(markdown()); });
    expect(markdown()).toBe(source);
    expect(markdown()).not.toContain('<svg');
  });
  it('opens newly inserted diagrams in Code and source edits support undo/redo', async () => {
    await mount('');
    await act(async () => {
      editor.commands.insertContent({ type: 'codeBlock', attrs: { language: 'mermaid', diagramCodeInitially: true }, content: [{ type: 'text', text: STARTER_DIAGRAM }] });
    });
    expect(container.querySelector('[data-mermaid-block] [data-node-view-content]')?.hasAttribute('hidden')).toBe(false);
    const initial = markdown();
    await act(async () => {
      editor.view.dispatch(closeHistory(editor.state.tr));
      editor.commands.insertContentAt({ from: 1, to: 1 + STARTER_DIAGRAM.length }, { type: 'text', text: 'flowchart TD\n  A-->C' });
    });
    const edited = markdown();
    expect(edited).toContain('flowchart TD');
    await act(async () => { editor.commands.undo(); });
    expect(markdown()).toBe(initial);
    await act(async () => { editor.commands.redo(); });
    expect(markdown()).toBe(edited);
    expect(initial).not.toContain('diagramCodeInitially');
  });
  it('observes source DOM edits without detaching the block-level content DOM', async () => {
    await mount(`\`\`\`mermaid\n${STARTER_DIAGRAM}\n\`\`\``);
    await act(async () => { button('Code').click(); });
    const source = container.querySelector('[data-mermaid-block] [data-node-view-content-react]')!;
    expect(source.tagName).toBe('PRE');
    await act(async () => {
      source.textContent = 'flowchart TD\n  A[Replacement] --> B';
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    expect(markdown()).toContain('A[Replacement] --> B');
    expect(source.isConnected).toBe(true);
  });
  it('opens Code when inserting before an existing diagram whose node view is reused', async () => {
    await mount('```mermaid\nsequenceDiagram\n Alice->>Bob: Hi\n```');
    await act(async () => {
      editor.commands.setTextSelection(1);
      editor.commands.insertContent([
        { type: 'codeBlock', attrs: { language: 'mermaid', diagramCodeInitially: true }, content: [{ type: 'text', text: STARTER_DIAGRAM }] },
        { type: 'paragraph' },
      ]);
    });
    const blocks = container.querySelectorAll('[data-mermaid-block]');
    expect(blocks.length).toBe(2);
    expect(blocks[0].querySelector('[data-node-view-content]')?.hasAttribute('hidden')).toBe(false);
    expect(markdown()).toContain(STARTER_DIAGRAM);
    expect(markdown()).toContain('Alice->>Bob: Hi');
  });
  it('shows readonly source and a fullscreen preview that exits without modifying Markdown', async () => {
    await mount(`\`\`\`mermaid\n${STARTER_DIAGRAM}\n\`\`\``, false);
    const original = markdown();
    expect(editor.view.dom.getAttribute('contenteditable')).toBe('false');
    await act(async () => { button('Code').click(); });
    expect(container.textContent).toContain('Read-only Mermaid source');
    await act(async () => { button('Chart').click(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
    await act(async () => { button('Fullscreen').click(); });
    expect(document.querySelector('dialog[open]')).not.toBeNull();
    expect(document.querySelector('dialog')?.parentElement).toBe(document.body);
    expect(document.querySelectorAll('[role="img"]')).toHaveLength(1);
    await act(async () => { document.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true, bubbles: true })); });
    expect(document.querySelector('dialog')).toBeNull();
    expect(markdown()).toBe(original);
  });
});
