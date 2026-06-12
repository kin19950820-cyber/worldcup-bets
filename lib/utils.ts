import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns-tz";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const HK_TZ = "Asia/Hong_Kong";

export function formatHKTime(date: string | Date, fmt = "MM-dd HH:mm") {
  return format(new Date(date), fmt, { timeZone: HK_TZ });
}

export function formatHKDateTime(date: string | Date) {
  return format(new Date(date), "yyyy-MM-dd HH:mm", { timeZone: HK_TZ });
}

export function formatCurrency(amount: number) {
  return `HK$${amount.toFixed(2)}`;
}

export function formatProfitLoss(amount: number) {
  const abs = Math.abs(amount).toFixed(2);
  return amount >= 0 ? `+HK$${abs}` : `-HK$${abs}`;
}

export function getMatchCountdown(kickoffTime: string): string {
  const now = Date.now();
  const kickoff = new Date(kickoffTime).getTime();
  const diff = kickoff - now;

  if (diff <= 0) return "已開始";

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);

  if (days > 0) return `${days}日${hours}時後`;
  if (hours > 0) return `${hours}時${minutes}分後`;
  return `${minutes}分後`;
}

export function isMatchStarted(kickoffTime: string): boolean {
  return new Date(kickoffTime) <= new Date();
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "待結算",
    won: "贏",
    lost: "輸",
    void: "取消",
  };
  return map[status] ?? status;
}

export function getMatchStatusLabel(status: string): string {
  const map: Record<string, string> = {
    SCHEDULED: "未開賽",
    TIMED: "未開賽",
    IN_PLAY: "比賽中",
    PAUSED: "中場",
    FINISHED: "已完場",
    POSTPONED: "押後",
    CANCELLED: "取消",
    SUSPENDED: "暫停",
  };
  return map[status] ?? status;
}
