export interface Slot {
  id: number;
  name: string;
  rootPath: string;
  currentTicketId: number | null;
  disabled: boolean;
  projectId: number | null;
  createdAt: string;
  updatedAt: string;
}
