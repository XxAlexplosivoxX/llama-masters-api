import { MUTED, SENSOR, TEXT } from "../lib/color";
import { fmtCompact } from "../lib/format";
import { weeklyToMonthly, type Range } from "../lib/shared";
import type { LoadedWeekly, Platform } from "../types";
import { useGraphsStore, useStore } from "../hooks/useGraphsStore";

interface Props {
  loaded: LoadedWeekly;
  platform: string;
  range: Range;
}

/** Range total per sub-area for the active platform; asterisk marks partial months. */
export function AreaRanking({ loaded, platform, range }: Props) {
  const store = useStore();
  const areaId = useGraphsStore((s) => s.areaId);
  const areas = loaded.areas.features.map((f) => f.properties);
  if (areas.length <= 1) {
    return <p className="rounded-lg border border-dashed border-grid p-4 text-sm text-muted">This place has a single area.</p>;
  }

  const rows = areas.map((a) => {
    const s = weeklyToMonthly(loaded.weekly, platform, a.area_id);
    let total = 0, partial = false;
    if (s) for (let m = range.from; m <= Math.min(range.to, s.values.length - 1); m++) {
      if (m >= 0 && s.values[m] !== null) total += s.values[m]!;
      if (m >= 0 && s.partial[m]) partial = true;
    }
    return { id: a.area_id, name: a.name, total, partial };
  }).sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.map((r) => r.total));
  const color = SENSOR[platform as Platform] ?? MUTED;

  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.id}>
          <button
            className="grid w-full grid-cols-[minmax(0,8rem)_minmax(3rem,1fr)_5rem] items-center gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-bg"
            onClick={() => store.actions.setArea(r.id)} aria-pressed={r.id === areaId}
          >
            <span className="truncate text-xs" style={{ color: r.id === areaId ? TEXT : MUTED, fontWeight: r.id === areaId ? 700 : 400 }}>
              {r.name}
            </span>
            <span className="h-3 overflow-hidden rounded-sm bg-grid/40">
              <span className="block h-full rounded-sm" style={{ width: `${(r.total / max) * 100}%`, background: color, opacity: r.id === areaId ? 1 : 0.75 }} />
            </span>
            <span className="num text-right text-2xs text-muted">
              {fmtCompact(Math.round(r.total))}
              {r.partial && <span className="text-alert" title="Includes partial months"> *</span>}
            </span>
          </button>
        </li>
      ))}
      <li className="pt-1 text-2xs text-muted">
        <span className="text-alert">*</span> includes partial months
      </li>
    </ul>
  );
}
