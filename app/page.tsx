import { readFile } from "node:fs/promises";
import path from "node:path";
import anime from "../data/anime.json";
import stagingAnime from "../data/import/staging-anime.json";
import { AnimeRadar } from "./components/anime-radar";
import type { Anime, DiscoveryReviewItem, DiscoveryReviewReport, ImportReport, ReviewAnimeCandidate, ReviewDataSource } from "./types";

export default async function Home() {
  const importReport = await readImportReport();
  const discoveryReview = await readDiscoveryReview();
  const reviewDataset = buildReviewDataset(stagingAnime as ReviewAnimeCandidate[], discoveryReview);

  return <AnimeRadar importReport={importReport} initialAnime={anime as Anime[]} reviewAnime={reviewDataset.items} reviewDataSource={reviewDataset.source} />;
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

function buildReviewDataset(stagingCandidates: ReviewAnimeCandidate[], review: DiscoveryReviewReport | null): { items: ReviewAnimeCandidate[]; source: ReviewDataSource } {
  if (!review) return { items: stagingCandidates, source: "staging-anime.json fallback" };

  const stagingByKey = new Map(stagingCandidates.map((candidate) => [candidateKey(candidate), candidate]));
  const stagingBySourceUrl = new Map(stagingCandidates.filter((candidate) => candidate.sourceUrl).map((candidate) => [candidate.sourceUrl, candidate]));

  return {
    items: (review.items ?? []).map((item) => toReviewCandidate(item, stagingByKey.get(discoveryItemKey(item)) ?? stagingBySourceUrl.get(item.sourceUrl))),
    source: "discovery-review.json",
  };
}

function toReviewCandidate(item: DiscoveryReviewItem, stagingMatch?: ReviewAnimeCandidate): ReviewAnimeCandidate {
  return {
    ...stagingMatch,
    title: item.title,
    originalTitle: item.originalTitle,
    year: item.year,
    episodes: item.episodes,
    status: item.status as Anime["status"],
    genres: item.genres ?? stagingMatch?.genres ?? [],
    tags: item.tags ?? stagingMatch?.tags ?? [],
    summary: item.summary ?? stagingMatch?.summary ?? "",
    externalSummary: item.externalSummary ?? stagingMatch?.externalSummary,
    sourceGenres: item.sourceGenres ?? item.genres ?? stagingMatch?.sourceGenres ?? [],
    sourceRating: item.sourceRating,
    personalFitScore: stagingMatch?.personalFitScore ?? 0,
    whyForMe: stagingMatch?.whyForMe ?? "",
    risk: stagingMatch?.risk ?? "",
    sourceName: item.sourceName ?? stagingMatch?.sourceName ?? "AniList",
    sourceUrl: item.sourceUrl,
    aliases: item.aliases ?? stagingMatch?.aliases,
    format: item.format,
    anilistFormat: item.format,
    preliminaryFitScore: item.preliminaryFitScore,
    recommendation: item.recommendation,
    reviewPriority: item.reviewPriority,
    matchReasons: item.matchReasons ?? [],
    riskReasons: item.riskReasons ?? [],
    reviewNote: item.reviewNote ?? "",
  };
}

function candidateKey(item: Pick<ReviewAnimeCandidate, "title" | "year">) {
  return `${normalizeKey(item.title)}::${item.year ?? ""}`;
}

function discoveryItemKey(item: Pick<DiscoveryReviewItem, "title" | "year">) {
  return `${normalizeKey(item.title)}::${item.year ?? ""}`;
}

function normalizeKey(value: string) {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[\p{P}\p{S}\s_]+/gu, "");
}
