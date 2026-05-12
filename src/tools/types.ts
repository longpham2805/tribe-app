import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import type { z } from "zod";
import type { Ticket } from "../entity/Ticket";
import type { AssistantMessageEmbed } from "../shared/assistantEmbed";

export type ToolSource = "rest" | "mcp" | "assistant_chat" | "assistant_auto";

export type ToolExposure = {
  assistant?: boolean;
  mcp?: boolean;
  rest?: boolean;
};

export type ToolConfirmation = {
  summary: string;
  reason: string;
  blastRadius?: "low" | "medium" | "high";
};

export type PendingToolConfirmation = {
  name: string;
  input: Record<string, unknown>;
  confirmation: ToolConfirmation;
  createdAt: string;
};

export type ToolExecutionContext = {
  source: ToolSource;
  confirmed?: boolean;
  activeProjectId?: number | null;
  ticketId?: number;
  phaseId?: number;
  sourceEventKey?: string;
  imageEmbeds?: Extract<AssistantMessageEmbed, { type: "image" }>[];
  selectImagesForTicket?: (value: unknown) => Extract<AssistantMessageEmbed, { type: "image" }>[];
  attachImagesToTicket?: (ticketId: number, images: Extract<AssistantMessageEmbed, { type: "image" }>[]) => Promise<Ticket | null>;
};

export type ToolCommandResult =
  | { ok: true; data: unknown; statusCode?: number }
  | { ok: false; error: string; statusCode: number }
  | {
      ok: false;
      confirmationRequired: true;
      statusCode: 202;
      pending: PendingToolConfirmation;
    };

export type ToolCommand = {
  name: string;
  description: string;
  exposure: ToolExposure;
  input: Record<string, ToolField>;
  handler: (input: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<unknown>;
  confirmation?: (input: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<ToolConfirmation | null>;
};

export type ToolField = {
  type: "string" | "number" | "boolean" | "array" | "object" | "unknown";
  description?: string;
  optional?: boolean;
  nullable?: boolean;
  enum?: readonly string[];
  items?: ToolField;
  properties?: Record<string, ToolField>;
};

export type AnthropicToolInputSchema = Tool["input_schema"];

export type BuiltToolSchema = {
  anthropic: AnthropicToolInputSchema;
  zodShape: Record<string, z.ZodTypeAny>;
};

export class ToolCommandError extends Error {
  constructor(message: string, readonly statusCode = 500) {
    super(message);
  }
}
