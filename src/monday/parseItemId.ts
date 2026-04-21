/**
 * Parse item ID from either a numeric ID or a Monday.com item URL.
 * URL format: https://*.monday.com/boards/.../pulses/ITEM_ID or .../pulses/ITEM_ID
 */
export function parseItemId(input: string): number | null {
  const trimmed = input.trim();
  const num = Number(trimmed);
  if (Number.isInteger(num) && num > 0) return num;
  const pulsesMatch = trimmed.match(/\/pulses\/(\d+)(?:\/|$|\?)?/i);
  return pulsesMatch ? parseInt(pulsesMatch[1], 10) : null;
}
