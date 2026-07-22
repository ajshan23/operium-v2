"use client";

import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import Placeholder from '@tiptap/extension-placeholder';
import { noteExtensions, NOTE_PROSE_CLASS } from '@/components/noteExtensions';
import {
  Bold, Italic, Strikethrough, Quote, Code,
  List, ListOrdered, Table as TableIcon, Link as LinkIcon,
  Link2Off, Globe, ListChecks
} from 'lucide-react';

interface TipTapEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Minimum height (px) of the typing area. Defaults to the full-page notes size. */
  minHeight?: number;
}

export default function TipTapEditor({
  value,
  onChange,
  placeholder = "Write something...",
  autoFocus = false,
  minHeight = 400
}: TipTapEditorProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const editor = useEditor({
    extensions: [
      ...noteExtensions({ editable: true }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: value,
    autofocus: autoFocus,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `${NOTE_PROSE_CLASS} focus:outline-none overflow-y-auto custom-scrollbar p-2`,
        style: `min-height: ${minHeight}px`,
      }
    },
    onUpdate: ({ editor }) => {
      const markdown = (editor.storage as any).markdown.getMarkdown();
      onChange(markdown);
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
  });

  // Keep editor content in sync with external value updates (e.g. switching notes)
  useEffect(() => {
    if (editor && value !== undefined) {
      const currentContent = (editor.storage as any).markdown.getMarkdown();
      if (currentContent !== value) {
        editor.commands.setContent(value, { emitUpdate: false });
      }
    }
  }, [value, editor]);

  if (!editor) {
    return null;
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    setLinkUrl(previousUrl || '');
    setIsLinkModalOpen(true);
  };

  const handleApplyLink = () => {
    if (linkUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      let fullUrl = linkUrl;
      if (!/^https?:\/\//i.test(linkUrl) && !linkUrl.startsWith('/')) {
        fullUrl = `https://${linkUrl}`;
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href: fullUrl }).run();
    }
    setIsLinkModalOpen(false);
    setLinkUrl('');
  };

  return (
    <div className={`flex flex-col w-full h-full bg-[#0c0c0f] rounded-2xl border transition-all duration-300 relative ${isFocused ? 'border-[#8b5cf6]/50 shadow-[0_0_24px_rgba(139,92,246,0.06)]' : 'border-[#1e1e24]'}`}>
      <style dangerouslySetInnerHTML={{ __html: `
        .is-editor-empty:first-child::before {
          color: #55556a;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
          font-style: italic;
        }
      `}} />

      {/* Formatting Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1e1e24] bg-[#070709] rounded-t-2xl overflow-x-auto custom-scrollbar shrink-0 select-none">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded-lg transition-colors ${editor.isActive('bold') ? 'bg-[#8b5cf6]/20 text-[#fafafa]' : 'text-[#63637a] hover:text-[#fafafa] hover:bg-white/5'}`}
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded-lg transition-colors ${editor.isActive('italic') ? 'bg-[#8b5cf6]/20 text-[#fafafa]' : 'text-[#63637a] hover:text-[#fafafa] hover:bg-white/5'}`}
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`p-1.5 rounded-lg transition-colors ${editor.isActive('strike') ? 'bg-[#8b5cf6]/20 text-[#fafafa]' : 'text-[#63637a] hover:text-[#fafafa] hover:bg-white/5'}`}
          title="Strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={setLink}
          className={`p-1.5 rounded-lg transition-colors ${editor.isActive('link') ? 'bg-[#8b5cf6]/20 text-[#fafafa]' : 'text-[#63637a] hover:text-[#fafafa] hover:bg-white/5'}`}
          title="Add Link"
        >
          <LinkIcon className="w-4 h-4" />
        </button>
        {editor.isActive('link') && (
          <button
            type="button"
            onClick={() => editor.chain().focus().unsetLink().run()}
            className="p-1.5 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors"
            title="Remove Link"
          >
            <Link2Off className="w-4 h-4" />
          </button>
        )}

        <div className="w-[1px] h-4 bg-[#1e1e24] mx-1"></div>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`p-1.5 rounded-lg text-xs font-bold transition-colors ${editor.isActive('heading', { level: 1 }) ? 'bg-[#8b5cf6]/20 text-[#fafafa]' : 'text-[#63637a] hover:text-[#fafafa] hover:bg-white/5'}`}
          title="Heading 1"
        >
          H1
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-1.5 rounded-lg text-xs font-bold transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-[#8b5cf6]/20 text-[#fafafa]' : 'text-[#63637a] hover:text-[#fafafa] hover:bg-white/5'}`}
          title="Heading 2"
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`p-1.5 rounded-lg text-xs font-bold transition-colors ${editor.isActive('heading', { level: 3 }) ? 'bg-[#8b5cf6]/20 text-[#fafafa]' : 'text-[#63637a] hover:text-[#fafafa] hover:bg-white/5'}`}
          title="Heading 3"
        >
          H3
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`p-1.5 rounded-lg transition-colors ${editor.isActive('blockquote') ? 'bg-[#8b5cf6]/20 text-[#fafafa]' : 'text-[#63637a] hover:text-[#fafafa] hover:bg-white/5'}`}
          title="Quote"
        >
          <Quote className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={`p-1.5 rounded-lg transition-colors ${editor.isActive('codeBlock') ? 'bg-[#8b5cf6]/20 text-[#fafafa]' : 'text-[#63637a] hover:text-[#fafafa] hover:bg-white/5'}`}
          title="Code Block"
        >
          <Code className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-4 bg-[#1e1e24] mx-1"></div>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-1.5 rounded-lg transition-colors ${editor.isActive('bulletList') ? 'bg-[#8b5cf6]/20 text-[#fafafa]' : 'text-[#63637a] hover:text-[#fafafa] hover:bg-white/5'}`}
          title="Bulleted List"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-1.5 rounded-lg transition-colors ${editor.isActive('orderedList') ? 'bg-[#8b5cf6]/20 text-[#fafafa]' : 'text-[#63637a] hover:text-[#fafafa] hover:bg-white/5'}`}
          title="Numbered List"
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={`p-1.5 rounded-lg transition-colors ${editor.isActive('taskList') ? 'bg-[#8b5cf6]/20 text-[#fafafa]' : 'text-[#63637a] hover:text-[#fafafa] hover:bg-white/5'}`}
          title="Task List"
        >
          <ListChecks className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-4 bg-[#1e1e24] mx-1"></div>

        <button
          type="button"
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()}
          className="p-1.5 text-[#63637a] hover:text-[#fafafa] hover:bg-white/5 rounded-lg transition-colors"
          title="Insert Table"
        >
          <TableIcon className="w-4 h-4" />
        </button>

        {editor.isActive('table') && (
          <>
            <div className="w-[1px] h-4 bg-[#1e1e24] mx-1"></div>
            <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()} className="px-2 py-1 text-[10px] font-semibold text-[#8b5cf6] bg-[#8b5cf6]/10 hover:bg-[#8b5cf6]/25 rounded transition-colors whitespace-nowrap">
              + Col
            </button>
            <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()} className="px-2 py-1 text-[10px] font-semibold text-[#8b5cf6] bg-[#8b5cf6]/10 hover:bg-[#8b5cf6]/25 rounded transition-colors whitespace-nowrap">
              + Row
            </button>
            <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()} className="px-2 py-1 text-[10px] font-semibold text-red-400 bg-red-400/10 hover:bg-red-400/20 rounded transition-colors whitespace-nowrap">
              - Col
            </button>
            <button type="button" onClick={() => editor.chain().focus().deleteRow().run()} className="px-2 py-1 text-[10px] font-semibold text-red-400 bg-red-400/10 hover:bg-red-400/20 rounded transition-colors whitespace-nowrap">
              - Row
            </button>
            <button type="button" onClick={() => editor.chain().focus().deleteTable().run()} className="px-2 py-1 text-[10px] font-bold text-red-500 hover:text-red-400 bg-transparent rounded transition-colors whitespace-nowrap ml-1">
              Delete Table
            </button>
          </>
        )}
      </div>

      {/* Editor Area */}
      <div className="flex-1 min-h-0 p-4">
        <EditorContent editor={editor} className="h-full" />
      </div>

      {/* Inline Link Overlay/Modal */}
      {isLinkModalOpen && (
        <div className="absolute inset-0 bg-[#000000]/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 rounded-2xl animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-[#0c0c0f] border border-[#2a2a35] w-full max-w-[340px] rounded-2xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.7),0_0_24px_rgba(139,92,246,0.1)] relative">
            <h4 className="text-[13px] font-bold text-[#fafafa] mb-3 flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-[#8b5cf6]" />
              <span>Attach Link</span>
            </h4>
            <input
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleApplyLink();
                }
                if (e.key === 'Escape') {
                  setIsLinkModalOpen(false);
                }
              }}
              autoFocus
              placeholder="https://example.com"
              className="w-full bg-[#141418] border border-[#2a2a35] rounded-xl py-2 px-3 text-[12px] text-white placeholder:text-[#55556a] focus:outline-none focus:border-[#8b5cf6]/50 focus:ring-1 focus:ring-[#8b5cf6]/50 transition-all shadow-inner mb-4"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsLinkModalOpen(false)}
                className="px-3 py-1.5 text-[11px] font-semibold text-[#63637a] hover:text-[#fafafa] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyLink}
                className="px-4 py-1.5 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-[11px] font-bold rounded-xl transition-all shadow-lg shadow-[#8b5cf6]/20"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
