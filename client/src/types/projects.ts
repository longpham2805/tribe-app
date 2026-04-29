export interface Project {
  id: number;
  name: string;
  slug: string | null;
  mondayBoardIds: number[] | null;
  mondayDefaultPersonId: string | null;
  mondayDevPeople: string[] | null;
  primaryColor: string | null;
  actionColor: string | null;
  introduction: string | null;
  rules: string | null;
  techStack: string | null;
  logoPath: string | null;
  ticketCount?: number;
  runningTicketCount?: number;
  hasRunningTickets?: boolean;
  createdAt: string;
  updatedAt: string;
}
