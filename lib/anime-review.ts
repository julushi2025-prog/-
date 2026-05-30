import type { ReviewAnimeCandidate } from "../app/types";

export type DiscoveryRecommendation = "recommended" | "maybe" | "low-priority" | "needs-review";
export type DiscoveryReviewPriority = "high" | "medium" | "low" | "manual";

export type DiscoveryReviewItem = {
  title: string;
  originalTitle: string;
  year: number;
  episodes: number;
  format: string;
  status: string;
  genres: string[];
  tags: string[];
  sourceRating: number | null;
  sourceUrl: string;
  preliminaryFitScore: number;
  recommendation: DiscoveryRecommendation;
  reviewPriority: DiscoveryReviewPriority;
  matchReasons: string[];
  riskReasons: string[];
  reviewNote: string;
};

export type DiscoveryReviewReport = {
  generatedAt: string;
  stagingPath: string;
  reportPath: string;
  markdownPath: string;
  counts: Record<DiscoveryRecommendation | "total", number>;
  items: DiscoveryReviewItem[];
};

type Signal = {
  label: string;
  patterns: RegExp[];
  reason: string;
};

const HIGH_WEIGHT_SIGNALS: Signal[] = [
  signal("Psychological", 14, ["Psychological"]),
  signal("Sci-Fi", 12, ["Sci-Fi", "Science Fiction"]),
  signal("Mystery", 12, ["Mystery"]),
  signal("Drama", 10, ["Drama"]),
  signal("Philosophy", 14, ["Philosophy", "Philosophical"]),
  signal("Denpa", 14, ["Denpa"]),
  signal("Cyberpunk", 14, ["Cyberpunk"]),
  signal("Dystopian", 14, ["Dystopian", "Dystopia"]),
  signal("Post-Apocalyptic", 14, ["Post-Apocalyptic", "Post Apocalyptic", "Apocalypse"]),
  signal("Experimental", 14, ["Experimental"]),
  signal("Nonlinear Narrative", 12, ["Nonlinear Narrative", "Non-linear Narrative", "Nonlinear"]),
  signal("Meta", 10, ["Meta"]),
  signal("Coming of Age", 10, ["Coming of Age"]),
  signal("Politics", 12, ["Politics", "Political"]),
  signal("Religion", 12, ["Religion", "Religious"]),
  signal("Conspiracy", 12, ["Conspiracy"]),
  signal("Surreal Comedy", 12, ["Surreal Comedy", "Surreal"]),
  signal("Tragedy", 12, ["Tragedy"]),
  signal("Urban Fantasy", 10, ["Urban Fantasy"]),
  signal("Strong direction", 12, ["Strong Direction", "Direction", "Director"]),
  signal("Cult", 10, ["Cult"]),
  signal("Auteur", 12, ["Auteur"]),
  signal("Symbolism", 12, ["Symbolism", "Symbolic"]),
  signal("Existential", 14, ["Existential", "Existentialism"]),
];

const MEDIUM_WEIGHT_SIGNALS: Signal[] = [
  signal("Supernatural", 7, ["Supernatural"]),
  signal("Mecha", 7, ["Mecha"]),
  signal("Mahou Shoujo", 7, ["Mahou Shoujo", "Magical Girl"]),
  signal("Time Manipulation", 8, ["Time Manipulation", "Time Travel", "Time Loop"]),
  signal("Alternate Universe", 7, ["Alternate Universe", "Parallel Universe"]),
  signal("War", 7, ["War", "Military"]),
  signal("Mythology", 7, ["Mythology", "Mythological"]),
  signal("Found Family", 6, ["Found Family"]),
  signal("Primarily Teen Cast", 5, ["Primarily Teen Cast", "Teen Cast"]),
  signal("Primarily Female Cast", 5, ["Primarily Female Cast", "Female Cast"]),
];

const DOWN_WEIGHT_SIGNALS: Signal[] = [
  signal("Harem", -16, ["Harem"]),
  signal("Ecchi", -18, ["Ecchi"]),
  signal("Generic Isekai", -12, ["Generic Isekai"]),
  signal("MUSIC", -20, ["Music"]),
  signal("SPECIAL", -16, ["Special"]),
  signal("PV", -18, ["PV", "Preview", "Promotional Video"]),
  signal("CM", -18, ["CM", "Commercial"]),
  signal("Advertisement", -18, ["Advertisement", "Ad"]),
];

const PROTECTED_COMEDY_FANTASY_SIGNALS = ["Parody", "Satire", "Cult", "High Rating", "Deconstruction", "Strong Direction", "Strong direction"];
const UNCERTAIN_VERSION_PATTERN = /\b(season|part|cour|movie|ova|ona|special|recap|summary|remake|remaster|version|edition|pilot|spin[- ]?off|sequel|prequel|pv|cm)\b/i;
const SHORT_FORM_PATTERN = /\b(pv|cm|commercial|advertisement|trailer|teaser|preview)\b/i;

