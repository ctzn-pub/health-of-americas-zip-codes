"use client";
import type { Insight } from "@/lib/types";

interface Props {
  insights: Insight[];
  onSelect?: (zip: string | null) => void;
  metricLabel: string;
  political?: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  benchmark: "National average",
  adi_gradient: "Disparity",
  correlation: "Tracks with",
  extreme: "Highest burden",
  affected: "People affected",
};
const POLITICAL_TYPE_LABEL: Record<string, string> = {
  ...TYPE_LABEL,
  benchmark: "National margin",
  extreme: "Extremes",
  affected: "Landslide areas",
};

export default function InsightRail({ insights, onSelect, metricLabel, political }: Props) {
  const typeLabel = political ? POLITICAL_TYPE_LABEL : TYPE_LABEL;
  return (
    <section className="rail" aria-label={`Key findings for ${metricLabel}`}>
      <div className="rail-head">
        <h2>What the data says</h2>
      </div>
      {insights
        .slice()
        .sort((a, b) => a.rank - b.rank)
        .map((ins) => {
          const clickable = !!ins.supporting_geo_id;
          const Cmp: any = clickable ? "button" : "div";
          return (
            <Cmp
              key={ins.insight_id}
              className={`insight sev-${ins.severity}`}
              {...(clickable
                ? {
                    type: "button",
                    onClick: () => onSelect?.(ins.supporting_geo_id),
                    title: "Select this ZIP on the map",
                  }
                : {})}
            >
              <div className="chip">{typeLabel[ins.type] ?? ins.type}</div>
              <div className="claim">{ins.claim}</div>
              <div className="method">{ins.method_note}</div>
            </Cmp>
          );
        })}
    </section>
  );
}
