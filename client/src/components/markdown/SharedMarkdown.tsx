import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface SharedMarkdownProps {
  content: string;
  compact?: boolean;
}

export const SharedMarkdown = memo(function SharedMarkdown({ content, compact = false }: SharedMarkdownProps) {
  const fontSize = compact ? 12 : 14;
  return (
    <div style={{ lineHeight: 1.6, fontSize, color: "inherit", wordBreak: "break-word" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          ul: ({ children }) => <ul style={{ margin: "0 0 10px", paddingLeft: 20 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: "0 0 10px", paddingLeft: 20 }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
          table: ({ children }) => (
            <div style={{ overflowX: "auto", margin: "0 0 10px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th style={{ textAlign: "left", border: "1px solid #334155", padding: "6px 8px" }}>{children}</th>
          ),
          td: ({ children }) => (
            <td style={{ border: "1px solid #334155", padding: "6px 8px", verticalAlign: "top" }}>{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
