"use client";

import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Link from '@tiptap/extension-link';

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export default function MarkdownViewer({ content, className = '' }: MarkdownViewerProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: {
          HTMLAttributes: {
            class: 'bg-[#070709] border border-[#1e1e24] rounded-lg p-3 my-2 font-mono text-[12px] text-[#a855f7] whitespace-pre-wrap',
          },
        },
      }),
      Markdown,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Link.configure({
        openOnClick: true,
        HTMLAttributes: { 
          class: 'text-[#8b5cf6] underline cursor-pointer hover:text-[#a78bfa] transition-colors', 
          target: '_blank', 
          rel: 'noopener noreferrer' 
        },
      }),
    ],
    content,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `prose prose-invert max-w-none outline-none select-text
        [&_p]:text-[13px] [&_p]:text-[#a1a1aa] [&_p]:leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0
        [&_strong]:font-bold [&_strong]:text-[#fafafa]
        [&_em]:italic [&_em]:text-[#e1e1e6]
        [&_s]:text-[#55556a] [&_s]:line-through
        [&_h1]:text-[18px] [&_h1]:font-extrabold [&_h1]:text-[#fafafa] [&_h1]:tracking-tight [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:border-b [&_h1]:border-[#1a1a22] [&_h1]:pb-0.5
        [&_h2]:text-[15px] [&_h2]:font-bold [&_h2]:text-[#fafafa] [&_h2]:mt-3 [&_h2]:mb-2
        [&_h3]:text-[13px] [&_h3]:font-bold [&_h3]:text-[#e1e1e6] [&_h3]:mt-3 [&_h3]:mb-1.5
        [&_blockquote]:border-l-2 [&_blockquote]:border-[#8b5cf6]/50 [&_blockquote]:pl-3 [&_blockquote]:py-1 [&_blockquote]:my-2 [&_blockquote]:italic [&_blockquote]:text-[#a1a1aa] [&_blockquote]:bg-white/5 [&_blockquote]:rounded-r-md
        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ul]:space-y-1 [&_ul]:text-[13px] [&_ul]:text-[#a1a1aa]
        [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_ol]:space-y-1 [&_ol]:text-[13px] [&_ol]:text-[#a1a1aa]
        [&_li]:pl-1 [&_li>p]:m-0
        [&_pre]:bg-[#070709] [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[#1e1e24] [&_pre]:text-[#a855f7] [&_pre]:font-mono [&_pre]:text-[12px] [&_pre]:my-2 [&_pre]:overflow-x-auto
        [&_code]:font-mono
        [&_p_code]:px-1 [&_p_code]:py-0.5 [&_p_code]:rounded [&_p_code]:bg-[#1e1e24] [&_p_code]:text-[#a855f7] [&_p_code]:text-[0.9em] [&_p_code]:border [&_p_code]:border-[#2a2a35]/40
        [&_table]:my-3 [&_table]:rounded-lg [&_table]:border [&_table]:border-[#1e1e24] [&_table]:w-full [&_table]:text-[12px] [&_table]:border-collapse
        [&_th]:bg-white/5 [&_th]:border-b [&_th]:border-[#1e1e24] [&_th]:border-r [&_th]:border-[#1e1e24] [&_th]:px-3 [&_th]:py-2 [&_th]:font-bold [&_th]:text-[#fafafa] [&_th]:text-left
        [&_td]:border-b [&_td]:border-[#1e1e24] [&_td]:border-r [&_td]:border-[#1e1e24] [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-[#a1a1aa]
        `.replace(/\s+/g, ' ').trim(),
      }
    }
  });

  useEffect(() => {
    if (editor && content !== undefined) {
      const currentContent = (editor.storage as any).markdown.getMarkdown();
      if (currentContent !== content) {
        editor.commands.setContent(content, { emitUpdate: false });
      }
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={`markdown-viewer ${className}`}>
      <EditorContent editor={editor} />
    </div>
  );
}
