"use client";
import Link from "next/link";
import PoliticsCorrBars, {
  PoliticsLeanLines,
  PoliticsSwingScatter,
} from "@/components/stories/PoliticsCharts";
import { StoryCaveat, StoryFig, StoryHead, StoryNext } from "@/components/stories/StoryShell";
import { loadPolitics } from "@/lib/data";
import { fmtPop, marginFmt } from "@/lib/format";
import { STORIES } from "@/lib/stories";
import { usePayload } from "@/lib/useData";
import StoryLoading from "./StoryLoading";

const story = STORIES.find((s) => s.slug === "red-blue-health")!;

function rho(v: number | null | undefined) {
  return v == null ? "—" : v.toFixed(2);
}

export default function RedBlueHealthStory() {
  const politics = usePayload(loadPolitics);
  if (!politics) return <StoryLoading />;

  const nat = politics.national;
  const byId = new Map(politics.metrics.map((m) => [m.id, m]));
  const copd = byId.get("copd")!;
  const chd = byId.get("chd")!;
  const smoking = byId.get("smoking")!;
  const obesity = byId.get("obesity")!;
  const diabetes = byId.get("diabetes")!;
  const depression = byId.get("depression")!;
  const food = byId.get("food_insecurity")!;
  const loneliness = politics.metrics.find((m) => (m.rho_margin ?? 0) > 0);
  const topSwing = politics.metrics
    .slice()
    .sort((a, b) => Math.abs(b.rho_swing ?? 0) - Math.abs(a.rho_swing ?? 0))[0];
  const rgv = politics.shift_right[0];

  return (
    <main id="main" className="story-wrap">
      <StoryHead
        story={story}
        meta={`Precinct returns disaggregated to ZCTAs (Fekrazad 2025) · ${nat.n_margin.toLocaleString()} ZIP/ZCTA areas with a 2020 margin · ${nat.n_swing.toLocaleString()} with a 2016→2020 swing`}
      />
      <article className="story-body">
        <p>
          The atlas now carries a political layer: precinct-level presidential returns from 2016 and
          2020, statistically disaggregated to the same ZIP/ZCTA grid as the 26 health measures.
          Across covered areas the two-party vote ran {marginFmt(nat.margin_2016)} in 2016 and{" "}
          {marginFmt(nat.margin_2020)} in 2020 — within a whisker of the official national results,
          which is the first sanity check on the method.
        </p>
        <p>
          The geography is lopsided in a familiar way. <strong className="big-number">
          {nat.zcta_lean_r.toLocaleString()} ZIP codes leaned Republican in 2020 and{" "}
          {nat.zcta_lean_d.toLocaleString()} leaned Democratic</strong> — but the smaller blue set
          contains more people ({fmtPop(nat.pop_lean_d)} vs {fmtPop(nat.pop_lean_r)}). Land votes
          red; density votes blue. Any health comparison between them is really a comparison between
          two kinds of places — rural and small-town America against metro America — and everything
          that follows should be read that way.
        </p>

        <h2>Chronic disease leans red; isolation leans blue</h2>
        <p>
          Line up all 26 measures against the 2020 margin and the pattern is not subtle. The
          strongest associations are all higher in Republican-leaning ZIP codes: COPD (ρ ={" "}
          {rho(copd.rho_margin)}), coronary heart disease ({rho(chd.rho_margin)}), smoking (
          {rho(smoking.rho_margin)}), high blood pressure, obesity ({rho(obesity.rho_margin)}), and
          disability. In population-weighted terms, ZIP codes at least five points more Republican
          than even average {smoking.rep?.toFixed(1)}% adult smoking against {smoking.dem?.toFixed(1)}%
          in comparably Democratic ones, and {copd.rep?.toFixed(1)}% COPD against{" "}
          {copd.dem?.toFixed(1)}%.
        </p>
        <p>
          The short list that runs the other way is just as telling: {loneliness ? (
            <>the measures higher in Democratic-leaning ZIP codes are loneliness (ρ = {rho(loneliness.rho_margin)}), lack of
            social and emotional support, and housing insecurity</>
          ) : (
            <>the measures higher in Democratic-leaning ZIP codes are social rather than cardiometabolic</>
          )} — the urban isolation bundle, not the chronic-disease bundle. Food insecurity splits the
          difference almost exactly (ρ = {rho(food.rho_margin)}): it is high in poor rural red ZIP
          codes and poor urban blue ones alike.
        </p>

        <StoryFig
          title="All 26 measures against the 2020 presidential margin"
          sub="Spearman rank correlation across ZIP/ZCTA areas; bars point toward the party whose areas carry more of the measure"
          caption={
            <>
              Bars are the correlation with the 2020 two-party margin; gold diamonds are the
              correlation with the 2016→2020 swing. The two orderings disagree in instructive ways —
              diabetes and food insecurity barely track the level of the margin but strongly track
              the shift toward Republicans.
            </>
          }
        >
          <PoliticsCorrBars data={politics} />
        </StoryFig>

        <h2>Several measures are worst at both extremes</h2>
        <p>
          Sorting ZIP codes into seven lean bins, from safe Republican (30+ points) to safe
          Democratic, shows two shapes. Smoking, COPD, obesity, and depression fall more or less
          monotonically from the red end to the blue end — depression runs from{" "}
          {politics.lean_bins[0]?.metrics.depression?.toFixed(1)}% in safe-Republican ZIP codes to{" "}
          {politics.lean_bins[politics.lean_bins.length - 1]?.metrics.depression?.toFixed(1)}% in
          safe-Democratic ones. But diabetes bends into a U: it is lowest in the contested middle
          (Lean D bins around {byId.get("diabetes")?.dem != null ? `${politics.lean_bins[4]?.metrics.diabetes?.toFixed(1)}%` : "its minimum"})
          and rises toward both landslide ends, because landslide ZIP codes — deep-rural red and
          segregated urban blue alike — are poorer than competitive ones. The tossup and lean bins
          are where incomes peak and deprivation bottoms out.
        </p>

        <StoryFig
          title="Selected measures across the political spectrum"
          sub="Population-weighted means in seven 2020-margin bins, indexed to each measure's average (100)"
          caption={
            <>
              Indexing puts measures with very different prevalence on one scale. Binge drinking is
              the flattest line in the atlas — and the only behavioral measure that peaks in the
              contested middle. Diabetes shows the clearest U shape.
            </>
          }
        >
          <PoliticsLeanLines
            data={politics}
            ids={["smoking", "copd", "obesity", "depression", "diabetes", "binge"]}
          />
        </StoryFig>

        <h2>The swing tracked health burden more than the margin did</h2>
        <p>
          Between 2016 and 2020 the country as a whole moved {Math.abs(nat.swing).toFixed(1)} points
          toward the Democrats, but {nat.zcta_shift_r.toLocaleString()} ZIP codes — nearly four in
          ten — moved the other way. What distinguishes them is health. The strongest swing
          correlate in the atlas is physical inactivity (ρ = {rho(topSwing.rho_swing)}), followed by
          fair-or-poor self-rated health, diabetes ({rho(diabetes.rho_swing)}), missed dental care,
          and food insecurity ({rho(food.rho_swing)}). Places carrying heavy everyday health burden
          shifted toward Republicans even where their 2016 lean said little about it — food
          insecurity has essentially no correlation with the <em>level</em> of the margin, yet is one
          of the strongest predictors of the rightward <em>shift</em>.
        </p>
        <p>
          The single biggest rightward swings are all in the Rio Grande Valley —{" "}
          {rgv ? (
            <>
              ZIP {rgv.zip} in {rgv.city}, {rgv.state} moved {Math.abs(rgv.swing).toFixed(0)} points
              toward Republicans
            </>
          ) : (
            <>South Texas moved dramatically</>
          )}{" "}
          — heavily Hispanic, high-diabetes, high-poverty border communities. The biggest leftward
          swings cluster around military bases and college towns.
        </p>

        <StoryFig
          title="The realignment curve"
          sub="Each point is a ZIP code: 2016 margin (x) against its 2016→2020 swing (y); the line is a LOESS trend"
          caption={
            <>
              Most of the distribution sits above zero — the national shift toward Democrats — but
              the trend dips below it in heavily Republican and some heavily Democratic territory.
              The deep-red end kept moving right; the contested middle moved left.
            </>
          }
        >
          <PoliticsSwingScatter data={politics} />
        </StoryFig>

        <h2>What this is, and is not</h2>
        <p>
          Precinct votes were allocated to ZCTAs in proportion to modeled household population
          (Fekrazad 2025), so vote counts here are fractional estimates, and ZCTA-years built on
          fewer than {nat.min_votes} votes are masked. Everything is ecological: Republican-leaning{" "}
          <em>places</em> carry more smoking and heart disease; that says nothing about the health of
          individual voters of either party. Politics here is a lens on the same underlying
          geography the rest of the atlas maps — age, density, deprivation, and race — not a cause
          of it. You can map both political layers yourself in the{" "}
          <Link href="/?p=atlas&metric=pres_margin_2020">atlas</Link> (2020 margin, 2016→2020
          swing), and every ZIP snapshot now carries its presidential lean.
        </p>

        <StoryCaveat />
        <StoryNext current="red-blue-health" />
      </article>
    </main>
  );
}
