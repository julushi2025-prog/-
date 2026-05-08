import type { Anime, AnimeStatus } from "../../app/types";

type AniListTitle = {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
};

type AniListDate = {
  year?: number | null;
};

type AniListTag = {
  name?: string | null;
  rank?: number | null;
  isMediaSpoiler?: boolean | null;
  isGeneralSpoiler?: boolean | null;
};

type AniListMedia = {
  id: number;
  type?: string | null;
  title?: AniListTitle | null;
  startDate?: AniListDate | null;
  episodes?: number | null;
  status?: string | null;
  genres?: string[] | null;
  tags?: AniListTag[] | null;
  description?: string | null;
  averageScore?: number | null;
  meanScore?: number | null;
  siteUrl?: string | null;
};

type AniListSearchResponse = {
  data?: {
    Page?: {
      media?: AniListMedia[] | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

export type AniListImportRow = Partial<Anime> & {
  sourceQuery: string;
  sourceId: number;
  matchConfidence: number;
  needsReview?: boolean;
  reviewReason?: string;
};

export type AniListSearchOptions = {
  queries: string[];
  requestDelayMs?: number;
  perQuery?: number;
};

const ANILIST_GRAPHQL_ENDPOINT = "https://graphql.anilist.co";
const DEFAULT_REQUEST_DELAY_MS = 1200;
const DEFAULT_PER_QUERY = 5;
const MAX_TAGS = 8;

const SEARCH_QUERY = `
  query SearchAnime($search: String, $perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
        id
        type
        title {
          romaji
          english
          native
        }
        startDate {
          year
        }
        episodes
        status
        genres
        tags {
          name
          rank
          isMediaSpoiler
          isGeneralSpoiler
        }
        description(asHtml: false)
        averageScore
        meanScore
        siteUrl
      }
    }
  }
`;

export async function fetchAniListAnime(options: AniListSearchOptions): Promise<AniListImportRow[]> {
  const queries = uniqueStrings(options.queries);
  const rows: AniListImportRow[] = [];
  const delayMs = options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS;
  const perQuery = options.perQuery ?? DEFAULT_PER_QUERY;

  for (let index = 0; index < queries.length; index += 1) {
    if (index > 0) await delay(delayMs);
    const query = queries[index];
    const results = await searchAniList(query, perQuery);
    const selected = selectBestAniListMatch(query, results);
    if (!selected) continue;
    rows.push(normalizeAniListMedia(selected.media, query, selected.confidence, selected.needsReview, selected.reviewReason));
  }

  return rows;
}

async function searchAniList(query: string, perPage: number): Promise<AniListMedia[]> {
  const response = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query: SEARCH_QUERY, variables: { search: query, perPage } }),
  });

  if (!response.ok) throw new Error(`AniList request failed for "${query}": HTTP ${response.status}`);

  const payload = (await response.json()) as AniListSearchResponse;
  if (payload.errors?.length) {
    const message = payload.errors.map((error) => error.message).filter(Boolean).join("; ") || "unknown GraphQL error";
    throw new Error(`AniList request failed for "${query}": ${message}`);
  }

  return payload.data?.Page?.media?.filter((item) => item.type === "ANIME") ?? [];
}

function selectBestAniListMatch(query: string, results: AniListMedia[]) {
  const ranked = results
    .map((media) => ({ media, confidence: scoreMatch(query, media) }))
    .sort((left, right) => right.confidence - left.confidence);
  const best = ranked[0];
  if (!best) return null;

  const second = ranked[1];
  const needsReview = best.confidence < 0.82 || (second !== undefined && best.confidence - second.confidence < 0.08);
  const reviewReason = needsReview
    ? second !== undefined && best.confidence - second.confidence < 0.08
      ? "AniList returned multiple similarly matching anime results."
      : "AniList best result did not confidently match the query title."
    : undefined;

  return { ...best, needsReview, reviewReason };
}

function normalizeAniListMedia(media: AniListMedia, query: string, confidence: number, needsReview: boolean, reviewReason?: string): AniListImportRow {
  const title = cleanText(media.title?.english) || cleanText(media.title?.romaji) || cleanText(media.title?.native) || query;
  const originalTitle = cleanText(media.title?.native) || title;
  const sourceRating = media.averageScore ?? media.meanScore ?? null;
  const summary = summarizeDescription(media.description);
  const genres = uniqueStrings(media.genres ?? []);
  const sourceUrl = cleanText(media.siteUrl);

  return {
    id: `anilist-${media.id}`,
    title,
    originalTitle,
    year: media.startDate?.year ?? 0,
    episodes: media.episodes ?? 0,
    status: normalizeAniListStatus(media.status),
    genres,
    tags: normalizeAniListTags(media.tags ?? []),
    summary,
    externalSummary: summary,
    sourceGenres: genres,
    sourceRating,
    personalFitScore: 0,
    whyForMe: "",
    risk: "",
    sourceName: "AniList",
    sourceUrl,
    aliases: uniqueStrings([media.title?.english, media.title?.romaji, media.title?.native].map((value) => cleanText(value))),
    sources: [{ id: "anilist", name: "AniList", trustLevel: 80, sourceUrl, description: summary, genres }],
    confidence,
    sourceQuery: query,
    sourceId: media.id,
    matchConfidence: confidence,
    needsReview,
    reviewReason,
  };
}

function normalizeAniListStatus(status: unknown): AnimeStatus {
  const value = cleanText(status).toUpperCase();
  if (["FINISHED", "CANCELLED"].includes(value)) return "完结";
  if (["RELEASING"].includes(value)) return "连载中";
  return "未开播";
}

function normalizeAniListTags(tags: AniListTag[]) {
  return tags
    .filter((tag) => tag.name && !tag.isMediaSpoiler && !tag.isGeneralSpoiler)
    .sort((left, right) => (right.rank ?? 0) - (left.rank ?? 0))
    .map((tag) => cleanText(tag.name))
    .filter(Boolean)
    .slice(0, MAX_TAGS);
}

function summarizeDescription(value: unknown) {
  const plain = cleanText(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (plain.length <= 360) return plain;
  return `${plain.slice(0, 357).trimEnd()}...`;
}

function scoreMatch(query: string, media: AniListMedia) {
  const normalizedQuery = normalizeTitle(query);
  const titles = [media.title?.english, media.title?.romaji, media.title?.native].map((title) => normalizeTitle(cleanText(title))).filter(Boolean);
  if (titles.includes(normalizedQuery)) return 1;
  if (titles.some((title) => title.includes(normalizedQuery) || normalizedQuery.includes(title))) return 0.9;

  const bestDistance = Math.min(...titles.map((title) => levenshtein(normalizedQuery, title)));
  const longest = Math.max(normalizedQuery.length, ...titles.map((title) => title.length), 1);
  return Math.max(0, 1 - bestDistance / longest);
}

function normalizeTitle(value: string) {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[\p{P}\p{S}\s_]+/gu, "");
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 0; i < left.length; i += 1) {
    let current = i + 1;
    for (let j = 0; j < right.length; j += 1) {
      const insert = current + 1;
      const deleteCost = previous[j + 1] + 1;
      const replace = previous[j] + (left[i] === right[j] ? 0 : 1);
      previous[j] = current;
      current = Math.min(insert, deleteCost, replace);
    }
    previous[right.length] = current;
  }
  return previous[right.length];
}
