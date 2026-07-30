"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useUrlState } from "@/lib/urlState";
import { STORIES } from "@/lib/stories";
import {
  loadCharts, loadComposite, loadGeoCatalog, loadInsights, loadMapValues, loadMetricCatalog,
  loadMetricDistributions, loadProfileShard, loadRegionCatalog, loadStateSummary,
} from "@/lib/data";
import { percentileOf, valueFmt, fmtPop } from "@/lib/format";
import { COMPOSITE_META } from "@/lib/snapshot";
import type {
  ChartsPayload, GeoCatalog, InsightsPayload, MapValues, MetricCatalog, MetricDistributions,
  MetricMeta, Mode, ProfileZip, RegionCatalog, StateSummary,
} from "@/lib/types";
import Controls from "./Controls";
import Legend from "./Legend";
import InsightRail from "./InsightRail";
import ZipCard from "./ZipCard";
import ZipSearch from "./search/ZipSearch";
import SnapshotScoreCard from "./snapshot/SnapshotScoreCard";
import HealthSnapshot from "./snapshot/HealthSnapshot";

const US_BOUNDS: [number, number, number, number] = [-125, 24, -66.5, 49.5];

const MapChoropleth = dynamic(() => import("./MapChoropleth"), {
  ssr: false,
  loading: () => <div className="map-canvas" style={{ display: "grid", placeItems: "center" }}><span className="muted">Loading map…</span></div>,
});
const RankedDotPlot = dynamic(() => import("./panels/RankedDotPlot"), { ssr: false, loading: () => <PanelSkeleton /> });
const Distribution = dynamic(() => import("./panels/Distribution"), { ssr: false, loading: () => <PanelSkeleton /> });
const ScatterLoess = dynamic(() => import("./panels/ScatterLoess"), { ssr: false, loading: () => <PanelSkeleton /> });
const DisparityGradient = dynamic(() => import("./panels/DisparityGradient"), { ssr: false, loading: () => <PanelSkeleton /> });

function PanelSkeleton() {
  return <div style={{ height: 300, display: "grid", placeItems: "center" }} className="muted">Loading chart…</div>;
}

const StoryLoadingFallback = () => (
  <div className="story-wrap"><p className="muted" style={{ padding: 40 }}>Loading the story…</p></div>
);

// Story articles are lazy client islands — each fetches its analytics payload on mount.
const STORY_COMPONENTS: Record<string, ReturnType<typeof dynamic>> = {
  "one-axis": dynamic(() => import("./spa/stories/OneAxisStory"), { loading: StoryLoadingFallback }),
  connected: dynamic(() => import("./spa/stories/ConnectedStory"), { loading: StoryLoadingFallback }),
  "four-americas": dynamic(() => import("./spa/stories/FourAmericasStory"), { loading: StoryLoadingFallback }),
  gradient: dynamic(() => import("./spa/stories/GradientStory"), { loading: StoryLoadingFallback }),
  "wealth-gap": dynamic(() => import("./spa/stories/WealthGapStory"), { loading: StoryLoadingFallback }),
  "diagnosis-gap": dynamic(() => import("./spa/stories/DiagnosisGapStory"), { loading: StoryLoadingFallback }),
  "tobacco-belt": dynamic(() => import("./spa/stories/TobaccoBeltStory"), { loading: StoryLoadingFallback }),
  "red-blue-health": dynamic(() => import("./spa/stories/RedBlueHealthStory"), { loading: StoryLoadingFallback }),
};

