import { z } from "zod";
import type { AnthropicToolInputSchema, BuiltToolSchema, ToolField } from "./types";

export function buildToolSchema(input: Record<string, ToolField>): BuiltToolSchema {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const zodShape: Record<string, z.ZodTypeAny> = {};

  for (const [name, field] of Object.entries(input)) {
    properties[name] = toJsonSchema(field);
    zodShape[name] = toZod(field);
    if (!field.optional) required.push(name);
  }

  const anthropic: AnthropicToolInputSchema = {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };

  return { anthropic, zodShape };
}

function toJsonSchema(field: ToolField): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  if (field.description) base.description = field.description;
  if (field.enum) base.enum = [...field.enum];

  if (field.type === "array") {
    base.type = field.nullable ? ["array", "null"] : "array";
    base.items = field.items ? toJsonSchema(field.items) : {};
    return base;
  }

  if (field.type === "object") {
    base.type = field.nullable ? ["object", "null"] : "object";
    if (field.properties) {
      base.properties = Object.fromEntries(
        Object.entries(field.properties).map(([name, child]) => [name, toJsonSchema(child)]),
      );
    }
    return base;
  }

  if (field.type === "unknown") {
    return base;
  }

  base.type = field.nullable ? [field.type, "null"] : field.type;
  return base;
}

function toZod(field: ToolField): z.ZodTypeAny {
  let schema: z.ZodTypeAny;
  if (field.enum && field.enum.length > 0) {
    schema = z.enum(field.enum as [string, ...string[]]);
  } else if (field.type === "string") {
    schema = z.string();
  } else if (field.type === "number") {
    schema = z.number();
  } else if (field.type === "boolean") {
    schema = z.boolean();
  } else if (field.type === "array") {
    schema = z.array(field.items ? toZod(field.items) : z.unknown());
  } else if (field.type === "object") {
    schema = field.properties ? z.object(buildZodShape(field.properties)).passthrough() : z.record(z.string(), z.unknown());
  } else {
    schema = z.unknown();
  }

  if (field.nullable) schema = schema.nullable();
  if (field.optional) schema = schema.optional();
  return schema;
}

function buildZodShape(input: Record<string, ToolField>): Record<string, z.ZodTypeAny> {
  return Object.fromEntries(Object.entries(input).map(([name, field]) => [name, toZod(field)]));
}
