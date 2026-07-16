import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ReactNode } from 'react';
import { Mermaid } from './Mermaid';

function textOf(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  return '';
}

// Renders repo markdown: GitHub-flavoured, syntax-highlighted code, and Mermaid diagrams.
// rehype-highlight is told not to auto-detect and to ignore unknown languages, so
// ```mermaid blocks arrive as plain text that the `pre` override hands to <Mermaid>.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-docs">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          pre(props) {
            const child = Array.isArray(props.children) ? props.children[0] : props.children;
            const cls: string =
              (child && typeof child === 'object' && 'props' in child && (child.props as { className?: string }).className) || '';
            if (/language-mermaid/.test(cls)) {
              const code = (child as { props: { children?: ReactNode } }).props.children;
              return <Mermaid chart={textOf(code).trim()} />;
            }
            return <pre className="code-block">{props.children}</pre>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
