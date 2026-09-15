"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useTheme } from "@/components/ThemeProvider";

import "@excalidraw/excalidraw/index.css";

// Excalidraw touches window/document at module scope — client-only import.
const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then(mod => mod.Excalidraw),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center text-content-muted">
        <Loader2 size={20} className="animate-spin" />
      </div>
    ),
  }
);

export const EMPTY_CANVAS_CONTENT = JSON.stringify({
  elements: [],
  appState: { viewBackgroundColor: "#f5faff" },
});

interface CanvasEditorProps {
  /** Canvas scene as JSON: { elements, appState: { viewBackgroundColor } } */
  value: string;
  /** Receives serialized scene edits. The parent owns persistence debouncing. */
  onChange?: (json: string) => void;
  readOnly?: boolean;
  /** Fill the parent pane without the card border or rounded corners. */
  fullBleed?: boolean;
  /** Recenter and fit the scene after mounting into a resized viewport. */
  fitToContent?: boolean;
}

function parseScene(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    return {
      elements: parsed.elements ?? [],
      appState: { viewBackgroundColor: parsed.appState?.viewBackgroundColor ?? "#f5faff" },
    };
  } catch {
    return { elements: [], appState: { viewBackgroundColor: "#f5faff" } };
  }
}

// Excalidraw bumps an element's `version` on every real edit; selection/zoom
// don't. Cheaper and more reliable than diffing the full serialized scene.
function sceneSignature(elements: readonly any[], bg: string) {
  return elements
    .filter(el => !el.isDeleted)
    .map(el => `${el.id}:${el.version}`)
    .join("|") + "~" + bg;
}

export default function CanvasEditor({
  value,
  onChange,
  readOnly = false,
  fullBleed = false,
  fitToContent = false,
}: CanvasEditorProps) {
  const { resolvedTheme } = useTheme();
  // Excalidraw manages the scene after mount; initialData is read once per
  // mount — parents must remount (key={noteId}) to switch canvases.
  const [initialData] = useState(() => parseScene(value));

  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const fitFrameRef = useRef<number | null>(null);
  const lastSignatureRef = useRef(
    sceneSignature(initialData.elements, initialData.appState.viewBackgroundColor)
  );

  const fitScene = useCallback((api: ExcalidrawImperativeAPI) => {
    if (!fitToContent) return;
    if (fitFrameRef.current !== null) cancelAnimationFrame(fitFrameRef.current);

    // Excalidraw measures its parent asynchronously. Waiting for two paint
    // frames ensures a newly portalled fullscreen container has final bounds.
    fitFrameRef.current = requestAnimationFrame(() => {
      fitFrameRef.current = requestAnimationFrame(() => {
        api.refresh();
        const elements = api.getSceneElements();
        if (elements.length > 0) {
          api.scrollToContent(elements, {
            fitToViewport: true,
            viewportZoomFactor: 0.86,
            animate: false,
          });
        }
        fitFrameRef.current = null;
      });
    });
  }, [fitToContent]);

  useEffect(() => {
    const api = excalidrawApiRef.current;
    if (api) fitScene(api);

    return () => {
      if (fitFrameRef.current !== null) cancelAnimationFrame(fitFrameRef.current);
    };
  }, [fitScene]);

  const handleChange = (elements: readonly any[], appState: any) => {
    if (!onChange || readOnly) return;
    const bg = appState.viewBackgroundColor ?? "#f5faff";
    // onChange also fires for selection/zoom — only emit real scene changes.
    // Keep the parent draft current immediately so remounting into fullscreen
    // never falls back to the last persisted version.
    const signature = sceneSignature(elements, bg);
    if (signature === lastSignatureRef.current) return;
    lastSignatureRef.current = signature;
    onChange(JSON.stringify({
      elements: elements.filter(el => !el.isDeleted),
      appState: { viewBackgroundColor: bg },
    }));
  };

  return (
    <div className={`w-full h-full overflow-hidden bg-surface-panel ${
      fullBleed ? "" : "rounded-2xl border border-line-subtle"
    }`}>
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={api => {
          excalidrawApiRef.current = api;
          fitScene(api);
        }}
        onChange={handleChange}
        theme={resolvedTheme}
        viewModeEnabled={readOnly}
        zenModeEnabled={readOnly}
        UIOptions={{ tools: { image: false } }}
      />
    </div>
  );
}
