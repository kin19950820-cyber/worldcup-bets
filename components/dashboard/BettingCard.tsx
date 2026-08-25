"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import type { BettingCard as CardData } from "@/lib/actions/betting-card";
import { renderBettingCardPng } from "@/lib/betting-card-png";
import { formatCurrency } from "@/lib/utils";

const signed = (v: number) => `${v >= 0 ? "+" : ""}${formatCurrency(v)}`;
const signedPct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

function streakText(current: number): string | null {
  if (current >= 2) return `🔥 Current：${current} 連勝`;
  if (current <= -2) return `🧊 Current：${Math.abs(current)} 連敗`;
  return null;
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`font-semibold tabular-nums ${accent ?? "text-white"}`}>{value}</span>
    </div>
  );
}

export default function BettingCard({ card }: { card: CardData }) {
  const form = streakText(card.currentStreak);
  const [busy, setBusy] = useState(false);

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await renderBettingCardPng(card);
      const file = new File([blob], `${card.name}-戰績卡.png`, {
        type: "image/png",
      });

      // Native share sheet with the image file (WhatsApp / IG on mobile).
      const nav = navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean;
      };
      if (nav.canShare?.({ files: [file] }) && navigator.share) {
        try {
          await navigator.share({ files: [file], title: `${card.name} 戰績卡` });
          return;
        } catch {
          return; // user cancelled the share sheet
        }
      }

      // Fallback: download the PNG.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("已儲存戰績卡圖片，可分享到 WhatsApp");
    } catch {
      toast.error("產生圖片失敗，請手動截圖");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-brand-950/40">
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{card.name}</h2>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
            戰績卡
          </span>
        </div>

        <div className="space-y-1.5">
          <Row label="淨資產" value={formatCurrency(card.netWorth)} />
          <Row
            label="本季盈虧"
            value={signed(card.profitLoss)}
            accent={card.profitLoss >= 0 ? "text-emerald-400" : "text-red-400"}
          />
          <Row
            label="投注 ROI"
            value={signedPct(card.roi)}
            accent={card.roi >= 0 ? "text-emerald-400" : "text-red-400"}
          />
        </div>

        <div className="my-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
            🎭 {card.style.label}
          </span>
          {form && (
            <span className="rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-semibold text-orange-300">
              {form}
            </span>
          )}
        </div>

        <div className="space-y-1.5 border-t border-slate-800 pt-3">
          <Row label="平均賠率" value={card.avgOdds.toFixed(2)} />
          <Row label="平均注碼" value={formatCurrency(card.avgStake)} />
          <Row
            label="最大贏注"
            value={signed(card.biggestWin)}
            accent="text-emerald-400"
          />
          <Row label="買入" value={`${card.rebuys} 次`} />
        </div>

        {(card.gameweekTitles.length > 0 || card.biggestUpsetOdds > 0) && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800 pt-3">
            {card.gameweekTitles.map((gw) => (
              <span
                key={gw}
                className="rounded-full bg-brand-500/15 px-2.5 py-1 text-xs font-semibold text-brand-300"
              >
                🏆 GW{gw} 王者
              </span>
            ))}
            {card.biggestUpsetOdds > 0 && (
              <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300">
                🌚 最大冷門 @{card.biggestUpsetOdds.toFixed(2)}
              </span>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={share}
        disabled={busy}
        className="w-full bg-brand-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
      >
        {busy ? "產生圖片中…" : "📤 分享戰績卡"}
      </button>
    </div>
  );
}
