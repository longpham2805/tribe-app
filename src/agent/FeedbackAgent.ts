import { TicketPhase } from "../enum/TicketPhase";
import {
  BaseAgent,
  MARKER_TRAILER,
  type FollowupPromptContext,
  type PromptContext,
} from "./BaseAgent";

const MAX_PRIOR_REPORT_CHARS = 20000;

function clipReport(content: string | undefined): string {
  const trimmed = (content ?? "").trim();
  if (!trimmed) return "_Not available._";
  if (trimmed.length <= MAX_PRIOR_REPORT_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_PRIOR_REPORT_CHARS)}\n\n[Truncated to ${MAX_PRIOR_REPORT_CHARS} characters.]`;
}

function escapeReminderText(value: string | null | undefined): string {
  return (value ?? "").trim() || "(none)";
}

export class FeedbackAgent extends BaseAgent {
  readonly phase = TicketPhase.FEEDBACK;
  protected readonly skills = ["git"];
  protected readonly instructionFile = "feedback-handler.md";

  buildPrompt(ctx: PromptContext): string {
    const sections: string[] = [];

    const outputStyle = this.inlineOutputStyle();
    if (outputStyle) sections.push(outputStyle);

    sections.push(this.inlineInstructions());

    const skillsBlock = this.inlineSkills();
    if (skillsBlock) sections.push(skillsBlock);

    const projectContextBlock = this.renderProjectContext(ctx.projectContext);
    if (projectContextBlock) sections.push(projectContextBlock);

    sections.push(this.renderFeedbackInputs(ctx));
    return `${sections.filter(Boolean).join("\n\n")}${MARKER_TRAILER}`;
  }

  buildFollowupPrompt(message: string, ctx?: FollowupPromptContext): string {
    const phase = ctx?.phase;
    const ticket = ctx?.ticket;
    const ticketId = ticket?.id == null ? "(unknown)" : `#${ticket.id}`;
    const sequence = phase?.sequence ?? 0;
    const branchName = phase?.branchName ?? `feedback/${ticket?.id ?? "ticket"}-${sequence}`;

    const reminder = [
      "<system-reminder>",
      "Role: Feedback Handler. Continue the existing feedback round.",
      `Ticket: ${ticketId}`,
      `Feedback iteration: ${sequence}`,
      `Working branch: ${branchName}`,
      "",
      "Original feedback comment:",
      escapeReminderText(phase?.feedbackComment),
      "",
      "Hard rules:",
      "- Never push to dev, main, or master.",
      "- Keep using the same feedback branch and same PR for this feedback iteration.",
      "- Do not open duplicate PRs for follow-up changes in this iteration.",
      "- If the user confirms the fix, finish with [STATUS:COMPLETED].",
      "- If more changes are needed, amend the same branch/PR and ask for confirmation again with [STATUS:REQUIRES_ACTION].",
      "</system-reminder>",
    ].join("\n");

    return `${reminder}\n\n## User Reply\n\n${message}${MARKER_TRAILER}`;
  }

  private renderFeedbackInputs(ctx: PromptContext): string {
    const sequence = ctx.feedbackSequence ?? 0;
    const sections: string[] = [
      `## Ticket\n\n${ctx.ticketContent}`,
      [
        "## Feedback Request",
        `Iteration: ${sequence}`,
        `Base branch: ${ctx.baseBranch ?? "dev"}`,
        ctx.lastPrUrl ? `Last pull request: ${ctx.lastPrUrl}` : "Last pull request: _Not available._",
        ctx.suggestedBranchName ? `Suggested feedback branch: \`${ctx.suggestedBranchName}\`` : "",
        "",
        ctx.feedbackComment ?? "",
      ].filter(Boolean).join("\n"),
      `## Prior Planning Report\n\n${clipReport(ctx.planningContent)}`,
      `## Prior Implementation Report\n\n${clipReport(ctx.implementationContent)}`,
      `## Prior Ship Report\n\n${clipReport(ctx.shipContent)}`,
    ];

    if (ctx.feedbackOutputPath) {
      sections.push(
        "## Output Artifact\n\n" +
          `Write \`feedback-${sequence}.md\` directly to this absolute path using your file-write tool:\n\n` +
          `- \`feedback-${sequence}.md\` -> \`${ctx.feedbackOutputPath}\``,
      );
    }

    return sections.join("\n\n");
  }
}
