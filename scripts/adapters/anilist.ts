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
  format?: string | null;
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
  anilistFormat?: string;
  needsReview?: boolean;
  reviewReason?: string;
};

export type AniListSearchOptions = {
  queries: string[];
  requestDelayMs?: number;
  perQuery?: number;
};

export type AniListDiscoveryMode = "trending" | "popular" | "genre" | "tag" | "year";

export type AniListDiscoveryOptions = {
  mode: AniListDiscoveryMode;
  genres?: string[];
  tags?: string[];
  yearFrom?: number;
  yearTo?: number;
  formats?: string[];
  status?: string[];
  minEpisodes?: number;
  maxEpisodes?: number;
  limit?: number;
  requestDelayMs?: number;
};

export type AniListDiscoveryStats = {
  discovered: number;
  excludedByFormat: number;
  excludedByEpisodeCount: number;
};

export type AniListDiscoveryResult = {
  rows: AniListImportRow[];
  stats: AniListDiscoveryStats;
};

const ANILIST_GRAPHQL_ENDPOINT = "https://graphql.anilist.co";
const DEFAULT_REQUEST_DELAY_MS = 1200;
const DEFAULT_PER_QUERY = 5;
const DEFAULT_DISCOVERY_LIMIT = 25;
const MAX_DISCOVERY_LIMIT = 100;
const MAX_TAGS = 8;
const DEFAULT_EXCLUDED_FORMATS = ["MUSIC", "SPECIAL"];
const EXCLUDED_SHORT_FORM_TAG_PATTERN = /\b(trailer|teaser|preview|pv|cm|commercial|opening|ending|op|ed|music video|music-video)\b/i;

const MEDIA_FIELDS = `
  id
  type
  format
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
`;

