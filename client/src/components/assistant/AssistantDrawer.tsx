import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { AssistantMessage, AssistantAction, AssistantMessageEmbed } from "../../types/assistant";
import { uploadAssistantImage } from "../../api/uploads";
import { MessageEmbeds } from "./MessageEmbeds";
import { AssistantMarkdown } from "./AssistantMarkdown";
import "./AssistantDrawer.css";

interface AssistantDrawerProps {
  open: boolean;
  onClose: () => void;
  isPinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  newMessages: AssistantMessage[];
  newActions: AssistantAction[];
  projectId?: number | null;
  onOpenTicket?: (ticketId: number) => void;
}

const SEVERITY_LABEL: Record<string, string> = {
  info: "info",
  warn: "warn",
  error: "error",
};

const SUGGESTIONS = [
  "What needs my input right now?",
  "Summarize today's shipped tickets",
  "Which slot is free?",
  "Why is the current phase paused?",
];

const ASSISTANT_INPUT_MAX_LINES = 4;
const MAX_ASSISTANT_IMAGES = 6;

function resizeAssistantInput(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;

  const styles = window.getComputedStyle(textarea);
  const fontSize = Number.parseFloat(styles.fontSize) || 13.5;
  const lineHeight = Number.parseFloat(styles.lineHeight) || fontSize * 1.45;
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
  const maxHeight = lineHeight * ASSISTANT_INPUT_MAX_LINES + paddingTop + paddingBottom;

  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
}

