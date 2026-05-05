import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";

import type { PhaseLogMap, PhaseStatus, Ticket, TicketFile, TicketPhase } from "../../types";
import { Modal } from "../ui/Modal";
import { TicketContentEditor } from "./detail/TicketContentEditor";
import { TicketDetailTopbar } from "./detail/TicketDetailTopbar";
import { TicketFeedbackRounds } from "./detail/TicketFeedbackRounds";
import { TicketFilePane } from "./detail/TicketFilePane";
import { TicketGeneratedFiles } from "./detail/TicketGeneratedFiles";
import { TicketLiveFeedSection } from "./detail/TicketLiveFeedSection";
import { TicketLifecycle } from "./detail/TicketLifecycle";
import { TicketReplyPanel } from "./detail/TicketReplyPanel";
import { TicketShipArtifacts } from "./detail/TicketShipArtifacts";

interface TicketViewerState {
  fileName: string | null;
}

interface TicketDetailModalProps {
  ticket: Ticket | null;
  open: boolean;
  paneWidth?: number;
  rightPaneOffset?: string;
  viewer: TicketViewerState | null;
  selectedPhase: TicketPhase | undefined;
  liveLogs: PhaseLogMap;
  files: TicketFile[];
  filesLoading: boolean;
  assignedSlotName: string | null;
  triggeringPhase: string | null;
  respondingTicket: number | null;
  responseDraft: string;
  onClose: () => void;
  onDelete: (ticketId: number) => void;
  onUpdateContent: (ticketId: number, patch: { title: string; description: string }) => Promise<void>;
  onTriggerPhase: (ticketId: number, phase: TicketPhase) => void;
  onSelectPhase: (ticketId: number, phase: TicketPhase) => void;
  onOpenFile: (fileName: string) => void;
  onCloseFile: () => void;
  onResponseDraftChange: (value: string) => void;
  onRespond: (ticketId: number) => void;
  onCreateFeedback: (ticketId: number, comment: string) => Promise<void>;
  creatingFeedbackTicket: number | null;
  projectName: string | null;
  phaseLabels: Record<TicketPhase, string>;
  phaseColors: Record<TicketPhase, string>;
  statusLabels: Record<PhaseStatus, string>;
  statusColors: Record<PhaseStatus, string | null>;
  pausedStatuses: readonly PhaseStatus[];
  phases: readonly TicketPhase[];
  savingContent: boolean;
}

