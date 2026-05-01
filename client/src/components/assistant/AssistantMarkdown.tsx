import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MessageRole } from "../../types/assistant";

interface AssistantMarkdownProps {
  content: string;
  role: Extract<MessageRole, "assistant" | "system">;
}

function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const normalized = href.trim().toLowerCase();
  if (normalized.startsWith("http://") || normalized.startsWith("https://") || normalized.startsWith("mailto:")) {
    return href;
  }
  return undefined;
}

const markdownComponents: Components = {
  a: ({ children, href }) => {
    const linkHref = safeHref(href);
    if (!linkHref) return <span className="asst-markdown__blocked-link">{children}</span>;
    return (
      <a href={linkHref} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
  img: ({ alt }) => <span className="asst-markdown__image-placeholder">[image: {alt || "omitted"}]</span>,
  table: ({ children }) => (
    <div className="asst-markdown__table-wrap">
      <table>{children}</table>
    </div>
  ),
};

export const AssistantMarkdown = memo(function AssistantMarkdown({ content, role }: AssistantMarkdownProps) {
  return (
    <div className={`asst-markdown asst-markdown--${role}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
