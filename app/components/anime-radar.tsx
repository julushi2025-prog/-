"use client";

import { useEffect, useMemo, useState } from "react";
import { externalLabelLocalizationMap, formatLocalizationMap, getAnimeFormat, getExternalAnimeGenres, getLocalizedAnimeDisplay, statusLocalizationMap } from "../../lib/anime-localization";
import type { Anime, ImportReport, ReviewAnimeCandidate } from "../types";

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
  sortBy: ReviewSortKey;
};

type ReviewSortKey = "sourceRating" | "year" | "episodes";

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
  sortBy: "sourceRating",
};

const episodeRanges = [
  { label: "全部", value: "all" },
  { label: "短篇 1-8", value: "1-8" },
  { label: "标准 9-13", value: "9-13" },
  { label: "中篇 14-24", value: "14-24" },
  { label: "长篇 25+", value: "25-999" },
];

const maxEpisodeOptions = ["all", "6", "12", "13", "24", "26", "52"];

const reviewSortLabels: Record<ReviewSortKey, string> = {
  sourceRating: "来源评分",
  year: "年份",
  episodes: "集数",
};

const importReportCountLabels: Record<string, string> = {
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

const storageKeys = {
  favorites: "anime-radar:favorites",
  dismissed: "anime-radar:dismissed",
};

export function AnimeRadar({ initialAnime, reviewAnime, importReport }: { initialAnime: Anime[]; reviewAnime: ReviewAnimeCandidate[]; importReport: ImportReport | null }) {
  const [mode, setMode] = useState<Mode>("library");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl shadow-black/20 md:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="mb-3 inline-flex rounded-full border border-slate-700 bg-slate-950/65 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">
              Anime Radar / Personal Database
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-50 md:text-5xl">个人动漫资料库</h1>
            <p className="mt-4 text-sm leading-7 text-slate-400 md:text-base">
              以资料站式的信息层级浏览正式库，并用同一套只读界面检查 discovery 候选。
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-2">
            <div className="grid grid-cols-2 gap-2">
              <ModeButton active={mode === "library"} onClick={() => setMode("library")}>正式库</ModeButton>
              <ModeButton active={mode === "review"} onClick={() => setMode("review")}>审核模式</ModeButton>
            </div>
            <p className="mt-3 px-2 text-center text-xs text-slate-500">审核模式仅展示候选，不写入 GitHub、不修改数据、不自动合并。</p>
          </div>
        </div>
      </header>

      {mode === "library" ? <LibraryMode initialAnime={initialAnime} /> : <ReviewMode existingAnime={initialAnime} importReport={importReport} reviewAnime={reviewAnime} />}
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
      <section className="grid gap-3 text-center sm:grid-cols-3">
        <Stat label="命中档案" value={filteredAnime.length.toString()} />
        <Stat label="平均适配" value={averageFit.toString()} />
        <Stat label="收藏" value={favoriteCount.toString()} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        <aside className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg shadow-black/20 lg:sticky lg:top-6">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Filters</p>
            <h2 className="mt-1 text-lg font-bold text-slate-50">筛选资料库</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">只读取 data/anime.json，按年份、类型、状态与适配度收窄结果。</p>
          </div>

          <div className="space-y-3">
            <Select label="年份" value={filters.year} onChange={(value) => updateFilter("year", value)} options={["all", ...years]} />
            <Select label="类型" value={filters.genre} onChange={(value) => updateFilter("genre", value)} options={["all", ...genres]} labels={externalLabelLocalizationMap} />
            <Select label="集数范围" value={filters.episodeRange} onChange={(value) => updateFilter("episodeRange", value)} options={episodeRanges.map((item) => item.value)} labels={Object.fromEntries(episodeRanges.map((item) => [item.value, item.label]))} />
            <Select label="状态" value={filters.status} onChange={(value) => updateFilter("status", value)} options={["all", ...statuses]} labels={statusLocalizationMap} />
            <Select label="标签" value={filters.tag} onChange={(value) => updateFilter("tag", value)} options={["all", ...tags]} labels={externalLabelLocalizationMap} />
            <label className="block rounded-xl border border-slate-800 bg-slate-950/55 p-3">
              <span className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                <span>最低适配度</span>
                <span className="text-slate-100">{filters.minScore}</span>
              </span>
              <input
                className="w-full accent-sky-400"
                max="100"
                min="0"
                type="range"
                value={filters.minScore}
                onChange={(event) => updateFilter("minScore", Number(event.target.value))}
              />
            </label>
          </div>

          <div className="mt-5 grid gap-2 border-t border-slate-800 pt-4 sm:grid-cols-3 lg:grid-cols-1">
            <ActionButton onClick={() => exportResults("json")}>导出 JSON</ActionButton>
            <ActionButton onClick={() => exportResults("csv")}>导出 CSV</ActionButton>
            <ActionButton onClick={resetDismissed}>恢复隐藏</ActionButton>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/55 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-50">正式库</h2>
              <p className="text-sm text-slate-400">按个人适配度排序，保留标题、年份、集数、状态与来源评分的核心层级。</p>
            </div>
            <p className="text-sm font-semibold text-slate-300">{filteredAnime.length} 个结果</p>
          </div>

          <section className="grid gap-3 xl:grid-cols-2">
            {filteredAnime.map((item) => {
              const display = getLocalizedAnimeDisplay(item);
              return (
                <article key={item.title} className="group rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:border-slate-600 hover:bg-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button className="block text-left" onClick={() => setSelectedAnime(item)}>
                        <h3 className="line-clamp-2 text-lg font-bold leading-snug text-slate-50 group-hover:text-slate-50">{display.title}</h3>
                        <p className="mt-1 line-clamp-1 text-xs text-slate-500">{display.originalTitle || "无原始标题"}{display.titleNeedsLocalization ? " · 标题待汉化" : ""}</p>
                      </button>
                      <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-slate-300">
                        <Badge>{item.year}</Badge>
                        <Badge>{item.episodes} 集</Badge>
                        <Badge>{display.status || "未知状态"}</Badge>
                        {display.genres.slice(0, 3).map((genre) => <Badge key={genre}>{genre}</Badge>)}
                      </div>
                    </div>
                    <ScoreCard label="Fit" value={item.personalFitScore} helper={`来源 ${item.sourceRating || "N/A"}`} />
                  </div>

                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-300">{display.summary}{display.summaryNotice ? `（${display.summaryNotice}）` : ""}</p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {display.tags.slice(0, 5).map((tag) => <Tag key={tag}>{tag}</Tag>)}
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <InfoBlock title="推荐理由" text={item.whyForMe} tone="cyan" />
                    <InfoBlock title="风险提醒" text={item.risk} tone="amber" />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
                    <a className="truncate text-sm font-medium text-sky-300 underline-offset-4 hover:text-sky-200 hover:underline" href={item.sourceUrl} rel="noreferrer" target="_blank">
                      {item.sourceName}
                    </a>
                    <div className="flex flex-wrap gap-2">
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
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/65 p-10 text-center text-slate-300">
              没有符合条件的档案。降低最低适配度或恢复隐藏作品试试。
            </div>
          )}
        </div>
      </section>
      {selectedAnime && <DetailModal anime={selectedAnime} onClose={() => setSelectedAnime(null)} />}
    </>
  );
}

function ReviewMode({ existingAnime, reviewAnime, importReport }: { existingAnime: Anime[]; reviewAnime: ReviewAnimeCandidate[]; importReport: ImportReport | null }) {
  const [filters, setFilters] = useState<ReviewFilters>(defaultReviewFilters);

  const metadataByKey = useMemo(() => buildReviewMetadata(reviewAnime, importReport, existingAnime), [existingAnime, importReport, reviewAnime]);
  const hasLowCandidateCount = reviewAnime.length > 0 && reviewAnime.length < 20;
  const formats = useMemo(() => unique(reviewAnime.map((item) => getAnimeFormat(item)).filter(Boolean)).sort(), [reviewAnime]);
  const genres = useMemo(() => unique(reviewAnime.flatMap((item) => getExternalAnimeGenres(item))).sort(), [reviewAnime]);
  const statuses = useMemo(() => unique(reviewAnime.map((item) => item.status).filter(Boolean)).sort(), [reviewAnime]);

  const filteredCandidates = useMemo(() => {
    return [...reviewAnime]
      .filter((item) => filters.format === "all" || getAnimeFormat(item) === filters.format)
      .filter((item) => filters.genre === "all" || getExternalAnimeGenres(item).includes(filters.genre))
      .filter((item) => filters.status === "all" || item.status === filters.status)
      .filter((item) => filters.maxEpisodes === "all" || item.episodes <= Number(filters.maxEpisodes))
      .sort((a, b) => compareReviewCandidates(a, b, filters.sortBy));
  }, [filters, reviewAnime]);

  function updateFilter<K extends keyof ReviewFilters>(key: K, value: ReviewFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  if (reviewAnime.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/75 p-10 text-center shadow-lg shadow-black/20">
        <h2 className="text-2xl font-extrabold text-slate-50">当前没有候选数据，请先运行 AniList discovery workflow</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">当前候选来源：data/import/staging-anime.json；当前报告来源：reports/import-report.json。</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">当前为只读审核模式，不写入正式库，不修改 data/anime.json，不自动合并。</p>
        <p className="mt-2 text-sm leading-6 text-amber-100">当前分支中的 staging 数据较少，请确认打开的是最新 discovery PR 的 Vercel Preview。</p>
      </div>
    );
  }

  return (
    <>
      <section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 shadow-lg shadow-black/20 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-50">审核模式数据来源</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              当前候选来源：data/import/staging-anime.json；当前报告来源：reports/import-report.json。它显示的是当前分支里的候选数据，不一定是最新一次 discovery 运行结果。
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-100">
              当前为只读审核模式，不写入正式库，不修改 data/anime.json，不自动合并。
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/65 px-4 py-3 text-sm leading-6 text-slate-300">
            <p><span className="font-bold text-slate-50">当前候选来源：</span>data/import/staging-anime.json</p>
            <p><span className="font-bold text-slate-50">当前报告来源：</span>{importReport ? "reports/import-report.json" : "未读取到 reports/import-report.json"}</p>
            <p><span className="font-bold text-slate-50">审核状态：</span>当前为只读审核模式，不写入正式库。</p>
          </div>
        </div>
      </section>

      {hasLowCandidateCount && (
        <section className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100 shadow-lg shadow-black/20 md:p-5">
          当前分支中的 staging 数据较少，请确认打开的是最新 discovery PR 的 Vercel Preview。
        </section>
      )}

      <section className="grid gap-3 text-center md:grid-cols-4">
        <Stat label="候选总数" value={reviewAnime.length.toString()} />
        <Stat label="当前显示" value={filteredCandidates.length.toString()} />
        <Stat label="需审核" value={(importReport?.counts?.needsReview ?? countReportList(importReport?.needsReview)).toString()} />
        <Stat label="疑似重复" value={(importReport?.counts?.possibleDuplicates ?? countReportList(importReport?.possibleDuplicates)).toString()} />
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 shadow-lg shadow-black/20 md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-50">候选审核台</h2>
            <p className="text-sm text-slate-400">只读读取 data/import/staging-anime.json，并关联 reports/import-report.json 中的审核报告。</p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-100">
            本页面不会正式导入、不会自动合并候选，也不会写入 GitHub 或修改数据文件。
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <Select label="排序" value={filters.sortBy} onChange={(value) => updateFilter("sortBy", value as ReviewSortKey)} options={Object.keys(reviewSortLabels)} labels={reviewSortLabels} />
          <Select label="格式" value={filters.format} onChange={(value) => updateFilter("format", value)} options={["all", ...formats]} labels={formatLocalizationMap} />
          <Select label="类型" value={filters.genre} onChange={(value) => updateFilter("genre", value)} options={["all", ...genres]} labels={externalLabelLocalizationMap} />
          <Select label="状态" value={filters.status} onChange={(value) => updateFilter("status", value)} options={["all", ...statuses]} labels={statusLocalizationMap} />
          <Select label="最大集数" value={filters.maxEpisodes} onChange={(value) => updateFilter("maxEpisodes", value)} options={maxEpisodeOptions} labels={{ all: "全部", "6": "≤ 6", "12": "≤ 12", "13": "≤ 13", "24": "≤ 24", "26": "≤ 26", "52": "≤ 52" }} />
        </div>
      </section>

      {importReport?.counts && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 shadow-lg shadow-black/20 md:p-5">
          <h2 className="text-lg font-bold text-slate-50">导入报告统计</h2>
          <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(importReport.counts).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/55 px-3 py-2">
                <span className="text-slate-400">{importReportCountLabels[key] ?? key}</span>
                <span className="font-bold text-slate-100">{String(value)}</span>
              </div>
            ))}
          </div>
          {Array.isArray(importReport.excluded) && importReport.excluded.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/55 p-4">
              <p className="text-sm font-bold text-slate-50">已排除</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                {importReport.excluded.map((item, index) => <li key={index}>{formatReportEntry(item)}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="grid gap-3 xl:grid-cols-2">
        {filteredCandidates.map((item) => {
          const metadata = metadataByKey.get(candidateKey(item)) ?? { needsReviewReasons: [], possibleDuplicates: [], existingDuplicateMatches: [] };
          return <ReviewCandidateCard key={`${item.id ?? item.sourceUrl}-${item.title}`} item={item} metadata={metadata} />;
        })}
      </section>

      {filteredCandidates.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/65 p-10 text-center text-slate-300">
          没有符合当前筛选条件的候选。请放宽格式、类型、状态或最大集数。
        </div>
      )}
    </>
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
    <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg shadow-black/20 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-50">{display.title}</h3>
          <p className="mt-1 text-sm text-slate-400">{display.originalTitle || "无原始标题"}{display.titleNeedsLocalization ? " · 标题待汉化" : ""}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
            <Badge>{item.year || "未知年份"}</Badge>
            <Badge>{item.episodes || "未知"} 集</Badge>
            <Badge>{display.format || "未知格式"}</Badge>
            <Badge>{display.status || "未知状态"}</Badge>
            <Badge>needsReview：{needsReviewStatus}</Badge>
            <Badge>possibleDuplicate：{possibleDuplicateStatus}</Badge>
          </div>
        </div>
        <div className="text-right">
          <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2">
            <p className="text-xs text-slate-500">来源评分</p>
            <p className="text-2xl font-extrabold text-sky-300">{item.sourceRating ?? "暂无"}</p>
          </div>
          <p className="mt-2 text-xs text-slate-400">匹配置信度 {item.matchConfidence ?? item.confidence ?? "暂无"}</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-300">{display.summary}{display.summaryNotice ? `（${display.summaryNotice}）` : ""}</p>

      <div className="mt-4 space-y-3">
        <PillGroup title="外部类型" values={display.externalGenres} empty="无外部类型" />
        <PillGroup title="外部标签" values={display.externalTags} empty="无已翻译外部标签" tag />
        <PillGroup title="未翻译外部标签" values={display.untranslatedExternalLabels} empty="无未翻译外部标签" tag />
        <PillGroup title="个人判断" values={personalJudgments} empty="个人判断：待审核" />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ReviewInfoBlock title="需要审核" items={reviewReasons} empty="未在报告中标记需要审核" tone="amber" />
        <ReviewInfoBlock title="疑似重复 / 已存在" items={duplicateItems} empty="未在报告或正式库比对中标记疑似重复" tone="rose" />
      </div>

      <div className="mt-4 border-t border-slate-800 pt-4">
        {item.sourceUrl ? (
          <a className="text-sm font-medium text-sky-300 underline-offset-4 hover:text-sky-200 hover:underline" href={item.sourceUrl} rel="noreferrer" target="_blank">
            {item.sourceName || "来源"} · {item.sourceUrl}
          </a>
        ) : (
          <p className="text-sm text-slate-400">无来源链接</p>
        )}
      </div>
    </article>
  );
}

function ScoreCard({ label, value, helper }: { label: string; value: React.ReactNode; helper?: string }) {
  return (
    <div className="shrink-0 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-right">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="text-2xl font-extrabold leading-none text-sky-300">{value}</p>
      {helper ? <p className="mt-1 text-[0.7rem] text-slate-500">{helper}</p> : null}
    </div>
  );
}

function ModeButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button className={`rounded-xl px-4 py-2 text-sm font-bold transition ${active ? "bg-slate-100 text-slate-950" : "border border-slate-800 text-slate-300 hover:border-slate-600 hover:bg-slate-900"}`} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 shadow-lg shadow-black/10">
      <p className="text-2xl font-extrabold text-slate-50">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-widest text-slate-500">{label}</p>
    </div>
  );
}

