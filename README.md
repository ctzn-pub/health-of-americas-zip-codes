# Health of America's ZIP Codes

A polished, **map-first single-page app** covering U.S. ZIP/ZCTA health, social needs, ACS
demographics, neighborhood deprivation — and **presidential politics** (2016/2020 two-party margin
and swing from precinct returns disaggregated to ZCTAs).

- **32,409** ZIP/ZCTA rows · **32,263** current PMTiles geometries · **26** featured health and
  social-need measures · **2** political layers (2020 margin, 2016→2020 swing)
- A dark "civic health observatory" interface with two complementary views in the atlas:
  - **ZIP health snapshot** (by place): pick a ZIP for a composite health score plus strip-plot small
    multiples that place it against its **state** and the **nation** across all featured measures,
    with ACS/ADI context, the ZIP's 2016/2020 presidential lean and swing, and per-ZIP source
    provenance. The map zooms to the ZIP's metro and shades areas by overall burden.
  - **Explore by measure** (one outcome at a time): a luminous MapLibre + PMTiles choropleth that
    recolors via feature-state, with four D3 analytical panels and an insight rail. The political
    layers use a red–blue diverging ramp (U.S. electoral convention) with politics-aware panel copy,
    and are excluded from the composite health score and the 26-measure analyses.
- **Stories** (`/?p=stories`): eight data-driven essays precomputed from the full matrix — the
  single PCA axis behind most place-based health differences (57% of variance), the correlation
  structure of the measures, four k-means **community archetypes**, the ADI deprivation gradient,
  the wealth gap, two outcome stories, and **"The political geography of health"** (all 26 measures
  vs the 2020 margin and 2016→2020 swing, lean-bin gradients, and the realignment curve).
- Selecting a ZIP **zooms the map to its metro**; state is URL-shareable.
- **Single-page app**: every section lives on `/` behind the `p` query param — `/?p=atlas`,
  `/?p=stories`, `/?p=story&s=<slug>`, `/?p=methods`, `/?p=sources` — with old paths redirected via
  `vercel.json`. The landing, methods, sources, and stories-index sections are still server-rendered
  at build with **real content and numbers**; the atlas and the story articles are lazy client
  islands that fetch their JSON payloads on demand.

## Repository layout

```
web/         Next.js (App Router) app — the deployable site
data-prep/   Python pipeline that produces web/public/data/* (run offline)
docs/        Data contract + audit notes
```

The deployable application is **`web/`**. The Python pipeline and large source artifacts are not
needed at app build or runtime. The map streams the public PMTiles geometry over HTTPS range
requests, and the precomputed JSON in `web/public/data/` is committed.

The health analytical source is `raw_data/zcta_atlas.parquet` plus
`raw_data/zcta_atlas.parquet.meta.json`. The political source is
`raw_data/zcta_swing_atlas.parquet` (+ `.meta.json`) — Fekrazad (2025) precinct→ZCTA RLCR
disaggregation joined to the same census atlas (copy it from
`Box-Box/Politics/data/precinct/census_estimates/`; parquets are gitignored). All geometry-bearing
ZCTAs already exist in the current PMTiles, so **a new PMTiles file is not required** unless the
geometry source changes.

## Deploy on Vercel

This repo ships a root [`vercel.json`](vercel.json) that builds the `web/` subdirectory and serves
its static export — so **importing the repo and deploying works with no dashboard configuration**.

1. Import this repository into Vercel and deploy. (Leave the Root Directory as the repo root.)
2. _(Optional)_ set an environment variable **`NEXT_PUBLIC_SITE_URL`** to your final URL
   (e.g. `https://your-domain.com`). It is used for canonical links, the sitemap, and Open Graph
   tags. If unset, a sensible default is used.

No other environment variables are required at runtime.

> **Alternative:** instead of the root `vercel.json`, you can set the project's **Root Directory to
> `web`** (Settings → General); Vercel then auto-detects Next.js. Use one approach or the other —
> if Root Directory is `web`, the root `vercel.json` is ignored.

