"use client";

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { renderDiagram, type DiagramImage } from '../lib/mermaid';
import { useTheme } from './ThemeProvider';

const control = 'rounded-lg border border-line px-3 py-1.5 text-xs text-content-primary hover:bg-surface-hover disabled:opacity-40';

function DiagramViewport({ image, fullscreen = false }: { image: DiagramImage; fullscreen?: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setZoom(1); }, [image]);
  const fit = Math.min(Math.max(1, size.width - 32) / image.width, Math.max(1, size.height - 32) / image.height, 2);
  const scale = fit * zoom;
  return (
    <div className={`flex min-h-0 flex-col ${fullscreen ? 'h-full' : ''}`}>
      <div className="flex shrink-0 items-center gap-2 border-b border-line-subtle p-2" aria-label="Diagram zoom controls">
        <button type="button" className={control} aria-label="Zoom out" disabled={zoom <= 0.25} onClick={() => setZoom(z => Math.max(0.25, z / 1.25))}>−</button>
        <span className="min-w-12 text-center text-xs text-content-secondary" aria-live="polite">{Math.round(scale * 100)}%</span>
        <button type="button" className={control} aria-label="Zoom in" disabled={zoom >= 8} onClick={() => setZoom(z => Math.min(8, z * 1.25))}>+</button>
        <button type="button" className={control} onClick={() => {
          setZoom(1);
          viewport.current?.scrollTo({ top: 0, left: 0 });
        }}>Fit to view</button>
      </div>
      <div ref={viewport} tabIndex={0} aria-label="Diagram preview; scroll to explore when zoomed" className={`overflow-auto ${fullscreen ? 'min-h-0 flex-1' : 'h-[360px]'}`}>
        <div className="flex min-h-full min-w-full w-max items-center justify-center p-4">
          <div
            role="img"
            aria-label="Mermaid diagram"
            className="shrink-0 [&>svg]:!h-full [&>svg]:!w-full [&>svg]:!max-w-none"
            style={{ width: image.width * scale, height: image.height * scale }}
            dangerouslySetInnerHTML={{ __html: image.svg }}
          />
        </div>
      </div>
    </div>
  );
}

function FullscreenDiagram({ children, onExit }: { children: ReactNode; onExit: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  return createPortal(
    <dialog ref={dialog} aria-label="Mermaid diagram fullscreen" onCancel={event => { event.preventDefault(); onExit(); }}
      className="fixed inset-0 z-[10000] m-0 h-[100dvh] max-h-none w-screen max-w-none border-0 bg-surface-panel p-0 text-content-primary backdrop:bg-overlay/80">
      <div className="flex h-full flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          <span className="text-sm font-semibold">Mermaid diagram</span>
          <button type="button" className={control} onClick={onExit} autoFocus>Exit fullscreen (Esc)</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </dialog>, document.body,
  );
}

export default function MermaidPreview({ source }: { source: string }) {
  const { resolvedTheme } = useTheme();
  const [result, setResult] = useState<{ source?: string; theme?: string; image?: DiagramImage; error?: string }>({});
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(() => {
      renderDiagram(source, resolvedTheme === 'dark', () => current).then(image => {
        if (current && image) setResult({ source, theme: resolvedTheme, image });
      }).catch(error => {
        if (current) setResult({ source, theme: resolvedTheme, error: error instanceof Error ? error.message : 'Unable to render this diagram. Check its Mermaid source.' });
      });
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [source, resolvedTheme]);

  const pending = result.source !== source || result.theme !== resolvedTheme;
  const preview = pending
    ? <div role="status" className="p-4 text-sm text-content-muted">Rendering diagram…</div>
    : result.error
      ? <div role="alert" className="whitespace-pre-wrap break-words p-4 text-sm text-content-secondary">{result.error}<div className="mt-2 text-xs">{fullscreen ? 'Exit fullscreen and open Code' : 'Open Code'} to review the source. Your note content has not been changed.</div></div>
      : result.image ? <DiagramViewport image={result.image} fullscreen={fullscreen} /> : null;
  return (
    <div>
      <div className="flex justify-end px-2 pt-2"><button type="button" className={control} disabled={pending || !result.image} onClick={() => setFullscreen(true)}>Fullscreen</button></div>
      {fullscreen
        ? <FullscreenDiagram onExit={() => setFullscreen(false)}>{preview}</FullscreenDiagram>
        : preview}
    </div>
  );
}
