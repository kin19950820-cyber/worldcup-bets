"use client";

import { useMemo, useState, useTransition } from "react";
import toast from "react-hot-toast";
import {
  createBet,
  createParlay,
  type ParlayLegInput,
} from "@/lib/actions/bets";
import { BET_TYPES, type BetOption, type BetType, type Match } from "@/lib/types";
import { formatCurrency, formatHKTime, cn } from "@/lib/utils";

interface BetFormProps {
  matches: Match[];
  currentBalance: number;
  oddsOptionsByMatchId: Record<string, BetOption[]>;
}

type Mode = "single" | "parlay";
type EditableLeg = {
  key: number;
  match_id: string;
  bet_type: Exclude<BetType, "過關"> | "";
  selection: string;
  odds: string;
  option_id: string;
};

const SINGLE_BET_TYPES = BET_TYPES.filter(
  (type): type is Exclude<BetType, "過關"> => type !== "過關"
);

let nextLegKey = 1;

function newLeg(): EditableLeg {
  return {
    key: nextLegKey++,
    match_id: "",
    bet_type: "",
    selection: "",
    odds: "",
    option_id: "",
  };
}

export default function BetForm({
  matches,
  currentBalance,
  oddsOptionsByMatchId,
}: BetFormProps) {
  const [mode, setMode] = useState<Mode>("single");
  const [pending, startTransition] = useTransition();
  const [stake, setStake] = useState("");
  const [betType, setBetType] = useState<Exclude<BetType, "過關"> | "">("");
  const [selection, setSelection] = useState("");
  const [odds, setOdds] = useState("");
  const [matchId, setMatchId] = useState("");
  const [optionId, setOptionId] = useState("");
  const [legs, setLegs] = useState<EditableLeg[]>([newLeg(), newLeg()]);

  const stakeNum = Number(stake) || 0;
  const singleOdds = Number(odds) || 0;
  const totalOdds = useMemo(
    () =>
      legs.reduce((product, leg) => {
        const legOdds = Number(leg.odds);
        return product * (legOdds > 1 ? legOdds : 1);
      }, 1),
    [legs]
  );
  const possibleReturn =
    stakeNum > 0
      ? stakeNum * (mode === "single" ? singleOdds : totalOdds)
      : 0;
  const selectedMatchOptions = matchId ? oddsOptionsByMatchId[matchId] ?? [] : [];

  const applySingleOption = (id: string) => {
    setOptionId(id);
    if (!id) return;

    const option = selectedMatchOptions.find((item) => item.id === id);
    if (!option) return;

    setBetType(option.bet_type);
    setSelection(option.selection);
    setOdds(option.odds.toString());
  };

  const updateLeg = (
    key: number,
    field: keyof Omit<EditableLeg, "key">,
    value: string
  ) => {
    setLegs((current) =>
      current.map((leg) => (leg.key === key ? { ...leg, [field]: value } : leg))
    );
  };

  const changeLegMatch = (key: number, match_id: string) => {
    setLegs((current) =>
      current.map((leg) =>
        leg.key === key
          ? {
              ...leg,
              match_id,
              bet_type: "",
              selection: "",
              odds: "",
              option_id: "",
            }
          : leg
      )
    );
  };

  const applyLegOption = (key: number, id: string) => {
    const leg = legs.find((item) => item.key === key);
    const option = leg
      ? (oddsOptionsByMatchId[leg.match_id] ?? []).find((item) => item.id === id)
      : null;

    setLegs((current) =>
      current.map((item) =>
        item.key !== key
          ? item
          : option
          ? {
              ...item,
              option_id: id,
              bet_type: option.bet_type,
              selection: option.selection,
              odds: option.odds.toString(),
            }
          : { ...item, option_id: id }
      )
    );
  };

  const handleSingleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createBet(formData);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `投注成功，剩餘 ${formatCurrency(result.new_balance as number)}`
      );
      setStake("");
      setOdds("");
      setMatchId("");
      setBetType("");
      setSelection("");
      setOptionId("");
    });
  };

  const handleParlaySubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const input = legs.map((leg) => ({
      match_id: leg.match_id,
      bet_type: leg.bet_type,
      selection: leg.selection,
      odds: Number(leg.odds),
    })) as ParlayLegInput[];

    startTransition(async () => {
      const result = await createParlay(input, stakeNum);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `${legs.length} 關過關投注成功，總賠率 ${result.total_odds}`
      );
      setStake("");
      setLegs([newLeg(), newLeg()]);
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-900 p-1">
        {(["single", "parlay"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            className={cn(
              "rounded-lg py-2 text-sm font-semibold transition-colors",
              mode === option
                ? "bg-brand-600 text-white"
                : "text-slate-400 hover:text-white"
            )}
          >
            {option === "single" ? "單注" : "過關"}
          </button>
        ))}
      </div>

      <div className="card p-4 flex items-center justify-between">
        <span className="text-slate-400 text-sm">可用餘額</span>
        <span className="font-bold text-white">
          {formatCurrency(currentBalance)}
        </span>
      </div>

      {mode === "single" ? (
        <form onSubmit={handleSingleSubmit} className="space-y-5">
          <MatchSelect
            matches={matches}
            value={matchId}
            onChange={(value) => {
              setMatchId(value);
              setBetType("");
              setSelection("");
              setOdds("");
              setOptionId("");
            }}
          />

          <OddsOptionSelect
            options={selectedMatchOptions}
            value={optionId}
            onChange={applySingleOption}
          />

          <div>
            <label className="form-label">投注種類</label>
            <select
              name="bet_type"
              required
              value={betType}
              onChange={(event) =>
                setBetType(event.target.value as Exclude<BetType, "過關"> | "")
              }
              className="form-input appearance-none"
            >
              <option value="">選擇種類</option>
              {SINGLE_BET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <SelectionInput value={selection} onChange={setSelection} />

          <div>
            <label className="form-label">賠率</label>
            <input
              name="odds"
              type="number"
              required
              min="1.01"
              step="0.01"
              value={odds}
              onChange={(event) => setOdds(event.target.value)}
              className="form-input"
              placeholder="例如 1.85"
            />
          </div>

          <StakeInput
            stake={stake}
            setStake={setStake}
            currentBalance={currentBalance}
          />

          <ReturnPreview
            possibleReturn={possibleReturn}
            stake={stakeNum}
            odds={singleOdds}
          />

          <SubmitButton
            pending={pending}
            disabled={
              stakeNum <= 0 ||
              stakeNum > currentBalance ||
              singleOdds <= 1
            }
          />
        </form>
      ) : (
        <form onSubmit={handleParlaySubmit} className="space-y-4">
          <p className="text-xs text-slate-500">
            過關最少 2 關、最多 10 關，同一場賽事不可重複。
          </p>

          {legs.map((leg, index) => {
            const selectedByOthers = new Set(
              legs
                .filter((item) => item.key !== leg.key)
                .map((item) => item.match_id)
            );

            return (
              <div key={leg.key} className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">
                    第 {index + 1} 關
                  </h3>
                  {legs.length > 2 && (
                    <button
                      type="button"
                      onClick={() =>
                        setLegs((current) =>
                          current.filter((item) => item.key !== leg.key)
                        )
                      }
                      className="text-xs text-red-400"
                    >
                      移除
                    </button>
                  )}
                </div>

                <select
                  required
                  value={leg.match_id}
                  onChange={(event) =>
                    changeLegMatch(leg.key, event.target.value)
                  }
                  className="form-input appearance-none"
                >
                  <option value="">選擇賽事</option>
                  {matches.map((match) => (
                    <option
                      key={match.id}
                      value={match.id}
                      disabled={selectedByOthers.has(match.id)}
                    >
                      {match.home_team} vs {match.away_team} ·{" "}
                      {formatHKTime(match.kickoff_time, "MM/dd HH:mm")}
                    </option>
                  ))}
                </select>

                <OddsOptionSelect
                  options={
                    leg.match_id ? oddsOptionsByMatchId[leg.match_id] ?? [] : []
                  }
                  value={leg.option_id}
                  onChange={(value) => applyLegOption(leg.key, value)}
                />

                <div className="grid grid-cols-2 gap-2">
                  <select
                    required
                    value={leg.bet_type}
                    onChange={(event) =>
                      updateLeg(leg.key, "bet_type", event.target.value)
                    }
                    className="form-input appearance-none"
                  >
                    <option value="">投注種類</option>
                    {SINGLE_BET_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    required
                    min="1.01"
                    step="0.01"
                    value={leg.odds}
                    onChange={(event) =>
                      updateLeg(leg.key, "odds", event.target.value)
                    }
                    className="form-input"
                    placeholder="賠率"
                  />
                </div>

                <input
                  type="text"
                  required
                  maxLength={100}
                  value={leg.selection}
                  onChange={(event) =>
                    updateLeg(leg.key, "selection", event.target.value)
                  }
                  className="form-input"
                  placeholder="投注選項，例如：主勝、香港 +0.25"
                />
              </div>
            );
          })}

          {legs.length < 10 && (
            <button
              type="button"
              onClick={() => setLegs((current) => [...current, newLeg()])}
              className="btn-secondary w-full py-2.5 text-sm"
            >
              加多一關
            </button>
          )}

          <StakeInput
            stake={stake}
            setStake={setStake}
            currentBalance={currentBalance}
          />

          <ReturnPreview
            possibleReturn={possibleReturn}
            stake={stakeNum}
            odds={totalOdds}
          />

          <SubmitButton
            pending={pending}
            disabled={
              stakeNum <= 0 ||
              stakeNum > currentBalance ||
              legs.some(
                (leg) =>
                  !leg.match_id ||
                  !leg.bet_type ||
                  !leg.selection.trim() ||
                  Number(leg.odds) <= 1
              )
            }
            label={`確認 ${legs.length} 關過關`}
          />
        </form>
      )}
    </div>
  );
}

function MatchSelect({
  matches,
  value,
  onChange,
}: {
  matches: Match[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="form-label">賽事</label>
      <select
        name="match_id"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="form-input appearance-none"
      >
        <option value="">選擇賽事</option>
        {matches.map((match) => (
          <option key={match.id} value={match.id}>
            {match.home_team} vs {match.away_team} ·{" "}
            {formatHKTime(match.kickoff_time, "MM/dd HH:mm")}
          </option>
        ))}
      </select>
    </div>
  );
}

function OddsOptionSelect({
  options,
  value,
  onChange,
}: {
  options: BetOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (options.length === 0) return null;

  return (
    <div>
      <label className="form-label">市場選項</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="form-input appearance-none"
      >
        <option value="">自訂輸入</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.source} · {option.selection} · {option.odds.toFixed(2)}
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-500 mt-1">
        選擇市場會自動填入投注選項和賠率，仍可手動修改。
      </p>
    </div>
  );
}

function SelectionInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="form-label">投注選項</label>
      <input
        name="selection"
        type="text"
        required
        maxLength={100}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="form-input"
        placeholder="例如：主勝、Over 2.5、香港 +0.25"
      />
    </div>
  );
}

