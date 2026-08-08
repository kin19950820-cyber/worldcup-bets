import Link from "next/link";
import { SEASONS } from "@/lib/seasons";
import { cn } from "@/lib/utils";

// Shared season selector: renders one chip per season linking to
// `${basePath}?season=<id>`, highlighting the active one. Server component —
// the containing page reads the `season` query param.
export default function SeasonChips({
  basePath,
  seasonId,
}: {
  basePath: string;
  seasonId: number;
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {SEASONS.map((item) => (
        <Link
          key={item.id}
          href={`${basePath}?season=${item.id}`}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            item.id === seasonId
              ? "border-brand-500/50 bg-brand-500/15 text-white"
              : "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-white"
          )}
        >
          {item.name}
          {item.ended && (
            <span className="ml-2 rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">
              已完結
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
