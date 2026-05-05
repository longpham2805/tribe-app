export interface PullRequestArtifact {
  repo: string;
  prUrl: string;
  commitSha: string;
}

type PullRequestIdentityInput = Pick<PullRequestArtifact, "repo" | "prUrl">;

const extractPrUrl = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const markdownMatch = trimmed.match(/\((https?:\/\/[^)\s]+)\)/i);
  if (markdownMatch?.[1]) return normalizePullRequestUrl(markdownMatch[1]);
  const directMatch = trimmed.match(/https?:\/\/\S+/i);
  if (!directMatch?.[0]) return null;
  return normalizePullRequestUrl(directMatch[0]);
};

const normalizePullRequestUrl = (raw: string): string => {
  const trimmed = raw.trim().replace(/[),.;]+$/, "");
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return trimmed.replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
};

const getGitHubPullRequestParts = (prUrl: string): { repo: string; number: string } | null => {
  try {
    const parsed = new URL(normalizePullRequestUrl(prUrl));
    if (parsed.hostname.toLowerCase() !== "github.com") return null;
    const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)$/i);
    if (!match?.[1] || !match[2] || !match[3]) return null;
    return { repo: `${match[1]}/${match[2]}`.toLowerCase(), number: match[3] };
  } catch {
    const match = normalizePullRequestUrl(prUrl).match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)$/i);
    if (!match?.[1] || !match[2]) return null;
    return { repo: match[1].toLowerCase(), number: match[2] };
  }
};

const extractRepoFromPrUrl = (prUrl: string): string | null => getGitHubPullRequestParts(prUrl)?.repo ?? null;

const normalizeBranchName = (branchName: string | null): string | null => branchName?.replace(/[),.;]+$/, "") ?? null;

export function getPullRequestArtifactKey(pr: PullRequestIdentityInput): string {
  const prUrl = normalizePullRequestUrl(pr.prUrl);
  const github = getGitHubPullRequestParts(prUrl);
  if (github) return `github:${github.repo}#${github.number}`;
  return `url:${prUrl}`;
}

export function dedupePullRequestArtifacts(pullRequests: PullRequestArtifact[]): PullRequestArtifact[] {
  const byKey = new Map<string, PullRequestArtifact>();
  for (const pr of pullRequests) {
    const key = getPullRequestArtifactKey(pr);
    if (!byKey.has(key)) byKey.set(key, { ...pr, prUrl: normalizePullRequestUrl(pr.prUrl) });
  }
  return [...byKey.values()];
}

export function parseShipArtifacts(content: string): { branchName: string | null; pullRequests: PullRequestArtifact[] } {
  const branchFromHeading = content.match(/##\s*Branch[\s\S]*?`([^`]+)`/i)?.[1]?.trim() ?? null;
  const branchFromNarrative =
    content.match(/\bon branch\s+`([^`]+)`/i)?.[1]?.trim() ??
    content.match(/\bon branch\s+([a-z0-9._/-]+)/i)?.[1]?.trim() ??
    null;
  const branchName = normalizeBranchName(branchFromHeading || branchFromNarrative);

  const pullRequests: PullRequestArtifact[] = [];
  const seen = new Set<string>();
  const addPullRequest = (pullRequest: PullRequestArtifact) => {
    const key = getPullRequestArtifactKey(pullRequest);
    if (seen.has(key)) return;
    seen.add(key);
    pullRequests.push({ ...pullRequest, prUrl: normalizePullRequestUrl(pullRequest.prUrl) });
  };

  const prSectionMatch = content.match(/##\s*Pull Requests\s*([\s\S]*?)(?:\n##\s+|\s*$)/i);
  if (prSectionMatch?.[1]) {
    const lines = prSectionMatch[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("|") && !line.includes("---") && !line.toLowerCase().includes("| repo |"));

    for (const line of lines) {
      const cells = line
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean);
      if (cells.length < 3) continue;
      const prUrl = extractPrUrl(cells[1]) ?? cells[1];
      const repo = cells[0];
      const commitSha = cells[2].replace(/`/g, "").trim();
      addPullRequest({ repo, prUrl, commitSha });
    }
  }

  const prUrlMatches = [...content.matchAll(/https?:\/\/github\.com\/[^\s)]+\/pull\/\d+[^\s)]*/gi)];
  const commitFromNarrative =
    content.match(/\bcommit\s+`?([0-9a-f]{7,40})`?/i)?.[1]?.trim() ??
    content.match(/\b([0-9a-f]{7,40})\b/)?.[1]?.trim() ??
    "";

  for (const match of prUrlMatches) {
    const prUrl = normalizePullRequestUrl(match[0]);
    const repo = extractRepoFromPrUrl(prUrl) ?? "unknown";
    addPullRequest({
      repo,
      prUrl,
      commitSha: commitFromNarrative,
    });
  }

  return { branchName, pullRequests };
}