const SEARCH_QUERY = `
  query SearchAnime($search: String, $perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

const DISCOVERY_QUERY = `
  query DiscoverAnime(
    $page: Int,
    $perPage: Int,
    $sort: [MediaSort],
    $genreIn: [String],
    $tagIn: [String],
    $formatIn: [MediaFormat],
    $statusIn: [MediaStatus],
    $startDateGreater: FuzzyDateInt,
    $startDateLesser: FuzzyDateInt,
    $episodesGreater: Int,
    $episodesLesser: Int
  ) {
    Page(page: $page, perPage: $perPage) {
      media(
        type: ANIME,
        sort: $sort,
        genre_in: $genreIn,
        tag_in: $tagIn,
        format_in: $formatIn,
        status_in: $statusIn,
        startDate_greater: $startDateGreater,
        startDate_lesser: $startDateLesser,
        episodes_greater: $episodesGreater,
        episodes_lesser: $episodesLesser
      ) {
        ${MEDIA_FIELDS}
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

export async function discoverAniListAnime(options: AniListDiscoveryOptions): Promise<AniListDiscoveryResult> {
  const limit = clampLimit(options.limit);
  const variables = buildDiscoveryVariables(options, limit);
  const rows: AniListImportRow[] = [];
  const seenIds = new Set<number>();
  const stats: AniListDiscoveryStats = { discovered: 0, excludedByFormat: 0, excludedByEpisodeCount: 0 };
  const delayMs = options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS;
  let page = 1;

  while (rows.length < limit && page <= 5) {
    if (page > 1) await delay(delayMs);
    const results = await requestAniListPage(DISCOVERY_QUERY, { ...variables, page, perPage: limit });
    if (results.length === 0) break;

    for (const media of results) {
      if (seenIds.has(media.id)) continue;
      seenIds.add(media.id);
      stats.discovered += 1;

      const exclusion = getDiscoveryExclusion(media, options);
      if (exclusion === "format") {
        stats.excludedByFormat += 1;
        continue;
      }
      if (exclusion === "episodes") {
        stats.excludedByEpisodeCount += 1;
        continue;
      }

      rows.push(normalizeAniListMedia(media, `discover:${options.mode}`, 1, false, "Discovered from AniList batch discovery; review personal recommendation fields before merging."));
      if (rows.length >= limit) break;
    }

    page += 1;
  }

  return { rows, stats };
}

async function searchAniList(query: string, perPage: number): Promise<AniListMedia[]> {
  return requestAniListPage(SEARCH_QUERY, { search: query, perPage });
}

async function requestAniListPage(query: string, variables: Record<string, unknown>): Promise<AniListMedia[]> {
  const response = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) throw new Error(`AniList request failed: HTTP ${response.status}`);

  const payload = (await response.json()) as AniListSearchResponse;
  if (payload.errors?.length) {
    const message = payload.errors.map((error) => error.message).filter(Boolean).join("; ") || "unknown GraphQL error";
    throw new Error(`AniList request failed: ${message}`);
  }

  return payload.data?.Page?.media?.filter((item) => item.type === "ANIME") ?? [];
}

function buildDiscoveryVariables(options: AniListDiscoveryOptions, limit: number) {
  const modeSort = options.mode === "popular" ? ["POPULARITY_DESC", "SCORE_DESC"] : ["TRENDING_DESC", "POPULARITY_DESC"];
  return removeEmptyValues({
    sort: modeSort,
    genreIn: uniqueStrings(options.genres ?? []),
    tagIn: uniqueStrings(options.tags ?? []),
    formatIn: uniqueStrings(options.formats ?? []),
    statusIn: uniqueStrings(options.status ?? []),
    startDateGreater: options.yearFrom ? options.yearFrom * 10000 : undefined,
    startDateLesser: options.yearTo ? options.yearTo * 10000 + 1231 : undefined,
    episodesGreater: options.minEpisodes !== undefined ? Math.max(0, Math.floor(options.minEpisodes) - 1) : undefined,
    episodesLesser: options.maxEpisodes !== undefined ? Math.max(1, Math.floor(options.maxEpisodes) + 1) : undefined,
    perPage: limit,
  });
}

function getDiscoveryExclusion(media: AniListMedia, options: AniListDiscoveryOptions) {
  const format = cleanText(media.format).toUpperCase();
  const excludedFormats = new Set(DEFAULT_EXCLUDED_FORMATS);
  const titleValues = [media.title?.english, media.title?.romaji, media.title?.native].map(cleanText).join(" ");
  const tagValues = (media.tags ?? []).map((tag) => cleanText(tag.name)).join(" ");
  if (excludedFormats.has(format) || EXCLUDED_SHORT_FORM_TAG_PATTERN.test(`${format} ${titleValues} ${tagValues}`)) return "format";

  const episodes = media.episodes ?? undefined;
  if (episodes !== undefined && options.minEpisodes !== undefined && episodes < options.minEpisodes) return "episodes";
  if (episodes !== undefined && options.maxEpisodes !== undefined && episodes > options.maxEpisodes) return "episodes";
  return null;
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
  const tags = getReviewableTags(media.tags);
  const sourceUrl = cleanText(media.siteUrl);

  return {
    id: `anilist-${media.id}`,
    title,
    originalTitle,
    year: media.startDate?.year ?? 0,
    episodes: media.episodes ?? 0,
    status: normalizeAniListStatus(media.status),
    genres,
    tags,
    summary,
    externalSummary: summary,
    sourceGenres: uniqueStrings([...genres, ...tags]),
    sourceRating,
    personalFitScore: 0,
    whyForMe: "",
    risk: "",
    sourceName: "AniList",
    sourceUrl,
    aliases: uniqueStrings([media.title?.english, media.title?.romaji, media.title?.native].map((value) => cleanText(value))),
    sources: [{ id: "anilist", name: "AniList", trustLevel: 80, sourceUrl, description: summary, genres: uniqueStrings([...genres, ...tags]) }],
    confidence,
    manualLockedFields: ["personalFitScore", "whyForMe", "risk", "tags"],
    sourceQuery: query,
    sourceId: media.id,
    matchConfidence: confidence,
    anilistFormat: cleanText(media.format),
    needsReview,
    reviewReason,
  };
}

function getReviewableTags(tags: AniListTag[] | null | undefined) {
  return uniqueStrings(
    (tags ?? [])
      .filter((tag) => !tag.isMediaSpoiler && !tag.isGeneralSpoiler)
      .sort((left, right) => (right.rank ?? 0) - (left.rank ?? 0))
      .slice(0, MAX_TAGS)
      .map((tag) => cleanText(tag.name))
      .filter(Boolean),
  );
}

function normalizeAniListStatus(status: unknown): AnimeStatus {
  const value = cleanText(status).toUpperCase();
  if (["FINISHED", "CANCELLED"].includes(value)) return "完结";
  if (["RELEASING"].includes(value)) return "连载中";
  return "未开播";
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

function removeEmptyValues(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && (!Array.isArray(value) || value.length > 0)));
}

function clampLimit(value: unknown) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : DEFAULT_DISCOVERY_LIMIT;
  return Math.max(1, Math.min(MAX_DISCOVERY_LIMIT, parsed));
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
