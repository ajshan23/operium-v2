"use client";

import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { noteExtensions, NOTE_PROSE_CLASS } from './noteExtensions';

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export default function MarkdownViewer({ content, className = '' }: MarkdownViewerProps) {
  const editor = useEditor({
    extensions: noteExtensions({ editable: false }),
    content,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `${NOTE_PROSE_CLASS} select-text`,
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
