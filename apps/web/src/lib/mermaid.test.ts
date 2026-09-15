import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isMermaidLanguage, MAX_DIAGRAM_LENGTH, renderDiagram } from './mermaid';

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock('mermaid', () => ({ default: mermaid }));

beforeEach(() => {
  vi.clearAllMocks();
  mermaid.render.mockResolvedValue({ svg: '<svg viewBox="0 0 400 200"></svg>' });
});

describe('Mermaid renderer', () => {
  it('recognizes only Mermaid language blocks', () => {
    expect(isMermaidLanguage('mermaid')).toBe(true);
    expect(isMermaidLanguage('Mermaid')).toBe(true);
    expect(isMermaidLanguage('js')).toBe(false);
    expect(isMermaidLanguage(null)).toBe(false);
  });
  it('rejects empty and oversized previews without losing source or loading the renderer', async () => {
    await expect(renderDiagram('  ', false)).rejects.toThrow('Add Mermaid source');
    await expect(renderDiagram('a'.repeat(MAX_DIAGRAM_LENGTH + 1), false)).rejects.toThrow('preview limit');
    expect(mermaid.render).not.toHaveBeenCalled();
  });
  it('uses secured configuration, unique IDs, dimensions, and removes temporary DOM', async () => {
    const first = await renderDiagram('flowchart LR\nA-->B', false);
    await renderDiagram('flowchart LR\nB-->C', true);
    expect(first).toMatchObject({ width: 400, height: 200 });
    expect(mermaid.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ securityLevel: 'strict', htmlLabels: false, theme: 'dark' }));
    const secure = mermaid.initialize.mock.calls[0][0].secure;
    expect(secure).toEqual(expect.arrayContaining(['securityLevel', 'htmlLabels', 'flowchart', 'maxTextSize']));
    expect(mermaid.render.mock.calls[0][0]).not.toBe(mermaid.render.mock.calls[1][0]);
    expect(mermaid.render.mock.calls[0][2].isConnected).toBe(false);
  });
  it('skips stale requests and recovers after a rejected render', async () => {
    expect(await renderDiagram('flowchart LR\nA-->B', false, () => false)).toBeNull();
    mermaid.render.mockRejectedValueOnce(new Error('Invalid diagram'));
    await expect(renderDiagram('invalid', false)).rejects.toThrow('Invalid diagram');
    expect(mermaid.render.mock.calls[0][2].isConnected).toBe(false);
    expect(await renderDiagram('flowchart LR\nA-->B', false)).toMatchObject({ width: 400 });
  });
  it('removes SVG navigation without discarding anchor layout transforms', async () => {
    mermaid.render.mockResolvedValueOnce({ svg: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 400 200"><a href="https://example.com" xlink:href="https://example.com" target="_blank" transform="translate(10,20)"><g class="node clickable"/></a></svg>' });
    const result = await renderDiagram('flowchart LR\nA-->B', false);
    expect(result?.svg).not.toContain('href=');
    expect(result?.svg).not.toContain('clickable');
    expect(result?.svg).toContain('translate(10,20)');
  });
});
