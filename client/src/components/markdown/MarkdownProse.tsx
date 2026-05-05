import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownProseProps {
  content: string;
}

function MarkdownProseComponent({ content }: MarkdownProseProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="file-markdown__h1">{children}</h1>,
        h2: ({ children }) => <h2 className="file-markdown__h2">{children}</h2>,
        h3: ({ children }) => <h3 className="file-markdown__h3">{children}</h3>,
        p: ({ children }) => <p className="file-markdown__p">{children}</p>,
        ul: ({ children }) => <ul className="file-markdown__list">{children}</ul>,
        ol: ({ children }) => <ol className="file-markdown__list">{children}</ol>,
        li: ({ children }) => <li className="file-markdown__li">{children}</li>,
        blockquote: ({ children }) => <blockquote className="file-markdown__quote">{children}</blockquote>,
        table: ({ children }) => (
          <div className="file-markdown__table-wrap">
            <table className="file-markdown__table">{children}</table>
          </div>
        ),
        th: ({ children }) => <th>{children}</th>,
        td: ({ children }) => <td>{children}</td>,
        pre: ({ children }) => <pre className="file-markdown__pre">{children}</pre>,
        img: ({ alt, src, title }) => (
          <img className="file-markdown__image" src={src} alt={alt} title={title} />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export const MarkdownProse = memo(MarkdownProseComponent);