The app is a static export (`output: "export"` → `web/out`), so it also runs on any static host.

## Local development

```bash
cd web
npm install
npm run dev        # http://localhost:3000
npm run build      # static export → web/out
```

## Routes (single-page app)

Everything is served from `/`; the client switches sections on the `p` query param:

| URL                  | Rendering          | What it is                                                     |
| -------------------- | ------------------ | -------------------------------------------------------------- |
| `/`                  | static             | Editorial landing page with live headline stats from the manifest |
| `/?p=atlas`          | client island      | Interactive atlas — `&view=snapshot` (by place) or measure mode with `&metric=`, `&mode=`, `&region=`, `&selected=` |
| `/?p=stories`        | static             | Stories index with per-story stats                             |
| `/?p=story&s=<slug>` | lazy client island | A story article (fetches its analytics payload on demand)      |
| `/?p=methods`        | static             | Methodology, ZIP-vs-ZCTA, political layers, missingness, accessibility |
| `/?p=sources`        | static             | Underlying files and per-measure provenance                    |

Old paths (`/atlas`, `/methods`, `/sources`, `/stories/*`) 308-redirect to their `?p=` equivalents
via `vercel.json`. `sitemap.xml`, `robots.txt`, and an Open Graph image are generated at build.

## Precomputed snapshot data

The "by place" snapshot is powered by compact artifacts derived **from the already-committed
`public/data` payloads** (no Python/Tigris needed):

```bash
cd web && npm run gen:profiles   # → metric_distributions.json, state_summary.json,
                                 #   profiles/{zip2}.json, map_values/composite.json
```

Re-run this after regenerating the base payloads with the Python pipeline. The outputs are committed
and served as static assets, so each ZIP snapshot loads only a small shard at runtime.

## Regenerating data payloads

```bash
python data-prep/prep_v2.py
python data-prep/analytics_v3.py
python data-prep/analytics_politics.py
cd web && npm run gen:profiles
```

`prep_v2.py` reads the complete parquet and metadata, cleans ACS sentinels, derives burden-oriented
measures, writes catalog/map/chart/insight payloads, and emits a coverage report. `analytics_v3.py`
computes the cross-measure structure behind the stories (Spearman matrix, PCA, k-means archetypes,
ADI gradients, dot-map centroids, per-ZIP archetype assignments). `analytics_politics.py` reads
`raw_data/zcta_swing_atlas.parquet` and emits the two political map layers (+ charts/insights),
`analytics/politics.json` for the politics story, `analytics/politics_by_zip.json`, and upserts the
two `kind: "political"` entries into `metric_catalog.json`. `gen:profiles` then builds profile
shards (including each ZIP's archetype tag and politics tuple), metric distributions, state
summaries, and the composite burden layer — political layers are excluded from the composite.

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19.2 · TypeScript · MapLibre GL JS · PMTiles · D3 · static export.

## Data & caveats

Health outcomes are **CDC PLACES model-based small-area estimates** (modeled, not direct counts).
Pennsylvania and Kentucky include documented tract-to-ZCTA backfill where native CDC ZCTA cells are
absent. Presidential margins are **fractional estimates** from precinct returns disaggregated to
ZCTAs (Fekrazad 2025, RLCR); conterminous U.S. only, and ZCTA-years with fewer than 50 fractional
two-party votes are masked. ZIP-level associations are **ecological** — they describe places, not
individuals or voters, and do not imply causation. **ZCTAs** approximate USPS ZIP Code service
areas and are not official mailing boundaries. See the in-app methods (`/?p=methods`) and sources
(`/?p=sources`) sections ([MethodsSection.tsx](web/components/spa/sections/MethodsSection.tsx),
[SourcesSection.tsx](web/components/spa/sections/SourcesSection.tsx)), and
[`docs/data-contract.md`](docs/data-contract.md).
