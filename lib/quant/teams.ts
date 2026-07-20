// Team-name resolution between the app's matches table (football-data.org
// short names), HKJC labels, and the historical results dataset
// (martj42/international_results canonical English names).

export function normalizeTeamName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9一-鿿]+/g, " ")
    .trim();
}

// Maps (normalized) app/HKJC names to the dataset's canonical name.
const DATASET_ALIASES: Record<string, string> = {
  usa: "United States",
  usmnt: "United States",
  "korea republic": "South Korea",
  "korea dpr": "North Korea",
  "ir iran": "Iran",
  turkiye: "Turkey",
  czechia: "Czech Republic",
  "congo dr": "DR Congo",
  "d r congo": "DR Congo",
  "democratic republic of congo": "DR Congo",
  "democratic republic of the congo": "DR Congo",
  "cote d ivoire": "Ivory Coast",
  "bosnia h": "Bosnia and Herzegovina",
  bosnia: "Bosnia and Herzegovina",
  "n macedonia": "North Macedonia",
  "cape verde": "Cape Verde",
  "cabo verde": "Cape Verde",
  "china pr": "China",
  "uae": "United Arab Emirates",
  "saudi": "Saudi Arabia",
};

// Successor states / renames applied when training so ratings history is
// continuous under one canonical name.
export const HISTORICAL_MERGES: Record<string, string> = {
  "West Germany": "Germany",
  "East Germany": "Germany",
  "Soviet Union": "Russia",
  USSR: "Russia",
  Czechoslovakia: "Czech Republic",
  Yugoslavia: "Serbia",
  "Serbia and Montenegro": "Serbia",
  Zaire: "DR Congo",
  Burma: "Myanmar",
  "Dutch East Indies": "Indonesia",
  "Türkiye": "Turkey",
};

// Maps (normalized) football-data.org club short names to football-data.co.uk
// dataset names.
const CLUB_ALIASES: Record<string, string> = {
  wolverhampton: "Wolves",
  "brighton hove": "Brighton",
  "leeds united": "Leeds",
  "sheffield utd": "Sheffield United",
  "luton town": "Luton",
  "ipswich town": "Ipswich",
  "newcastle united": "Newcastle",
  "west ham united": "West Ham",
  "tottenham hotspur": "Tottenham",
  "manchester city": "Man City",
  "manchester united": "Man United",
  "nottingham forest": "Nott'm Forest",
  "afc bournemouth": "Bournemouth",
};

function resolveTeamName(
  appName: string,
  ratingKeys: string[],
  aliases: Record<string, string>
): string | null {
  const normalized = normalizeTeamName(appName);
  if (!normalized) return null;

  const aliased = aliases[normalized];
  if (aliased && ratingKeys.includes(aliased)) return aliased;

  const exact = ratingKeys.find(
    (key) => normalizeTeamName(key) === normalized
  );
  if (exact) return exact;

  // Last resort: unambiguous containment match.
  const contains = ratingKeys.filter((key) => {
    const keyNorm = normalizeTeamName(key);
    return keyNorm.includes(normalized) || normalized.includes(keyNorm);
  });
  return contains.length === 1 ? contains[0] : null;
}

export function resolveDatasetTeam(appName: string, ratingKeys: string[]) {
  return resolveTeamName(appName, ratingKeys, DATASET_ALIASES);
}

export function resolveClubTeam(appName: string, ratingKeys: string[]) {
  return resolveTeamName(appName, ratingKeys, CLUB_ALIASES);
}

// 2026 World Cup host nations: their home fixtures are non-neutral.
export const WC_2026_HOSTS = new Set(["United States", "Canada", "Mexico"]);
