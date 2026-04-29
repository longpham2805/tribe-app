export interface PullRequestArtifact {
  repo: string;
  prUrl: string;
  commitSha: string;
}

export function parseShipArtifacts(content: string): { branchName: string | null; pullRequests: PullRequestArtifact[] } {
  const extractPrUrl = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const markdownMatch = trimmed.match(/\((https?:\/\/[^)\s]+)\)/i);
    if (markdownMatch?.[1]) return markdownMatch[1];
    const directMatch = trimmed.match(/https?:\/\/\S+/i);
    if (!directMatch?.[0]) return null;
    return directMatch[0].replace(/[),.;]+$/, "");
  };

  const extractRepoFromPrUrl = (prUrl: string): string | null => {
    const match = prUrl.match(/github\.com\/([^/]+\/[^/]+)\/pull\/\d+/i);
    return match?.[1] ?? null;
  };

  const branchFromHeading = content.match(/##\s*Branch[\s\S]*?`([^`]+)`/i)?.[1]?.trim() ?? null;
  const branchFromNarrative =
    content.match(/\bon branch\s+`([^`]+)`/i)?.[1]?.trim() ??
    content.match(/\bon branch\s+([a-z0-9._/-]+)/i)?.[1]?.trim() ??
    null;
  const branchName = branchFromHeading || branchFromNarrative;

  const pullRequests: PullRequestArtifact[] = [];
  const seen = new Set<string>();
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
      const key = `${repo}|${prUrl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pullRequests.push({ repo, prUrl, commitSha });
    }
  }

  const prUrlMatches = [...content.matchAll(/https?:\/\/github\.com\/[^\s)]+\/pull\/\d+/gi)];
  const commitFromNarrative =
    content.match(/\bcommit\s+`?([0-9a-f]{7,40})`?/i)?.[1]?.trim() ??
    content.match(/\b([0-9a-f]{7,40})\b/)?.[1]?.trim() ??
    "";

  for (const match of prUrlMatches) {
    const rawUrl = match[0];
    const prUrl = rawUrl.replace(/[),.;]+$/, "");
    const repo = extractRepoFromPrUrl(prUrl) ?? "unknown";
    const key = `${repo}|${prUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pullRequests.push({
      repo,
      prUrl,
      commitSha: commitFromNarrative,
    });
  }

  return { branchName, pullRequests };
}
