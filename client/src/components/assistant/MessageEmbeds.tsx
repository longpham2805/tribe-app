import type { AssistantMessageEmbed } from "../../types/assistant";

function getPhaseLabel(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function TicketEmbedCard({ embed, onOpenTicket }: {
  embed: Extract<AssistantMessageEmbed, { type: "ticket" }>;
  onOpenTicket?: (ticketId: number) => void;
}) {
  const content = (
    <>
      <span className="asst-ticket-card__meta">#{embed.ticketId}{embed.phase ? ` · ${getPhaseLabel(embed.phase)}` : ""}</span>
      {embed.title && <span className="asst-ticket-card__title">{embed.title}</span>}
    </>
  );
  return onOpenTicket ? (
    <button type="button" className="asst-ticket-card asst-ticket-card--button" onClick={() => onOpenTicket(embed.ticketId)}>
      {content}
    </button>
  ) : (
    <div className="asst-ticket-card">{content}</div>
  );
}

function PlanEmbedCard({ embed }: { embed: Extract<AssistantMessageEmbed, { type: "plan" }> }) {
  return (
    <div className="asst-embed asst-embed--plan">
      <span className="asst-embed__label">plan</span>
      <span className="asst-embed__text">{embed.summary}</span>
    </div>
  );
}

function ImplementationEmbedCard({ embed }: { embed: Extract<AssistantMessageEmbed, { type: "implementation" }> }) {
  return (
    <div className="asst-embed asst-embed--implementation">
      <span className="asst-embed__label">implementation</span>
      <span className="asst-embed__text">{embed.summary}</span>
    </div>
  );
}

function BranchEmbedChip({ embed }: { embed: Extract<AssistantMessageEmbed, { type: "branch" }> }) {
  return (
    <div className="asst-embed asst-embed--branch">
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="5" cy="3" r="1.5" />
        <circle cx="5" cy="13" r="1.5" />
        <circle cx="11" cy="5" r="1.5" />
        <path d="M5 4.5v7M5 4.5C5 7 11 7 11 5" />
      </svg>
      <span className="asst-embed__branch-name">{embed.name}</span>
    </div>
  );
}

function PullRequestEmbedChip({ embed }: { embed: Extract<AssistantMessageEmbed, { type: "pull_request" }> }) {
  const label = embed.title ?? (embed.number ? `PR #${embed.number}` : "Pull request");
  return (
    <a href={embed.url} target="_blank" rel="noopener noreferrer" className="asst-embed asst-embed--pr">
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="4" cy="3" r="1.5" />
        <circle cx="4" cy="13" r="1.5" />
        <circle cx="12" cy="5" r="1.5" />
        <path d="M4 4.5v7M12 6.5V10a2 2 0 0 1-2 2H4" />
        <path d="M10 3l2 2-2 2" />
      </svg>
      <span className="asst-embed__pr-label">{label}</span>
      {embed.state && <span className={`asst-embed__pr-state asst-embed__pr-state--${embed.state.toLowerCase()}`}>{embed.state.toLowerCase()}</span>}
    </a>
  );
}

function QuestionEmbedCallout({ embed }: { embed: Extract<AssistantMessageEmbed, { type: "question" }> }) {
  return (
    <div className="asst-embed asst-embed--question">
      <span className="asst-embed__label">question</span>
      <span className="asst-embed__text">{embed.text}</span>
    </div>
  );
}

function ImageEmbedPreview({ embed }: { embed: Extract<AssistantMessageEmbed, { type: "image" }> }) {
  return (
    <a href={embed.url} target="_blank" rel="noopener noreferrer" className="asst-image-embed">
      <img src={embed.url} alt={embed.name ?? "Attached image"} className="asst-image-embed__img" />
      {embed.name && <span className="asst-image-embed__name">{embed.name}</span>}
    </a>
  );
}

export function MessageEmbeds({ embeds, onOpenTicket }: {
  embeds: AssistantMessageEmbed[] | null | undefined;
  onOpenTicket?: (ticketId: number) => void;
}) {
  if (!embeds?.length) return null;

  const tickets = embeds.filter((e): e is Extract<AssistantMessageEmbed, { type: "ticket" }> => e.type === "ticket");
  const others = embeds.filter((e) => e.type !== "ticket");

  return (
    <div className="asst-embeds">
      {tickets.length > 0 && (
        <div className="asst-ticket-cards" aria-label="Referenced tickets">
          {tickets.map((e, i) => (
            <TicketEmbedCard key={i} embed={e} onOpenTicket={onOpenTicket} />
          ))}
        </div>
      )}
      {others.map((embed, i) => {
        switch (embed.type) {
          case "plan": return <PlanEmbedCard key={i} embed={embed} />;
          case "implementation": return <ImplementationEmbedCard key={i} embed={embed} />;
          case "branch": return <BranchEmbedChip key={i} embed={embed} />;
          case "pull_request": return <PullRequestEmbedChip key={i} embed={embed} />;
          case "question": return <QuestionEmbedCallout key={i} embed={embed} />;
          case "image": return <ImageEmbedPreview key={i} embed={embed} />;
          default: return null;
        }
      })}
    </div>
  );
}
