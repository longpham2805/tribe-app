import { Ticket } from "../entity/Ticket";
import { TicketPhase } from "../enum/TicketPhase";
import type { MondayItemDetail } from "../monday/types";

export interface ProjectHook {
  readonly name: string;
  shouldHandle(ticket: Ticket): boolean;
  onTicketImported?(ticket: Ticket, item: MondayItemDetail): Promise<void>;
  onPhaseEntered?(ticket: Ticket, phaseName: TicketPhase): Promise<void>;
  onPhaseCompleted?(ticket: Ticket, phaseName: TicketPhase): Promise<void>;
}
