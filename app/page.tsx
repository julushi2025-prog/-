import { readFile } from "node:fs/promises";
import path from "node:path";
import anime from "../data/anime.json";
import stagingAnime from "../data/import/staging-anime.json";
import { AnimeRadar } from "./components/anime-radar";
import type { Anime, DiscoveryReviewReport, ImportReport, ReviewAnimeCandidate } from "./types";

export default async function Home() {
  const importReport = await readImportReport();
  const discoveryReview = await readDiscoveryReview();
  const reviewAnime = mergeDiscoveryReview(stagingAnime as ReviewAnimeCandidate[], discoveryReview);

  return <AnimeRadar importReport={importReport} initialAnime={anime as Anime[]} reviewAnime={reviewAnime} />;
}

async function readImportReport() {
  try {
    const file = await readFile(path.join(process.cwd(), "reports", "import-report.json"), "utf8");
    return JSON.parse(file) as ImportReport;
  } catch {
    return null;
  }
}


async function readDiscoveryReview() {
  try {
    const file = await readFile(path.join(process.cwd(), "reports", "discovery-review.json"), "utf8");
    return JSON.parse(file) as DiscoveryReviewReport;
  } catch {
    return null;
  }
}

function mergeDiscoveryReview(candidates: ReviewAnimeCandidate[], review: DiscoveryReviewReport | null) {
  if (!review?.items?.length) return candidates;
  const reviewByKey = new Map(review.items.map((item) => [`${normalizeKey(item.title)}::${item.year ?? ""}`, item]));

  return candidates.map((candidate) => {
    const item = reviewByKey.get(`${normalizeKey(candidate.title)}::${candidate.year ?? ""}`);
    if (!item) return candidate;
    return {
      ...candidate,
      preliminaryFitScore: item.preliminaryFitScore,
      recommendation: item.recommendation,
      reviewPriority: item.reviewPriority,
      matchReasons: item.matchReasons,
      riskReasons: item.riskReasons,
      reviewNote: item.reviewNote,
    };
  });
}

function normalizeKey(value: string) {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[\p{P}\p{S}\s_]+/gu, "");
}
