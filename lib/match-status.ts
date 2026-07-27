const CLOSED_MATCH_STATUSES = new Set([
  "FINISHED",
  "CANCELLED",
  "POSTPONED",
  "SUSPENDED",
  "AWARDED",
]);

// Betting closes this many minutes BEFORE kickoff. A match is not bettable once
// now >= kickoff - cutoff. (Previously betting stayed open until 3h AFTER
// kickoff, which allowed bets on matches already in progress.)
export const BETTING_CUTOFF_MINUTES = 5;

// Standard error surfaced when a match is no longer bettable.
export const BETTING_CLOSED_MESSAGE = "此賽事已停止接受投注";

export function isMatchClosed(status: string | null | undefined) {
  return CLOSED_MATCH_STATUSES.has(status ?? "");
}

// The instant betting closes for a match (kickoff minus the cutoff).
export function bettingClosesAt(kickoffTime: string | Date): Date {
  const closesAt = new Date(kickoffTime);
  closesAt.setMinutes(closesAt.getMinutes() - BETTING_CUTOFF_MINUTES);
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
