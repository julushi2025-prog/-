export type AnimeStatus = "完结" | "连载中" | "未开播";

export type AnimeSourceRef = {
  id?: string;
  name?: string;
  trustLevel?: number;
  sourceUrl?: string;
};

export type Anime = {
  title: string;
  originalTitle: string;
  year: number;
  episodes: number;
  status: AnimeStatus;
  genres: string[];
  tags: string[];
  summary: string;
  sourceRating: number | null;
  personalFitScore: number;
  whyForMe: string;
  risk: string;
  sourceName: string;
  sourceUrl: string;
  id?: string;
  aliases?: string[];
  sources?: AnimeSourceRef[];
  lastUpdated?: string;
  confidence?: number;
  manualLockedFields?: string[];
};
