// Shared TipTap extension setup for note editing/viewing (spaces editor,
// read-only MarkdownViewer, shared-note page) so all render notes identically.
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Link from '@tiptap/extension-link';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { common, createLowlight } from 'lowlight';

export const lowlight = createLowlight(common);

export function noteExtensions({ editable }: { editable: boolean }) {
  return [
    StarterKit.configure({
      // Replaced by CodeBlockLowlight / the configured Link below
      codeBlock: false,
      link: false,
    }),
    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: null,
      HTMLAttributes: {
        class: 'code-block',
      },
    }),
    Markdown,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList.configure({
      HTMLAttributes: { class: 'task-list' },
    }),
    TaskItem.configure({
      nested: true,
      HTMLAttributes: { class: 'task-item' },
    }),
    Link.configure({
      openOnClick: !editable,
      HTMLAttributes: {
        class: 'text-[#8b5cf6] underline cursor-pointer hover:text-[#a78bfa] transition-colors',
        ...(!editable ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
      },
    }),
  ];
}

// Base typography for note content. Code gets neutral text; syntax colors come
// from the .note-prose hljs theme in globals.css.
export const NOTE_PROSE_CLASS = `note-prose prose prose-invert max-w-none outline-none
  [&_p]:text-[13px] [&_p]:text-[#a1a1aa] [&_p]:leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0
  [&_strong]:font-bold [&_strong]:text-[#fafafa]
  [&_em]:italic [&_em]:text-[#e1e1e6]
  [&_s]:text-[#55556a] [&_s]:line-through
  [&_h1]:text-[20px] [&_h1]:font-extrabold [&_h1]:text-[#fafafa] [&_h1]:tracking-tight [&_h1]:mt-5 [&_h1]:mb-3 [&_h1]:border-b [&_h1]:border-[#1a1a22] [&_h1]:pb-1
  [&_h2]:text-[16px] [&_h2]:font-bold [&_h2]:text-[#fafafa] [&_h2]:mt-4 [&_h2]:mb-2
  [&_h3]:text-[13px] [&_h3]:font-bold [&_h3]:text-[#e1e1e6] [&_h3]:mt-3 [&_h3]:mb-1.5
  [&_blockquote]:border-l-2 [&_blockquote]:border-[#8b5cf6]/50 [&_blockquote]:pl-3 [&_blockquote]:py-1 [&_blockquote]:my-2 [&_blockquote]:italic [&_blockquote]:text-[#a1a1aa] [&_blockquote]:bg-white/5 [&_blockquote]:rounded-r-md
  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ul]:space-y-1 [&_ul]:text-[13px] [&_ul]:text-[#a1a1aa]
  [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_ol]:space-y-1 [&_ol]:text-[13px] [&_ol]:text-[#a1a1aa]
  [&_li]:pl-1 [&_li>p]:m-0
  [&_pre]:bg-[#070709] [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[#1e1e24] [&_pre]:text-[#d4d4dc] [&_pre]:font-mono [&_pre]:text-[12px] [&_pre]:leading-[1.6] [&_pre]:my-2 [&_pre]:overflow-x-auto
  [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:border-0 [&_pre_code]:text-inherit
  [&_code]:font-mono
  [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-[#1e1e24] [&_:not(pre)>code]:text-[#e1e1e6] [&_:not(pre)>code]:text-[0.9em] [&_:not(pre)>code]:border [&_:not(pre)>code]:border-[#2a2a35]/40
  [&_table]:my-3 [&_table]:rounded-lg [&_table]:border [&_table]:border-[#1e1e24] [&_table]:w-full [&_table]:text-[12px] [&_table]:border-collapse
  [&_th]:bg-white/5 [&_th]:border-b [&_th]:border-[#1e1e24] [&_th]:border-r [&_th]:border-[#1e1e24] [&_th]:px-3 [&_th]:py-2 [&_th]:font-bold [&_th]:text-[#fafafa] [&_th]:text-left
  [&_td]:border-b [&_td]:border-[#1e1e24] [&_td]:border-r [&_td]:border-[#1e1e24] [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-[#a1a1aa]
  `.replace(/\s+/g, ' ').trim();
