import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Anime, AnimeStatus } from "../app/types";

type SourceType = "manual-json" | "api-placeholder";

type AnimeSource = {
  id: string;
  name: string;
  enabled: boolean;
  type: SourceType;
  description: string;
  path?: string;
  baseUrl?: string;
};

type ExternalAnime = Partial<Anime> & {
  original_title?: string;
  source_rating?: number | string;
  source_name?: string;
  source_url?: string;
};

type ImportCandidate = Anime & {
  importSourceId: string;
  importSourceName: string;
};

type MergeStats = {
  added: number;
  updated: number;
  skipped: number;
  warnings: string[];
  changes: string[];
};

const MANUAL_FIELDS = ["personalFitScore", "whyForMe", "risk", "tags"] as const;
const PLAYBACK_URL_PATTERN = /\b(play|watch|stream|episode|video|m3u8|magnet|torrent|download)\b/i;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const sourcesPath = path.join(root, "data", "sources.json");
  const animePath = path.join(root, "data", "anime.json");

  const sources = await readJson<AnimeSource[]>(sourcesPath);
  const currentAnime = await readJson<Anime[]>(animePath);
  const enabledSources = sources.filter((source) => source.enabled);
  const stats: MergeStats = { added: 0, updated: 0, skipped: 0, warnings: [], changes: [] };

  console.log("Anime Radar data update");
  console.log(`Mode: ${args.write ? "write" : "dry-run"}`);
  console.log(`Configured sources: ${sources.length}; enabled: ${enabledSources.length}`);
  console.log(`Current local records: ${currentAnime.length}`);
  console.log("Safety: no piracy resources, no playback links, no high-frequency crawling, and no network requests in v1.\n");

  const candidates: ImportCandidate[] = [];
  for (const source of enabledSources) {
    const imported = await loadSource(source, root, stats);
    candidates.push(...imported);
  }

  const dedupedCandidates = dedupeCandidates(candidates, stats);
  const nextAnime = mergeAnime(currentAnime, dedupedCandidates, stats);

  console.log("Import preview:");
  console.log(`- Candidates read: ${candidates.length}`);
  console.log(`- Candidates after de-dupe: ${dedupedCandidates.length}`);
  console.log(`- Would add: ${stats.added}`);
  console.log(`- Would update: ${stats.updated}`);
  console.log(`- Skipped: ${stats.skipped}`);

  if (stats.changes.length > 0) {
    console.log("\nPlanned changes:");
    for (const change of stats.changes) console.log(`- ${change}`);
  }

  if (stats.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of stats.warnings) console.log(`- ${warning}`);
  }

  if (!args.write) {
    console.log("\nDry-run complete. No changes were written to data/anime.json.");
    return;
  }

  await confirmWrite(args.yes, stats.added + stats.updated, animePath);
  await writeFile(animePath, `${JSON.stringify(nextAnime, null, 2)}\n`);
  console.log(`\nWrote ${nextAnime.length} records to data/anime.json.`);
}

function parseArgs(args: string[]) {
  const write = args.includes("--write");
  const dryRun = args.includes("--dry-run");
  const yes = args.includes("--yes") || args.includes("-y");

  if (write && dryRun) {
    throw new Error("Use either --dry-run or --write, not both.");
  }

  return { write, yes };
}

async function loadSource(source: AnimeSource, root: string, stats: MergeStats): Promise<ImportCandidate[]> {
  if (source.type === "manual-json") {
    if (!source.path) {
      stats.warnings.push(`${source.id}: missing path; skipped.`);
      return [];
    }

    const filePath = path.resolve(root, source.path);
    try {
      await access(filePath);
    } catch {
      stats.warnings.push(`${source.id}: ${source.path} does not exist yet; skipped.`);
      return [];
    }

    const rows = await readJson<ExternalAnime[]>(filePath);
    return rows.map((row, index) => normalizeAnime(row, source, index, stats)).filter((item): item is ImportCandidate => item !== null);
  }

  stats.warnings.push(`${source.id}: API/crawler adapter is intentionally not implemented in v1; skipped without network requests.`);
  return [];
}

function normalizeAnime(row: ExternalAnime, source: AnimeSource, index: number, stats: MergeStats): ImportCandidate | null {
  const title = cleanText(row.title);
  const year = toNumber(row.year);

  if (!title || !year) {
    stats.skipped += 1;
    stats.warnings.push(`${source.id}[${index}]: missing required title or year; skipped.`);
    return null;
  }

  const sourceUrl = sanitizeSourceUrl(cleanText(row.sourceUrl ?? row.source_url), source, index, stats);

  return {
    title,
    originalTitle: cleanText(row.originalTitle ?? row.original_title) || title,
    year,
    episodes: toNumber(row.episodes) ?? 0,
    status: normalizeStatus(row.status),
    genres: normalizeStringArray(row.genres),
    tags: normalizeStringArray(row.tags),
    summary: cleanText(row.summary),
    sourceRating: toFiniteNumber(row.sourceRating ?? row.source_rating) ?? 0,
    personalFitScore: clampScore(toNumber(row.personalFitScore) ?? 0),
    whyForMe: cleanText(row.whyForMe),
    risk: cleanText(row.risk),
    sourceName: cleanText(row.sourceName ?? row.source_name) || source.name,
    sourceUrl,
    importSourceId: source.id,
    importSourceName: source.name,
  };
}

function dedupeCandidates(candidates: ImportCandidate[], stats: MergeStats) {
  const byKey = new Map<string, ImportCandidate>();

  for (const candidate of candidates) {
    const key = animeKey(candidate);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }

    byKey.set(key, mergeCandidates(existing, candidate, stats));
    stats.skipped += 1;
    stats.warnings.push(`Duplicate import candidate merged by title + year: ${candidate.title} (${candidate.year}).`);
  }

  return [...byKey.values()];
}

