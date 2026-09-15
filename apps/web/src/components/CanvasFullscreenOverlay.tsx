"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Loader2, Minimize2, Palette } from "lucide-react";

interface CanvasFullscreenOverlayProps {
  title: string;
  saving?: boolean;
  onExit: () => void;
  children: ReactNode;
}

export default function CanvasFullscreenOverlay({
  title,
  saving = false,
  onExit,
  children,
}: CanvasFullscreenOverlayProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title || "Untitled canvas"} fullscreen editor`}
      className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen flex-col overflow-hidden bg-surface-panel"
    >
      <div className="h-14 shrink-0 border-b border-line bg-surface-page px-4 flex items-center justify-between gap-4 shadow-[0_4px_18px_rgba(0,0,0,0.35)]">
        <div className="min-w-0 flex items-center gap-2.5">
          <Palette size={14} className="text-accent-text shrink-0" />
          <span className="truncate text-[13px] font-semibold text-content-primary">
            {title || "Untitled Canvas"}
          </span>
          {saving && <Loader2 size={12} className="animate-spin text-content-muted shrink-0" />}
        </div>
        <button
          type="button"
          onClick={onExit}
          title="Exit fullscreen (Esc)"
          aria-label="Exit canvas fullscreen"
          className="h-9 px-3 rounded-xl border border-line bg-surface-raised text-content-primary hover:bg-surface-hover hover:border-accent/60 flex items-center gap-2 text-xs font-semibold shrink-0 transition-colors"
        >
          <Minimize2 size={14} /> Exit fullscreen
        </button>
      </div>
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>,
    document.body,
  );
}