function Select({ label, value, options, labels, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return (
    <label className="block rounded-xl border border-slate-800 bg-slate-950/55 p-3">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <select className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-400" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{labels?.[option] ?? (option === "all" ? "全部" : option)}</option>
        ))}
      </select>
    </label>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-0.5 text-xs font-medium text-slate-300">{children}</span>;
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md border border-slate-700 bg-slate-800/75 px-2 py-0.5 text-xs font-medium text-slate-300">#{children}</span>;
}

function ActionButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800" onClick={onClick} type="button">{children}</button>;
}

function InfoBlock({ title, text, tone }: { title: string; text: string; tone: "cyan" | "amber" }) {
  const color = tone === "cyan" ? "border-sky-500/20 bg-sky-500/5 text-sky-200" : "border-amber-500/20 bg-amber-500/5 text-amber-200";
  return (
    <div className={`rounded-xl border p-3 ${color}`}>
      <p className="mb-1 text-xs font-bold uppercase tracking-widest opacity-80">{title}</p>
      <p className="line-clamp-3 text-sm leading-6 text-slate-300">{text}</p>
    </div>
  );
}

function ReviewInfoBlock({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: "amber" | "rose" }) {
  const color = tone === "amber" ? "border-amber-500/20 bg-amber-500/5 text-amber-200" : "border-rose-500/20 bg-rose-500/5 text-rose-200";
  return (
    <div className={`rounded-xl border p-3 ${color}`}>
      <p className="mb-2 text-xs font-bold uppercase tracking-widest opacity-80">{title}</p>
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
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">{title}</p>
      <div className="flex flex-wrap gap-2">
        {values.length > 0 ? values.map((value) => tag ? <Tag key={value}>{value}</Tag> : <Badge key={value}>{value}</Badge>) : <span className="text-sm text-slate-500">{empty}</span>}
      </div>
    </div>
  );
}

