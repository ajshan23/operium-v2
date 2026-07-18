"use client";

import React, { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import "@excalidraw/excalidraw/index.css";

// Excalidraw touches window/document at module scope — client-only import.
const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then(mod => mod.Excalidraw),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center text-[#55556a]">
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
  /** Debounced; receives the serialized scene. Omit for read-only display. */
  onChange?: (json: string) => void;
  readOnly?: boolean;
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

export default function CanvasEditor({ value, onChange, readOnly = false }: CanvasEditorProps) {
  // Excalidraw manages the scene after mount; initialData is read once per
  // mount — parents must remount (key={noteId}) to switch canvases.
  const [initialData] = useState(() => parseScene(value));

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSignatureRef = useRef(
    sceneSignature(initialData.elements, initialData.appState.viewBackgroundColor)
  );

  const handleChange = (elements: readonly any[], appState: any) => {
    if (!onChange || readOnly) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const bg = appState.viewBackgroundColor ?? "#f5faff";
      // onChange also fires for selection/zoom — only emit real scene changes
      const signature = sceneSignature(elements, bg);
      if (signature === lastSignatureRef.current) return;
      lastSignatureRef.current = signature;
      onChange(JSON.stringify({
        elements: elements.filter(el => !el.isDeleted),
        appState: { viewBackgroundColor: bg },
      }));
    }, 800);
  };

  return (
    <div className="w-full h-full rounded-2xl border border-[#1e1e24] overflow-hidden bg-[#0c0c0f]">
      <Excalidraw
        initialData={initialData}
        onChange={handleChange}
        theme="dark"
        viewModeEnabled={readOnly}
        zenModeEnabled={readOnly}
        UIOptions={{ tools: { image: false } }}
      />
    </div>
  );
}
