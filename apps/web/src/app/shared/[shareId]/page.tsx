"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { API_BASE_URL } from "@/api/client";
import { FileText, Loader2, AlertTriangle, ExternalLink } from "lucide-react";

interface SharedNote {
  title: string;
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

  // Simple markdown renderer — paragraphs, headers, code blocks
  function renderContent(raw: string): React.ReactNode[] {
    const lines = raw.split("\n");
    const nodes: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i] ?? "";

      if (line.startsWith("```")) {
        const lang = line.slice(3).trim();
        const code: string[] = [];
        i++;
        while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
          code.push(lines[i] ?? "");
          i++;
        }
        nodes.push(
          <pre key={i} className="bg-[#0d0b16] rounded-xl p-4 overflow-x-auto border border-[#1a1a22] my-4 text-sm">
            {lang && <div className="text-[10px] text-[#63637a] mb-2 font-mono uppercase tracking-wider">{lang}</div>}
            <code className="text-[#c4b5fd] font-mono leading-relaxed">{code.join("\n")}</code>
          </pre>
        );
      } else if (line.startsWith("# ")) {
        nodes.push(<h1 key={i} className="text-2xl font-bold text-[#fafafa] mt-8 mb-3">{line.slice(2)}</h1>);
      } else if (line.startsWith("## ")) {
        nodes.push(<h2 key={i} className="text-xl font-semibold text-[#fafafa] mt-6 mb-2">{line.slice(3)}</h2>);
      } else if (line.startsWith("### ")) {
        nodes.push(<h3 key={i} className="text-lg font-medium text-[#e2e0ff] mt-5 mb-2">{line.slice(4)}</h3>);
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        const items: string[] = [line.slice(2)];
        while (i + 1 < lines.length && ((lines[i + 1] ?? "").startsWith("- ") || (lines[i + 1] ?? "").startsWith("* "))) {
          i++;
          items.push((lines[i] ?? "").slice(2));
        }
        nodes.push(
          <ul key={i} className="list-disc list-inside space-y-1 my-3 text-[#c4c4d4]">
            {items.map((it, j) => <li key={j}>{it}</li>)}
          </ul>
        );
      } else if (/^\d+\. /.test(line)) {
        const items: string[] = [line.replace(/^\d+\. /, "")];
        while (i + 1 < lines.length && /^\d+\. /.test(lines[i + 1] ?? "")) {
          i++;
          items.push((lines[i] ?? "").replace(/^\d+\. /, ""));
        }
        nodes.push(
          <ol key={i} className="list-decimal list-inside space-y-1 my-3 text-[#c4c4d4]">
            {items.map((it, j) => <li key={j}>{it}</li>)}
          </ol>
        );
      } else if (line.trim() === "") {
        nodes.push(<div key={i} className="h-3" />);
      } else {
        // Inline markdown: bold, code, italic
        const rendered = line
          .replace(/\*\*(.*?)\*\*/g, "<strong class=\"text-[#fafafa] font-semibold\">$1</strong>")
          .replace(/`(.*?)`/g, "<code class=\"bg-[#1a1228] text-[#c4b5fd] px-1.5 py-0.5 rounded text-sm font-mono\">$1</code>")
          .replace(/\*(.*?)\*/g, "<em class=\"italic text-[#e2e0ff]\">$1</em>");
        nodes.push(
          <p key={i} className="text-[#c4c4d4] leading-relaxed" dangerouslySetInnerHTML={{ __html: rendered }} />
        );
      }
      i++;
    }
    return nodes;
  }

  return (
    <div className="min-h-screen bg-[#050505] text-[#fafafa]">
      {/* Top bar */}
      <div className="border-b border-[#1a1a22] bg-[#050505]/90 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#7c3aed] to-[#ec4899] flex items-center justify-center shadow-[0_0_12px_rgba(139,92,246,0.4)]">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-white fill-current">
                <path d="M12 2C12 2 17 8.5 17 12.5C17 15.26 14.76 17.5 12 17.5C9.24 17.5 7 15.26 7 12.5C7 8.5 12 2 12 2Z" />
              </svg>
            </div>
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
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Note header */}
        <div className="mb-8 pb-8 border-b border-[#1a1a22]">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={16} className="text-[#8b5cf6]" />
            <span className="text-xs text-[#63637a]">Shared note</span>
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
        <div className="space-y-2 prose-sm max-w-none">
          {renderContent(content)}
        </div>

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