export function TicketDetailModal({
  ticket,
  open,
  paneWidth = 720,
  rightPaneOffset = "0px",
  viewer,
  selectedPhase,
  liveLogs,
  files,
  filesLoading,
  assignedSlotName,
  triggeringPhase,
  respondingTicket,
  responseDraft,
  onClose,
  onDelete,
  onUpdateContent,
  onTriggerPhase,
  onSelectPhase,
  onOpenFile,
  onCloseFile,
  onResponseDraftChange,
  onRespond,
  onCreateFeedback,
  creatingFeedbackTicket,
  projectName,
  phaseLabels,
  phaseColors,
  statusLabels,
  statusColors,
  pausedStatuses,
  phases,
  savingContent,
}: TicketDetailModalProps) {
  const [editingContent, setEditingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const contentForm = useForm<{ title: string; description: string }>({
    defaultValues: {
      title: ticket?.title ?? "",
      description: ticket?.description ?? "",
    },
  });
  const feedbackForm = useForm<{ comment: string }>({
    defaultValues: {
      comment: "",
    },
  });

  useEffect(() => {
    setEditingContent(false);
    contentForm.reset({
      title: ticket?.title ?? "",
      description: ticket?.description ?? "",
    });
    setContentError(null);
    setFeedbackOpen(false);
    feedbackForm.reset({ comment: "" });
    setFeedbackError(null);
  }, [ticket?.id, ticket?.title, ticket?.description, ticket?.waitingForSlot, contentForm, feedbackForm]);

  const draftTitle = contentForm.watch("title");
  const draftDescription = contentForm.watch("description");
  const feedbackDraft = feedbackForm.watch("comment");
  const setDraftTitle = (value: string) => contentForm.setValue("title", value, { shouldDirty: true });
  const setDraftDescription = (value: string) => contentForm.setValue("description", value, { shouldDirty: true });
  const setFeedbackDraft = (value: string) => feedbackForm.setValue("comment", value, { shouldDirty: true });
  const resetContentDraft = () => contentForm.reset({ title: ticket?.title ?? "", description: ticket?.description ?? "" });
  const resetFeedbackDraft = () => feedbackForm.reset({ comment: "" });
  const contentTitleInput = contentForm.register("title", { required: true, maxLength: 255 });
  const contentDescriptionInput = contentForm.register("description");
  const feedbackCommentInput = feedbackForm.register("comment");
  const replyForm = useForm<{ message: string }>({ defaultValues: { message: responseDraft } });
  const { ref: replyRegisterRef, ...replyInput } = replyForm.register("message");
  useEffect(() => {
    replyForm.reset({ message: responseDraft });
  }, [responseDraft, replyForm]);
  const replyMessage = replyForm.watch("message");
  const clearReply = () => {
    replyForm.reset({ message: "" });
    onResponseDraftChange("");
  };
  const replyPanelRef = useRef<HTMLDivElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const paused = ticket?.phases.find(
    (phase) => !!phase.startedAt && !phase.completedAt && pausedStatuses.includes(phase.status),
  );

  useEffect(() => {
    if (!open || !paused || editingContent) return;

    const frame = window.requestAnimationFrame(() => {
      replyPanelRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
      replyTextareaRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, ticket?.id, paused?.id, paused?.status, editingContent]);

  if (!ticket) return null;

  const canEditContent = ticket.waitingForSlot;
  const feedbackPhases = ticket.phases
    .filter((phase) => phase.phaseName === "FEEDBACK")
    .sort((left, right) => left.sequence - right.sequence || left.id - right.id);
  const feedbackPrUrls = new Set(
    feedbackPhases.flatMap((phase) => (phase.pullRequests ?? []).map((pr) => pr.prUrl)),
  );
  const shipPullRequests = (ticket.pullRequests ?? []).filter((pr) => !feedbackPrUrls.has(pr.prUrl));
  const hasActivePhase = ticket.phases.some((phase) => !!phase.startedAt && !phase.completedAt);
  const hasOpenFeedback = feedbackPhases.some((phase) => !phase.completedAt);
  const assignedArtifacts = ticket.branchName || shipPullRequests.length > 0;
  const canRequestFeedback = ((ticket.pullRequests?.length ?? 0) > 0 || ticket.isDone) && !hasActivePhase && !hasOpenFeedback;
  const feedbackBusy = creatingFeedbackTicket === ticket.id;

  const activePhase = ticket.phases.find((p) => !!p.startedAt && !p.completedAt);
  const liveFeedPhase = activePhase ?? ticket.phases.slice().reverse().find((p) => !!p.completedAt) ?? ticket.phases[0];
  const displayedFeedPhaseName = selectedPhase ?? liveFeedPhase?.phaseName;
  const hasActivityDock = !!activePhase;
  const ticketRunning = ticket.phases.some((phase) => phase.status === "RUNNING");
  const isReplyBusy = respondingTicket === ticket.id;
  const title = viewer?.fileName ? `Ticket #${ticket.id} · ${viewer.fileName}` : `Ticket #${ticket.id} · ${ticket.title}`;
  const trimmedDraftTitle = draftTitle.trim();
  const titleTooLong = trimmedDraftTitle.length > 255;
  const saveDisabled = savingContent || !trimmedDraftTitle || titleTooLong;

  const handleContentSubmit = contentForm.handleSubmit(async ({ title, description }) => {
    const trimmedTitle = title.trim();
    if (savingContent || !trimmedTitle || trimmedTitle.length > 255) return;
    setContentError(null);
    try {
      await onUpdateContent(ticket.id, {
        title: trimmedTitle,
        description: description.trim(),
      });
      setEditingContent(false);
      contentForm.reset({ title: trimmedTitle, description });
    } catch (error: unknown) {
      setContentError(error instanceof Error ? error.message : "Failed to update ticket");
    }
  });

  const handleFeedbackSubmit = feedbackForm.handleSubmit(async ({ comment }) => {
    const trimmedComment = comment.trim();
    if (!trimmedComment || feedbackBusy || !canRequestFeedback) return;
    setFeedbackError(null);
    try {
      await onCreateFeedback(ticket.id, trimmedComment);
      resetFeedbackDraft();
      setFeedbackOpen(false);
    } catch (error: unknown) {
      setFeedbackError(error instanceof Error ? error.message : "Failed to create feedback");
    }
  });

  const handleReplyChange = (value: string) => {
    replyForm.setValue("message", value, { shouldDirty: true });
    onResponseDraftChange(value);
  };

  const handleReplySubmit = () => {
    if (!replyMessage.trim()) return;
    onResponseDraftChange(replyMessage);
    onRespond(ticket.id);
  };

  if (viewer?.fileName) {
    return (
      <TicketFilePane
        open={open}
        ticketId={ticket.id}
        fileName={viewer.fileName}
        title={title}
        paneWidth={paneWidth}
        rightPaneOffset={rightPaneOffset}
        liveLogs={liveLogs}
        onCloseFile={onCloseFile}
      />
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={title} variant="right-pane" width={paneWidth} rightOffset={rightPaneOffset} noHeader>
      <div className={`td-shell${hasActivityDock ? " td-shell--activity-dock" : ""}`}>
        <TicketDetailTopbar
          ticket={ticket}
          projectName={projectName}
          canEditContent={canEditContent}
          editingContent={editingContent}
          savingContent={savingContent}
          onToggleEdit={() => {
            if (editingContent) {
              setDraftTitle(ticket.title);
              setDraftDescription(ticket.description ?? "");
            }
            setEditingContent((prev) => !prev);
            setContentError(null);
          }}
          onDelete={onDelete}
          onClose={onClose}
        />

        <div className={`td-body${hasActivityDock ? " td-body--with-activity-dock" : ""}`}>
          <TicketContentEditor
            ticket={ticket}
            editingContent={editingContent}
            assignedSlotName={assignedSlotName}
            phaseLabels={phaseLabels}
            phaseColors={phaseColors}
            contentTitleInput={contentTitleInput}
            contentDescriptionInput={contentDescriptionInput}
            contentError={contentError}
            titleTooLong={titleTooLong}
            savingContent={savingContent}
            saveDisabled={saveDisabled}
            onSubmit={handleContentSubmit}
            onCancel={() => {
              setEditingContent(false);
              resetContentDraft();
              setContentError(null);
            }}
          />

          <TicketLifecycle
            ticket={ticket}
            phases={phases}
            selectedPhase={selectedPhase}
            triggeringPhase={triggeringPhase}
            ticketRunning={ticketRunning}
            phaseLabels={phaseLabels}
            phaseColors={phaseColors}
            statusLabels={statusLabels}
            statusColors={statusColors}
            onSelectPhase={onSelectPhase}
            onTriggerPhase={onTriggerPhase}
          />

          <TicketReplyPanel
            paused={paused}
            hasActivityDock={hasActivityDock}
            replyPanelRef={replyPanelRef}
            replyRegisterRef={replyRegisterRef}
            replyTextareaRef={replyTextareaRef}
            replyInput={replyInput}
            replyMessage={replyMessage}
            responseDraft={responseDraft}
            isReplyBusy={isReplyBusy}
            phaseLabels={phaseLabels}
            statusLabels={statusLabels}
            statusColors={statusColors}
            onReplyChange={handleReplyChange}
            onDiscard={clearReply}
            onRespond={() => onRespond(ticket.id)}
          />

          <div className="td-work-products">
            <TicketGeneratedFiles files={files} filesLoading={filesLoading} onOpenFile={onOpenFile} />

            <TicketShipArtifacts
              ticket={ticket}
              assignedArtifacts={!!assignedArtifacts}
              shipPullRequests={shipPullRequests}
              feedbackOpen={feedbackOpen}
              feedbackBusy={feedbackBusy}
              feedbackDraft={feedbackDraft}
              feedbackError={feedbackError}
              canRequestFeedback={canRequestFeedback}
              feedbackButtonTitle={hasOpenFeedback ? "Finish the open feedback round first" : "Add feedback"}
              feedbackCommentInput={feedbackCommentInput}
              onToggleFeedback={() => {
                setFeedbackOpen((prev) => {
                  const next = !prev;
                  if (!next) resetFeedbackDraft();
                  return next;
                });
                setFeedbackError(null);
              }}
              onCancelFeedback={() => {
                setFeedbackOpen(false);
                resetFeedbackDraft();
                setFeedbackError(null);
              }}
              onSubmitFeedback={handleFeedbackSubmit}
            />
          </div>

          <TicketFeedbackRounds
            feedbackPhases={feedbackPhases}
            paused={paused}
            replyPanelRef={replyPanelRef}
            replyRegisterRef={replyRegisterRef}
            replyTextareaRef={replyTextareaRef}
            replyInput={replyInput}
            replyMessage={replyMessage}
            isReplyBusy={isReplyBusy}
            phaseColors={phaseColors}
            statusLabels={statusLabels}
            statusColors={statusColors}
            onReplyChange={handleReplyChange}
            onClearReply={clearReply}
            onSubmitReply={handleReplySubmit}
          />

          <TicketLiveFeedSection
            ticketId={ticket.id}
            displayedFeedPhaseName={displayedFeedPhaseName}
            hasActivityDock={hasActivityDock}
            liveLogs={liveLogs}
            phaseLabels={phaseLabels}
          />
        </div>
      </div>
    </Modal>
  );
}
