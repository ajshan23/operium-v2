"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { API_BASE_URL } from "@/api/client";
import MarkdownViewer from "@/components/MarkdownViewer";
import CanvasEditor from "@/components/CanvasEditor";
import Logo from "@/components/Logo";
import { FileText, Palette, Loader2, AlertTriangle, ExternalLink } from "lucide-react";

interface SharedNote {
  title: string;
  type?: "text" | "canvas";
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export default function SharedNotePage() {
  const params   = useParams<{ shareId: string }>();
  const shareId  = params?.shareId ?? "";

  const [note, setNote]       = useState<SharedNote | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!shareId) return;
    fetch(`${API_BASE_URL}/api/shared/notes/${shareId}`)
      .then(r => r.json())
      .then(res => {
        if (res.data) {
          setNote(res.data.note as SharedNote);
          setContent(res.data.content as string);
        } else {
          setError(res.message ?? "Note not found");
        }
      })
      .catch(() => setError("Failed to load shared note"))
      .finally(() => setLoading(false));
  }, [shareId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-page flex items-center justify-center">
        <Loader2 size={28} className="text-accent-text animate-spin" />
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="min-h-screen bg-surface-page flex flex-col items-center justify-center gap-4 text-center px-4">
        <AlertTriangle size={36} className="text-content-muted" />
        <h1 className="text-content-primary text-xl font-semibold">Note not found</h1>
        <p className="text-content-muted text-sm">{error || "This shared note doesn't exist or sharing has been disabled."}</p>
        <Link href="/" className="mt-2 text-accent-text text-sm hover:underline">Go to Operium</Link>
      </div>
    );
  }

  const updatedAt = new Date(note.updatedAt).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="min-h-screen bg-surface-page text-content-primary">
      {/* Top bar */}
      <div className="border-b border-line-subtle bg-surface-page/90 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-3xl lg:max-w-5xl mx-auto px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo variant="mark" size={32} className="shrink-0" />
            <span className="text-sm font-semibold text-accent-text">Operium</span>
            <span className="text-content-muted text-sm">/</span>
            <span className="text-sm text-content-muted">Shared Note</span>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-content-muted hover:text-accent-text transition-colors"
          >
            <ExternalLink size={12} />
            Open Operium
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl lg:max-w-5xl mx-auto px-6 lg:px-8 py-12 lg:py-14">
        {/* Note header */}
        <div className="mb-8 pb-8 border-b border-line-subtle">
          <div className="flex items-center gap-2 mb-4">
            {note.type === "canvas"
              ? <Palette size={16} className="text-status-info" />
              : <FileText size={16} className="text-accent-text" />}
            <span className="text-xs text-content-muted">{note.type === "canvas" ? "Shared canvas" : "Shared note"}</span>
          </div>
          <h1 className="text-3xl font-bold text-content-primary mb-3">{note.title || "Untitled"}</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-content-muted">Last updated {updatedAt}</span>
            {note.tags?.map(t => (
              <span key={t} className="text-xs text-accent-text bg-accent/10 px-2 py-0.5 rounded-full">
                #{t}
              </span>
            ))}
          </div>
        </div>

        {/* Note body */}
        {note.type === "canvas" ? (
          <div className="w-full h-[70vh] min-h-[420px]">
            <CanvasEditor value={content} readOnly />
          </div>
        ) : (
          <div className="max-w-none">
            {content.trim()
              ? <MarkdownViewer content={content} />
              : <p className="text-content-muted italic text-sm">This note is empty.</p>}
          </div>
        )}

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-line-subtle text-center">
          <p className="text-xs text-content-muted">
            Shared via{" "}
            <Link href="/" className="text-accent-text hover:underline">Operium</Link>
            {" "}— persistent memory for AI coding assistants
          </p>
        </div>
      </div>
    </div>
  );
}
