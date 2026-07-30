import MethodsSection from "./MethodsSection";
import SourcesSection from "./SourcesSection";

// About is the reference view: who made the atlas, then the full methods and sources
// appendices that used to sit in collapsed accordions under the map. Server-rendered,
// so the numbers and provenance stay crawlable.
export default function AboutSection() {
  return (
    <div className="about-wrap">
      <div className="about-lede">
        <p className="about-credit">
          Created by{" "}
          <a href="https://vishalsingh.org" target="_blank" rel="noopener noreferrer">
            Vishal Singh
          </a>{" "}
          and Uma Huggins.
        </p>
        <p className="about-blurb">
          An atlas of health, social need, and political geography for all 32,409 U.S.
          ZIP/ZCTA areas — built to make the neighborhood-level structure of American health
          legible: how burden tracks deprivation, how the four Americas cluster, and where
          politics and health move together.
        </p>
      </div>

      <section className="about-block" aria-labelledby="about-methods">
        <h2 className="about-h" id="about-methods">
          <span className="about-index">Appendix A</span>
          Methods &amp; limitations
        </h2>
        <p className="about-sub">
          Modeled estimates, ZIP vs ZCTA, view modes, the political layers, missingness
        </p>
        <MethodsSection />
      </section>

      <section className="about-block" aria-labelledby="about-sources">
        <h2 className="about-h" id="about-sources">
          <span className="about-index">Appendix B</span>
          Sources &amp; provenance
        </h2>
        <p className="about-sub">Underlying files, vintages, and per-measure provenance</p>
        <SourcesSection />
      </section>
    </div>
  );
}
