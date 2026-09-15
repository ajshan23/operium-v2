import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MermaidPreview from './MermaidPreview';
import { renderDiagram } from '../lib/mermaid';

const theme = vi.hoisted(() => ({ resolvedTheme: 'light' }));
vi.mock('./ThemeProvider', () => ({ useTheme: () => theme }));
vi.mock('../lib/mermaid', () => ({ renderDiagram: vi.fn() }));
const renderer = vi.mocked(renderDiagram);
const image = (label: string) => ({ svg: `<svg><text>${label}</text></svg>`, width: 200, height: 100 });
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  renderer.mockReset();
  renderer.mockImplementation(async source => image(source));
  theme.resolvedTheme = 'light';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});
const show = async (source: string) => { await act(async () => root.render(<MermaidPreview source={source} />)); };
const tick = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(250); }); };
const clickFullscreen = async () => { await act(async () => container.querySelector('button')!.click()); };

describe('Mermaid preview lifecycle', () => {
  it('keeps the same fullscreen dialog open through theme changes, errors and recovery', async () => {
    await show('first'); await tick(); await clickFullscreen();
    const dialog = document.querySelector('dialog');
    expect(dialog?.hasAttribute('open')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    theme.resolvedTheme = 'dark';
    await show('first');
    expect(document.querySelector('dialog')).toBe(dialog);
    expect(dialog?.querySelector('[role="status"]')).not.toBeNull();
    await tick();
    expect(renderer).toHaveBeenLastCalledWith('first', true, expect.any(Function));
    renderer.mockRejectedValueOnce(new Error('Syntax error'));
    await show('invalid'); await tick();
    expect(document.querySelector('dialog')).toBe(dialog);
    expect(dialog?.querySelector('[role="alert"]')?.textContent).toContain('Syntax error');
    await show('recovered'); await tick();
    expect(dialog?.querySelector('[role="img"]')?.textContent).toBe('recovered');
    await act(async () => dialog!.querySelector('button')!.click());
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('debounces changes and ignores an old render that resolves after the latest one', async () => {
    let finishOld: (result: ReturnType<typeof image>) => void = () => {};
    renderer.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    await show('old'); await tick();
    await show('intermediate');
    await show('latest'); await tick();
    expect(renderer.mock.calls.map(call => call[0])).toEqual(['old', 'latest']);
    expect(container.querySelector('[role="img"]')?.textContent).toBe('latest');
    await act(async () => finishOld(image('old')));
    expect(container.querySelector('[role="img"]')?.textContent).toBe('latest');
  });

  it('restores body scrolling if a fullscreen note is unmounted', async () => {
    document.body.style.overflow = 'auto';
    await show('diagram'); await tick(); await clickFullscreen();
    await act(async () => root.render(null));
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });
});