function panelDefs(political: boolean, shortLabel = ""): { Cmp: any; title: string; sub: string }[] {
  if (political) {
    const isSwing = /swing/i.test(shortLabel);
    return [
      { Cmp: DisparityGradient, title: "The deprivation gradient", sub: "Population-weighted average across Area Deprivation Index deciles, with 95% confidence band. Positive = more Democratic." },
      {
        Cmp: RankedDotPlot,
        title: isSwing ? "Biggest shifts toward each party" : "Most Democratic and most Republican ZIP codes",
        sub: `Each ZIP against the national ${isSwing ? "swing" : "two-party margin"}. Hover or focus a row to highlight it on the map.`,
      },
      { Cmp: Distribution, title: "How ZIP codes are distributed", sub: `Count of ZIP codes by ${isSwing ? "swing" : "margin"}, with the national value marked. Positive = more Democratic.` },
      { Cmp: ScatterLoess, title: `${shortLabel || "Vote margin"} vs. area deprivation`, sub: "Each point is a ZIP code. The line is a LOESS trend. Association is ecological, not causal." },
    ];
  }
  return [
    { Cmp: DisparityGradient, title: "The deprivation gradient", sub: "Population-weighted average across Area Deprivation Index deciles, with 95% confidence band." },
    { Cmp: RankedDotPlot, title: "Highest- and lowest-burden ZIP codes", sub: "Each ZIP against the U.S. average. Hover or focus a row to highlight it on the map." },
    { Cmp: Distribution, title: "How ZIP codes are distributed", sub: "Count of ZIP codes by value, with the U.S. average and high-burden threshold marked." },
    { Cmp: ScatterLoess, title: "Health vs. area deprivation", sub: "Each point is a ZIP code. The line is a LOESS trend. Association is ecological, not causal." },
  ];
}

