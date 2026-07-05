"use client";
import { useEffect, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { PageId } from "@/lib/site";
import { STORIES } from "@/lib/stories";
import StoryLoading from "./stories/StoryLoading";

// The atlas and the story articles are client islands loaded on demand; the other
// sections arrive server-rendered as props (compact, crawlable HTML).
const AppClient = dynamic(() => import("@/components/AppClient"), {
  loading: () => (
    <main id="main" className="app">
      <p className="muted" style={{ padding: 40 }}>Loading the atlas…</p>
    </main>
  ),
});

const STORY_COMPONENTS: Record<string, ReturnType<typeof dynamic>> = {
  "one-axis": dynamic(() => import("./stories/OneAxisStory"), { loading: () => <StoryLoading /> }),
  connected: dynamic(() => import("./stories/ConnectedStory"), { loading: () => <StoryLoading /> }),
  "four-americas": dynamic(() => import("./stories/FourAmericasStory"), { loading: () => <StoryLoading /> }),
  gradient: dynamic(() => import("./stories/GradientStory"), { loading: () => <StoryLoading /> }),
  "wealth-gap": dynamic(() => import("./stories/WealthGapStory"), { loading: () => <StoryLoading /> }),
  "diagnosis-gap": dynamic(() => import("./stories/DiagnosisGapStory"), { loading: () => <StoryLoading /> }),
  "tobacco-belt": dynamic(() => import("./stories/TobaccoBeltStory"), { loading: () => <StoryLoading /> }),
  "red-blue-health": dynamic(() => import("./stories/RedBlueHealthStory"), { loading: () => <StoryLoading /> }),
};

export interface SpaSections {
  home: ReactNode;
  stories: ReactNode;
  methods: ReactNode;
  sources: ReactNode;
}

const PAGES: PageId[] = ["home", "atlas", "stories", "story", "methods", "sources"];

export function decodePage(sp: URLSearchParams): { page: PageId; slug: string | null } {
  const raw = sp.get("p");
  const page = PAGES.includes(raw as PageId) ? (raw as PageId) : "home";
  const slug = sp.get("s");
  if (page === "story" && (!slug || !STORIES.some((s) => s.slug === slug))) {
    return { page: "stories", slug: null };
  }
  return { page, slug: page === "story" ? slug : null };
}

export default function SpaShell({ sections }: { sections: SpaSections }) {
  const sp = useSearchParams();
  const { page, slug } = decodePage(new URLSearchParams(sp.toString()));

  // Section switches are soft navigations on "/", so restore the top of the new "page".
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [page, slug]);

  if (page === "atlas") return <AppClient />;
  if (page === "story" && slug) {
    const Story = STORY_COMPONENTS[slug];
    return Story ? <Story /> : sections.stories;
  }
  if (page === "stories") return sections.stories;
  if (page === "methods") return sections.methods;
  if (page === "sources") return sections.sources;
  return sections.home;
}
