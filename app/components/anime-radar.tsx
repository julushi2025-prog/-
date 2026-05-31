"use client";

import { useEffect, useMemo, useState } from "react";
import { externalLabelLocalizationMap, formatLocalizationMap, getAnimeFormat, getExternalAnimeGenres, getLocalizedAnimeDisplay, statusLocalizationMap } from "../../lib/anime-localization";
import type { Anime, DiscoveryRecommendation, ImportReport, ReviewAnimeCandidate, ReviewDataSource } from "../types";

type Mode = "library" | "review";

type Filters = {
  year: string;
  genre: string;
  status: string;
  tag: string;
  episodeRange: string;
  minScore: number;
};

type ReviewFilters = {
  format: string;
  genre: string;
  status: string;
  maxEpisodes: string;
};

type ReviewRecommendationGroup = {
  key: DiscoveryRecommendation;
  title: string;
  description: string;
  items: ReviewAnimeCandidate[];
};

type ReviewMetadata = {
  needsReviewReasons: string[];
  possibleDuplicates: string[];
  existingDuplicateMatches: string[];
};

const defaultFilters: Filters = {
  year: "all",
  genre: "all",
  status: "all",
  tag: "all",
  episodeRange: "all",
  minScore: 70,
};

const defaultReviewFilters: ReviewFilters = {
  format: "all",
  genre: "all",
  status: "all",
  maxEpisodes: "all",
};

const episodeRanges = [
  { label: "全部", value: "all" },
  { label: "短篇 1-8", value: "1-8" },
  { label: "标准 9-13", value: "9-13" },
  { label: "中篇 14-24", value: "14-24" },
  { label: "长篇 25+", value: "25-999" },
];

const maxEpisodeOptions = ["all", "6", "12", "13", "24", "26", "52"];

const importReportCountLabels: Record<string, string> = {
  preliminaryFitScore: "初步适配分",
  sourceRating: "来源评分",
  stagingRows: "暂存条目",
  normalizedCandidates: "标准化候选",
  added: "新增",
  updated: "更新",
  skipped: "跳过",
  conflicts: "冲突",
  manualLocksPreserved: "保留的手动锁",
  acceptedExternalMetadata: "接受的外部元数据",
  preservedLocalDisplayFields: "保留的本地展示字段",
  possibleDuplicates: "疑似重复",
  needsReview: "需要审核",
  "needs-review": "需要审核",
  merged: "已合并",
};

const recommendationOrder: DiscoveryRecommendation[] = ["recommended", "maybe", "low-priority", "needs-review"];

const recommendationDescriptions: Record<DiscoveryRecommendation, string> = {
  recommended: "粗审核认为优先值得人工查看的候选。",
  maybe: "有命中信号，但仍需要人工判断是否适合。",
  "low-priority": "适配信号较弱，建议排在后面查看。",
  "needs-review": "存在系列、版本、重复或其他风险，需要人工重点确认。",
};

const reviewSourceLabels: Record<ReviewDataSource, string> = {
  "discovery-review.json": "reports/discovery-review.json",
  "staging-anime.json fallback": "data/import/staging-anime.json fallback",
};

const storageKeys = {
  favorites: "anime-radar:favorites",
  dismissed: "anime-radar:dismissed",
};

export function AnimeRadar({ initialAnime, reviewAnime, importReport, reviewDataSource }: { initialAnime: Anime[]; reviewAnime: ReviewAnimeCandidate[]; importReport: ImportReport | null; reviewDataSource: ReviewDataSource }) {
  const [mode, setMode] = useState<Mode>("library");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="overflow-hidden rounded-3xl border border-cyan-400/20 bg-slate-950/75 p-5 shadow-2xl shadow-cyan-950/30 backdrop-blur md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="mb-3 inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200">
              Anime Radar / Personal Fit Terminal
            </p>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">个人动漫情报收集与推荐终端</h1>
            <p className="mt-4 text-sm leading-7 text-slate-300 md:text-base">
              在“正式库”继续浏览 data/anime.json；切到“审核模式”可只读查看 AniList discovery 粗审核候选，优先读取 reports/discovery-review.json。
            </p>
          </div>
          <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-2">
            <div className="grid grid-cols-2 gap-2">
              <ModeButton active={mode === "library"} onClick={() => setMode("library")}>正式库</ModeButton>
              <ModeButton active={mode === "review"} onClick={() => setMode("review")}>审核模式</ModeButton>
            </div>
            <p className="mt-3 px-2 text-center text-xs text-slate-400">审核模式仅展示候选，不写入 GitHub、不修改数据、不自动合并。</p>
          </div>
        </div>
      </header>

      {mode === "library" ? <LibraryMode initialAnime={initialAnime} /> : <ReviewMode existingAnime={initialAnime} importReport={importReport} reviewAnime={reviewAnime} reviewDataSource={reviewDataSource} />}
    </main>
  );
}

