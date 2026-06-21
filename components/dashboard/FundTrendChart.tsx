import type { BalanceHistoryPoint } from "@/lib/types";
import { formatCurrency, formatHKTime } from "@/lib/utils";

interface FundTrendChartProps {
  points: BalanceHistoryPoint[];
  title?: string;
  subtitle?: string;
}

const CHART_WIDTH = 320;
const CHART_HEIGHT = 150;
const PADDING_X = 18;
const PADDING_Y = 18;

export default function FundTrendChart({
  points,
  title = "資金走勢",
  subtitle,
}: FundTrendChartProps) {
  const cleaned = points
    .filter((point) => Number.isFinite(point.balance))
    .slice(-40);
  const fallbackPoint = cleaned[0] ?? {
    balance: 0,
    created_at: new Date().toISOString(),
  };
  const chartPoints =
    cleaned.length > 1
      ? cleaned
      : [
          fallbackPoint,
          {
            ...fallbackPoint,
            created_at: new Date().toISOString(),
          },
        ];
  const balances = chartPoints.map((point) => point.balance);
  const minBalance = Math.min(...balances);
  const maxBalance = Math.max(...balances);
  const range = Math.max(1, maxBalance - minBalance);
  const innerWidth = CHART_WIDTH - PADDING_X * 2;
  const innerHeight = CHART_HEIGHT - PADDING_Y * 2;
  const path = chartPoints
    .map((point, index) => {
      const x =
        PADDING_X +
        (index / Math.max(1, chartPoints.length - 1)) * innerWidth;
      const y =
        PADDING_Y +
        (1 - (point.balance - minBalance) / range) * innerHeight;

      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const areaPath = `${path} L ${CHART_WIDTH - PADDING_X} ${
    CHART_HEIGHT - PADDING_Y
  } L ${PADDING_X} ${CHART_HEIGHT - PADDING_Y} Z`;
  const latest = cleaned.at(-1);
  const first = cleaned[0];
  const change =
    latest && first ? latest.balance - first.balance : 0;
  const isNegative = change < 0;
  const trendColor = isNegative ? "rgb(248 113 113)" : "rgb(16 185 129)";
  const trendFillId = isNegative ? "fundTrendFillNegative" : "fundTrendFillPositive";
  const high = maxBalance;
  const low = minBalance;

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-300">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {subtitle ?? `最近 ${cleaned.length} 次資金變動`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-white">
            {latest ? formatCurrency(latest.balance) : formatCurrency(0)}
          </p>
          <p
            className={
              change >= 0
                ? "text-xs font-semibold text-emerald-400"
                : "text-xs font-semibold text-red-400"
            }
          >
            {change >= 0 ? "+" : ""}
            {formatCurrency(change)}
          </p>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-40 w-full overflow-visible"
        role="img"
        aria-label="資金走勢圖"
      >
        <defs>
          <linearGradient id="fundTrendFillPositive" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="fundTrendFillNegative" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(248 113 113)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="rgb(248 113 113)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2].map((line) => {
          const y = PADDING_Y + (line / 2) * innerHeight;
          return (
            <line
              key={line}
              x1={PADDING_X}
              x2={CHART_WIDTH - PADDING_X}
              y1={y}
              y2={y}
              stroke="rgb(51 65 85)"
              strokeDasharray="3 5"
              strokeWidth="1"
            />
          );
        })}
        <path d={areaPath} fill={`url(#${trendFillId})`} />
        <path
          d={path}
          fill="none"
          stroke={trendColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        {chartPoints.map((point, index) => {
          if (
            index !== chartPoints.length - 1 &&
            index !== 0 &&
            chartPoints.length > 8
          ) {
            return null;
          }

          const x =
            PADDING_X +
            (index / Math.max(1, chartPoints.length - 1)) * innerWidth;
          const y =
            PADDING_Y +
            (1 - (point.balance - minBalance) / range) * innerHeight;

          return (
            <circle
              key={`${point.created_at}-${index}`}
              cx={x}
              cy={y}
              r={index === chartPoints.length - 1 ? 4 : 3}
              fill="rgb(15 23 42)"
              stroke={trendColor}
              strokeWidth="2"
            />
          );
        })}
      </svg>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-slate-500">最高</p>
          <p className="font-semibold text-white">{formatCurrency(high)}</p>
        </div>
        <div>
          <p className="text-slate-500">最低</p>
          <p className="font-semibold text-white">{formatCurrency(low)}</p>
        </div>
        <div>
          <p className="text-slate-500">更新</p>
          <p className="font-semibold text-white">
            {latest ? formatHKTime(latest.created_at, "MM/dd HH:mm") : "--"}
          </p>
        </div>
      </div>
    </div>
  );
}
