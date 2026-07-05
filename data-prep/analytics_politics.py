"""Politics payloads: ZCTA presidential vote (2016/2020) + swing, joined to health.

Reads raw_data/zcta_swing_atlas.parquet (Fekrazad 2025 RLCR precinct->census
disaggregation joined to the project census atlas; copy it from
Box-Box/Politics/data/precinct/census_estimates/ if absent) and emits:

  map_values/pres_margin_2020.json   choropleth values (D-R margin, pct points)
  map_values/pres_swing.json         choropleth values (2016->2020 swing, pct points)
  charts/pres_margin_2020.json       full analytical panel payload (same shape as health)
  charts/pres_swing.json
  insights/pres_margin_2020.json
  insights/pres_swing.json
  analytics/politics.json            story payload: lean bins x 26 measures, correlations
  analytics/politics_by_zip.json     per-ZIP [margin16, margin20, swing] for profile shards

It also UPSERTS two "Politics" entries into metric_catalog.json with
kind="political" and scale_kind="diverging"; the web build (gen:profiles) and the
UI exclude kind="political" from the health composite and 26-measure analytics.

Margins are two-party (Dem minus Rep) in percentage points, -100..+100; positive
= more Democratic. ZCTAs with < MIN_VOTES fractional total votes in a year are
masked for that year (precinct slivers produce degenerate -100/+100 margins).

Run from repo root:
  python data-prep/analytics_politics.py
Then from web/:
  npm run gen:profiles
"""
from __future__ import annotations

import datetime as dt
import json
import math
import pathlib
from typing import Any

import duckdb
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "raw_data" / "zcta_swing_atlas.parquet"
META_PATH = ROOT / "raw_data" / "zcta_swing_atlas.parquet.meta.json"
DATA = ROOT / "web" / "public" / "data"
CATALOG = DATA / "metric_catalog.json"

MIN_VOTES = 50          # mask year-margins built on fewer fractional votes
SWING_POP_FLOOR = 5000  # population floor for "biggest shift" exemplar lists
SOURCE_URL = "https://doi.org/10.1038/s41597-025-05140-3"

CONTEXT: dict[str, dict[str, str]] = {
    "adi_national_rank": dict(label="Area Deprivation Index rank", short="ADI", higher="more deprived"),
    "median_income_clean": dict(label="Median household income", short="Income", higher="higher income"),
    "poverty_pct": dict(label="Poverty rate", short="Poverty", higher="more poverty"),
    "college_pct": dict(label="College graduates", short="College+", higher="more college graduates"),
    "unemployed_pct": dict(label="Unemployment rate", short="Unemployment", higher="more unemployment"),
    "age65_pct": dict(label="Adults 65+", short="65+", higher="older population"),
    "black_pct": dict(label="Black population share", short="Black share", higher="larger Black population share"),
    "hispanic_pct": dict(label="Hispanic population share", short="Hispanic share", higher="larger Hispanic population share"),
    "population_density": dict(label="Population density", short="Density", higher="denser population"),
    "home_value_clean": dict(label="Median home value", short="Home value", higher="higher home value"),
}

LEAN_BINS = [
    dict(id="safe_r", label="Safe R", lo=-1e9, hi=-30),
    dict(id="strong_r", label="Strong R", lo=-30, hi=-15),
    dict(id="lean_r", label="Lean R", lo=-15, hi=-5),
    dict(id="tossup", label="Tossup", lo=-5, hi=5),
    dict(id="lean_d", label="Lean D", lo=5, hi=15),
    dict(id="strong_d", label="Strong D", lo=15, hi=30),
    dict(id="safe_d", label="Safe D", lo=30, hi=1e9),
]


def write(rel: str, obj: Any) -> None:
    path = DATA / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":"), allow_nan=False), encoding="utf-8")


def finite_or_none(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, np.generic):
        return finite_or_none(v.item())
    return v


