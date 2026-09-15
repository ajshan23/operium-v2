"use client";

import { useEffect, useState } from 'react';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { isMermaidLanguage } from '../lib/mermaid';
import MermaidPreview from './MermaidPreview';

function CodeBlockView({ node, editor }: NodeViewProps) {
  const diagram = isMermaidLanguage(node.attrs.language);
  const [showCode, setShowCode] = useState(Boolean(node.attrs.diagramCodeInitially));
  useEffect(() => {
    // ProseMirror may reuse a node view when a new diagram is inserted before
    // an existing one. Honor the insertion hint on updates as well as mount.
    setShowCode(Boolean(node.attrs.diagramCodeInitially));
  }, [node.attrs.diagramCodeInitially]);
  return (
    <NodeViewWrapper className={diagram ? 'not-prose my-3 overflow-hidden rounded-xl border border-line bg-surface-panel' : 'code-block'} data-mermaid-block={diagram || undefined}>
      {diagram && <div contentEditable={false} className="flex items-center gap-2 border-b border-line-subtle bg-surface-raised px-3 py-2">
        <span className="mr-auto text-xs font-semibold text-content-secondary">Mermaid</span>
        {['Chart', 'Code'].map((label, index) => <button key={label} type="button" aria-pressed={showCode === Boolean(index)}
          onClick={() => setShowCode(Boolean(index))}
          className={`rounded-md px-3 py-1 text-xs ${showCode === Boolean(index) ? 'bg-accent/20 text-accent-text' : 'text-content-muted hover:bg-surface-hover'}`}>{label}</button>)}
      </div>}
      {/* Never unmount the editable content DOM: ProseMirror owns the source,
          selection and history even while the chart is being previewed. */}
      <NodeViewContent hidden={diagram && !showCode}
        className={`${diagram ? '[&>pre]:!m-0 [&>pre]:!rounded-none [&>pre]:!border-0' : ''} ${node.attrs.language ? `language-${node.attrs.language}` : ''}`} />
      {diagram && showCode && <div contentEditable={false} className="px-3 pb-2 text-xs text-content-muted">{editor.isEditable ? 'Edit Mermaid source above, then choose Chart to preview.' : 'Read-only Mermaid source.'}</div>}
      {diagram && !showCode && <div contentEditable={false}><MermaidPreview source={node.textContent} /></div>}
    </NodeViewWrapper>
  );
}

export const MermaidCodeBlock = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // Transient editor state only; Markdown serialization still saves just
      // the codeBlock language and text, with no diagram metadata or SVG.
      diagramCodeInitially: { default: false, rendered: false, parseHTML: () => false },
    };
  },
  addNodeView() {
    // Use the block-level pre itself as the content DOM. Browsers may unwrap
    // inline code/span elements when replacing all their text, which would
    // otherwise detach ProseMirror's content DOM and silently lose edits.
    return ReactNodeViewRenderer(CodeBlockView, { contentDOMElementTag: 'pre' });
  },
});
