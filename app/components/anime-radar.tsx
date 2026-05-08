"use client";

import { useEffect, useMemo, useState } from "react";
import type { Anime } from "../types";

type Filters = {
  year: string;
  genre: string;
  status: string;
  tag: string;
  episodeRange: string;
  minScore: number;
};

const defaultFilters: Filters = {
  year: "all",
  genre: "all",
  status: "all",
  tag: "all",
  episodeRange: "all",
  minScore: 70,
};

const episodeRanges = [
  { label: "全部", value: "all" },
  { label: "短篇 1-8", value: "1-8" },
  { label: "标准 9-13", value: "9-13" },
  { label: "中篇 14-24", value: "14-24" },
  { label: "长篇 25+", value: "25-999" },
];

const storageKeys = {
  favorites: "anime-radar:favorites",
  dismissed: "anime-radar:dismissed",
};

export function AnimeRadar({ initialAnime }: { initialAnime: Anime[] }) {
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
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="overflow-hidden rounded-3xl border border-cyan-400/20 bg-slate-950/75 p-5 shadow-2xl shadow-cyan-950/30 backdrop-blur md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="mb-3 inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200">
              Anime Radar / Personal Fit Terminal
            </p>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">个人动漫情报收集与推荐终端</h1>
            <p className="mt-4 text-sm leading-7 text-slate-300 md:text-base">
              不是普通排行榜，而是用本地 mock 数据按“世界观密度、视听表达、作者性、结构与分析价值”筛出更适合你的作品档案。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center sm:min-w-96">
            <Stat label="命中档案" value={filteredAnime.length.toString()} />
            <Stat label="平均适配" value={averageFit.toString()} />
            <Stat label="收藏" value={favoriteCount.toString()} />
          </div>
        </div>
      </header>

      <section className="rounded-3xl border border-slate-700/70 bg-slate-950/80 p-4 shadow-xl shadow-black/30 backdrop-blur md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">筛选矩阵</h2>
            <p className="text-sm text-slate-400">第一版只读取 data/anime.json，不请求外部站点。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={() => exportResults("json")}>导出 JSON</ActionButton>
            <ActionButton onClick={() => exportResults("csv")}>导出 CSV</ActionButton>
            <ActionButton onClick={resetDismissed}>恢复隐藏</ActionButton>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Select label="年份" value={filters.year} onChange={(value) => updateFilter("year", value)} options={["all", ...years]} />
          <Select label="类型" value={filters.genre} onChange={(value) => updateFilter("genre", value)} options={["all", ...genres]} />
          <Select label="集数范围" value={filters.episodeRange} onChange={(value) => updateFilter("episodeRange", value)} options={episodeRanges.map((item) => item.value)} labels={Object.fromEntries(episodeRanges.map((item) => [item.value, item.label]))} />
          <Select label="状态" value={filters.status} onChange={(value) => updateFilter("status", value)} options={["all", ...statuses]} />
          <Select label="标签" value={filters.tag} onChange={(value) => updateFilter("tag", value)} options={["all", ...tags]} />
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
        {filteredAnime.map((item) => (
          <article key={item.title} className="group rounded-3xl border border-slate-700/70 bg-slate-950/85 p-4 shadow-xl shadow-black/30 transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:shadow-cyan-950/30 md:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <button className="text-left" onClick={() => setSelectedAnime(item)}>
                  <h3 className="text-xl font-black text-white group-hover:text-cyan-100">{item.title}</h3>
                  <p className="mt-1 text-sm text-slate-400">{item.originalTitle}</p>
                </button>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                  <Badge>{item.year}</Badge>
                  <Badge>{item.episodes} 集</Badge>
                  <Badge>{item.status}</Badge>
                  {item.genres.map((genre) => <Badge key={genre}>{genre}</Badge>)}
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

            <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-300">{item.summary}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              {item.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
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
        ))}
      </section>

      {filteredAnime.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-600 bg-slate-950/70 p-10 text-center text-slate-300">
          没有符合条件的档案。降低最低适配度或恢复隐藏作品试试。
        </div>
      )}

      {selectedAnime && <DetailModal anime={selectedAnime} onClose={() => setSelectedAnime(null)} />}
    </main>
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
  return <button className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs font-bold text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/20" onClick={onClick}>{children}</button>;
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

function DetailModal({ anime, onClose }: { anime: Anime; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-cyan-300/25 bg-slate-950 p-5 shadow-2xl shadow-cyan-950/40 md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-200">作品档案</p>
            <h2 className="mt-2 text-3xl font-black text-white">{anime.title}</h2>
            <p className="mt-1 text-slate-400">{anime.originalTitle}</p>
          </div>
          <button className="rounded-full border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:border-cyan-300" onClick={onClose}>关闭</button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <Stat label="年份" value={anime.year.toString()} />
          <Stat label="集数" value={anime.episodes.toString()} />
          <Stat label="状态" value={anime.status} />
          <Stat label="适配" value={anime.personalFitScore.toString()} />
        </div>

        <div className="mt-6 space-y-4">
          <ModalSection title="简介" text={anime.summary} />
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