def records(df) -> list[dict[str, Any]]:
    return [{k: finite_or_none(v) for k, v in row.items()} for row in df.to_dict("records")]


def loess(x: np.ndarray, y: np.ndarray, grid: np.ndarray, frac: float = 0.35) -> list[list[float]]:
    n = len(x)
    if n == 0:
        return []
    k = max(min(int(frac * n), n), min(30, n))
    order = np.argsort(x)
    xs, ys = x[order], y[order]
    out: list[list[float]] = []
    for gx in grid:
        d = np.abs(xs - gx)
        idx = np.argsort(d)[:k]
        dx, dy = xs[idx], ys[idx]
        dmax = np.max(np.abs(dx - gx)) or 1.0
        w = (1 - (np.abs(dx - gx) / dmax) ** 3) ** 3
        w = np.clip(w, 0, None)
        if float(np.sum(w)) == 0:
            out.append([round(float(gx), 2), round(float(np.mean(dy)), 3)])
            continue
        sw = np.sum(w)
        mx = np.sum(w * dx) / sw
        my = np.sum(w * dy) / sw
        bx = np.sum(w * (dx - mx) * (dy - my))
        bxx = np.sum(w * (dx - mx) ** 2) or 1e-9
        slope = bx / bxx
        out.append([round(float(gx), 2), round(float(my + slope * (gx - mx)), 3)])
    return out


def clean_num(col: str) -> str:
    return f"CASE WHEN {col} < 0 THEN NULL ELSE {col} END"


def clean_pct(col: str) -> str:
    return f"CASE WHEN {col} < 0 THEN NULL ELSE {col} * 100 END"


