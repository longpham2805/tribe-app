export interface Slot {
  id: number;
  name: string;
  rootPath: string;
  currentTicketId: number | null;
  projectId: number | null;
  createdAt: string;
  updatedAt: string;
}