function mergeAnime(currentAnime: Anime[], candidates: ImportCandidate[], stats: MergeStats) {
  const next = currentAnime.map((item) => ({ ...item }));
  const indexByKey = new Map(next.map((item, index) => [animeKey(item), index]));

  for (const candidate of candidates) {
    const key = animeKey(candidate);
    const existingIndex = indexByKey.get(key);

    if (existingIndex === undefined) {
      const { importSourceId: _importSourceId, importSourceName: _importSourceName, ...anime } = candidate;
      next.push(anime);
      indexByKey.set(key, next.length - 1);
      stats.added += 1;
      stats.changes.push(`ADD ${anime.title} (${anime.year}) from ${candidate.importSourceName}.`);
      continue;
    }

    const merged = mergeOne(next[existingIndex], candidate, stats, true);
    if (JSON.stringify(merged) !== JSON.stringify(next[existingIndex])) {
      next[existingIndex] = merged;
      stats.updated += 1;
      stats.changes.push(`UPDATE ${merged.title} (${merged.year}) from ${candidate.importSourceName}; manual fields preserved unless imported content was higher quality.`);
    } else {
      stats.skipped += 1;
    }
  }

  return next;
}

function mergeCandidates(existing: ImportCandidate, incoming: ImportCandidate, stats: MergeStats): ImportCandidate {
  return {
    ...mergeOne(existing, incoming, stats, false),
    importSourceId: existing.importSourceId,
    importSourceName: existing.importSourceName,
  };
}

function mergeOne(existing: Anime, incoming: Anime, _stats: MergeStats, preserveManualFields: boolean): Anime {
  const merged: Anime = {
    ...existing,
    originalTitle: preferText(existing.originalTitle, incoming.originalTitle),
    episodes: incoming.episodes || existing.episodes,
    status: incoming.status || existing.status,
    genres: uniqueStrings([...existing.genres, ...incoming.genres]),
    summary: preferText(existing.summary, incoming.summary),
    sourceRating: Math.max(existing.sourceRating || 0, incoming.sourceRating || 0),
    sourceName: preferText(existing.sourceName, incoming.sourceName),
    sourceUrl: preferText(existing.sourceUrl, incoming.sourceUrl),
  };

  if (preserveManualFields) {
    merged.personalFitScore = existing.personalFitScore || incoming.personalFitScore;
    merged.whyForMe = preferHigherQualityManualText(existing.whyForMe, incoming.whyForMe);
    merged.risk = preferHigherQualityManualText(existing.risk, incoming.risk);
    merged.tags = uniqueStrings([...existing.tags, ...incoming.tags]);
  } else {
    for (const field of MANUAL_FIELDS) {
      if (field === "tags") merged.tags = uniqueStrings([...existing.tags, ...incoming.tags]);
    }
    merged.personalFitScore = Math.max(existing.personalFitScore || 0, incoming.personalFitScore || 0);
    merged.whyForMe = preferText(existing.whyForMe, incoming.whyForMe);
    merged.risk = preferText(existing.risk, incoming.risk);
  }

  return merged;
}

function animeKey(item: Pick<Anime, "title" | "year">) {
  return `${item.title.trim().toLocaleLowerCase()}::${item.year}`;
}

function normalizeStatus(status: unknown): AnimeStatus {
  const value = cleanText(status);
  if (["完结", "finished", "completed", "complete"].includes(value.toLocaleLowerCase())) return "完结";
  if (["连载中", "airing", "ongoing", "current"].includes(value.toLocaleLowerCase())) return "连载中";
  if (["未开播", "upcoming", "announced", "not yet aired"].includes(value.toLocaleLowerCase())) return "未开播";
  return "未开播";
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueStrings(value.map(cleanText).filter(Boolean));
  if (typeof value === "string") return uniqueStrings(value.split(/[,，、]/).map(cleanText).filter(Boolean));
  return [];
}

function sanitizeSourceUrl(value: string, source: AnimeSource, index: number, stats: MergeStats) {
  if (!value) return "";

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported protocol");
    if (PLAYBACK_URL_PATTERN.test(url.pathname) || PLAYBACK_URL_PATTERN.test(url.search)) {
      stats.warnings.push(`${source.id}[${index}]: sourceUrl looks like a playback/download URL and was removed.`);
      return "";
    }
    return url.toString();
  } catch {
    stats.warnings.push(`${source.id}[${index}]: invalid sourceUrl removed.`);
    return "";
  }
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown): number | undefined {
  const parsed = toFiniteNumber(value);
  return parsed === undefined ? undefined : Math.round(parsed);
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function preferText(existing: string, incoming: string) {
  return incoming && incoming.length > existing.length ? incoming : existing;
}

function preferHigherQualityManualText(existing: string, incoming: string) {
  if (!incoming) return existing;
  if (!existing) return incoming;
  return incoming.length >= existing.length + 20 ? incoming : existing;
}

async function confirmWrite(yes: boolean, changeCount: number, animePath: string) {
  if (changeCount === 0) {
    console.log("\nNo changes to write.");
    return;
  }

  if (yes) return;

  if (!process.stdin.isTTY) {
    throw new Error("Write mode requires confirmation. Re-run with --write --yes in non-interactive environments.");
  }

  const rl = createInterface({ input, output });
  const answer = await rl.question(`Write ${changeCount} changes to ${animePath}? Type YES to confirm: `);
  rl.close();

  if (answer !== "YES") {
    throw new Error("Write cancelled; data/anime.json was not modified.");
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf-8")) as T;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
