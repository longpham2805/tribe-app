import { extractPullRequestUrl, getPullRequestLinkLabel } from "../../../constants/ticket";

type PullRequestArtifact = { repo: string; prUrl: string; commitSha: string };

export function TicketArtifactRows({
  branchName,
  pullRequests,
  keyPrefix = "",
}: {
  branchName?: string | null;
  pullRequests?: PullRequestArtifact[] | null;
  keyPrefix?: string;
}) {
  return (
    <>
      {branchName ? (
        <div className="td-artifacts-row">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
          <code className="mono" style={{ fontSize: 12.5, color: "var(--ink-1)" }}>{branchName}</code>
        </div>
      ) : null}
      {(pullRequests ?? []).map((pr) => {
        const url = extractPullRequestUrl(pr.prUrl);
        return (
          <div key={`${keyPrefix}${pr.repo}-${pr.prUrl}`} className="td-artifacts-row">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="18" cy="18" r="3" />
              <circle cx="6" cy="6" r="3" />
              <path d="M13 6h3a2 2 0 0 1 2 2v7" />
              <line x1="6" y1="9" x2="6" y2="21" />
            </svg>
            <span className="mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>{pr.repo}</span>
            {url ? (
              <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--claude-deep)", textDecoration: "none", fontWeight: 500 }}>
                {getPullRequestLinkLabel(url)}
              </a>
            ) : (
              <span>{pr.prUrl}</span>
            )}
            <code className="mono" style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: "auto" }}>{pr.commitSha}</code>
          </div>
        );
      })}
    </>
  );
}