def main() -> None:
    if not RAW.exists():
        raise FileNotFoundError(
            f"{RAW} not found — copy zcta_swing_atlas.parquet from "
            "Box-Box/Politics/data/precinct/census_estimates/ into raw_data/"
        )
    meta = json.loads(META_PATH.read_text(encoding="utf-8")) if META_PATH.exists() else {}
    generated_at = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    source = (
        "Fekrazad (2025) precinct-level returns disaggregated to ZCTAs via RLCR dasymetric "
        "weighting (fractional votes); two-party margins. Conterminous US only (no AK/HI)."
    )

    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    health_metrics = [m for m in catalog["metrics"] if m.get("kind") != "political"]
    health_ids = [m["metric_id"] for m in health_metrics]
    by_id = {m["metric_id"]: m for m in health_metrics}

    derived = {
        "no_dental_visit": "100 - health_dental",
        "no_checkup": "100 - health_checkup",
    }
    metric_selects = []
    for m in health_metrics:
        mid = m["metric_id"]
        expr = derived.get(mid) or clean_num(m["source_column"])
        metric_selects.append(f"({expr}) AS {mid}")

    con = duckdb.connect()
    con.execute(
        f"""
        CREATE OR REPLACE TABLE j AS
        SELECT
          geoid AS zip,
          COALESCE(NULLIF(county_name, ''), NULLIF(cbsa_name, ''), 'ZCTA ' || geoid) AS place,
          state_abbr AS state,
          population,
          population_density,
          {clean_num('adi_national_rank')} AS adi_national_rank,
          {clean_num('median_income')} AS median_income_clean,
          {clean_num('median_home_value')} AS home_value_clean,
          {clean_pct('per_poverty')} AS poverty_pct,
          {clean_pct('per_college_above')} AS college_pct,
          {clean_pct('per_unemployed')} AS unemployed_pct,
          {clean_pct('per_65_over')} AS age65_pct,
          {clean_pct('per_black')} AS black_pct,
          {clean_pct('per_hispanic')} AS hispanic_pct,
          health_source, health_n_backfilled,
          CASE WHEN pres_tot_2016 >= {MIN_VOTES} THEN pres_margin_2016 * 100 END AS pres_margin_2016,
          CASE WHEN pres_tot_2020 >= {MIN_VOTES} THEN pres_margin_2020 * 100 END AS pres_margin_2020,
          CASE WHEN pres_tot_2016 >= {MIN_VOTES} AND pres_tot_2020 >= {MIN_VOTES}
               THEN (pres_margin_2020 - pres_margin_2016) * 100 END AS pres_swing,
          pres_dem_2016, pres_rep_2016, pres_tot_2016,
          pres_dem_2020, pres_rep_2020, pres_tot_2020,
          {', '.join(metric_selects)}
        FROM read_parquet('{RAW.as_posix()}')
        """
    )
    n_total = con.execute("SELECT count(*) FROM j").fetchone()[0]

    # True national two-party margins over covered ZCTAs (vote-weighted, not ZCTA-weighted).
    nat = records(con.execute(
        """
        SELECT 100 * (sum(pres_dem_2016) - sum(pres_rep_2016)) / (sum(pres_dem_2016) + sum(pres_rep_2016)) AS m16,
               100 * (sum(pres_dem_2020) - sum(pres_rep_2020)) / (sum(pres_dem_2020) + sum(pres_rep_2020)) AS m20
        FROM j
        """
    ).fetchdf())[0]
    nat_m16 = round(float(nat["m16"]), 2)
    nat_m20 = round(float(nat["m20"]), 2)
    nat_swing = round(nat_m20 - nat_m16, 2)

    politics_defs = [
        dict(
            metric_id="pres_margin_2020",
            label="2020 presidential margin",
            short="2020 margin",
            desc="Two-party presidential margin (Dem minus Rep), 2020, in percentage points; positive = more Democratic",
            benchmark=nat_m20,
        ),
        dict(
            metric_id="pres_swing",
            label="2016 to 2020 presidential swing",
            short="2016-20 swing",
            desc="Change in the two-party presidential margin from 2016 to 2020, in percentage points; positive = shifted toward Democrats",
            benchmark=nat_swing,
        ),
    ]

    catalog_add: list[dict[str, Any]] = []
    for pdef in politics_defs:
        mid = pdef["metric_id"]
        row = records(con.execute(
            f"""
            SELECT count({mid}) n, count(*) - count({mid}) miss,
                   min({mid}) mn, max({mid}) mx,
                   avg({mid}) mean,
                   quantile_cont({mid}, 0.02) p2,
                   quantile_cont({mid}, 0.90) p90,
                   quantile_cont({mid}, 0.98) p98,
                   sum(CASE WHEN {mid} > 0 THEN population ELSE 0 END) dem_pop,
                   sum(population) FILTER (WHERE {mid} IS NOT NULL) tot_pop
            FROM j
            """
        ).fetchdf())[0]
        half = math.ceil(max(abs(float(row["p2"])), abs(float(row["p98"]))))
        domain = [-half, 0, half]
        bench = pdef["benchmark"]
        p90 = round(float(row["p90"]), 1)

        catalog_add.append({
            "metric_id": mid,
            "label": pdef["label"],
            "short_label": pdef["short"],
            "topic": "Politics",
            "kind": "political",
            "unit": "points",
            "format": "+.1f",
            "lower_is_better": False,
            "domain": domain,
            "scale_kind": "diverging",
            "benchmark_kind": "national_vote_weighted",
            "benchmark": bench,
            "p90": p90,
            "denominator": "two-party presidential votes",
            "description": pdef["desc"],
            "source": source,
            "source_url": SOURCE_URL,
            "source_from": "parquet",
            "source_column": mid,
            "source_year": 2020,
            "vintage_note": "Precinct returns 2016 & 2020; RLCR disaggregation (Fekrazad 2025)",
            "confidence_interval_available": False,
            "suppression_rule": f"Masked where a year has fewer than {MIN_VOTES} fractional two-party votes",
            "missingness_note": f"{int(row['miss'])} of {n_total} ZCTAs missing",
            "n_zip": int(row["n"]),
            "missing_count": int(row["miss"]),
            "value_min": round(float(row["mn"]), 1),
            "value_max": round(float(row["mx"]), 1),
            "native_rows": int(row["n"]),
            "mixed_rows": 0,
            "aggregated_rows": 0,
            "no_geometry_rows": 0,
        })

        vals = con.execute(f"SELECT zip, round({mid}, 1) v FROM j WHERE {mid} IS NOT NULL").fetchall()
        write(f"map_values/{mid}.json", {
            "metric_id": mid,
            "join_key": "zip",
            "unit": "points",
            "domain": domain,
            "benchmark": bench,
            "values": {z: finite_or_none(v) for z, v in vals},
            "source": source,
            "source_year": 2020,
            "generated_at": generated_at,
        })

        # ---- charts payload (same shape as the health measures) ----
        def ranked(order: str) -> list[dict[str, Any]]:
            return records(con.execute(
                f"""
                SELECT zip, place AS city, state, round({mid}, 1) AS value,
                       population, round({mid} - {bench}, 1) AS gap,
                       NULL AS health_source, 0 AS health_n_backfilled
                FROM j
                WHERE {mid} IS NOT NULL AND population >= 250
                ORDER BY {mid} {order}, population DESC
                LIMIT 20
                """
            ).fetchdf())

        lo, hi = con.execute(
            f"SELECT quantile_cont({mid}, 0.01), quantile_cont({mid}, 0.99) FROM j WHERE {mid} IS NOT NULL"
        ).fetchone()
        lo, hi = float(lo), float(hi)
        if hi <= lo:
            hi = lo + 1
        edges = np.linspace(lo, hi, 41)
        counts = records(con.execute(
            f"""
            SELECT least(39, greatest(0, floor(({mid} - {lo}) / ({hi} - {lo}) * 40)))::INT b, count(*) c
            FROM j WHERE {mid} IS NOT NULL GROUP BY b ORDER BY b
            """
        ).fetchdf())
        cmap = {int(r["b"]): int(r["c"]) for r in counts}
        bins = [
            {"x0": round(float(edges[i]), 2), "x1": round(float(edges[i + 1]), 2), "count": cmap.get(i, 0)}
            for i in range(40)
        ]

        corrs: list[dict[str, Any]] = []
        for ctx, cmeta in CONTEXT.items():
            rho, n = con.execute(
                f"""
                SELECT corr(rx, ry) rho, count(*) n
                FROM (
                  SELECT rank() OVER (ORDER BY {ctx}) rx, rank() OVER (ORDER BY {mid}) ry
                  FROM j WHERE {ctx} IS NOT NULL AND {mid} IS NOT NULL
                )
                """
            ).fetchone()
            corrs.append({
                "context": ctx,
                "label": cmeta["label"],
                "short": cmeta["short"],
                "rho": round(float(rho), 3) if rho is not None else None,
                "n": int(n),
            })
        corrs.sort(key=lambda d: abs(d["rho"] or 0), reverse=True)

        grad_rows = records(con.execute(
            f"""
            WITH d AS (
              SELECT {mid} v, population pop, adi_national_rank adi,
                     ntile(10) OVER (ORDER BY adi_national_rank) decile
              FROM j WHERE adi_national_rank IS NOT NULL AND {mid} IS NOT NULL
            )
            SELECT decile, sum(v * pop) / sum(pop) wmean, stddev_samp(v) sd, count(*) n,
                   min(adi) adi_lo, max(adi) adi_hi
            FROM d GROUP BY decile ORDER BY decile
            """
        ).fetchdf())
        gradient = []
        for g in grad_rows:
            se = (float(g["sd"] or 0) / (int(g["n"]) ** 0.5)) if g["n"] else 0
            wmean = float(g["wmean"])
            gradient.append({
                "decile": int(g["decile"]),
                "value": round(wmean, 2),
                "lci": round(wmean - 1.96 * se, 2),
                "uci": round(wmean + 1.96 * se, 2),
                "n": int(g["n"]),
                "adi_lo": round(float(g["adi_lo"]), 1),
                "adi_hi": round(float(g["adi_hi"]), 1),
            })
        gap_td = round(gradient[-1]["value"] - gradient[0]["value"], 1) if len(gradient) >= 2 else None

        full = con.execute(
            f"""
            SELECT zip, place AS city, state, adi_national_rank x, {mid} y, population
            FROM j WHERE adi_national_rank IS NOT NULL AND {mid} IS NOT NULL
            """
        ).fetchdf()
        xx, yy = full["x"].to_numpy(float), full["y"].to_numpy(float)
        if len(full) >= 2:
            gx = np.linspace(np.quantile(xx, 0.01), np.quantile(xx, 0.99), 40)
            loess_pts = loess(xx, yy, gx)
            lp = np.array(loess_pts)
            pred = np.interp(xx, lp[:, 0], lp[:, 1])
            full = full.assign(resid=yy - pred)
            worse = records(full.nlargest(8, "resid")[["zip", "city", "state", "x", "y", "resid"]].round(2))
            better = records(full.nsmallest(8, "resid")[["zip", "city", "state", "x", "y", "resid"]].round(2))
        else:
            loess_pts, worse, better = [], [], []
        sample = records(con.execute(
            f"""
            SELECT zip, round(adi_national_rank, 1) x, round({mid}, 1) y
            FROM j WHERE adi_national_rank IS NOT NULL AND {mid} IS NOT NULL
            USING SAMPLE 1800 ROWS (reservoir, 42)
            """
        ).fetchdf())

        landslide_pop = con.execute(
            f"SELECT sum(CASE WHEN abs({mid}) >= 30 THEN population ELSE 0 END) FROM j WHERE {mid} IS NOT NULL"
        ).fetchone()[0]
        write(f"charts/{mid}.json", {
            "metric_id": mid,
            "benchmark": bench,
            "high_burden_threshold": p90,
            "summary": {
                "national_average": bench,
                "unweighted_mean": round(float(row["mean"]), 2),
                "n_zip": int(row["n"]),
                "high_burden_population": int(landslide_pop or 0),
                "total_population": int(row["tot_pop"]),
                "high_burden_pct_pop": round(100 * int(landslide_pop or 0) / max(int(row["tot_pop"]), 1), 1),
                "native_rows": int(row["n"]),
                "mixed_rows": 0,
                "aggregated_rows": 0,
            },
            "ranked_top": ranked("DESC"),
            "ranked_bottom": ranked("ASC"),
            "distribution": {"bins": bins, "benchmark": bench, "p90": p90},
            "correlations": corrs,
            "disparity_gradient": {"by": "adi_national_rank", "deciles": gradient, "top_minus_bottom": gap_td},
            "scatter": {
                "context": "adi_national_rank",
                "points": sample,
                "loess": loess_pts,
                "worse_than_expected": worse,
                "better_than_expected": better,
            },
            "source": source,
            "generated_at": generated_at,
        })

        # ---- insights ----
        is_margin = mid == "pres_margin_2020"
        top_d = ranked("DESC")[0]
        top_r = ranked("ASC")[0]
        topc = corrs[0] if corrs else None
        if is_margin:
            bench_claim = (
                f"Across covered ZCTAs, the national two-party 2020 margin is D+{abs(nat_m20)} "
                f"(positive = more Democratic)."
            )
        else:
            direction = "toward Democrats" if nat_swing >= 0 else "toward Republicans"
            bench_claim = f"Nationally the two-party margin shifted {abs(nat_swing)} points {direction} from 2016 to 2020."
        insights = [{
            "insight_id": f"{mid}_national",
            "type": "benchmark",
            "rank": 1,
            "claim": bench_claim,
            "value": bench,
            "supporting_geo_id": None,
            "supporting_chart": "distribution",
            "severity": "info",
            "method_note": "Vote-weighted two-party margin over covered ZCTAs; fractional disaggregated votes.",
        }]
        if gap_td is not None:
            lean_dir = "more Democratic" if gap_td >= 0 else "more Republican"
            insights.append({
                "insight_id": f"{mid}_adi_gradient",
                "type": "adi_gradient",
                "rank": 2,
                "claim": f"The most-deprived ADI tenth averages {abs(gap_td)} points {lean_dir} than the least-deprived tenth.",
                "value": gap_td,
                "supporting_geo_id": None,
                "supporting_chart": "disparity_gradient",
                "severity": "medium",
                "method_note": "Population-weighted ADI national-rank decile means; ecological, not causal.",
            })
        if topc and topc["rho"] is not None:
            insights.append({
                "insight_id": f"{mid}_corr",
                "type": "correlation",
                "rank": 3,
                "claim": f"Across ZCTAs, {pdef['short'].lower()} is most associated with "
                         f"{topc['label'].lower()} (Spearman rho={topc['rho']}, n={topc['n']:,}).",
                "value": topc["rho"],
                "supporting_geo_id": None,
                "supporting_chart": "scatter",
                "severity": "info",
                "method_note": "Spearman rank correlation; place-level association only.",
            })
        hi_word = "Most Democratic" if is_margin else "Biggest shift toward Democrats"
        lo_word = "Most Republican" if is_margin else "Biggest shift toward Republicans"
        insights.append({
            "insight_id": f"{mid}_top_place",
            "type": "extreme",
            "rank": 4,
            "claim": f"{hi_word}: {top_d['zip']} ({top_d['city']}, {top_d['state']}) at {top_d['value']:+} points; "
                     f"{lo_word.lower()}: {top_r['zip']} ({top_r['city']}, {top_r['state']}) at {top_r['value']:+}.",
            "value": top_d["value"],
            "supporting_geo_id": top_d["zip"],
            "supporting_chart": "ranked",
            "severity": "info",
            "method_note": "Extreme ZCTA values among places with at least 250 residents.",
        })
        insights.append({
            "insight_id": f"{mid}_landslide",
            "type": "affected",
            "rank": 5,
            "claim": (
                f"About {int(landslide_pop or 0) / 1e6:.0f} million people live in landslide ZCTAs "
                f"(absolute {'margin' if is_margin else 'swing'} of 30+ points)."
            ),
            "value": int(landslide_pop or 0),
            "supporting_geo_id": None,
            "supporting_chart": "map",
            "severity": "info",
            "method_note": "Population in ZCTAs where the absolute value is 30 points or more.",
        })
        write(f"insights/{mid}.json", {"metric_id": mid, "insights": insights, "generated_at": generated_at})

    # ---- catalog upsert ----
    kept = [m for m in catalog["metrics"] if m.get("kind") != "political"]
    catalog["metrics"] = kept + catalog_add
    catalog.setdefault("sources", {})["politics_parquet"] = str(RAW.relative_to(ROOT)).replace("\\", "/")
    catalog["sources"]["politics_metadata"] = str(META_PATH.relative_to(ROOT)).replace("\\", "/")
    CATALOG.write_text(json.dumps(catalog, separators=(",", ":"), allow_nan=False), encoding="utf-8")

    # ---- per-zip compact politics for profile shards ----
    pz = con.execute(
        """
        SELECT zip, round(pres_margin_2016, 1), round(pres_margin_2020, 1), round(pres_swing, 1)
        FROM j
        WHERE pres_margin_2016 IS NOT NULL OR pres_margin_2020 IS NOT NULL
        """
    ).fetchall()
    write("analytics/politics_by_zip.json", {
        "fields": ["margin_2016", "margin_2020", "swing"],
        "zips": {z: [finite_or_none(a), finite_or_none(b), finite_or_none(c)] for z, a, b, c in pz},
        "generated_at": generated_at,
    })

    # ---- story payload ----
    bin_case = " ".join(
        f"WHEN pres_margin_2020 < {b['hi']} THEN '{b['id']}'" for b in LEAN_BINS[:-1]
    ) + f" ELSE '{LEAN_BINS[-1]['id']}'"
    metric_means = ", ".join(
        f"sum({mid} * population) / sum(population) FILTER (WHERE {mid} IS NOT NULL) AS {mid}"
        for mid in health_ids
    )
    bins_df = con.execute(
        f"""
        SELECT CASE {bin_case} END AS bin,
               count(*) n, sum(population) pop,
               sum(pres_margin_2020 * population) / sum(population) margin,
               sum(pres_swing * population) / sum(population) FILTER (WHERE pres_swing IS NOT NULL) swing,
               sum(adi_national_rank * population) / sum(population) FILTER (WHERE adi_national_rank IS NOT NULL) adi,
               sum(median_income_clean * population) / sum(population) FILTER (WHERE median_income_clean IS NOT NULL) income,
               sum(college_pct * population) / sum(population) FILTER (WHERE college_pct IS NOT NULL) college,
               {metric_means}
        FROM j
        WHERE pres_margin_2020 IS NOT NULL
        GROUP BY 1
        """
    ).fetchdf()
    bin_rows = {r["bin"]: r for r in records(bins_df)}
    lean_bins = []
    for b in LEAN_BINS:
        r = bin_rows.get(b["id"])
        if r is None:
            continue
        lean_bins.append({
            "id": b["id"],
            "label": b["label"],
            "lo": None if b["lo"] < -1e8 else b["lo"],
            "hi": None if b["hi"] > 1e8 else b["hi"],
            "n": int(r["n"]),
            "population": int(r["pop"]),
            "margin": round(r["margin"], 1),
            "swing": round(r["swing"], 2) if r["swing"] is not None else None,
            "context": {
                "adi": round(r["adi"], 1) if r["adi"] is not None else None,
                "income": round(r["income"], 0) if r["income"] is not None else None,
                "college": round(r["college"], 1) if r["college"] is not None else None,
            },
            "metrics": {mid: (round(r[mid], 2) if r[mid] is not None else None) for mid in health_ids},
        })

    # correlations of each measure with margin and swing + D/R gap
    metric_rows = []
    for mid in health_ids:
        rho_m, n_m = con.execute(
            f"""
            SELECT corr(rx, ry), count(*) FROM (
              SELECT rank() OVER (ORDER BY pres_margin_2020) rx, rank() OVER (ORDER BY {mid}) ry
              FROM j WHERE pres_margin_2020 IS NOT NULL AND {mid} IS NOT NULL)
            """
        ).fetchone()
        rho_s, n_s = con.execute(
            f"""
            SELECT corr(rx, ry), count(*) FROM (
              SELECT rank() OVER (ORDER BY pres_swing) rx, rank() OVER (ORDER BY {mid}) ry
              FROM j WHERE pres_swing IS NOT NULL AND {mid} IS NOT NULL)
            """
        ).fetchone()
        dem, rep = con.execute(
            f"""
            SELECT sum(CASE WHEN pres_margin_2020 > 5 THEN {mid} * population END)
                     / sum(CASE WHEN pres_margin_2020 > 5 THEN population END),
                   sum(CASE WHEN pres_margin_2020 < -5 THEN {mid} * population END)
                     / sum(CASE WHEN pres_margin_2020 < -5 THEN population END)
            FROM j WHERE {mid} IS NOT NULL
            """
        ).fetchone()
        dem = finite_or_none(dem)
        rep = finite_or_none(rep)
        meta_m = by_id[mid]
        metric_rows.append({
            "id": mid,
            "label": meta_m["label"],
            "short": meta_m["short_label"],
            "topic": meta_m["topic"],
            "rho_margin": round(float(rho_m), 3) if rho_m is not None else None,
            "rho_swing": round(float(rho_s), 3) if rho_s is not None else None,
            "dem": round(dem, 2) if dem is not None else None,
            "rep": round(rep, 2) if rep is not None else None,
            "gap": round(rep - dem, 2) if dem is not None and rep is not None else None,
        })
    metric_rows.sort(key=lambda r: abs(r["rho_margin"] or 0), reverse=True)

    # realignment curve: 2016 margin (x) vs swing (y)
    sw = con.execute(
        "SELECT pres_margin_2016 x, pres_swing y FROM j WHERE pres_margin_2016 IS NOT NULL AND pres_swing IS NOT NULL"
    ).fetchdf()
    gx = np.linspace(np.quantile(sw["x"], 0.02), np.quantile(sw["x"], 0.98), 40)
    swing_curve = loess(sw["x"].to_numpy(float), sw["y"].to_numpy(float), gx)
    swing_sample = records(con.execute(
        """
        SELECT zip, round(pres_margin_2016, 1) x, round(pres_swing, 1) y
        FROM j WHERE pres_margin_2016 IS NOT NULL AND pres_swing IS NOT NULL
        USING SAMPLE 1500 ROWS (reservoir, 42)
        """
    ).fetchdf())

    def shift_list(order: str) -> list[dict[str, Any]]:
        return records(con.execute(
            f"""
            SELECT zip, place AS city, state, population,
                   round(pres_margin_2016, 1) m16, round(pres_margin_2020, 1) m20, round(pres_swing, 1) swing
            FROM j
            WHERE pres_swing IS NOT NULL AND population >= {SWING_POP_FLOOR}
            ORDER BY pres_swing {order}
            LIMIT 10
            """
        ).fetchdf())

    counts = records(con.execute(
        """
        SELECT count(*) FILTER (WHERE pres_swing < 0) shift_r,
               count(*) FILTER (WHERE pres_swing > 0) shift_d,
               count(*) FILTER (WHERE pres_margin_2020 < 0) lean_r,
               count(*) FILTER (WHERE pres_margin_2020 > 0) lean_d,
               sum(population) FILTER (WHERE pres_margin_2020 < 0) pop_r,
               sum(population) FILTER (WHERE pres_margin_2020 > 0) pop_d,
               count(pres_swing) n_swing, count(pres_margin_2020) n_margin
        FROM j
        """
    ).fetchdf())[0]

    write("analytics/politics.json", {
        "national": {
            "margin_2016": nat_m16,
            "margin_2020": nat_m20,
            "swing": nat_swing,
            "n_margin": int(counts["n_margin"]),
            "n_swing": int(counts["n_swing"]),
            "zcta_lean_r": int(counts["lean_r"]),
            "zcta_lean_d": int(counts["lean_d"]),
            "pop_lean_r": int(counts["pop_r"]),
            "pop_lean_d": int(counts["pop_d"]),
            "zcta_shift_r": int(counts["shift_r"]),
            "zcta_shift_d": int(counts["shift_d"]),
            "min_votes": MIN_VOTES,
        },
        "method": (
            f"Precinct returns disaggregated to ZCTAs (Fekrazad 2025, RLCR); two-party margins in "
            f"percentage points, positive = more Democratic. ZCTA-years with fewer than {MIN_VOTES} "
            f"fractional votes are masked. Group rates are population-weighted; associations are "
            f"ecological (about places, not voters)."
        ),
        "source": source,
        "source_url": SOURCE_URL,
        "lean_bins": lean_bins,
        "metrics": metric_rows,
        "swing_curve": {"points": swing_sample, "loess": swing_curve,
                        "x": "pres_margin_2016", "y": "pres_swing"},
        "shift_right": shift_list("ASC"),
        "shift_left": shift_list("DESC"),
        "generated_at": generated_at,
    })

    print(f"politics payloads written: n_margin={int(counts['n_margin']):,}, n_swing={int(counts['n_swing']):,}")
    print(f"national margins: 2016 {nat_m16:+}, 2020 {nat_m20:+}, swing {nat_swing:+}")
    top = metric_rows[0]
    print(f"strongest margin association: {top['short']} rho={top['rho_margin']}")


if __name__ == "__main__":
    main()
