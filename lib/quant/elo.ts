// World Football Elo rating (eloratings.net convention).
//
//   expected W_e = 1 / (10^(-dr/400) + 1)      dr = R_home + HFA - R_away
//   update     R' = R + K * G * (W - W_e)
//
// K depends on match importance, G on the goal margin:
//   G = 1 (margin <= 1), 1.5 (margin = 2), (11 + margin) / 8 (margin >= 3)

export const ELO_INITIAL = 1500;
export const ELO_HOME_ADVANTAGE = 100;

// Club football uses a flat K and a smaller home advantage (clubElo-style).
export const CLUB_ELO_K = 20;
export const CLUB_ELO_HOME_ADVANTAGE = 70;

export function eloWinExpectancy(ratingDiff: number) {
  return 1 / (Math.pow(10, -ratingDiff / 400) + 1);
}

export function eloKFactor(tournament: string): number {
  const t = tournament.toLowerCase();
  if (t.includes("fifa world cup") && !t.includes("qualification")) return 60;
  if (t.includes("qualification")) return 40;
  if (
    t.includes("uefa euro") ||
    t.includes("copa am") ||
    t.includes("african cup") ||
    t.includes("africa cup") ||
    t.includes("afc asian cup") ||
    t.includes("gold cup") ||
    t.includes("confederations")
  ) {
    return 50;
  }
  if (t.includes("friendly")) return 20;
  return 30;
}

export function eloGoalMultiplier(homeScore: number, awayScore: number) {
  const margin = Math.abs(homeScore - awayScore);
  if (margin <= 1) return 1;
  if (margin === 2) return 1.5;
  return (11 + margin) / 8;
}

export function eloExpectedScore(
  homeRating: number,
  awayRating: number,
  neutral: boolean
) {
  const dr = homeRating + (neutral ? 0 : ELO_HOME_ADVANTAGE) - awayRating;
  return 1 / (Math.pow(10, -dr / 400) + 1);
}

export function eloUpdate(
  homeRating: number,
  awayRating: number,
  homeScore: number,
  awayScore: number,
  tournament: string,
  neutral: boolean
): { home: number; away: number; expected: number } {
  const expected = eloExpectedScore(homeRating, awayRating, neutral);
  const actual = homeScore > awayScore ? 1 : homeScore === awayScore ? 0.5 : 0;
  const delta =
    eloKFactor(tournament) *
    eloGoalMultiplier(homeScore, awayScore) *
    (actual - expected);

  return { home: homeRating + delta, away: awayRating - delta, expected };
}
