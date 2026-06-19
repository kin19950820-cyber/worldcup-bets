const CLOSED_MATCH_STATUSES = new Set([
  "FINISHED",
  "CANCELLED",
  "POSTPONED",
  "SUSPENDED",
  "AWARDED",
]);

export function isMatchClosed(status: string | null | undefined) {
  return CLOSED_MATCH_STATUSES.has(status ?? "");
}
