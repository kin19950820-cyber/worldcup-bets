"use client";

import { useState, useEffect } from "react";
import { getMatchCountdown } from "@/lib/utils";

export default function MatchCountdown({ kickoffTime }: { kickoffTime: string }) {
  const [countdown, setCountdown] = useState(getMatchCountdown(kickoffTime));

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(getMatchCountdown(kickoffTime));
    }, 30000);
    return () => clearInterval(timer);
  }, [kickoffTime]);

  const isStarted = countdown === "已開始";

  return (
    <span
      className={
        isStarted
          ? "text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400"
          : "text-xs text-brand-500 font-medium"
      }
    >
      {countdown}
    </span>
  );
}
