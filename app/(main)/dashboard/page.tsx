import { redirect } from "next/navigation";
import { getDashboardData } from "@/lib/actions/dashboard";
import {
  formatCurrency,
  formatProfitLoss,
  formatHKTime,
  getSettlementStatus,
  getStatusLabel,
} from "@/lib/utils";
import { cn } from "@/lib/utils";
import Link from "next/link";
import MatchCountdown from "@/components/matches/MatchCountdown";
import Season2LoanCard from "@/components/loans/Season2LoanCard";
import { getSeasonState } from "@/lib/actions/season";
import { getMyGroups } from "@/lib/actions/groups";
import FundTrendChart from "@/components/dashboard/FundTrendChart";
import GroupCard from "@/components/dashboard/GroupCard";
import { parseParlay } from "@/lib/parlay";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [data, season, myGroups] = await Promise.all([
    getDashboardData(),
    getSeasonState(),
    getMyGroups(),
  ]);
  if (!data || !data.profile) redirect("/login");

  const {
    profile,
    pending_stake,
    possible_return,
    balance_history,
    recent_bets,
    upcoming_matches,
  } = data;
  // Season 2 net worth / profit come from the season_players ledger.
  const profit = season
    ? season.profitLoss
    : profile.current_balance + pending_stake - profile.starting_fund;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* Balance Card */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-slate-400 text-sm font-medium">現時結餘</h2>
          <span className="text-xs text-slate-500">初始 HK$500</span>
        </div>
        <div className="text-4xl font-bold text-white mb-1">
          {formatCurrency(profile.current_balance)}
        </div>
        <div className={cn("text-sm font-semibold", profit >= 0 ? "profit-positive" : "profit-negative")}>
          {formatProfitLoss(profit)} 盈虧
        </div>
      </div>

      <FundTrendChart points={balance_history} />

      {myGroups.length > 0 && <GroupCard myGroups={myGroups} />}

      {season && (
        <Season2LoanCard
          currentBalance={season.currentBalance}
          outstandingDebt={season.outstandingDebt}
          loanCount={season.loanCount}
          netWorth={season.netWorth}
          eligible={season.eligibility.allowed}
          reason={season.eligibility.reason}
        />
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-slate-400 text-xs mb-1">待結算本金</p>
          <p className="text-white font-bold text-lg">{formatCurrency(pending_stake)}</p>
        </div>
        <div className="card p-4">
          <p className="text-slate-400 text-xs mb-1">可能回報</p>
          <p className="text-brand-500 font-bold text-lg">{formatCurrency(possible_return)}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/place-bet" className="btn-primary text-center py-3 text-sm rounded-xl">
          ➕ 落注
        </Link>
        <Link href="/bets-board" className="btn-secondary text-center py-3 text-sm rounded-xl">
          📋 投注版
        </Link>
      </div>

      {/* Upcoming Matches */}
      {upcoming_matches.length > 0 && (
        <div>
          <h3 className="text-slate-300 font-semibold mb-3 flex items-center gap-2">
            <span>⚽</span> 即將開賽
          </h3>
          <div className="space-y-2">
            {upcoming_matches.map((match) => (
              <div key={match.id} className="card p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">{match.stage ?? "Group Stage"}</span>
                  <MatchCountdown kickoffTime={match.kickoff_time} />
                </div>
                <div className="flex items-center justify-center gap-3 mt-2">
                  <span className="font-semibold text-sm text-right flex-1">{match.home_team}</span>
                  <span className="text-slate-500 text-xs font-mono">vs</span>
                  <span className="font-semibold text-sm text-left flex-1">{match.away_team}</span>
                </div>
                <p className="text-center text-xs text-slate-500 mt-2">
                  {formatHKTime(match.kickoff_time, "MM月dd日 HH:mm")} HKT
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Bets */}
      {recent_bets.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-slate-300 font-semibold flex items-center gap-2">
              <span>🎯</span> 最近投注
            </h3>
            <Link href="/bets-board" className="text-xs text-brand-500">
              查看全部
            </Link>
          </div>
          <div className="space-y-2">
            {recent_bets.slice(0, 5).map((bet) => {
              const parlay = parseParlay(bet.selection);
              const match = bet.matches as { home_team: string; away_team: string } | null;
              return (
                <div key={bet.id} className="card p-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {parlay
                        ? `${parlay.legs.length} 關過關`
                        : match
                        ? `${match.home_team} vs ${match.away_team}`
                        : "—"}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {parlay
                        ? `總賠率 ${bet.odds} · 最高派彩 ${formatCurrency(
                            bet.possible_return
                          )}`
                        : `${bet.bet_type} · ${bet.selection}`}
                    </p>
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <StatusBadge
                      status={
                        parlay
                          ? bet.status
                          : getSettlementStatus(
                              bet.status,
                              bet.payout,
                              bet.stake,
                              bet.odds
                            )
                      }
                    />
                    <p className="text-xs text-slate-500 mt-1">{formatCurrency(bet.stake)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {upcoming_matches.length === 0 && recent_bets.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <div className="text-4xl mb-3">⚽</div>
          <p>暫時未有賽事或投注記錄</p>
          <p className="text-xs mt-1">等待管理員同步賽程</p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    won: "bg-emerald-500/20 text-emerald-400",
    half_won: "bg-lime-500/20 text-lime-400",
    lost: "bg-red-500/20 text-red-400",
    half_lost: "bg-orange-500/20 text-orange-400",
    void: "bg-slate-500/20 text-slate-400",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", map[status] ?? map.pending)}>
      {getStatusLabel(status)}
    </span>
  );
}
