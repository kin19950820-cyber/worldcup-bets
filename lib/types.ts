export type Profile = {
  id: string;
  display_name: string;
  starting_fund: number;
  current_balance: number;
  role: "player" | "admin";
  created_at: string;
};

export type Match = {
  id: string;
  external_match_id: string;
  home_team: string;
  away_team: string;
  kickoff_time: string;
  stage: string | null;
  group_name: string | null;
  status: string;
  score_home: number | null;
  score_away: number | null;
  created_at: string;
  updated_at: string;
};

export type BetType =
  | "過關"
  | "讓球"
  | "主客和"
  | "讓球主客和"
  | "入球大細"
  | "波膽"
  | "半全場"
  | "首名入球"
  | "其他";

export const BET_TYPES: BetType[] = [
  "過關",
  "讓球",
  "主客和",
  "讓球主客和",
  "入球大細",
  "波膽",
  "半全場",
  "首名入球",
  "其他",
];

export type BetStatus =
  | "pending"
  | "won"
  | "half_won"
  | "lost"
  | "half_lost"
  | "void";

export type Bet = {
  id: string;
  user_id: string;
  match_id: string;
  bet_type: BetType;
  selection: string;
  odds: number;
  stake: number;
  possible_return: number;
  payout: number;
  status: BetStatus;
  settled_at: string | null;
  created_at: string;
  profiles?: Profile;
  matches?: Match;
};

export type Transaction = {
  id: string;
  user_id: string;
  bet_id: string | null;
  type:
    | "initial_fund"
    | "stake_deduct"
    | "payout"
    | "refund"
    | "adjustment"
    | "loan"
    | "loan_repayment";
  amount: number;
  balance_after: number;
  created_at: string;
};

export type LeaderboardEntry = {
  id: string;
  display_name: string;
  current_balance: number;
  net_balance: number;
  total_borrowed: number;
  pending_stake: number;
  starting_fund: number;
  profit_loss: number;
  total_won: number;
  total_lost: number;
  total_void: number;
  total_pending: number;
  win_rate: number;
  total_stake: number;
};

export type DashboardData = {
  profile: Profile;
  pending_stake: number;
  possible_return: number;
  total_borrowed: number;
  loan_principal: number;
  loan_interest: number;
  loan_effective_annual_rate: number;
  recent_bets: Bet[];
  upcoming_matches: Match[];
};