export default function AppClient({
  storiesIndex,
  aboutSection,
}: {
  storiesIndex?: ReactNode;
  aboutSection?: ReactNode;
}) {
  const [state, setState] = useUrlState();
  const isAbout = state.view === "about";
  const isSnap = state.view === "snapshot";
  const isStories = state.view === "stories";
  const activeStory = isStories && state.story && STORIES.some((s) => s.slug === state.story) ? state.story : undefined;
  // the two map-bearing views; "stories" and "about" are prose and show no atlas chrome
  const isAtlas = isSnap || state.view === "measure";
  const isMeasure = state.view === "measure";

  const [catalog, setCatalog] = useState<MetricCatalog | null>(null);
  const [regions, setRegions] = useState<RegionCatalog | null>(null);
  const [geo, setGeo] = useState<GeoCatalog | null>(null);

  // measure-view payloads
  const [mapValues, setMapValues] = useState<MapValues | null>(null);
  const [charts, setCharts] = useState<ChartsPayload | null>(null);
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [loading, setLoading] = useState(false);

  // snapshot-view payloads
  const [composite, setComposite] = useState<MapValues | null>(null);
  const [dists, setDists] = useState<MetricDistributions | null>(null);
  const [stateSummary, setStateSummary] = useState<StateSummary | null>(null);
  const [profile, setProfile] = useState<ProfileZip | null>(null);

  const [hovered, setHovered] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [overMap, setOverMap] = useState(false);

  useEffect(() => {
    loadMetricCatalog().then(setCatalog).catch(() => {});
    loadRegionCatalog().then(setRegions).catch(() => {});
    loadGeoCatalog().then(setGeo).catch(() => {});
    // legacy ?p=methods / ?p=sources links → the matching section of the About view.
    // decode() already resolves these to view "about"; this just drops the stale param and
    // scrolls to the right appendix once it has painted.
    const p = new URLSearchParams(window.location.search).get("p");
    if (p === "methods" || p === "sources") {
      setState({ view: "about" });
      requestAnimationFrame(() => document.getElementById(`about-${p}`)?.scrollIntoView());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta: MetricMeta | null = useMemo(() => {
    if (!catalog) return null;
    return catalog.metrics.find((m) => m.metric_id === state.metric) ?? catalog.metrics.find((m) => m.metric_id === catalog.default_metric) ?? catalog.metrics[0];
  }, [catalog, state.metric]);
  const metricInvalid = !!catalog && !catalog.metrics.some((m) => m.metric_id === state.metric);
  // political layers (presidential margin/swing) live in the catalog for the measure view,
  // but the snapshot's composite/strips frame is health-only
  const healthMetrics = useMemo(
    () => (catalog ? catalog.metrics.filter((m) => m.kind !== "political") : []),
    [catalog],
  );
  const politicalMetrics = useMemo(
    () => (catalog ? catalog.metrics.filter((m) => m.kind === "political") : []),
    [catalog],
  );
  const isPolitical = meta?.kind === "political";

  // return to the top when toggling views or opening/closing a story
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [state.view, state.story]);

  // measure payloads (skip in snapshot/stories views)
  useEffect(() => {
    if (!meta || !isMeasure) return;
    let alive = true;
    setLoading(true);
    Promise.all([loadMapValues(meta.metric_id), loadCharts(meta.metric_id), loadInsights(meta.metric_id)])
      .then(([mv, ch, ins]) => {
        if (!alive) return;
        setMapValues(mv); setCharts(ch); setInsights(ins); setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [meta, isMeasure]);

  // snapshot base payloads (composite map + distributions + state means)
  useEffect(() => {
    if (!isSnap) return;
    loadComposite().then(setComposite).catch(() => {});
    loadMetricDistributions().then(setDists).catch(() => {});
    loadStateSummary().then(setStateSummary).catch(() => {});
  }, [isSnap]);

  // selected ZIP profile (used by the snapshot)
  useEffect(() => {
    const z = state.selected;
    if (!z) { setProfile(null); return; }
    let alive = true;
    loadProfileShard(z.slice(0, 2)).then((sh) => { if (alive) setProfile(sh.zips[z] ?? null); }).catch(() => alive && setProfile(null));
    return () => { alive = false; };
  }, [state.selected]);

  // map framing: zoom to the selected ZIP's metro, else the chosen region
  const bounds = useMemo<[number, number, number, number]>(() => {
    const rec = state.selected && geo ? geo.zips[state.selected] : undefined;
    if (rec) {
      const lat = rec[3], lon = rec[4];
      const dLat = 0.55;
      const dLon = 0.55 / Math.max(0.25, Math.cos((lat * Math.PI) / 180));
      return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
    }
    const r = regions?.regions.find((x) => x.id === state.region);
    return (r?.bounds as [number, number, number, number]) ?? US_BOUNDS;
  }, [geo, state.selected, regions, state.region]);

  // what the shared map paints
  const mapPayload = isSnap ? composite : mapValues;
  const mapMeta = isSnap ? COMPOSITE_META : meta;
  const mapMode: Mode = isSnap ? "rate" : state.mode;
  const mapBusy = isSnap ? !composite : loading;

  const selected = state.selected;
  const sortedValues = useMemo(() => (mapValues ? Object.values(mapValues.values).sort((a, b) => a - b) : []), [mapValues]);
  const selectedValue = selected && mapValues ? mapValues.values[selected] : undefined;
  const selectedPct = selectedValue != null ? percentileOf(sortedValues, selectedValue) : undefined;
  const geoRec = selected && geo ? geo.zips[selected] : undefined;
  const hoverRec = hovered && geo ? geo.zips[hovered] : undefined;
  const hoverVal = hovered && mapPayload ? mapPayload.values[hovered] : undefined;

  const onSelect = (zip: string | null) => setState({ selected: zip ?? undefined });
  const mapFmt = mapMeta ? valueFmt(mapMeta.format, mapMeta.unit) : (v: number) => `${v}`;

  if (!catalog || !meta || !mapMeta) {
    return <main className="app"><p className="muted" style={{ padding: 40 }}>Loading the atlas…</p></main>;
  }

  const placeOf = (rec?: GeoCatalog["zips"][string]) => (rec ? [rec[0], rec[1]].filter(Boolean).join(", ") : "");
  const stateMeans = profile?.c[1] && stateSummary ? stateSummary[profile.c[1]] : undefined;

  const heading = isAbout
    ? "About this atlas"
    : isStories
      ? "What the ZIP-code data teaches"
      : isSnap
        ? "A health snapshot for any ZIP code"
        : "U.S. health outcomes, ZIP code by ZIP code";
  const subCopy = isAbout
    ? "Who built it, how the estimates are modeled, what they can and cannot support, and every underlying source."
    : isStories
      ? `Eight data-driven essays precomputed from the full ${healthMetrics.length}-measure × 32k-area matrix — the structure behind the map, from the deprivation axis to presidential politics.`
      : isSnap
        ? `Pick a ZIP code to see where it lands across ${healthMetrics.length} health and social-need measures, with ACS demographics, ADI context, 2016–2020 presidential lean, and one experimental composite score.`
        : `${healthMetrics.length} burden-oriented health measures plus presidential vote margin and swing, across 32,409 ZIP/ZCTA areas — mapped against the national average, neighborhood deprivation, and local demographic context.`;

  const StoryCmp = activeStory ? STORY_COMPONENTS[activeStory] : null;

  // In the snapshot view, a chosen ZIP promotes its card + per-measure strips above the map:
  // the map is context for picking a place, not the answer, and keeping it on the fold hid
  // everything below it. Without a selection the map leads, since it's the only way to browse.
  const snapDetail = isSnap && !!selected && !!profile;

  const mapSection = isAtlas && (
    <div className={snapDetail ? "stage stage-map-last" : "stage"}>
      <div className="map-col">
        <div
          className="map-frame"
          aria-busy={mapBusy}
          onMouseEnter={() => setOverMap(true)}
          onMouseLeave={() => { setOverMap(false); setHovered(null); }}
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPointer({ x: e.clientX - r.left, y: e.clientY - r.top }); }}
        >
          <MapChoropleth
            payload={mapPayload}
            mode={mapMode}
            domain={mapMeta.domain}
            benchmark={mapMeta.benchmark}
            kind={mapMeta.scale_kind === "diverging" ? "diverging" : "sequential"}
            bounds={bounds}
            selected={selected}
            hovered={hovered}
            onSelect={onSelect}
            onHover={setHovered}
          />
          <Legend
            mode={mapMode}
            domain={mapMeta.domain}
            benchmark={mapMeta.benchmark}
            fmt={mapFmt}
            title={mapMeta.short_label}
            lowerIsBetter={mapMeta.lower_is_better}
            kind={mapMeta.scale_kind === "diverging" ? "diverging" : "sequential"}
          />
          {hovered && overMap && (
            <div className="tooltip" style={{ left: Math.min(pointer.x + 14, 9999), top: pointer.y + 14 }}>
              <div className="tt-name">{placeOf(hoverRec) || `ZIP ${hovered}`}</div>
              <div className="tt-val">
                {mapMeta.short_label}: {hoverVal != null ? mapFmt(hoverVal) : "no estimate"}
                {hoverRec ? ` · ${fmtPop(hoverRec[5])} people` : ""}
              </div>
            </div>
          )}
          {mapBusy && <div className="tooltip" style={{ left: 14, top: 14, background: "var(--panel-2)" }}>Updating…</div>}
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          {isSnap
            ? "Shaded by overall health burden — deeper red means higher combined burden across available measures. Hover a ZIP for its percentile; click for its full snapshot."
            : <>Hover a ZIP for its value; click to pin it. {meta.description}. Denominator: {meta.denominator}.{meta.missing_count > 0 ? ` ${meta.missing_count.toLocaleString()} ZIP/ZCTA rows have no estimate for this measure and draw as no-data where they are in the tiles.` : ""}</>}
        </p>
      </div>

      {!snapDetail && (
        <aside>
          {isSnap ? (
            <div className="snap-empty">
              <h2>See any ZIP&apos;s health snapshot</h2>
              <p className="muted">
                Search a ZIP code above, or click any area on the map, to see how it compares across
                all {healthMetrics.length} measures, ACS context, state averages, and the nation.
              </p>
              {selected && !profile && <p className="muted">Loading ZIP {selected}…</p>}
            </div>
          ) : (
            <>
              {selected && (
                <div style={{ marginBottom: 12 }}>
                  <ZipCard
                    zip={selected}
                    place={placeOf(geoRec)}
                    region={geoRec?.[2] ?? undefined}
                    population={geoRec?.[5]}
                    county={geoRec?.[6]}
                    source={geoRec?.[8]}
                    backfilled={geoRec?.[10]}
                    adi={geoRec?.[11]}
                    income={geoRec?.[12]}
                    politics={profile?.p ?? undefined}
                    meta={meta}
                    value={selectedValue}
                    percentile={selectedPct}
                    onClear={() => onSelect(null)}
                  />
                </div>
              )}
              {insights && <InsightRail insights={insights.insights} onSelect={onSelect} metricLabel={meta.label} political={isPolitical} />}
            </>
          )}
        </aside>
      )}
    </div>
  );

  return (
    <main id="main" className="app">
      {!activeStory && (
        <header className="masthead">
          <span className="kicker">ZIP Health Atlas</span>
          <h1>{heading}</h1>
          <p className="sub">{subCopy}</p>
        </header>
      )}

      {isAbout ? (
        <section className="about-pane" aria-label="About this atlas">
          {aboutSection ?? <p className="muted" style={{ padding: 40 }}>Loading…</p>}
        </section>
      ) : isStories ? (
        <section className="stories-pane" aria-label="Data stories">
          {StoryCmp ? (
            <>
              <button type="button" className="btn story-back" onClick={() => setState({ story: undefined })}>
                ← All stories
              </button>
              <StoryCmp />
            </>
          ) : (
            storiesIndex ?? (
              <p className="muted" style={{ padding: 40 }}>Loading stories…</p>
            )
          )}
        </section>
      ) : isSnap ? (
        <div className="controls">
          <div className="field" style={{ flex: "1 1 280px", maxWidth: 360 }}>
            <label>Find a ZIP</label>
            <ZipSearch compact onSubmit={(z) => setState({ selected: z })} placeholder="ZIP code — e.g. 10001" />
          </div>
          <div className="field">
            <label htmlFor="snap-region">Zoom to</label>
            <select id="snap-region" value={state.region} onChange={(e) => setState({ region: e.target.value, selected: undefined })}>
              {(regions?.regions ?? []).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
        </div>
      ) : (
        <Controls metrics={catalog.metrics} regions={regions?.regions ?? []} state={state} onChange={setState} />
      )}

      {isMeasure && metricInvalid && (
        <div className="notice" role="status">Unknown measure “{state.metric}”. Showing <strong>{meta.label}</strong> instead.</div>
      )}

      {snapDetail && selected && profile && (
        <div className="snap-detail">
          <SnapshotScoreCard
            zip={selected}
            profile={profile}
            metrics={healthMetrics}
            nMeasured={profile.m.filter(Boolean).length}
            onClear={() => onSelect(null)}
            onPickMetric={(id) => setState({ view: "measure", metric: id })}
          />
        </div>
      )}

      {isSnap && selected && profile && (
        dists ? (
          <section className="snap-strips-section" aria-label="Per-measure health snapshot">
            <HealthSnapshot
              profile={profile}
              metrics={healthMetrics}
              politicalMetrics={politicalMetrics}
              dists={dists}
              stateMeans={stateMeans}
              onPickMetric={(id) => setState({ view: "measure", metric: id })}
            />
          </section>
        ) : (
          <section className="snap-strips-section" aria-label="Per-measure health snapshot">
            <p className="muted">Loading the per-measure detail…</p>
          </section>
        )
      )}

      {snapDetail && (
        <h3 className="snap-map-heading">
          Where this ZIP sits nationally
          <span> — shaded by overall health burden. Click any area for its snapshot.</span>
        </h3>
      )}

      {mapSection}

      {isMeasure && (
        <section className="panels" aria-label="Analytical panels">
          {charts &&
            panelDefs(!!isPolitical, meta.short_label).map(({ Cmp, title, sub }) => (
              <div className="panel" key={title}>
                <h3>{title}</h3>
                <p className="panel-sub">{sub}</p>
                <Cmp charts={charts} meta={meta} selected={selected} selectedValue={selectedValue} onSelect={onSelect} onHover={setHovered} />
              </div>
            ))}
        </section>
      )}

      <footer className="footer">
        <p>
          <strong>Sources.</strong> Health outcomes: CDC PLACES-style model-based small-area estimates,
          prepared from <code>zcta_atlas.parquet</code> and joined to public PMTiles geometry. Socioeconomic
          context includes ACS demographics and ADI 2023 v4.0.1. Presidential margins and swing come from
          precinct returns disaggregated to ZCTAs (Fekrazad 2025, <code>zcta_swing_atlas.parquet</code>).
          The composite health score is an experimental average of national percentiles across available
          health measures; political layers are excluded from it.
        </p>
        <p>
          <strong>Caveats.</strong> Estimates are modeled, not direct counts. Pennsylvania and Kentucky
          include documented tract-to-ZCTA backfill where native CDC ZCTA cells are absent. ZIP/ZCTA-level
          associations are ecological and do not describe individuals or imply causation. Generated {catalog.generated_at.slice(0, 10)}.
        </p>
      </footer>
    </main>
  );
}
