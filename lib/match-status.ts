const CLOSED_MATCH_STATUSES = new Set([
  "FINISHED",
  "CANCELLED",
  "POSTPONED",
  "SUSPENDED",
  "AWARDED",
]);

// Betting stays open until this many minutes AFTER kickoff, so players can
// still bet in the opening exchanges of a match. A match is no longer bettable
// once now >= kickoff + this offset.
export const BETTING_CLOSE_AFTER_KICKOFF_MINUTES = 30;

// Standard error surfaced when a match is no longer bettable.
export const BETTING_CLOSED_MESSAGE = "此賽事已停止接受投注";

export function isMatchClosed(status: string | null | undefined) {
  return CLOSED_MATCH_STATUSES.has(status ?? "");
}

// The instant betting closes for a match (kickoff plus the grace window).
export function bettingClosesAt(kickoffTime: string | Date): Date {
  const closesAt = new Date(kickoffTime);
  closesAt.setMinutes(closesAt.getMinutes() + BETTING_CLOSE_AFTER_KICKOFF_MINUTES);
  return closesAt;
}

export function isMatchBettable(
  match: { status?: string | null; kickoff_time?: string | null },
  now = new Date()
) {
  if (isMatchClosed(match.status)) return false;
  if (!match.kickoff_time) return false;

  // Blocked at exactly the cutoff and after.
  return now.getTime() < bettingClosesAt(match.kickoff_time).getTime();
}
