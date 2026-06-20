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

export function isMatchBettable(
  match: { status?: string | null; kickoff_time?: string | null },
  now = new Date()
) {
  if (isMatchClosed(match.status)) return false;
  if (!match.kickoff_time) return false;

  const hideAfter = new Date(match.kickoff_time);
  hideAfter.setHours(hideAfter.getHours() + 3);

  return hideAfter > now;
}