export function buildDiscoveryReviewReport(candidates: ReviewAnimeCandidate[], options?: { generatedAt?: string; stagingPath?: string; reportPath?: string; markdownPath?: string }): DiscoveryReviewReport {
  const items = candidates.map(reviewCandidate).sort(compareReviewItems);
  const counts = createCounts(items);

  return {
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    stagingPath: options?.stagingPath ?? "data/import/staging-anime.json",
    reportPath: options?.reportPath ?? "reports/discovery-review.json",
    markdownPath: options?.markdownPath ?? "reports/discovery-review.md",
    counts,
    items,
  };
}

export function renderDiscoveryReviewMarkdown(report: DiscoveryReviewReport) {
  const groups: DiscoveryRecommendation[] = ["recommended", "maybe", "low-priority", "needs-review"];
  const lines = [
    "# Anime Radar Discovery Review",
    "",
    `Generated at: ${report.generatedAt}`,
    `Staging source: \`${report.stagingPath}\``,
    "",
    "This report is a read-only rough review of staging candidates. It does not import, merge, write to the formal library, or delete low-priority candidates.",
    "",
    "## Summary",
    "",
    `- Total: ${report.counts.total}`,
    `- Recommended: ${report.counts.recommended}`,
    `- Maybe: ${report.counts.maybe}`,
    `- Low priority: ${report.counts["low-priority"]}`,
    `- Needs review: ${report.counts["needs-review"]}`,
    "",
  ];

  for (const group of groups) {
    const groupItems = report.items.filter((item) => item.recommendation === group);
    lines.push(`## ${formatRecommendation(group)} (${groupItems.length})`, "");
    if (groupItems.length === 0) {
      lines.push("_No candidates in this group._", "");
      continue;
    }

    for (const item of groupItems) {
      lines.push(
        `### ${item.title}${item.originalTitle && item.originalTitle !== item.title ? ` / ${item.originalTitle}` : ""}`,
        "",
        `- Year: ${formatValue(item.year)}`,
        `- Episodes: ${formatValue(item.episodes)}`,
        `- Format: ${item.format || "unknown"}`,
        `- Genres: ${item.genres.length ? item.genres.join(", ") : "unknown"}`,
        `- Source rating: ${item.sourceRating ?? "unknown"}`,
        `- Preliminary fit score: ${item.preliminaryFitScore}`,
        `- Recommendation: ${item.recommendation} / priority: ${item.reviewPriority}`,
        `- Match reasons: ${item.matchReasons.length ? item.matchReasons.join("; ") : "none"}`,
        `- Risk reasons: ${item.riskReasons.length ? item.riskReasons.join("; ") : "none"}`,
        `- Source: ${item.sourceUrl || "unknown"}`,
        `- Review note: ${item.reviewNote}`,
        "",
      );
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

function reviewCandidate(candidate: ReviewAnimeCandidate): DiscoveryReviewItem {
  const labels = collectLabels(candidate);
  const labelText = labels.join(" ");
  const matchReasons: string[] = [];
  const riskReasons: string[] = [];
  let score = 40;

  for (const item of HIGH_WEIGHT_SIGNALS) {
    if (matchesSignal(item, labelText)) {
      score += item.patterns.length > 0 ? getSignalWeight(item) : 0;
      matchReasons.push(item.reason);
    }
  }

  for (const item of MEDIUM_WEIGHT_SIGNALS) {
    if (matchesSignal(item, labelText)) {
      score += getSignalWeight(item);
      matchReasons.push(item.reason);
    }
  }

  for (const item of DOWN_WEIGHT_SIGNALS) {
    if (matchesSignal(item, labelText)) {
      score += getSignalWeight(item);
      riskReasons.push(item.reason);
    }
  }

  if ((candidate.episodes ?? 0) >= 52) {
    score -= 12;
    riskReasons.push("Very long episode count: may be costly to review/watch.");
  }

  if (candidate.sourceRating !== null && candidate.sourceRating !== undefined) {
    if (candidate.sourceRating >= 85) {
      score += 8;
      matchReasons.push("High Rating: AniList source rating is very strong.");
    } else if (candidate.sourceRating >= 75) {
      score += 4;
      matchReasons.push("Solid source rating from AniList.");
    } else if (candidate.sourceRating < 60) {
      score -= 5;
      riskReasons.push("Low source rating from AniList.");
    }
  }

  const format = getFormat(candidate);
  if (SHORT_FORM_PATTERN.test(`${format} ${candidate.title}`)) {
    score -= 18;
    riskReasons.push("Short promotional/commercial format requires caution.");
  }

  const informationIsSparse = labels.length < 3 || ((candidate.genres?.length ?? 0) === 0 && (candidate.tags?.length ?? 0) === 0);
  if (informationIsSparse) {
    riskReasons.push("信息不足，需要人工判断");
  }

  const titleOrFormatLooksUncertain = UNCERTAIN_VERSION_PATTERN.test(`${candidate.title} ${candidate.originalTitle ?? ""} ${format}`);
  const versionIsUncertain = candidate.needsReview === true || titleOrFormatLooksUncertain;
  if (versionIsUncertain) {
    riskReasons.push(candidate.needsReview === true && candidate.reviewReason?.trim() ? candidate.reviewReason.trim() : "Series/sequel/special/version is uncertain and needs manual review.");
  }

  const hasProtectedComedyFantasy = hasAny(labels, ["Comedy", "Fantasy", "Isekai"]) && hasAny(labels, PROTECTED_COMEDY_FANTASY_SIGNALS);
  score = clamp(score, 0, 100);

  let recommendation: DiscoveryRecommendation;
  if (versionIsUncertain) recommendation = "needs-review";
  else if (informationIsSparse) recommendation = "maybe";
  else if (score >= 70) recommendation = "recommended";
  else if (score >= 48 || hasProtectedComedyFantasy) recommendation = "maybe";
  else recommendation = "low-priority";

  if (hasProtectedComedyFantasy && recommendation === "low-priority") recommendation = "maybe";

  const reviewPriority = getReviewPriority(recommendation, score);
  const normalizedMatchReasons = matchReasons.length > 0 ? unique(matchReasons) : ["No strong preference signal found in the current AniList metadata."];
  const normalizedRiskReasons = unique(riskReasons);

  return {
    title: candidate.title,
    originalTitle: candidate.originalTitle,
    year: candidate.year,
    episodes: candidate.episodes,
    format,
    status: candidate.status,
    genres: candidate.genres ?? [],
    tags: candidate.tags ?? [],
    sourceRating: candidate.sourceRating ?? null,
    sourceUrl: candidate.sourceUrl,
    preliminaryFitScore: score,
    recommendation,
    reviewPriority,
    matchReasons: normalizedMatchReasons,
    riskReasons: normalizedRiskReasons,
    reviewNote: buildReviewNote(recommendation, score, normalizedRiskReasons),
  };
}

function signal(label: string, weight: number, aliases: string[]): Signal & { weight: number } {
  return {
    label,
    weight,
    patterns: aliases.map((alias) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias).replace(/\\ /g, "[-\\s]?")}([^a-z0-9]|$)`, "i")),
    reason: `${label}: matches a ${weight > 0 ? "positive" : "down-weight"} rough-review signal.`,
  };
}

function getSignalWeight(signalItem: Signal) {
  return "weight" in signalItem && typeof signalItem.weight === "number" ? signalItem.weight : 0;
}

function matchesSignal(signalItem: Signal, labelText: string) {
  return signalItem.patterns.some((pattern) => pattern.test(labelText));
}

function collectLabels(candidate: ReviewAnimeCandidate) {
  return unique([
    ...(candidate.genres ?? []),
    ...(candidate.tags ?? []),
    ...(candidate.sourceGenres ?? []),
    candidate.anilistFormat,
    candidate.format,
    candidate.summary,
    candidate.externalSummary,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0));
}

function getFormat(candidate: ReviewAnimeCandidate) {
  return candidate.anilistFormat || candidate.format || "unknown";
}

function getReviewPriority(recommendation: DiscoveryRecommendation, score: number): DiscoveryReviewPriority {
  if (recommendation === "needs-review") return "manual";
  if (recommendation === "recommended" || score >= 70) return "high";
  if (recommendation === "maybe" || score >= 48) return "medium";
  return "low";
}

function buildReviewNote(recommendation: DiscoveryRecommendation, score: number, riskReasons: string[]) {
  if (recommendation === "needs-review") return `Manual review required before any later import decision. Preliminary score ${score}; keep candidate in staging report.`;
  if (recommendation === "recommended") return `Strong rough fit; review early but do not auto-import. Preliminary score ${score}.`;
  if (recommendation === "maybe") return `Possible fit; use web review/manual judgment before promotion. Preliminary score ${score}.`;
  return `Low priority only; candidate is retained for audit and should not be deleted automatically. Preliminary score ${score}${riskReasons.length ? `; risks: ${riskReasons.join("; ")}` : ""}.`;
}

function compareReviewItems(left: DiscoveryReviewItem, right: DiscoveryReviewItem) {
  const leftManual = left.recommendation === "needs-review" ? 1 : 0;
  const rightManual = right.recommendation === "needs-review" ? 1 : 0;
  return rightManual - leftManual || right.preliminaryFitScore - left.preliminaryFitScore || left.title.localeCompare(right.title);
}

function createCounts(items: DiscoveryReviewItem[]): DiscoveryReviewReport["counts"] {
  return items.reduce(
    (counts, item) => {
      counts.total += 1;
      counts[item.recommendation] += 1;
      return counts;
    },
    { total: 0, recommended: 0, maybe: 0, "low-priority": 0, "needs-review": 0 },
  );
}

function formatRecommendation(value: DiscoveryRecommendation) {
  return value === "low-priority" ? "low-priority" : value;
}

function formatValue(value: number) {
  return value || "unknown";
}

function hasAny(labels: string[], needles: string[]) {
  const normalized = labels.map((label) => label.toLocaleLowerCase());
  return needles.some((needle) => normalized.some((label) => label.includes(needle.toLocaleLowerCase())));
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