function LibraryMode({ initialAnime }: { initialAnime: Anime[] }) {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [selectedAnime, setSelectedAnime] = useState<Anime | null>(null);

  useEffect(() => {
    setFavorites(readStorage(storageKeys.favorites));
    setDismissed(readStorage(storageKeys.dismissed));
  }, []);

  const years = useMemo(() => unique(initialAnime.map((item) => item.year.toString())).sort((a, b) => Number(b) - Number(a)), [initialAnime]);
  const genres = useMemo(() => unique(initialAnime.flatMap((item) => item.genres)).sort(), [initialAnime]);
  const statuses = useMemo(() => unique(initialAnime.map((item) => item.status)).sort(), [initialAnime]);
  const tags = useMemo(() => unique(initialAnime.flatMap((item) => item.tags)).sort(), [initialAnime]);

  const filteredAnime = useMemo(() => {
    return initialAnime
      .filter((item) => !dismissed.includes(item.title))
      .filter((item) => filters.year === "all" || item.year.toString() === filters.year)
      .filter((item) => filters.genre === "all" || item.genres.includes(filters.genre))
      .filter((item) => filters.status === "all" || item.status === filters.status)
      .filter((item) => filters.tag === "all" || item.tags.includes(filters.tag))
      .filter((item) => item.personalFitScore >= filters.minScore)
      .filter((item) => matchesEpisodeRange(item.episodes, filters.episodeRange))
      .sort((a, b) => b.personalFitScore - a.personalFitScore || (b.sourceRating ?? 0) - (a.sourceRating ?? 0));
  }, [dismissed, filters, initialAnime]);

  const averageFit = Math.round(filteredAnime.reduce((sum, item) => sum + item.personalFitScore, 0) / Math.max(filteredAnime.length, 1));
  const favoriteCount = favorites.length;

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleFavorite(title: string) {
    setFavorites((current) => {
      const next = current.includes(title) ? current.filter((item) => item !== title) : [...current, title];
      writeStorage(storageKeys.favorites, next);
      return next;
    });
  }

  function dismissAnime(title: string) {
    setDismissed((current) => {
      const next = [...new Set([...current, title])];
      writeStorage(storageKeys.dismissed, next);
      return next;
    });
  }

  function resetDismissed() {
    setDismissed([]);
    writeStorage(storageKeys.dismissed, []);
  }

  function exportResults(format: "json" | "csv") {
    const payload = format === "json" ? JSON.stringify(filteredAnime, null, 2) : toCsv(filteredAnime);
    const blob = new Blob([payload], { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `anime-radar-results.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <section className="grid grid-cols-3 gap-3 text-center">
        <Stat label="命中档案" value={filteredAnime.length.toString()} />
        <Stat label="平均适配" value={averageFit.toString()} />
        <Stat label="收藏" value={favoriteCount.toString()} />
      </section>

      <section className="rounded-3xl border border-slate-700/70 bg-slate-950/80 p-4 shadow-xl shadow-black/30 backdrop-blur md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">筛选矩阵</h2>
            <p className="text-sm text-slate-400">正式库模式只读取 data/anime.json，不请求外部站点。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={() => exportResults("json")}>导出 JSON</ActionButton>
            <ActionButton onClick={() => exportResults("csv")}>导出 CSV</ActionButton>
            <ActionButton onClick={resetDismissed}>恢复隐藏</ActionButton>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Select label="年份" value={filters.year} onChange={(value) => updateFilter("year", value)} options={["all", ...years]} />
          <Select label="类型" value={filters.genre} onChange={(value) => updateFilter("genre", value)} options={["all", ...genres]} labels={externalLabelLocalizationMap} />
          <Select label="集数范围" value={filters.episodeRange} onChange={(value) => updateFilter("episodeRange", value)} options={episodeRanges.map((item) => item.value)} labels={Object.fromEntries(episodeRanges.map((item) => [item.value, item.label]))} />
          <Select label="状态" value={filters.status} onChange={(value) => updateFilter("status", value)} options={["all", ...statuses]} labels={statusLocalizationMap} />
          <Select label="标签" value={filters.tag} onChange={(value) => updateFilter("tag", value)} options={["all", ...tags]} labels={externalLabelLocalizationMap} />
          <label className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-3">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">最低适配度：{filters.minScore}</span>
            <input
              className="w-full accent-cyan-300"
              max="100"
              min="0"
              type="range"
              value={filters.minScore}
              onChange={(event) => updateFilter("minScore", Number(event.target.value))}
            />
          </label>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {filteredAnime.map((item) => {
          const display = getLocalizedAnimeDisplay(item);
          return (
          <article key={item.title} className="group rounded-3xl border border-slate-700/70 bg-slate-950/85 p-4 shadow-xl shadow-black/30 transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:shadow-cyan-950/30 md:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <button className="text-left" onClick={() => setSelectedAnime(item)}>
                  <h3 className="text-xl font-black text-white group-hover:text-cyan-100">{display.title}</h3>
                  <p className="mt-1 text-sm text-slate-400">{display.originalTitle || "无原始标题"}{display.titleNeedsLocalization ? " · 标题待汉化" : ""}</p>
                </button>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                  <Badge>{item.year}</Badge>
                  <Badge>{item.episodes} 集</Badge>
                  <Badge>{display.status || "未知状态"}</Badge>
                  {display.genres.map((genre) => <Badge key={genre}>{genre}</Badge>)}
                </div>
              </div>
              <div className="text-right">
                <div className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2">
                  <p className="text-xs text-cyan-200">Fit</p>
                  <p className="text-2xl font-black text-cyan-100">{item.personalFitScore}</p>
                </div>
                <p className="mt-2 text-xs text-slate-400">来源评分 {item.sourceRating || "N/A"}</p>
              </div>
            </div>

            <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-300">{display.summary}{display.summaryNotice ? `（${display.summaryNotice}）` : ""}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              {display.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <InfoBlock title="推荐理由" text={item.whyForMe} tone="cyan" />
              <InfoBlock title="风险提醒" text={item.risk} tone="amber" />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
              <a className="text-sm font-semibold text-cyan-200 underline-offset-4 hover:underline" href={item.sourceUrl} rel="noreferrer" target="_blank">
                {item.sourceName}
              </a>
              <div className="flex gap-2">
                <ActionButton onClick={() => toggleFavorite(item.title)}>{favorites.includes(item.title) ? "取消收藏" : "收藏"}</ActionButton>
                <ActionButton onClick={() => dismissAnime(item.title)}>不感兴趣</ActionButton>
                <ActionButton onClick={() => setSelectedAnime(item)}>详情</ActionButton>
              </div>
            </div>
          </article>
          );
        })}
      </section>

      {filteredAnime.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-600 bg-slate-950/70 p-10 text-center text-slate-300">
          没有符合条件的档案。降低最低适配度或恢复隐藏作品试试。
        </div>
      )}

      {selectedAnime && <DetailModal anime={selectedAnime} onClose={() => setSelectedAnime(null)} />}
    </>
  );
}

function ReviewMode({ existingAnime, reviewAnime, importReport, reviewDataSource }: { existingAnime: Anime[]; reviewAnime: ReviewAnimeCandidate[]; importReport: ImportReport | null; reviewDataSource: ReviewDataSource }) {
  const [filters, setFilters] = useState<ReviewFilters>(defaultReviewFilters);

  const metadataByKey = useMemo(() => buildReviewMetadata(reviewAnime, importReport, existingAnime), [existingAnime, importReport, reviewAnime]);
  const hasLowCandidateCount = reviewAnime.length > 0 && reviewAnime.length < 20;
  const formats = useMemo(() => unique(reviewAnime.map((item) => getAnimeFormat(item)).filter(Boolean)).sort(), [reviewAnime]);
  const genres = useMemo(() => unique(reviewAnime.flatMap((item) => getExternalAnimeGenres(item))).sort(), [reviewAnime]);
  const statuses = useMemo(() => unique(reviewAnime.map((item) => item.status).filter(Boolean)).sort(), [reviewAnime]);

  const recommendationCounts = useMemo(() => countRecommendations(reviewAnime), [reviewAnime]);
  const filteredCandidates = useMemo(() => {
    return [...reviewAnime]
      .filter((item) => filters.format === "all" || getAnimeFormat(item) === filters.format)
      .filter((item) => filters.genre === "all" || getExternalAnimeGenres(item).includes(filters.genre))
      .filter((item) => filters.status === "all" || item.status === filters.status)
      .filter((item) => filters.maxEpisodes === "all" || item.episodes <= Number(filters.maxEpisodes));
  }, [filters, reviewAnime]);
  const groupedCandidates = useMemo(() => groupReviewCandidates(filteredCandidates), [filteredCandidates]);

  function updateFilter<K extends keyof ReviewFilters>(key: K, value: ReviewFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  if (reviewAnime.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-cyan-300/30 bg-slate-950/80 p-10 text-center shadow-xl shadow-black/30">
        <h2 className="text-2xl font-black text-white">当前没有候选数据，请先运行 AniList discovery workflow</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">当前数据来源：{reviewSourceLabels[reviewDataSource]}。</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">当前为只读审核模式，不写入正式库，不修改 data/anime.json，不自动合并。</p>
        <p className="mt-2 text-sm leading-6 text-amber-100">当前分支中的 staging 数据较少，请确认打开的是最新 discovery PR 的 Vercel Preview。</p>
      </div>
    );
  }

  return (
    <>
      <section className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-4 shadow-xl shadow-black/30 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-cyan-50">审核模式数据来源</h2>
            <p className="mt-2 text-sm leading-6 text-cyan-100/90">
              当前数据来源：{reviewSourceLabels[reviewDataSource]}。审核模式会优先读取 reports/discovery-review.json；如果该文件不存在，才回退读取 data/import/staging-anime.json。
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-100">
              当前为只读审核模式，不写入正式库，不修改 data/anime.json，不自动合并。
            </p>
          </div>
          <div className="rounded-2xl border border-slate-700/70 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-slate-200">
            <p><span className="font-bold text-white">当前数据来源：</span>{reviewSourceLabels[reviewDataSource]}</p>
            <p><span className="font-bold text-white">回退规则：</span>{reviewDataSource === "discovery-review.json" ? "已命中 discovery-review.json" : "未读取到 discovery-review.json，使用 staging fallback"}</p>
            <p><span className="font-bold text-white">审核状态：</span>当前为只读审核模式，不写入正式库。</p>
          </div>
        </div>
      </section>

      {hasLowCandidateCount && (
        <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100 shadow-xl shadow-black/30 md:p-5">
          当前候选数量较少，请确认打开的是最新 discovery PR 的 Vercel Preview。
        </section>
      )}

      <section className="grid gap-3 text-center md:grid-cols-5">
        <Stat label="候选总数" value={reviewAnime.length.toString()} />
        <Stat label="recommended" value={recommendationCounts.recommended.toString()} />
        <Stat label="maybe" value={recommendationCounts.maybe.toString()} />
        <Stat label="low-priority" value={recommendationCounts["low-priority"].toString()} />
        <Stat label="needs-review" value={recommendationCounts["needs-review"].toString()} />
      </section>

      <section className="rounded-3xl border border-slate-700/70 bg-slate-950/80 p-4 shadow-xl shadow-black/30 backdrop-blur md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">候选审核台</h2>
            <p className="text-sm text-slate-400">只读展示粗审核结果；按 recommendation 分组，每组按 preliminaryFitScore 从高到低排序。</p>
          </div>
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-xs leading-5 text-amber-100">
            本页面不会正式导入、不会自动合并候选，也不会写入 GitHub 或修改数据文件。
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Select label="格式" value={filters.format} onChange={(value) => updateFilter("format", value)} options={["all", ...formats]} labels={formatLocalizationMap} />
          <Select label="类型" value={filters.genre} onChange={(value) => updateFilter("genre", value)} options={["all", ...genres]} labels={externalLabelLocalizationMap} />
          <Select label="状态" value={filters.status} onChange={(value) => updateFilter("status", value)} options={["all", ...statuses]} labels={statusLocalizationMap} />
          <Select label="最大集数" value={filters.maxEpisodes} onChange={(value) => updateFilter("maxEpisodes", value)} options={maxEpisodeOptions} labels={{ all: "全部", "6": "≤ 6", "12": "≤ 12", "13": "≤ 13", "24": "≤ 24", "26": "≤ 26", "52": "≤ 52" }} />
        </div>
      </section>

      {importReport?.counts && (
        <section className="rounded-3xl border border-slate-700/70 bg-slate-950/80 p-4 shadow-xl shadow-black/30 md:p-5">
          <h2 className="text-lg font-bold text-white">导入报告统计</h2>
          <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(importReport.counts).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
                <span className="text-slate-400">{importReportCountLabels[key] ?? key}</span>
                <span className="font-bold text-slate-100">{String(value)}</span>
              </div>
            ))}
          </div>
          {Array.isArray(importReport.excluded) && importReport.excluded.length > 0 && (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-sm font-bold text-white">已排除</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                {importReport.excluded.map((item, index) => <li key={index}>{formatReportEntry(item)}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="space-y-6">
        {groupedCandidates.map((group) => (
          <ReviewCandidateGroup key={group.key} group={group} metadataByKey={metadataByKey} />
        ))}
      </section>

      {filteredCandidates.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-600 bg-slate-950/70 p-10 text-center text-slate-300">
          没有符合当前筛选条件的候选。请放宽格式、类型、状态或最大集数。
        </div>
      )}
    </>
  );
}

function ReviewCandidateGroup({ group, metadataByKey }: { group: ReviewRecommendationGroup; metadataByKey: Map<string, ReviewMetadata> }) {
  return (
    <section className="rounded-3xl border border-slate-700/70 bg-slate-950/55 p-4 shadow-xl shadow-black/30 md:p-5">
      <div className="mb-4 flex flex-col gap-2 border-b border-slate-800 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-200">recommendation</p>
          <h3 className="mt-1 text-2xl font-black text-white">{group.key} · {formatRecommendationLabel(group.key)}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">{group.description}</p>
        </div>
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100">
          {group.items.length} 个候选
        </div>
      </div>

      {group.items.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {group.items.map((item) => {
            const metadata = metadataByKey.get(candidateKey(item)) ?? { needsReviewReasons: [], possibleDuplicates: [], existingDuplicateMatches: [] };
            return <ReviewCandidateCard key={`${item.id ?? item.sourceUrl}-${item.title}`} item={item} metadata={metadata} />;
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-6 text-sm text-slate-400">当前筛选下本组暂无候选。</div>
      )}
    </section>
  );
}

function ReviewCandidateCard({ item, metadata }: { item: ReviewAnimeCandidate; metadata: ReviewMetadata }) {
  const display = getLocalizedAnimeDisplay(item);
  const reviewReasons = [
    ...(item.needsReview ? [item.reviewReason || "候选标记为需要人工审核。"] : []),
    ...metadata.needsReviewReasons,
  ];
  const personalJudgments = getPersonalJudgments(item);
  const duplicateItems = unique([...metadata.possibleDuplicates, ...metadata.existingDuplicateMatches]);
  const needsReviewStatus = item.needsReview || metadata.needsReviewReasons.length > 0 ? "是" : "否";
  const possibleDuplicateStatus = duplicateItems.length > 0 ? "是" : "否";

  return (
    <article className="rounded-3xl border border-slate-700/70 bg-slate-950/85 p-4 shadow-xl shadow-black/30 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-white">{display.title}</h3>
          <p className="mt-1 text-sm text-slate-400">{display.originalTitle || "无原始标题"}{display.titleNeedsLocalization ? " · 标题待汉化" : ""}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
            <Badge>{item.year || "未知年份"}</Badge>
            <Badge>{item.episodes || "未知"} 集</Badge>
            <Badge>{display.format || "未知格式"}</Badge>
            <Badge>{display.status || "未知状态"}</Badge>
            <Badge>needsReview：{needsReviewStatus}</Badge>
            <Badge>possibleDuplicate：{possibleDuplicateStatus}</Badge>
            {item.recommendation && <Badge>推荐：{formatRecommendationLabel(item.recommendation)}</Badge>}
            {item.reviewPriority && <Badge>优先级：{formatReviewPriorityLabel(item.reviewPriority)}</Badge>}
          </div>
        </div>
        <div className="text-right">
          <div className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2">
            <p className="text-xs text-cyan-200">来源评分</p>
            <p className="text-2xl font-black text-cyan-100">{item.sourceRating ?? "暂无"}</p>
          </div>
          <p className="mt-2 text-xs text-slate-400">匹配置信度 {item.matchConfidence ?? item.confidence ?? "暂无"}</p>
          {item.preliminaryFitScore !== undefined && <p className="mt-1 text-xs font-bold text-emerald-200">初步适配分 {item.preliminaryFitScore}</p>}
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-3">
        <ReviewField label="title" value={item.title} />
        <ReviewField label="originalTitle" value={item.originalTitle || "无原始标题"} />
        <ReviewField label="year" value={item.year || "未知"} />
        <ReviewField label="episodes" value={item.episodes || "未知"} />
        <ReviewField label="format" value={display.format || getAnimeFormat(item) || "未知格式"} />
        <ReviewField label="status" value={display.status || item.status || "未知状态"} />
        <ReviewField label="sourceRating" value={item.sourceRating ?? "暂无"} />
        <ReviewField label="preliminaryFitScore" value={item.preliminaryFitScore ?? "暂无"} />
        <ReviewField label="recommendation" value={item.recommendation ?? "needs-review"} />
        <ReviewField label="reviewPriority" value={item.reviewPriority ?? "暂无"} />
        <ReviewField className="sm:col-span-2 lg:col-span-3" label="sourceUrl" value={item.sourceUrl || "无来源链接"} />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
        <p className="mb-1 text-xs font-black uppercase tracking-widest text-slate-500">summary / externalSummary</p>
        <p className="text-sm leading-6 text-slate-300">{display.summary}{display.summaryNotice ? `（${display.summaryNotice}）` : ""}</p>
      </div>

      <div className="mt-4 space-y-3">
        <PillGroup title="外部类型" values={display.externalGenres} empty="无外部类型" />
        <PillGroup title="外部标签" values={display.externalTags} empty="无已翻译外部标签" tag />
        <PillGroup title="未翻译外部标签" values={display.untranslatedExternalLabels} empty="无未翻译外部标签" tag />
        <PillGroup title="个人判断" values={personalJudgments} empty="个人判断：待审核" />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ReviewInfoBlock title="匹配理由" items={item.matchReasons ?? []} empty="粗审核暂无匹配理由" tone="emerald" />
        <ReviewInfoBlock title="风险理由" items={item.riskReasons ?? []} empty="粗审核暂无风险理由" tone="rose" />
        <ReviewInfoBlock title="审核备注" items={item.reviewNote ? [item.reviewNote] : []} empty="粗审核暂无备注" tone="amber" />
        <ReviewInfoBlock title="需要审核" items={reviewReasons} empty="未在报告中标记需要审核" tone="amber" />
        <ReviewInfoBlock title="疑似重复 / 已存在" items={duplicateItems} empty="未在报告或正式库比对中标记疑似重复" tone="rose" />
      </div>

      <div className="mt-4 border-t border-slate-800 pt-4">
        {item.sourceUrl ? (
          <a className="text-sm font-semibold text-cyan-200 underline-offset-4 hover:underline" href={item.sourceUrl} rel="noreferrer" target="_blank">
            {item.sourceName || "来源"} · {item.sourceUrl}
          </a>
        ) : (
          <p className="text-sm text-slate-400">无来源链接</p>
        )}
      </div>
    </article>
  );
}

function ModeButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button className={`rounded-xl px-4 py-2 text-sm font-black transition ${active ? "bg-cyan-300 text-slate-950" : "border border-slate-700 text-slate-200 hover:border-cyan-300/60"}`} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4">
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  );
}

function Select({ label, value, options, labels, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return (
    <label className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-3">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-300" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{labels?.[option] ?? (option === "all" ? "全部" : option)}</option>
        ))}
      </select>
    </label>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-slate-600 bg-slate-900 px-2.5 py-1">{children}</span>;
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-violet-300/25 bg-violet-300/10 px-2.5 py-1 text-xs font-medium text-violet-100">#{children}</span>;
}

function ActionButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs font-bold text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/20" onClick={onClick} type="button">{children}</button>;
}

function InfoBlock({ title, text, tone }: { title: string; text: string; tone: "cyan" | "amber" }) {
  const color = tone === "cyan" ? "border-cyan-300/20 bg-cyan-300/5 text-cyan-100" : "border-amber-300/20 bg-amber-300/5 text-amber-100";
  return (
    <div className={`rounded-2xl border p-3 ${color}`}>
      <p className="mb-1 text-xs font-black uppercase tracking-widest opacity-80">{title}</p>
      <p className="line-clamp-3 text-sm leading-6 text-slate-300">{text}</p>
    </div>
  );
}

function ReviewField({ label, value, className = "" }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2 ${className}`}>
      <p className="text-[0.65rem] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function ReviewInfoBlock({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: "amber" | "rose" | "emerald" }) {
  const color = tone === "amber" ? "border-amber-300/20 bg-amber-300/5 text-amber-100" : tone === "emerald" ? "border-emerald-300/20 bg-emerald-300/5 text-emerald-100" : "border-rose-300/20 bg-rose-300/5 text-rose-100";
  return (
    <div className={`rounded-2xl border p-3 ${color}`}>
      <p className="mb-2 text-xs font-black uppercase tracking-widest opacity-80">{title}</p>
      {items.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-300">
          {unique(items).map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <p className="text-sm leading-6 text-slate-400">{empty}</p>
      )}
    </div>
  );
}

function PillGroup({ title, values, empty, tag = false }: { title: string; values: string[]; empty: string; tag?: boolean }) {
  return (
    <div>
      <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">{title}</p>
      <div className="flex flex-wrap gap-2">
        {values.length > 0 ? values.map((value) => tag ? <Tag key={value}>{value}</Tag> : <Badge key={value}>{value}</Badge>) : <span className="text-sm text-slate-500">{empty}</span>}
      </div>
    </div>
  );
}

function DetailModal({ anime, onClose }: { anime: Anime; onClose: () => void }) {
  const display = getLocalizedAnimeDisplay(anime);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-cyan-300/25 bg-slate-950 p-5 shadow-2xl shadow-cyan-950/40 md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-200">作品档案</p>
            <h2 className="mt-2 text-3xl font-black text-white">{display.title}</h2>
            <p className="mt-1 text-slate-400">{display.originalTitle || "无原始标题"}{display.titleNeedsLocalization ? " · 标题待汉化" : ""}</p>
          </div>
          <button className="rounded-full border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:border-cyan-300" onClick={onClose}>关闭</button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <Stat label="年份" value={anime.year.toString()} />
          <Stat label="集数" value={anime.episodes.toString()} />
          <Stat label="状态" value={display.status || "未知状态"} />
          <Stat label="适配" value={anime.personalFitScore.toString()} />
        </div>

        <div className="mt-6 space-y-4">
          <ModalSection title="简介" text={`${display.summary}${display.summaryNotice ? `（${display.summaryNotice}）` : ""}`} />
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">类型与标签</p>
            <div className="flex flex-wrap gap-2">
              {display.genres.map((genre) => <Badge key={genre}>{genre}</Badge>)}
              {display.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
            </div>
          </div>
          <ModalSection title="为什么适合我" text={anime.whyForMe} />
          <ModalSection title="可能不适合我的原因" text={anime.risk} />
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">来源</p>
            <a className="mt-2 inline-flex text-cyan-200 underline-offset-4 hover:underline" href={anime.sourceUrl} rel="noreferrer" target="_blank">
              {anime.sourceName} · {anime.sourceUrl}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalSection({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
      <h3 className="text-sm font-black uppercase tracking-widest text-cyan-100">{title}</h3>
      <p className="mt-2 leading-7 text-slate-300">{text}</p>
    </section>
  );
}

function buildReviewMetadata(candidates: ReviewAnimeCandidate[], report: ImportReport | null, existingAnime: Anime[]) {
  const map = new Map<string, ReviewMetadata>();
  candidates.forEach((candidate) => map.set(candidateKey(candidate), { needsReviewReasons: [], possibleDuplicates: [], existingDuplicateMatches: [] }));

  report?.needsReview?.forEach((entry) => {
    const key = reportEntryKey(entry);
    if (!key) return;
    const metadata = map.get(key);
    if (metadata) metadata.needsReviewReasons.push(entry.reason || formatReportEntry(entry));
  });

  report?.possibleDuplicates?.forEach((entry) => {
    const incomingKey = reportEntryKey({ title: entry.incomingTitle, year: entry.incomingYear });
    const existingText = entry.existingTitle ? `疑似与 ${entry.existingTitle}${entry.existingYear ? ` (${entry.existingYear})` : ""} 重复` : "疑似重复";
    const message = [existingText, entry.reason, entry.action ? `处理状态：${importReportCountLabels[entry.action] ?? entry.action}` : ""].filter(Boolean).join("；");
    const metadata = incomingKey ? map.get(incomingKey) : undefined;
    if (metadata) metadata.possibleDuplicates.push(message);
  });

  candidates.forEach((candidate) => {
    const metadata = map.get(candidateKey(candidate));
    if (!metadata) return;
    const duplicates = findExistingDuplicates(candidate, existingAnime);
    duplicates.forEach((existing) => {
      metadata.existingDuplicateMatches.push(`当前 data/anime.json 已存在疑似重复：${existing.title}${existing.year ? ` (${existing.year})` : ""}`);
    });
  });

  return map;
}

function getPersonalJudgments(item: ReviewAnimeCandidate) {
  const judgments = [
    item.personalFitScore > 0 ? `适配度：${item.personalFitScore}` : "",
    item.whyForMe?.trim() ? `推荐理由：${item.whyForMe.trim()}` : "",
    item.risk?.trim() ? `风险提醒：${item.risk.trim()}` : "",
  ];
  return judgments.filter(Boolean);
}

function candidateKey(item: Pick<Anime, "title" | "year">) {
  return `${normalizeKey(item.title)}::${item.year ?? ""}`;
}

function findExistingDuplicates(candidate: ReviewAnimeCandidate, existingAnime: Anime[]) {
  const candidateNames = normalizedNames(candidate);
  return existingAnime.filter((existing) => {
    if (candidate.year && existing.year && candidate.year !== existing.year) return false;
    return normalizedNames(existing).some((name) => candidateNames.includes(name));
  });
}

function normalizedNames(item: Pick<Anime, "title" | "originalTitle" | "aliases">) {
  return unique([item.title, item.originalTitle, ...(item.aliases ?? [])].map(normalizeKey).filter(Boolean));
}

function reportEntryKey(entry: { title?: string; year?: number; incomingTitle?: string; incomingYear?: number }) {
  const title = entry.title ?? entry.incomingTitle;
  const year = entry.year ?? entry.incomingYear;
  return title ? `${normalizeKey(title)}::${year ?? ""}` : null;
}

function normalizeKey(value: string) {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[\p{P}\p{S}\s_]+/gu, "");
}

function formatRecommendationLabel(value: string) {
  const labels: Record<string, string> = {
    recommended: "推荐",
    maybe: "待判断",
    "low-priority": "低优先级",
    "needs-review": "人工审核",
  };
  return labels[value] ?? value;
}

function formatReviewPriorityLabel(value: string) {
  const labels: Record<string, string> = { high: "高", medium: "中", low: "低", manual: "人工" };
  return labels[value] ?? value;
}

function countRecommendations(candidates: ReviewAnimeCandidate[]) {
  return candidates.reduce<Record<DiscoveryRecommendation, number>>((counts, item) => {
    const recommendation = item.recommendation ?? "needs-review";
    counts[recommendation] += 1;
    return counts;
  }, { recommended: 0, maybe: 0, "low-priority": 0, "needs-review": 0 });
}

function groupReviewCandidates(candidates: ReviewAnimeCandidate[]): ReviewRecommendationGroup[] {
  return recommendationOrder.map((key) => ({
    key,
    title: formatRecommendationLabel(key),
    description: recommendationDescriptions[key],
    items: candidates
      .filter((item) => (item.recommendation ?? "needs-review") === key)
      .sort((a, b) => (b.preliminaryFitScore ?? -1) - (a.preliminaryFitScore ?? -1) || a.title.localeCompare(b.title)),
  }));
}


function formatReportEntry(entry: unknown) {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return String(entry);
  const values = Object.entries(entry).map(([key, value]) => `${formatReportKey(key)}: ${Array.isArray(value) ? value.join("|") : String(value)}`);
  return values.join("；");
}

function formatReportKey(key: string) {
  return importReportCountLabels[key] ?? key;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function matchesEpisodeRange(episodes: number, range: string) {
  if (range === "all") return true;
  const [min, max] = range.split("-").map(Number);
  return episodes >= min && episodes <= max;
}

function readStorage(key: string) {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function writeStorage(key: string, value: string[]) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function toCsv(items: Anime[]) {
  const headers: (keyof Anime)[] = ["title", "originalTitle", "year", "episodes", "status", "genres", "tags", "summary", "sourceRating", "personalFitScore", "whyForMe", "risk", "sourceName", "sourceUrl"];
  const rows = items.map((item) => headers.map((header) => csvCell(Array.isArray(item[header]) ? (item[header] as string[]).join("|") : item[header])).join(","));
  return [headers.join(","), ...rows].join("\n");
}

function csvCell(value: string | number | null | undefined) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