function StakeInput({
  stake,
  setStake,
  currentBalance,
}: {
  stake: string;
  setStake: (value: string) => void;
  currentBalance: number;
}) {
  const stakeNum = Number(stake) || 0;
  return (
    <div>
      <label className="form-label">投注額 (HK$)</label>
      <input
        name="stake"
        type="number"
        required
        min="1"
        step="1"
        max={currentBalance}
        value={stake}
        onChange={(event) => setStake(event.target.value)}
        className="form-input"
      />
      <div className="flex gap-2 mt-2">
        {[10, 20, 50, 100].map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => setStake(String(Math.min(amount, currentBalance)))}
            className={cn(
              "flex-1 text-xs py-1.5 rounded-lg border transition-colors",
              stakeNum === amount
                ? "border-brand-500 text-brand-400 bg-brand-500/10"
                : "border-slate-700 text-slate-400"
            )}
          >
            ${amount}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReturnPreview({
  possibleReturn,
  stake,
  odds,
}: {
  possibleReturn: number;
  stake: number;
  odds: number;
}) {
  if (possibleReturn <= 0 || odds <= 1) return null;

  return (
    <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-4">
      <div className="flex justify-between text-sm">
        <span className="text-slate-400">總賠率</span>
        <span className="text-white font-semibold">{odds.toFixed(4)}</span>
      </div>
      <div className="flex justify-between items-center mt-2">
        <span className="text-slate-400 text-sm">預計派彩</span>
        <span className="text-brand-400 font-bold text-xl">
          {formatCurrency(possibleReturn)}
        </span>
      </div>
      <p className="text-right text-xs text-emerald-400 mt-1">
        淨盈利 +{formatCurrency(possibleReturn - stake)}
      </p>
    </div>
  );
}

function SubmitButton({
  pending,
  disabled,
  label = "確認落注",
}: {
  pending: boolean;
  disabled: boolean;
  label?: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="btn-primary w-full py-4 text-base"
    >
      {pending ? "提交中" : label}
    </button>
  );
}