function DetailModal({ anime, onClose }: { anime: Anime; onClose: () => void }) {
  const display = getLocalizedAnimeDisplay(anime);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl shadow-black/50 md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">作品档案</p>
            <h2 className="mt-2 text-3xl font-extrabold text-slate-50">{display.title}</h2>
            <p className="mt-1 text-slate-500">{display.originalTitle || "无原始标题"}{display.titleNeedsLocalization ? " · 标题待汉化" : ""}</p>
          </div>
          <button className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500 hover:bg-slate-900" onClick={onClose}>关闭</button>
        </div>

        <section className="mt-5 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">基本信息</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <Stat label="年份" value={anime.year.toString()} />
            <Stat label="集数" value={anime.episodes.toString()} />
            <Stat label="状态" value={display.status || "未知状态"} />
            <Stat label="适配" value={anime.personalFitScore.toString()} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {display.genres.map((genre) => <Badge key={genre}>{genre}</Badge>)}
            {display.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
          </div>
        </section>

        <div className="mt-4 space-y-4">
          <ModalSection title="简介" text={`${display.summary}${display.summaryNotice ? `（${display.summaryNotice}）` : ""}`} />
          <ModalSection title="为什么适合我" text={anime.whyForMe} />
          <ModalSection title="风险提醒" text={anime.risk} />
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">来源链接</p>
            <a className="mt-2 inline-flex max-w-full break-all text-sky-300 underline-offset-4 hover:text-sky-200 hover:underline" href={anime.sourceUrl} rel="noreferrer" target="_blank">
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
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">{title}</h3>
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


function compareReviewCandidates(a: ReviewAnimeCandidate, b: ReviewAnimeCandidate, sortBy: ReviewSortKey) {
  const left = sortBy === "sourceRating" ? a.sourceRating ?? -1 : a[sortBy] ?? -1;
  const right = sortBy === "sourceRating" ? b.sourceRating ?? -1 : b[sortBy] ?? -1;
  return right - left || a.title.localeCompare(b.title);
}

function countReportList(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
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
