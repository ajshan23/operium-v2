import type { MermaidConfig } from 'mermaid';

export const MAX_DIAGRAM_LENGTH = 50_000;
export const STARTER_DIAGRAM = 'flowchart LR\n  A[Start] --> B[Finish]';
export const isMermaidLanguage = (language: unknown) =>
  typeof language === 'string' && language.toLowerCase() === 'mermaid';

export interface DiagramImage {
  svg: string;
  width: number;
  height: number;
}

// Mermaid uses global configuration. Serialize initialize/render pairs so
// simultaneous diagrams (and theme changes) cannot affect one another.
let renderQueue: Promise<unknown> = Promise.resolve();
let nextId = 0;

export function renderDiagram(source: string, dark: boolean, isCurrent = () => true): Promise<DiagramImage | null> {
  const task = renderQueue.then(async () => {
    if (!isCurrent()) return null;
    if (!source.trim()) throw new Error('Add Mermaid source in Code to draw a diagram.');
    if (source.length > MAX_DIAGRAM_LENGTH) {
      throw new Error('This diagram exceeds the 50,000-character preview limit. Its source is still saved.');
    }
    const { default: mermaid } = await import('mermaid');
    if (!isCurrent()) return null;
    const config: MermaidConfig = {
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      maxTextSize: MAX_DIAGRAM_LENGTH,
      maxEdges: 500,
      suppressErrorRendering: true,
      // Diagram frontmatter/directives must not loosen these restrictions.
      secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges',
        'suppressErrorRendering', 'htmlLabels', 'flowchart', 'dompurifyConfig'],
    };
    mermaid.initialize(config);
    // Keep Mermaid's temporary measurement DOM out of the note and ensure
    // even failed renders leave no error SVGs attached to the document body.
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden';
    document.body.appendChild(host);
    try {
      const { svg } = await mermaid.render(`note-mermaid-${++nextId}`, source, host);
      const element = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
      // Strict mode blocks callbacks, but Mermaid can still emit SVG links.
      // Preserve their layout wrappers while removing all navigation actions.
      element.querySelectorAll('a').forEach(link => {
        link.removeAttribute('href');
        link.removeAttribute('xlink:href');
        link.removeAttribute('target');
        link.setAttribute('tabindex', '-1');
      });
      element.querySelectorAll('.clickable').forEach(node => node.classList.remove('clickable'));
      const box = element.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
      const width = box?.[2] || parseFloat(element.getAttribute('width') || '') || 800;
      const height = box?.[3] || parseFloat(element.getAttribute('height') || '') || 500;
      // Strict Mermaid sanitizes its SVG. Do not call bindFunctions: notes
      // are diagrams, not a surface for callbacks or navigation actions.
      return { svg: new XMLSerializer().serializeToString(element), width, height };
    } finally {
      host.remove();
    }
  });
  renderQueue = task.catch(() => {});
  return task;
}
