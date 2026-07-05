"use client";
// Figures for the "red-blue-health" story. All SVG-from-data with a table fallback,
// matching the other story chart islands.
import type { PoliticsPayload } from "@/lib/types";
import { GRID, INK, BENCH } from "@/lib/colors";
import {
  useResize,
  Axis,
  TableFallback,
  d3,
  useMemo,
  type Col,
} from "@/components/charts/chartUtils";

// US electoral convention (matches the map's POLITICAL ramp poles)
const RED = "#e4604f"; // more Republican / higher where more Republican
const BLUE = "#5da5db"; // more Democratic / higher where more Democratic
const GOLD = "#e8c468"; // swing markers

const M = { t: 16, r: 24, b: 34, l: 148 };

/** Diverging bars: Spearman rho of each measure vs the 2020 margin, with a gold tick
 *  for the swing correlation. Negative = higher in Republican-leaning ZIP codes. */
export default function PoliticsCorrBars({ data }: { data: PoliticsPayload }) {
  const [ref, width] = useResize();
  const rows = useMemo(
    () =>
      data.metrics
        .filter((m) => m.rho_margin != null)
        .slice()
        .sort((a, b) => (a.rho_margin ?? 0) - (b.rho_margin ?? 0)),
    [data],
  );
  const rowH = 19;
  const ih = rows.length * rowH;
  const height = M.t + ih + M.b;
  const iw = Math.max(0, width - M.l - M.r);
  const ext = Math.max(
    0.55,
    ...rows.map((m) => Math.max(Math.abs(m.rho_margin ?? 0), Math.abs(m.rho_swing ?? 0))),
  );
  const x = d3.scaleLinear().domain([-ext, ext]).range([0, iw]);

  const cols: Col[] = [
    { key: "label", label: "Measure" },
    { key: "rho_margin", label: "ρ vs 2020 margin", numeric: true, fmt: (v) => (v == null ? "—" : v.toFixed(2)) },
    { key: "rho_swing", label: "ρ vs 2016→20 swing", numeric: true, fmt: (v) => (v == null ? "—" : v.toFixed(2)) },
  ];

  return (
    <div ref={ref} style={{ width: "100%" }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Spearman correlation of each of ${rows.length} measures with the 2020 two-party margin; negative means higher prevalence in Republican-leaning ZIP codes.`}
          style={{ fontVariantNumeric: "tabular-nums", display: "block" }}
        >
          <g aria-hidden="true">
            {[-0.4, -0.2, 0.2, 0.4].map((t) => (
              <line key={t} x1={M.l + x(t)} x2={M.l + x(t)} y1={M.t} y2={M.t + ih} stroke={GRID} shapeRendering="crispEdges" />
            ))}
            <line x1={M.l + x(0)} x2={M.l + x(0)} y1={M.t} y2={M.t + ih} stroke={BENCH} strokeWidth={1.4} shapeRendering="crispEdges" />
          </g>
          {rows.map((m, i) => {
            const cy = M.t + i * rowH + rowH / 2;
            const rho = m.rho_margin ?? 0;
            const x0 = M.l + x(Math.min(0, rho));
            const w = Math.abs(x(rho) - x(0));
            return (
              <g key={m.id}>
                <text x={M.l - 8} y={cy + 3.5} fontSize={11.5} textAnchor="end" fill="var(--ink-2)">
                  {m.short}
                </text>
                <rect x={x0} y={cy - 5.5} width={Math.max(w, 0.5)} height={11} rx={2} fill={rho < 0 ? RED : BLUE} fillOpacity={0.9}>
                  <title>{`${m.label}: ρ ${rho.toFixed(2)} vs 2020 margin${m.rho_swing != null ? `, ρ ${m.rho_swing.toFixed(2)} vs swing` : ""}`}</title>
                </rect>
                {m.rho_swing != null && (
                  <path
                    d={`M ${M.l + x(m.rho_swing)} ${cy - 5.5} l 4 5.5 l -4 5.5 l -4 -5.5 Z`}
                    fill={GOLD}
                    stroke="#0c1420"
                    strokeWidth={0.8}
                  >
                    <title>{`${m.label}: ρ ${m.rho_swing.toFixed(2)} vs 2016→2020 swing`}</title>
                  </path>
                )}
              </g>
            );
          })}
          <Axis orient="bottom" scale={x} tx={M.l} ty={M.t + ih} ticks={5} tickFormat={(d) => `${d}`} />
          <g aria-hidden="true" fontSize={11} fill={BENCH}>
            <text x={M.l} y={height - 4}>← higher where more Republican</text>
            <text x={M.l + iw} y={height - 4} textAnchor="end">higher where more Democratic →</text>
          </g>
        </svg>
      )}
      <p className="muted" aria-hidden="true" style={{ fontSize: 11.5, margin: "6px 0 0" }}>
        <span style={{ color: RED }}>■</span>/<span style={{ color: BLUE }}>■</span> bar: ρ vs 2020
        margin · <span style={{ color: GOLD }}>◆</span> ρ vs 2016→2020 swing (negative = higher where
        the shift ran toward Republicans)
      </p>
      <TableFallback
        caption="Spearman correlations of each measure with the 2020 presidential margin and the 2016-2020 swing"
        columns={cols}
        rows={rows as unknown as Record<string, unknown>[] as Record<string, any>[]}
      />
    </div>
  );
}

const LINE_COLORS = ["#e4604f", "#e8c468", "#7fd1c0", "#5da5db", "#c9a2e0", "#9db4d1"];

/** Selected measures across the seven political-lean bins, indexed to each measure's
 *  cross-bin mean (=100) so different prevalence scales share one panel. */
export function PoliticsLeanLines({ data, ids }: { data: PoliticsPayload; ids: string[] }) {
  const [ref, width] = useResize();
  const H = 320;
  const m = { t: 16, r: 110, b: 40, l: 48 };
  const bins = data.lean_bins;
  const byId = useMemo(() => new Map(data.metrics.map((mm) => [mm.id, mm])), [data]);

  const series = useMemo(() => {
    return ids
      .map((id, i) => {
        const vals = bins.map((b) => b.metrics[id]);
        if (vals.some((v) => v == null)) return null;
        const mean = d3.mean(vals as number[]) ?? 1;
        return {
          id,
          short: byId.get(id)?.short ?? id,
          color: LINE_COLORS[i % LINE_COLORS.length],
          idx: (vals as number[]).map((v) => (v / mean) * 100),
          raw: vals as number[],
        };
      })
      .filter(Boolean) as { id: string; short: string; color: string; idx: number[]; raw: number[] }[];
  }, [bins, byId, ids]);

  const iw = Math.max(0, width - m.l - m.r);
  const ih = H - m.t - m.b;
  const x = d3.scalePoint<string>().domain(bins.map((b) => b.label)).range([0, iw]);
  const [lo, hi] = [
    Math.min(92, d3.min(series, (s) => d3.min(s.idx) ?? 100) ?? 92) - 2,
    Math.max(108, d3.max(series, (s) => d3.max(s.idx) ?? 100) ?? 108) + 2,
  ];
  const y = d3.scaleLinear().domain([lo, hi]).range([ih, 0]);

  const cols: Col[] = [
    { key: "label", label: "Lean bin" },
    ...series.map((s) => ({ key: s.id, label: s.short, numeric: true, fmt: (v: number) => `${v.toFixed(1)}%` })),
  ];
  const rows = bins.map((b, i) => ({
    label: b.label,
    ...Object.fromEntries(series.map((s) => [s.id, s.raw[i]])),
  }));

  return (
    <div ref={ref} style={{ width: "100%" }}>
      {width > 0 && (
        <svg
          width={width}
          height={H}
          role="img"
          aria-label="Selected health measures across seven political-lean groups of ZIP codes, indexed to each measure's average."
          style={{ fontVariantNumeric: "tabular-nums", display: "block" }}
        >
          <g aria-hidden="true">
            {y.ticks(5).map((t) => (
              <line key={t} x1={m.l} x2={m.l + iw} y1={m.t + y(t)} y2={m.t + y(t)} stroke={t === 100 ? BENCH : GRID} shapeRendering="crispEdges" />
            ))}
          </g>
          {series.map((s) => {
            const line = d3
              .line<number>()
              .x((_, i) => m.l + (x(bins[i].label) ?? 0))
              .y((v) => m.t + y(v));
            return (
              <g key={s.id}>
                <path d={line(s.idx) ?? undefined} fill="none" stroke={s.color} strokeWidth={2} />
                {s.idx.map((v, i) => (
                  <circle key={i} cx={m.l + (x(bins[i].label) ?? 0)} cy={m.t + y(v)} r={3} fill={s.color}>
                    <title>{`${s.short} · ${bins[i].label}: ${s.raw[i].toFixed(1)}% (index ${v.toFixed(0)})`}</title>
                  </circle>
                ))}
                <text x={m.l + iw + 8} y={m.t + y(s.idx[s.idx.length - 1]) + 4} fontSize={11.5} fill={s.color}>
                  {s.short}
                </text>
              </g>
            );
          })}
          <Axis orient="left" scale={y} tx={m.l} ty={m.t} ticks={5} tickFormat={(d) => `${d}`} />
          <Axis orient="bottom" scale={x} tx={m.l} ty={m.t + ih} />
          <text x={m.l - 36} y={m.t - 4} fontSize={11} fill={BENCH}>index (measure avg = 100)</text>
        </svg>
      )}
      <TableFallback
        caption="Population-weighted mean prevalence of selected measures by 2020 political-lean bin"
        columns={cols}
        rows={rows}
      />
    </div>
  );
}

/** The realignment curve: 2016 margin (x) vs 2016→2020 swing (y), sampled ZIP codes
 *  plus the LOESS trend. */
export function PoliticsSwingScatter({ data }: { data: PoliticsPayload }) {
  const [ref, width] = useResize();
  const H = 340;
  const m = { t: 16, r: 18, b: 40, l: 48 };
  const pts = data.swing_curve.points;
  const loess = data.swing_curve.loess;

  const iw = Math.max(0, width - m.l - m.r);
  const ih = H - m.t - m.b;
  const x = d3.scaleLinear().domain([-95, 95]).range([0, iw]).clamp(true);
  const yExt = Math.max(20, Math.min(40, d3.max(loess, (d) => Math.abs(d[1])) ?? 20) + 14);
  const y = d3.scaleLinear().domain([-yExt, yExt]).range([ih, 0]).clamp(true);

  const cols: Col[] = [
    { key: "x", label: "2016 margin (pts)", numeric: true, fmt: (v) => v.toFixed(0) },
    { key: "y", label: "LOESS swing (pts)", numeric: true, fmt: (v) => v.toFixed(1) },
  ];

  return (
    <div ref={ref} style={{ width: "100%" }}>
      {width > 0 && (
        <svg
          width={width}
          height={H}
          role="img"
          aria-label="Each point is a ZIP code: 2016 presidential margin against its 2016 to 2020 swing, with a LOESS trend."
          style={{ fontVariantNumeric: "tabular-nums", display: "block" }}
        >
          <g aria-hidden="true">
            <line x1={m.l} x2={m.l + iw} y1={m.t + y(0)} y2={m.t + y(0)} stroke={BENCH} shapeRendering="crispEdges" />
            <line x1={m.l + x(0)} x2={m.l + x(0)} y1={m.t} y2={m.t + ih} stroke={GRID} shapeRendering="crispEdges" />
          </g>
          <g>
            {pts.map((p) => (
              <circle
                key={p.zip}
                cx={m.l + x(p.x)}
                cy={m.t + y(p.y)}
                r={2}
                fill={p.x < 0 ? RED : BLUE}
                fillOpacity={0.35}
              />
            ))}
          </g>
          <path
            aria-hidden="true"
            d={
              d3
                .line<[number, number]>()
                .x((d) => m.l + x(d[0]))
                .y((d) => m.t + y(d[1]))(loess as [number, number][]) ?? undefined
            }
            fill="none"
            stroke={INK}
            strokeWidth={2.2}
          />
          <Axis orient="left" scale={y} tx={m.l} ty={m.t} ticks={5} tickFormat={(d) => `${Number(d) > 0 ? "+" : ""}${d}`} />
          <Axis orient="bottom" scale={x} tx={m.l} ty={m.t + ih} ticks={7} tickFormat={(d) => `${Number(d) > 0 ? "D+" : Number(d) < 0 ? "R+" : ""}${Math.abs(Number(d))}`} />
          <g aria-hidden="true" fontSize={11} fill={BENCH}>
            <text x={m.l - 36} y={m.t - 4}>swing toward Democrats (pts) ↑</text>
            <text x={m.l + iw} y={H - 6} textAnchor="end">2016 two-party margin →</text>
          </g>
        </svg>
      )}
      <TableFallback
        caption="LOESS trend of 2016-2020 swing by 2016 margin"
        columns={cols}
        rows={loess.map((d) => ({ x: d[0], y: d[1] }))}
      />
    </div>
  );
}
