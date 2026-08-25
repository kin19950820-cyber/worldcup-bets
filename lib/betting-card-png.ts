// Client-side canvas renderer for the shareable 戰績卡 PNG. No external deps
// (avoids tainted-canvas / CORS issues); the card is all text + shapes.

import type { BettingCard } from "@/lib/actions/betting-card";
import { formatCurrency } from "@/lib/utils";

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "PingFang HK", "Microsoft JhengHei", "Noto Sans CJK HK", "Segoe UI", sans-serif';

const signed = (v: number) => `${v >= 0 ? "+" : ""}${formatCurrency(v)}`;
const signedPct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

function streakText(current: number): string | null {
  if (current >= 2) return `🔥 ${current} 連勝`;
  if (current <= -2) return `🧊 ${Math.abs(current)} 連敗`;
  return null;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

type Chip = { text: string; bg: string; fg: string };

// Lays out (and optionally paints) a row of pill chips with wrapping.
function layoutChips(
  ctx: CanvasRenderingContext2D,
  chips: Chip[],
  x: number,
  y: number,
  maxRight: number,
  paint: boolean
): number {
  const h = 40;
  const gap = 12;
  const padX = 18;
  ctx.font = `600 22px ${FONT_STACK}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  let cx = x;
  let cy = y;
  for (const chip of chips) {
    const w = ctx.measureText(chip.text).width + padX * 2;
    if (cx + w > maxRight && cx > x) {
      cx = x;
      cy += h + gap;
    }
    if (paint) {
      roundRect(ctx, cx, cy, w, h, h / 2);
      ctx.fillStyle = chip.bg;
      ctx.fill();
      ctx.fillStyle = chip.fg;
      ctx.font = `600 22px ${FONT_STACK}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(chip.text, cx + padX, cy + h / 2 + 1);
    }
    cx += w + gap;
  }
  return cy + h;
}

// Single top-down pass; when paint is false it only advances the cursor so the
// caller can size the canvas before the real draw.
function render(
  ctx: CanvasRenderingContext2D,
  card: BettingCard,
  W: number,
  paint: boolean
): number {
  const PAD = 44;
  const left = PAD;
  const right = W - PAD;
  let y = PAD;

  const line = (
    label: string,
    value: string,
    color: string,
    valueSize: number
  ) => {
    if (paint) {
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.font = `400 22px ${FONT_STACK}`;
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(label, left, y);
      ctx.textAlign = "right";
      ctx.font = `700 ${valueSize}px ${FONT_STACK}`;
      ctx.fillStyle = color;
      ctx.fillText(value, right, y);
    }
  };

  // Name + 戰績卡 tag
  y += 44;
  if (paint) {
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `800 46px ${FONT_STACK}`;
    ctx.fillStyle = "#f8fafc";
    ctx.fillText(card.name, left, y);
    const tag = "戰績卡";
    ctx.font = `600 20px ${FONT_STACK}`;
    const tw = ctx.measureText(tag).width + 28;
    roundRect(ctx, right - tw, y - 30, tw, 34, 17);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tag, right - tw / 2, y - 12);
  }
  y += 12;
  if (paint) {
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `400 20px ${FONT_STACK}`;
    ctx.fillStyle = "#64748b";
    ctx.fillText("英超大亂鬥 · Season 2", left, y);
  }

  // Headline stats
  y += 52;
  line("淨資產", formatCurrency(card.netWorth), "#f8fafc", 34);
  y += 48;
  line(
    "本季盈虧",
    signed(card.profitLoss),
    card.profitLoss >= 0 ? "#34d399" : "#f87171",
    34
  );
  y += 48;
  line(
    "投注 ROI",
    signedPct(card.roi),
    card.roi >= 0 ? "#34d399" : "#f87171",
    34
  );

  // Style + streak chips
  y += 30;
  const topChips: Chip[] = [
    { text: `🎭 ${card.style.label}`, bg: "rgba(251,191,36,0.16)", fg: "#fcd34d" },
  ];
  const form = streakText(card.currentStreak);
  if (form)
    topChips.push({ text: form, bg: "rgba(249,115,22,0.16)", fg: "#fdba74" });
  y = layoutChips(ctx, topChips, left, y, right, paint);

  // Divider
  y += 26;
  if (paint) {
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }

  // Secondary stats
  y += 40;
  line("平均賠率", card.avgOdds.toFixed(2), "#e2e8f0", 24);
  y += 38;
  line("平均注碼", formatCurrency(card.avgStake), "#e2e8f0", 24);
  y += 38;
  line("最大贏注", signed(card.biggestWin), "#34d399", 24);
  y += 38;
  line("買入", `${card.rebuys} 次`, "#e2e8f0", 24);

  // Achievement chips
  const achievements: Chip[] = [];
  for (const gw of card.gameweekTitles) {
    achievements.push({
      text: `🏆 GW${gw} 王者`,
      bg: "rgba(56,189,248,0.16)",
      fg: "#7dd3fc",
    });
  }
  if (card.biggestUpsetOdds > 0) {
    achievements.push({
      text: `🌚 最大冷門 @${card.biggestUpsetOdds.toFixed(2)}`,
      bg: "rgba(148,163,184,0.16)",
      fg: "#cbd5e1",
    });
  }
  if (achievements.length > 0) {
    y += 28;
    y = layoutChips(ctx, achievements, left, y, right, paint);
  }

  return y + PAD;
}

export async function renderBettingCardPng(card: BettingCard): Promise<Blob> {
  const W = 680;
  const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 2));

  // Measure pass to size the canvas.
  const measure = document.createElement("canvas").getContext("2d")!;
  const H = render(measure, card, W, false);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  // Background gradient + border.
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#0f172a");
  grad.addColorStop(1, "#0b2430");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  roundRect(ctx, 2, 2, W - 4, H - 4, 28);
  ctx.strokeStyle = "rgba(56,189,248,0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();

  render(ctx, card, W, true);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png"
    );
  });
}
