import { NextResponse } from "next/server";

import type { AnimeStatus } from "../../types";

type AniListTitle = {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
};

type AniListDate = {
  year?: number | null;
};

type AniListMedia = {
  type?: string | null;
  title?: AniListTitle | null;
  startDate?: AniListDate | null;
  episodes?: number | null;
  status?: string | null;
  genres?: string[] | null;
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

type TestAniListResult = {
  title: string;
  originalTitle: string;
  year: number;
  episodes: number;
  status: AnimeStatus;
  genres: string[];
  sourceRating: number | null;
  sourceUrl: string;
};

const ANILIST_GRAPHQL_ENDPOINT = "https://graphql.anilist.co";
const TEST_RESULT_LIMIT = 3;

const TEST_ANILIST_QUERY = `
  query TestAnimeSearch($search: String, $perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
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
        averageScore
        meanScore
        siteUrl
      }
    }
  }
`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unsupportedParams = Array.from(new Set(searchParams.keys())).filter((key) => key !== "query");
  if (unsupportedParams.length > 0) {
    return NextResponse.json({ error: "Only the query parameter is supported" }, { status: 400 });
  }

  const query = cleanText(searchParams.get("query"));

  if (!query) {
    return NextResponse.json({ error: "Missing required query parameter: query" }, { status: 400 });
  }

  const response = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query: TEST_ANILIST_QUERY, variables: { search: query, perPage: TEST_RESULT_LIMIT } }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: `AniList request failed: HTTP ${response.status}` }, { status: 502 });
  }

  const payload = (await response.json()) as AniListSearchResponse;
  if (payload.errors?.length) {
    const message = payload.errors.map((error) => error.message).filter(Boolean).join("; ") || "unknown GraphQL error";
    return NextResponse.json({ error: `AniList request failed: ${message}` }, { status: 502 });
  }

  const results = (payload.data?.Page?.media ?? [])
    .filter((item) => item.type === "ANIME")
    .slice(0, TEST_RESULT_LIMIT)
    .map((media) => normalizeAniListMedia(media, query));

  return NextResponse.json({ query, results });
}

function normalizeAniListMedia(media: AniListMedia, query: string): TestAniListResult {
  const title = cleanText(media.title?.english) || cleanText(media.title?.romaji) || cleanText(media.title?.native) || query;
  const originalTitle = cleanText(media.title?.native) || title;

  return {
    title,
    originalTitle,
    year: media.startDate?.year ?? 0,
    episodes: media.episodes ?? 0,
    status: normalizeAniListStatus(media.status),
    genres: uniqueStrings(media.genres ?? []),
    sourceRating: media.averageScore ?? media.meanScore ?? null,
    sourceUrl: cleanUrl(media.siteUrl),
  };
}

function normalizeAniListStatus(status: unknown): AnimeStatus {
  const value = cleanText(status).toUpperCase();
  if (["FINISHED", "CANCELLED"].includes(value)) return "完结";
  if (value === "RELEASING") return "连载中";
  return "未开播";
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function cleanUrl(value: unknown): string {
  const url = cleanText(value);
  return /^https?:\/\//i.test(url) ? url : "";
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => cleanText(value)).filter(Boolean)));
}
