"use client";

import { useState } from "react";
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
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const cleaned = points
    .filter((point) => Number.isFinite(point.net_balance))
    .slice(-40);
  const fallbackPoint = cleaned[0] ?? {
    balance: 0,
    net_balance: 0,
    outstanding_loan: 0,
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
  const netBalances = chartPoints.map((point) => point.net_balance);
  const minNetBalance = Math.min(...netBalances);
  const maxNetBalance = Math.max(...netBalances);
  const range = Math.max(1, maxNetBalance - minNetBalance);
  const innerWidth = CHART_WIDTH - PADDING_X * 2;
  const innerHeight = CHART_HEIGHT - PADDING_Y * 2;
  const activeIndex = hoveredIndex ?? cleaned.length - 1;
  const activePoint = cleaned[activeIndex] ?? cleaned.at(-1);
  const getPointPosition = (point: BalanceHistoryPoint, index: number) => {
    const x =
      PADDING_X +
      (index / Math.max(1, chartPoints.length - 1)) * innerWidth;
    const y =
      PADDING_Y +
      (1 - (point.net_balance - minNetBalance) / range) * innerHeight;

    return { x, y };
  };
  const path = chartPoints
    .map((point, index) => {
      const { x, y } = getPointPosition(point, index);

      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const areaPath = `${path} L ${CHART_WIDTH - PADDING_X} ${
    CHART_HEIGHT - PADDING_Y
  } L ${PADDING_X} ${CHART_HEIGHT - PADDING_Y} Z`;
  const latest = cleaned.at(-1);
  const first = cleaned[0];
  const change =
    latest && first ? latest.net_balance - first.net_balance : 0;
  const isNegative = change < 0;
  const trendColor = isNegative ? "rgb(248 113 113)" : "rgb(16 185 129)";
  const trendFillId = isNegative ? "fundTrendFillNegative" : "fundTrendFillPositive";
  const high = maxNetBalance;
  const low = minNetBalance;

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
            {latest ? formatCurrency(latest.net_balance) : formatCurrency(0)}
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

      <div className="relative">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-36 w-full overflow-visible sm:h-40"
          role="img"
          aria-label="資金走勢圖"
          onMouseLeave={() => setHoveredIndex(null)}
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
            const { x, y } = getPointPosition(point, index);
            const shouldShowPoint =
              index === chartPoints.length - 1 ||
              index === 0 ||
              index === hoveredIndex ||
              chartPoints.length <= 8;

            return (
              <g key={`${point.created_at}-${index}`}>
                {shouldShowPoint && (
                  <circle
                    cx={x}
                    cy={y}
                    r={index === activeIndex ? 5 : 3}
                    fill="rgb(15 23 42)"
                    stroke={trendColor}
                    strokeWidth="2"
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r="10"
                  fill="transparent"
                  tabIndex={0}
                  onFocus={() => setHoveredIndex(index)}
                  onBlur={() => setHoveredIndex(null)}
                  onMouseEnter={() => setHoveredIndex(index)}
                />
              </g>
            );
          })}
        </svg>
        {activePoint && (
          <div className="pointer-events-none mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-xl sm:absolute sm:right-2 sm:top-2 sm:mt-0 sm:block">
            <p className="font-semibold text-white sm:mb-1">
              {formatHKTime(activePoint.created_at, "MM/dd HH:mm")}
            </p>
            <p className="text-slate-300 sm:mt-1">
              淨資金 {formatCurrency(activePoint.net_balance)}
            </p>
            <p className="text-slate-500">
              現金 {formatCurrency(activePoint.balance)}
            </p>
            <p className="text-orange-300">
              欠款 {formatCurrency(activePoint.outstanding_loan)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-slate-500">最高淨值</p>
          <p className="font-semibold text-white">{formatCurrency(high)}</p>
        </div>
        <div>
          <p className="text-slate-500">最低淨值</p>
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
