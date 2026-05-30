export type AnimeStatus = "完结" | "连载中" | "未开播";

export type AnimeSourceRef = {
  id?: string;
  name?: string;
  trustLevel?: number;
  sourceUrl?: string;
  description?: string;
  genres?: string[];
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
  externalSummary?: string;
  sourceGenres?: string[];
};

export type DiscoveryRecommendation = "recommended" | "maybe" | "low-priority" | "needs-review";
export type DiscoveryReviewPriority = "high" | "medium" | "low" | "manual";

export type ReviewAnimeCandidate = Anime & {
  format?: string;
  anilistFormat?: string;
  preliminaryFitScore?: number;
  recommendation?: DiscoveryRecommendation;
  reviewPriority?: DiscoveryReviewPriority;
  matchReasons?: string[];
  riskReasons?: string[];
  reviewNote?: string;
  sourceQuery?: string;
  sourceId?: number;
  matchConfidence?: number;
  needsReview?: boolean;
  reviewReason?: string;
};

export type ImportReportEntry = {
  title?: string;
  year?: number;
  sourceName?: string;
  reason?: string;
  [key: string]: unknown;
};

export type ImportReportDuplicate = {
  incomingTitle?: string;
  incomingYear?: number;
  existingTitle?: string;
  existingYear?: number;
  reason?: string;
  action?: string;
  [key: string]: unknown;
};

export type ImportReport = {
  generatedAt?: string;
  mode?: "dry-run" | "write";
  stagingPath?: string;
  animePath?: string;
  reportPath?: string;
  counts?: Record<string, number>;
  needsReview?: ImportReportEntry[];
  possibleDuplicates?: ImportReportDuplicate[];
  excluded?: ImportReportEntry[];
  warnings?: string[];
  [key: string]: unknown;
};

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
  generatedAt?: string;
  stagingPath?: string;
  reportPath?: string;
  markdownPath?: string;
  counts?: Record<string, number>;
  items?: DiscoveryReviewItem[];
};