function formatMessageTime(createdAt: string) {
  return new Date(createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function AssistantAvatar({ role }: { role: AssistantMessage["role"] }) {
  const isUser = role === "user";
  const isSystem = role === "system";
  return (
    <span className={`asst-avatar asst-avatar--${role}`} aria-hidden="true">
      {isUser ? "Y" : isSystem ? "i" : "t"}
    </span>
  );
}

function MessageBubble({ msg, onOpenTicket }: {
  msg: AssistantMessage;
  onOpenTicket?: (ticketId: number) => void;
}) {
  const isUser = msg.role === "user";
  return (
    <div className={`asst-message asst-message--${msg.role}`}>
      <AssistantAvatar role={msg.role} />
      <div className="asst-message__body">
        <div className={`asst-bubble asst-bubble--${msg.role} asst-bubble--${msg.severity}`}>
          {!isUser && (msg.severity !== "info" || msg.ticketId) && (
            <span className="asst-bubble__label">
              {msg.severity !== "info" && (
                <span className={`asst-severity asst-severity--${msg.severity}`}>{SEVERITY_LABEL[msg.severity]}</span>
              )}
              {msg.ticketId && <span className="asst-ticket-ref">#{msg.ticketId}</span>}
            </span>
          )}
          <div className={`asst-bubble__content${isUser ? "" : " asst-bubble__content--markdown"}`}>
            {isUser ? msg.content : <AssistantMarkdown content={msg.content} role={msg.role === "system" ? "system" : "assistant"} />}
          </div>
        </div>
        <MessageEmbeds embeds={msg.embeds} onOpenTicket={onOpenTicket} />
        <span className="asst-bubble__time">
          {formatMessageTime(msg.createdAt)}
        </span>
      </div>
    </div>
  );
}

function ActionCard({ action, onApprove, onReject }: {
  action: AssistantAction;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  if (action.status !== "proposed") return null;
  return (
    <div className="asst-action-card">
      <div className="asst-action-card__type">{action.type.replace(/_/g, " ")}</div>
      {action.reason && <div className="asst-action-card__reason">{action.reason}</div>}
      {action.ticketId && <div className="asst-action-card__ticket">Ticket #{action.ticketId}</div>}
      <div className="asst-action-card__actions">
        <button
          className="asst-btn asst-btn--approve"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            onApprove(action.id);
          }}
        >
          Approve
        </button>
        <button
          className="asst-btn asst-btn--reject"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            onReject(action.id);
          }}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export function AssistantDrawer({
  open,
  onClose,
  isPinned,
  onPinnedChange,
  newMessages,
  newActions,
  projectId,
  onOpenTicket,
}: AssistantDrawerProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [actions, setActions] = useState<AssistantAction[]>([]);
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImagePreviews = useMemo(
    () => pendingImages.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [pendingImages],
  );

  useEffect(() => {
    return () => {
      pendingImagePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [pendingImagePreviews]);

  // Load initial state when opened
  useEffect(() => {
    if (!open) return;
    fetch("/api/assistant/messages")
      .then((r) => r.json())
      .then((data: AssistantMessage[]) => setMessages(data.reverse()))
      .catch(console.error);
    fetch("/api/assistant/actions")
      .then((r) => r.json())
      .then((data: AssistantAction[]) => setActions(data))
      .catch(console.error);
  }, [open]);

  // Append live WS messages
  useEffect(() => {
    if (newMessages.length === 0) return;
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      const fresh = newMessages.filter((m) => !ids.has(m.id));
      return fresh.length === 0 ? prev : [...prev, ...fresh];
    });
  }, [newMessages]);

  // Update live WS actions
  useEffect(() => {
    if (newActions.length === 0) return;
    setActions((prev) => {
      const map = new Map(prev.map((a) => [a.id, a]));
      for (const a of newActions) map.set(a.id, a);
      return Array.from(map.values());
    });
  }, [newActions]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    resizeAssistantInput(inputRef.current);
  }, [input, open]);

  const addPendingImages = useCallback((incoming: FileList | File[]) => {
    const images = Array.from(incoming).filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    setPendingImages((prev) => [...prev, ...images].slice(0, MAX_ASSISTANT_IMAGES));
    setComposerError(null);
  }, []);

  const removePendingImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
  }, []);

  const sendMessage = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    const files = override ? [] : pendingImages;
    if ((!text && files.length === 0) || sending) return;
    setSending(true);
    setComposerError(null);
    try {
      const imageEmbeds: AssistantMessageEmbed[] = [];
      for (const file of files) {
        imageEmbeds.push(await uploadAssistantImage(file));
      }
      await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          projectId: projectId ?? undefined,
          embeds: imageEmbeds.length > 0 ? imageEmbeds : undefined,
        }),
      });
      setInput("");
      if (!override) setPendingImages([]);
      // Refetch actions after response to pick up any newly proposed actions
      fetch("/api/assistant/actions")
        .then((r) => r.json())
        .then((data: AssistantAction[]) => setActions(data))
        .catch(console.error);
    } catch (err) {
      console.error(err);
      setComposerError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }, [input, pendingImages, sending, projectId]);

  const handleApprove = useCallback(async (id: number) => {
    await fetch(`/api/assistant/actions/${id}/approve`, { method: "POST" }).catch(console.error);
  }, []);

  const handleReject = useCallback(async (id: number) => {
    await fetch(`/api/assistant/actions/${id}/reject`, { method: "POST" }).catch(console.error);
  }, []);

  const pendingActions = actions.filter((a) => a.status === "proposed");

  if (!open) return null;

  return (
    <div className="asst-overlay" onClick={onClose}>
      <div className="asst-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="asst-drawer__header">
          <span className="asst-mark" aria-hidden="true">t</span>
          <div className="asst-drawer__heading">
            <span className="asst-drawer__title">Tribe assistant</span>
            <span className="asst-drawer__status">
              <span className="asst-drawer__status-dot" />
              {isPinned ? "Pinned" : "Ready"} · workspace-aware
            </span>
          </div>
          <button
            className={`asst-icon-btn asst-pin${isPinned ? " asst-pin--active" : ""}`}
            onClick={() => onPinnedChange(!isPinned)}
            aria-label={isPinned ? "Unpin assistant" : "Pin assistant"}
            aria-pressed={isPinned}
            title={isPinned ? "Unpin assistant" : "Pin assistant"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.5 4.5 19.5 9.5" />
              <path d="m9 14.5-4 4" />
              <path d="M7.5 12.5 4 9l5-5 3.5 3.5 3-3L20 9l-3 3 3.5 3.5-5 5-3.5-3.5Z" />
            </svg>
          </button>
          <button className="asst-icon-btn asst-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {pendingActions.length > 0 && (
          <div className="asst-actions-section">
            <div className="asst-section-label">Pending actions</div>
            {pendingActions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))}
          </div>
        )}

        <div className="asst-messages">
          {messages.length === 0 && (
            <div className="asst-empty">
              <h3 className="asst-empty__title">How can I help?</h3>
              <p className="asst-empty__copy">Ask about tickets, phases, slots, or anything waiting on your input.</p>
              <div className="asst-suggestions" aria-label="Suggested assistant prompts">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    className="asst-suggestion"
                    onClick={() => void sendMessage(suggestion)}
                    disabled={sending}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} onOpenTicket={onOpenTicket} />
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="asst-composer">
          {pendingImagePreviews.length > 0 && (
            <div className="asst-composer-images" aria-label="Images to send">
              {pendingImagePreviews.map((preview, index) => (
                <div className="asst-composer-image" key={`${preview.file.name}-${preview.file.lastModified}-${index}`}>
                  <img src={preview.url} alt={preview.file.name} className="asst-composer-image__img" />
                  <button
                    type="button"
                    className="asst-composer-image__remove"
                    onClick={() => removePendingImage(index)}
                    disabled={sending}
                    aria-label={`Remove ${preview.file.name}`}
                    title="Remove image"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <div
            className="asst-input-row"
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!sending) addPendingImages(event.dataTransfer.files);
            }}
          >
            <button
              type="button"
              className="asst-attach"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || pendingImages.length >= MAX_ASSISTANT_IMAGES}
              aria-label="Attach images"
              title="Attach images"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 8h.01" />
                <rect width="18" height="18" x="3" y="3" rx="2.5" />
                <path d="m3 16 5-5 4 4 2-2 7 7" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              className="asst-file-input"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                if (event.target.files) addPendingImages(event.target.files);
                event.target.value = "";
              }}
            />
            <textarea
              ref={inputRef}
              className="asst-input"
              rows={1}
              placeholder="Ask about a ticket, slot, or phase…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={(event) => {
                const files = event.clipboardData.files;
                if (files.length > 0) {
                  event.preventDefault();
                  addPendingImages(files);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              disabled={sending}
            />
            <button
              className="asst-send"
              onClick={() => void sendMessage()}
              disabled={sending || (!input.trim() && pendingImages.length === 0)}
              aria-label="Send message"
            >
              {sending ? (
                <span className="asst-send__dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              )}
            </button>
          </div>
          {composerError && <div className="asst-composer-error">{composerError}</div>}
          <div className="asst-composer-help">
            <span>Replies use this workspace's context</span>
            <span className="asst-composer-help__keys">
              <kbd>Enter</kbd> to send
              <span aria-hidden="true">·</span>
              <kbd>Shift Enter</kbd> newline
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
