import { Ticket } from "../entity/Ticket";
import { TicketPhase } from "../enum/TicketPhase";
import type { MondayItemDetail } from "../monday/types";

export interface ProjectSettings {
  mondayBoardIds: number[];
  mondayDefaultPersonId: string | null;
  mondayDevPeople: string[];
}

export interface ProjectHook {
  readonly name: string;
  shouldHandle(ticket: Ticket): boolean;
  onTicketImported?(ticket: Ticket, item: MondayItemDetail, settings: ProjectSettings): Promise<void>;
  onPhaseEntered?(ticket: Ticket, phaseName: TicketPhase, settings: ProjectSettings): Promise<void>;
  onPhaseCompleted?(ticket: Ticket, phaseName: TicketPhase, settings: ProjectSettings): Promise<void>;
}
