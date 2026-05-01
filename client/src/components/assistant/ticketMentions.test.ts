import { extractTicketMentionIds } from "./ticketMentions";

function expectIds(name: string, content: string, ticketId: number | null, expected: number[]) {
  const actual = extractTicketMentionIds({ content, ticketId });
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new Error(`${name}: expected ${expected.join(",")}, received ${actual.join(",")}`);
  }
}

export function runTicketMentionTests() {
  expectIds("hash reference", "Review #111 before ship", null, [111]);
  expectIds("ticket word reference", "Ticket 111 and ticket #112 are related", null, [111, 112]);
  expectIds("ticket id first", "Also see #112", 111, [111, 112]);
  expectIds("dedupe", "#111 ticket 111 Ticket #111", null, [111]);
  expectIds("pr exclusion", "PR #12 fixes ticket #111", null, [111]);
  expectIds("cap", "#1 #2 #3 #4 #5 #6", null, [1, 2, 3, 4, 5]);
}
