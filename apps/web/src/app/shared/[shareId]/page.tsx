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
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 size={28} className="text-[#8b5cf6] animate-spin" />
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center gap-4 text-center px-4">
        <AlertTriangle size={36} className="text-[#3a3a4a]" />
        <h1 className="text-[#fafafa] text-xl font-semibold">Note not found</h1>
        <p className="text-[#63637a] text-sm">{error || "This shared note doesn't exist or sharing has been disabled."}</p>
        <Link href="/" className="mt-2 text-[#8b5cf6] text-sm hover:underline">Go to Operium</Link>
      </div>
    );
  }

  const updatedAt = new Date(note.updatedAt).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="min-h-screen bg-[#050505] text-[#fafafa]">
      {/* Top bar */}
      <div className="border-b border-[#1a1a22] bg-[#050505]/90 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-3xl lg:max-w-5xl mx-auto px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo variant="mark" size={32} className="shrink-0" />
            <span className="text-sm font-semibold text-[#8b5cf6]">Operium</span>
            <span className="text-[#2a2a35] text-sm">/</span>
            <span className="text-sm text-[#63637a]">Shared Note</span>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-[#63637a] hover:text-[#8b5cf6] transition-colors"
          >
            <ExternalLink size={12} />
            Open Operium
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl lg:max-w-5xl mx-auto px-6 lg:px-8 py-12 lg:py-14">
        {/* Note header */}
        <div className="mb-8 pb-8 border-b border-[#1a1a22]">
          <div className="flex items-center gap-2 mb-4">
            {note.type === "canvas"
              ? <Palette size={16} className="text-[#3b82f6]" />
              : <FileText size={16} className="text-[#8b5cf6]" />}
            <span className="text-xs text-[#63637a]">{note.type === "canvas" ? "Shared canvas" : "Shared note"}</span>
          </div>
          <h1 className="text-3xl font-bold text-[#fafafa] mb-3">{note.title || "Untitled"}</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-[#63637a]">Last updated {updatedAt}</span>
            {note.tags?.map(t => (
              <span key={t} className="text-xs text-[#8b5cf6] bg-[#8b5cf6]/10 px-2 py-0.5 rounded-full">
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
              : <p className="text-[#55556a] italic text-sm">This note is empty.</p>}
          </div>
        )}

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-[#1a1a22] text-center">
          <p className="text-xs text-[#3a3a4a]">
            Shared via{" "}
            <Link href="/" className="text-[#8b5cf6] hover:underline">Operium</Link>
            {" "}— persistent memory for AI coding assistants
          </p>
        </div>
      </div>
    </div>
  );
}
