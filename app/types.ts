export type AnimeStatus = "完结" | "连载中" | "未开播";

export type Anime = {
  title: string;
  originalTitle: string;
  year: number;
  episodes: number;
  status: AnimeStatus;
  genres: string[];
  tags: string[];
  summary: string;
  sourceRating: number;
  personalFitScore: number;
  whyForMe: string;
  risk: string;
  sourceName: string;
  sourceUrl: string;
};
