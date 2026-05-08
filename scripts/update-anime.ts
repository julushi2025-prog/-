import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Anime, AnimeStatus } from "../app/types";
import { fetchAniListAnime } from "./adapters/anilist";

type SourceType = "manual-json" | "api-placeholder" | "anilist-api";
type ObjectiveField = (typeof OBJECTIVE_FIELDS)[number];
type ManualField = (typeof MANUAL_FIELDS)[number];
type SystemField = (typeof SYSTEM_FIELDS)[number];
type ImportField = ObjectiveField | ManualField | SystemField;

type AnimeSource = {
  id: string;
  name: string;
  enabled: boolean;
  type: SourceType;
  description: string;
  trustLevel: number;
  priority?: number;
  path?: string;
  baseUrl?: string;
};

type ExternalAnime = Partial<Anime> & {
  original_title?: string;
  source_rating?: number | string | null;
  source_name?: string;
  source_url?: string;
  needsReview?: boolean;
  reviewReason?: string;
};

type ImportCandidate = Anime & {
  importSourceId: string;
  importSourceName: string;
  importTrustLevel: number;
  importNeedsReview?: boolean;
  importReviewReason?: string;
};

type ConflictEntry = {
  title: string;
  year: number;
  field: ImportField;
  existingValue: unknown;
  incomingValue: unknown;
  existingTrustLevel: number;
  incomingTrustLevel: number;
  resolution: string;
};

type ManualLockEntry = {
  title: string;
  year: number;
  field: ManualField;
  keptValue: unknown;
  incomingValue: unknown;
  reason: string;
};

type AcceptedExternalMetadataEntry = {
  title: string;
  year: number;
  field: ImportField;
  existingValue: unknown;
  incomingValue: unknown;
  reason: string;
};

type PreservedLocalDisplayFieldEntry = {
  title: string;
  year: number;
  field: "originalTitle" | "summary" | "genres";
  keptValue: unknown;
  incomingValue: unknown;
  reason: string;
};

type DuplicateEntry = {
  incomingTitle: string;
  incomingYear: number;
  existingTitle: string;
  existingYear: number;
  reason: string;
  action: "merged" | "needs-review";
};

type SkippedEntry = {
  title?: string;
  year?: number;
  sourceName?: string;
  reason: string;
};

type ImportReport = {
  generatedAt: string;
  mode: "dry-run" | "write";
  stagingPath: string;
  animePath: string;
  reportPath: string;
  counts: {
    stagingRows: number;
    normalizedCandidates: number;
    added: number;
    updated: number;
    skipped: number;
    conflicts: number;
    manualLocksPreserved: number;
    acceptedExternalMetadata: number;
    preservedLocalDisplayFields: number;
    possibleDuplicates: number;
    needsReview: number;
  };
  added: Array<{ title: string; year: number; sourceName: string }>;
  updated: Array<{ title: string; year: number; sourceName: string; fields: ImportField[] }>;
  skipped: SkippedEntry[];
  acceptedExternalMetadata: AcceptedExternalMetadataEntry[];
  preservedLocalDisplayFields: PreservedLocalDisplayFieldEntry[];
  conflicts: ConflictEntry[];
  manualLocksPreserved: ManualLockEntry[];
  possibleDuplicates: DuplicateEntry[];
  needsReview: Array<{ title?: string; year?: number; sourceName?: string; reason: string }>;
  warnings: string[];
};

const OBJECTIVE_FIELDS = ["title", "originalTitle", "year", "episodes", "status", "genres", "summary", "sourceRating", "sourceName", "sourceUrl"] as const;
const MANUAL_FIELDS = ["personalFitScore", "whyForMe", "risk", "tags"] as const;
const SYSTEM_FIELDS = ["id", "aliases", "sources", "lastUpdated", "confidence", "manualLockedFields", "externalSummary", "sourceGenres"] as const;
const DEFAULT_MANUAL_LOCKED_FIELDS: ManualField[] = ["personalFitScore", "whyForMe", "risk", "tags"];
const DEFAULT_STAGING_PATH = "data/import/staging-anime.json";
const DEFAULT_QUERY_PATH = "data/import/search-queries.json";
const REPORT_PATH = "reports/import-report.json";
const PLAYBACK_URL_PATTERN = /\b(play|watch|stream|episode|video|m3u8|magnet|torrent|download)\b/i;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const sourcesPath = path.join(root, "data", "sources.json");
  const animePath = path.join(root, "data", "anime.json");
  const reportPath = path.join(root, REPORT_PATH);

  const sources = await readJson<AnimeSource[]>(sourcesPath);
  const currentAnime = await readJson<Anime[]>(animePath);
  const importSource = getImportSource(sources, args.source);
  const report = createReport(args.write ? "write" : "dry-run", DEFAULT_STAGING_PATH, "data/anime.json", REPORT_PATH);

  console.log("Anime Radar data update");
  console.log(`Mode: ${args.write ? "write" : "dry-run"}`);
  console.log(`Source: ${importSource.name} (${importSource.id})`);
  console.log(`Staging input: ${DEFAULT_STAGING_PATH}`);
  console.log(`Current local records: ${currentAnime.length}`);
  console.log("Safety: no piracy resources, no playback links, no high-frequency crawling, and AniList requests are rate limited.\n");

  const stagingRows = await loadStagingRows(root, args, importSource);
  report.counts.stagingRows = stagingRows.length;
  const candidates = stagingRows
    .map((row, index) => normalizeAnime(row, importSource, index, report))
    .filter((item): item is ImportCandidate => item !== null);
  report.counts.normalizedCandidates = candidates.length;

  const dedupedCandidates = dedupeCandidates(candidates, report);
  const nextAnime = mergeAnime(currentAnime, dedupedCandidates, sources, report);
  updateCounts(report);
  await writeReport(reportPath, report);

  console.log("Import preview:");
  console.log(`- Staging rows read: ${report.counts.stagingRows}`);
  console.log(`- Candidates after normalization: ${report.counts.normalizedCandidates}`);
  console.log(`- Candidates after de-dupe: ${dedupedCandidates.length}`);
  console.log(`- Would add: ${report.counts.added}`);
  console.log(`- Would update: ${report.counts.updated}`);
  console.log(`- Skipped: ${report.counts.skipped}`);
  console.log(`- Conflicts: ${report.counts.conflicts}`);
  console.log(`- Accepted external metadata: ${report.counts.acceptedExternalMetadata}`);
  console.log(`- Preserved local display fields: ${report.counts.preservedLocalDisplayFields}`);
  console.log(`- Manual locks preserved: ${report.counts.manualLocksPreserved}`);
  console.log(`- Possible duplicates needing review: ${report.counts.possibleDuplicates}`);
  console.log(`- Source matches needing review: ${report.counts.needsReview}`);
  console.log(`- Report written: ${REPORT_PATH}`);

  if (!args.write) {
    console.log("\nDry-run complete. No changes were written to data/anime.json.");
    return;
  }

  await confirmWrite(args.yes, report.counts.added + report.counts.updated, animePath);
  await writeFile(animePath, `${JSON.stringify(nextAnime, null, 2)}\n`);
  console.log(`\nWrote ${nextAnime.length} records to data/anime.json.`);
}

function parseArgs(args: string[]) {
  const write = args.includes("--write");
  const dryRun = args.includes("--dry-run");
  const yes = args.includes("--yes") || args.includes("-y");
  const source = getArgValue(args, "--source") ?? "staging-import";
  const queries = getArgValues(args, "--query");

  if (write && dryRun) throw new Error("Use either --dry-run or --write, not both.");
  return { write, yes, source, queries };
}

function getArgValue(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function getArgValues(args: string[], name: string) {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1]);
  }
  return values;
}

function getImportSource(sources: AnimeSource[], requestedSource: string): AnimeSource {
  const configured = sources.find((source) => source.id === requestedSource || source.name.toLocaleLowerCase() === requestedSource.toLocaleLowerCase());
  if (configured) {
    if (!configured.enabled) throw new Error(`Source "${requestedSource}" is disabled in data/sources.json.`);
    return configured;
  }

  if (requestedSource === "staging" || requestedSource === "staging-import") {
    return {
      id: "staging-import",
      name: "Staging Import",
      enabled: true,
      type: "manual-json",
      description: "Local staging import file.",
      trustLevel: 50,
      path: DEFAULT_STAGING_PATH,
    };
  }

  throw new Error(`Unknown source "${requestedSource}". Add it to data/sources.json first.`);
}

async function loadStagingRows(root: string, args: ReturnType<typeof parseArgs>, source: AnimeSource): Promise<ExternalAnime[]> {
  if (source.id !== "anilist") return readJson<ExternalAnime[]>(path.join(root, source.path ?? DEFAULT_STAGING_PATH));

  const queries = args.queries.length > 0 ? args.queries : await readSearchQueries(path.join(root, DEFAULT_QUERY_PATH));
  if (queries.length === 0) throw new Error(`AniList source requires at least one --query or a non-empty ${DEFAULT_QUERY_PATH}.`);

  const rows = await fetchAniListAnime({ queries });
  const stagingPath = path.join(root, DEFAULT_STAGING_PATH);
  await writeFile(stagingPath, `${JSON.stringify(rows, null, 2)}\n`);
  console.log(`AniList adapter wrote ${rows.length} normalized row(s) to ${DEFAULT_STAGING_PATH}.`);
  return rows;
}

async function readSearchQueries(filePath: string) {
  const queries = await readJson<unknown>(filePath);
  if (Array.isArray(queries)) return uniqueStrings(queries.map(cleanText).filter(Boolean));
  if (queries && typeof queries === "object" && Array.isArray((queries as { queries?: unknown[] }).queries)) {
    return uniqueStrings(((queries as { queries: unknown[] }).queries).map(cleanText).filter(Boolean));
  }
  throw new Error(`${DEFAULT_QUERY_PATH} must be a JSON array of strings or an object with a queries array.`);
}

function normalizeAnime(row: ExternalAnime, source: AnimeSource, index: number, report: ImportReport): ImportCandidate | null {
  const title = cleanText(row.title);
  const year = toNumber(row.year);

  if (!title || !year) {
    report.skipped.push({ title: title || undefined, year, sourceName: source.name, reason: `${source.id}[${index}]: missing required title or year.` });
    return null;
  }

  const explicitRating = row.sourceRating ?? row.source_rating;
  const normalizedSourceName = cleanText(row.sourceName ?? row.source_name) || source.name;
  const sourceRating = explicitRating === undefined ? null : toNullableFiniteNumber(explicitRating);
  const sourceUrl = sanitizeSourceUrl(cleanText(row.sourceUrl ?? row.source_url), source, index, report);
  const externalSummary = cleanText(row.externalSummary ?? row.summary);
  const sourceGenres = normalizeStringArray(row.sourceGenres ?? row.genres);

  return {
    id: cleanText(row.id) || makeId(title, year),
    title,
    originalTitle: cleanText(row.originalTitle ?? row.original_title) || title,
    year,
    episodes: toNumber(row.episodes) ?? 0,
    status: normalizeStatus(row.status),
    genres: normalizeStringArray(row.genres),
    tags: normalizeStringArray(row.tags),
    summary: cleanText(row.summary),
    sourceRating,
    personalFitScore: clampScore(toNumber(row.personalFitScore) ?? 0),
    whyForMe: cleanText(row.whyForMe),
    risk: cleanText(row.risk),
    sourceName: normalizedSourceName,
    sourceUrl,
    aliases: normalizeStringArray(row.aliases),
    sources: normalizeSources(row.sources, source, sourceUrl, externalSummary, sourceGenres),
    lastUpdated: cleanText(row.lastUpdated),
    confidence: clampConfidence(toNullableFiniteNumber(row.confidence)),
    manualLockedFields: normalizeManualLockedFields(row.manualLockedFields),
    externalSummary,
    sourceGenres,
    importSourceId: source.id,
    importSourceName: source.name,
    importTrustLevel: source.trustLevel,
    importNeedsReview: row.needsReview === true,
    importReviewReason: cleanText(row.reviewReason),
  };
}

function dedupeCandidates(candidates: ImportCandidate[], report: ImportReport) {
  const deduped: ImportCandidate[] = [];

  for (const candidate of candidates) {
    const existingIndex = deduped.findIndex((item) => isConfirmedDuplicate(item, candidate));
    if (existingIndex >= 0) {
      const existing = deduped[existingIndex];
      deduped[existingIndex] = mergeImportedCandidates(existing, candidate, report);
      report.possibleDuplicates.push({ incomingTitle: candidate.title, incomingYear: candidate.year, existingTitle: existing.title, existingYear: existing.year, reason: "Confirmed duplicate in staging by normalized title/originalTitle/aliases + year.", action: "merged" });
      continue;
    }

    const possibleDuplicate = deduped.find((item) => isPossibleDuplicate(item, candidate));
    if (possibleDuplicate) {
      report.possibleDuplicates.push({ incomingTitle: candidate.title, incomingYear: candidate.year, existingTitle: possibleDuplicate.title, existingYear: possibleDuplicate.year, reason: "Similar normalized title/alias but not enough evidence to merge automatically.", action: "needs-review" });
      report.skipped.push({ title: candidate.title, year: candidate.year, sourceName: candidate.importSourceName, reason: "Possible duplicate in staging requires manual review." });
      continue;
    }

    deduped.push(candidate);
  }

  return deduped;
}

function mergeAnime(currentAnime: Anime[], candidates: ImportCandidate[], sources: AnimeSource[], report: ImportReport) {
  const next = currentAnime.map((item) => ({ ...item }));

  for (const candidate of candidates) {
    if (candidate.importNeedsReview) {
      const reason = candidate.importReviewReason || "Incoming source match needs manual review before merge.";
      report.needsReview.push({ title: candidate.title, year: candidate.year, sourceName: candidate.importSourceName, reason });
      report.skipped.push({ title: candidate.title, year: candidate.year, sourceName: candidate.importSourceName, reason });
      continue;
    }

    const existingIndex = next.findIndex((item) => isConfirmedDuplicate(item, candidate));

    if (existingIndex === -1) {
      const possibleDuplicate = next.find((item) => isPossibleDuplicate(item, candidate));
      if (possibleDuplicate) {
        report.possibleDuplicates.push({ incomingTitle: candidate.title, incomingYear: candidate.year, existingTitle: possibleDuplicate.title, existingYear: possibleDuplicate.year, reason: "Similar normalized title/alias in anime.json but not enough evidence to merge automatically.", action: "needs-review" });
        report.skipped.push({ title: candidate.title, year: candidate.year, sourceName: candidate.importSourceName, reason: "Possible duplicate in anime.json requires manual review." });
        continue;
      }

      const { importSourceId: _importSourceId, importSourceName, importTrustLevel: _importTrustLevel, importNeedsReview: _importNeedsReview, importReviewReason: _importReviewReason, ...anime } = candidate;
      next.push({ ...anime, lastUpdated: new Date().toISOString() });
      report.added.push({ title: anime.title, year: anime.year, sourceName: importSourceName });
      continue;
    }

    const existing = next[existingIndex];
    const merged = mergeOne(existing, candidate, getExistingTrustLevel(existing, sources), report);
    if (JSON.stringify(merged.anime) !== JSON.stringify(existing)) {
      next[existingIndex] = merged.anime;
      report.updated.push({ title: merged.anime.title, year: merged.anime.year, sourceName: candidate.importSourceName, fields: merged.changedFields });
    } else {
      report.skipped.push({ title: candidate.title, year: candidate.year, sourceName: candidate.importSourceName, reason: "No field changes after normalization, trust comparison, and manual locks." });
    }
  }

  return next;
}

function mergeImportedCandidates(existing: ImportCandidate, incoming: ImportCandidate, report: ImportReport): ImportCandidate {
  const merged = mergeOne(existing, incoming, existing.importTrustLevel, report);
  return {
    ...merged.anime,
    importSourceId: existing.importTrustLevel >= incoming.importTrustLevel ? existing.importSourceId : incoming.importSourceId,
    importSourceName: existing.importTrustLevel >= incoming.importTrustLevel ? existing.importSourceName : incoming.importSourceName,
    importTrustLevel: Math.max(existing.importTrustLevel, incoming.importTrustLevel),
    importNeedsReview: existing.importNeedsReview || incoming.importNeedsReview,
    importReviewReason: existing.importReviewReason || incoming.importReviewReason,
  };
}

function mergeOne(existing: Anime, incoming: ImportCandidate, existingTrustLevel: number, report: ImportReport): { anime: Anime; changedFields: ImportField[] } {
  const merged: Anime = { ...existing };
  const changedFields: ImportField[] = [];
  const explicitLockedFields = normalizeManualLockedFields(existing.manualLockedFields);
  const defaultLockedFields = DEFAULT_MANUAL_LOCKED_FIELDS.filter((field) => !isEmptyValue(existing[field]));
  const lockedFields = uniqueStrings([...explicitLockedFields, ...defaultLockedFields]) as ManualField[];

  for (const field of OBJECTIVE_FIELDS) {
    const result = resolveObjectiveField(field, existing[field], incoming[field], existingTrustLevel, incoming.importTrustLevel, existing, incoming, report);
    if (result.changed) {
      (merged[field] as Anime[ObjectiveField]) = result.value as never;
      changedFields.push(field);
    }
  }

  for (const field of MANUAL_FIELDS) {
    const incomingValue = incoming[field];
    const existingValue = existing[field];
    if (isEmptyValue(incomingValue)) continue;

    if (lockedFields.includes(field) && !isEmptyValue(existingValue)) {
      if (!valuesEqual(existingValue, incomingValue)) {
        report.manualLocksPreserved.push({ title: existing.title, year: existing.year, field, keptValue: existingValue, incomingValue, reason: explicitLockedFields.includes(field) ? "manualLockedFields explicitly locks this field." : "Default manual field lock preserved non-empty personal judgment." });
      }
      continue;
    }

    if (isEmptyValue(existingValue)) {
      (merged[field] as Anime[ManualField]) = incomingValue as never;
      changedFields.push(field);
    }
  }

  const nextAliases = uniqueStrings([...(existing.aliases ?? []), incoming.title, incoming.originalTitle, ...(incoming.aliases ?? [])].filter(Boolean));
  if (!valuesEqual(existing.aliases ?? [], nextAliases)) {
    merged.aliases = nextAliases;
    changedFields.push("aliases");
  }

  const nextSources = mergeSources(existing.sources, incoming.sources, incoming);
  if (!valuesEqual(existing.sources ?? [], nextSources)) {
    merged.sources = nextSources;
    changedFields.push("sources");
    reportAcceptedExternalMetadata(report, existing, "sources", existing.sources ?? [], nextSources, "External source reference metadata was merged without replacing local display fields.");
  }

  if (isEmptyValue(existing.externalSummary) && !isEmptyValue(incoming.externalSummary)) {
    merged.externalSummary = incoming.externalSummary;
    changedFields.push("externalSummary");
    reportAcceptedExternalMetadata(report, existing, "externalSummary", existing.externalSummary, incoming.externalSummary, "External description stored separately from local summary.");
  }

  if (isEmptyValue(existing.sourceGenres) && !isEmptyValue(incoming.sourceGenres)) {
    merged.sourceGenres = incoming.sourceGenres;
    changedFields.push("sourceGenres");
    reportAcceptedExternalMetadata(report, existing, "sourceGenres", existing.sourceGenres, incoming.sourceGenres, "External genres stored separately from local display genres.");
  }

  if (!existing.id) {
    merged.id = incoming.id || makeId(merged.title, merged.year);
    changedFields.push("id");
  }

  const incomingLockedFields = normalizeManualLockedFields(incoming.manualLockedFields);
  const nextLockedFields = uniqueStrings([...(existing.manualLockedFields ?? []), ...incomingLockedFields]);
  if (nextLockedFields.length > 0 && !valuesEqual(existing.manualLockedFields ?? [], nextLockedFields)) {
    merged.manualLockedFields = nextLockedFields;
    changedFields.push("manualLockedFields");
  }

  if (changedFields.length > 0) {
    merged.lastUpdated = new Date().toISOString();
    if (!changedFields.includes("lastUpdated")) changedFields.push("lastUpdated");
  }

  return { anime: merged, changedFields };
}

function resolveObjectiveField(field: ObjectiveField, existingValue: unknown, incomingValue: unknown, existingTrustLevel: number, incomingTrustLevel: number, existing: Anime, incoming: ImportCandidate, report: ImportReport) {
  if (isEmptyValue(incomingValue)) return { value: existingValue, changed: false };
  if (isEmptyValue(existingValue)) {
    reportAcceptedExternalMetadata(report, existing, field, existingValue, incomingValue, `Existing ${field} is empty, so incoming ${incoming.importSourceName} metadata was accepted.`);
    return { value: incomingValue, changed: !valuesEqual(existingValue, incomingValue) };
  }
  if (valuesEqual(existingValue, incomingValue)) return { value: existingValue, changed: false };

  if (field === "summary") {
    report.preservedLocalDisplayFields.push({ title: existing.title, year: existing.year, field, keptValue: existingValue, incomingValue, reason: "summary is a local display field; non-empty anime.json summary is preserved and external descriptions stay in source metadata." });
    return { value: existingValue, changed: false };
  }

  if (field === "genres") {
    report.preservedLocalDisplayFields.push({ title: existing.title, year: existing.year, field, keptValue: existingValue, incomingValue, reason: "genres are local display taxonomy; non-empty anime.json genres are preserved and external genres stay in source metadata." });
    return { value: existingValue, changed: false };
  }

  if (field === "originalTitle" && shouldPreserveExistingOriginalTitle(existingValue, incomingValue)) {
    report.preservedLocalDisplayFields.push({ title: existing.title, year: existing.year, field, keptValue: existingValue, incomingValue, reason: "Existing originalTitle appears to be an original CJK/kana title; romaji/English incoming title was kept as an alias instead of replacing it." });
    return { value: existingValue, changed: false };
  }

  if (field === "sourceUrl" && typeof existingValue === "string" && typeof incomingValue === "string" && isExampleUrl(incomingValue)) {
    report.conflicts.push({ title: existing.title, year: existing.year, field, existingValue, incomingValue, existingTrustLevel, incomingTrustLevel, resolution: "Existing real sourceUrl kept; mock/example links are not allowed to replace it." });
    return { value: existingValue, changed: false };
  }

  if (["sourceName", "sourceUrl", "sourceRating"].includes(field)) {
    reportAcceptedExternalMetadata(report, existing, field, existingValue, incomingValue, `${incoming.importSourceName} source metadata is allowed to refresh ${field}.`);
    return { value: incomingValue, changed: true };
  }

  if (incomingTrustLevel > existingTrustLevel) {
    report.conflicts.push({ title: existing.title, year: existing.year, field, existingValue, incomingValue, existingTrustLevel, incomingTrustLevel, resolution: "Incoming value kept because its source trustLevel is higher." });
    reportAcceptedExternalMetadata(report, existing, field, existingValue, incomingValue, "Incoming value accepted because its source trustLevel is higher.");
    return { value: incomingValue, changed: true };
  }

  report.conflicts.push({ title: existing.title, year: existing.year, field, existingValue, incomingValue, existingTrustLevel, incomingTrustLevel, resolution: incomingTrustLevel === existingTrustLevel ? "Existing anime.json value kept because trustLevel is equal." : "Existing anime.json value kept because its source trustLevel is higher." });
  return { value: existingValue, changed: false };
}

function reportAcceptedExternalMetadata(report: ImportReport, existing: Anime, field: ImportField, existingValue: unknown, incomingValue: unknown, reason: string) {
  report.acceptedExternalMetadata.push({ title: existing.title, year: existing.year, field, existingValue, incomingValue, reason });
}

function shouldPreserveExistingOriginalTitle(existingValue: unknown, incomingValue: unknown) {
  const existingTitle = cleanText(existingValue);
  const incomingTitle = cleanText(incomingValue);
  return hasCjkOrKana(existingTitle) && !hasCjkOrKana(incomingTitle);
}

function hasCjkOrKana(value: string) {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(value);
}

function isConfirmedDuplicate(left: Pick<Anime, "title" | "originalTitle" | "year" | "aliases">, right: Pick<Anime, "title" | "originalTitle" | "year" | "aliases">) {
  if (left.year !== right.year) return false;
  const leftTitles = normalizedTitles(left);
  const rightTitles = normalizedTitles(right);
  return leftTitles.some((title) => rightTitles.includes(title));
}

function isPossibleDuplicate(left: Pick<Anime, "title" | "originalTitle" | "year" | "aliases">, right: Pick<Anime, "title" | "originalTitle" | "year" | "aliases">) {
  const leftTitles = normalizedTitles(left);
  const rightTitles = normalizedTitles(right);
  if (leftTitles.some((title) => rightTitles.includes(title))) return true;
  if (left.year !== right.year) return false;
  return leftTitles.some((leftTitle) => rightTitles.some((rightTitle) => areSimilarTitles(leftTitle, rightTitle)));
}

function normalizedTitles(item: Pick<Anime, "title" | "originalTitle" | "aliases">) {
  return uniqueStrings([item.title, item.originalTitle, ...(item.aliases ?? [])].map(normalizeTitle).filter(Boolean));
}

function normalizeTitle(value: string) {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[\p{P}\p{S}\s_]+/gu, "");
}

function areSimilarTitles(left: string, right: string) {
  if (left.length < 4 || right.length < 4) return false;
  return left.includes(right) || right.includes(left) || levenshtein(left, right) <= 2;
}

function normalizeStatus(status: unknown): AnimeStatus {
  const value = cleanText(status).toLocaleLowerCase();
  if (["完结", "finished", "completed", "complete"].includes(value)) return "完结";
  if (["连载中", "airing", "ongoing", "current"].includes(value)) return "连载中";
  if (["未开播", "upcoming", "announced", "not yet aired"].includes(value)) return "未开播";
  return "未开播";
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueStrings(value.map(cleanText).filter(Boolean));
  if (typeof value === "string") return uniqueStrings(value.split(/[,，、]/).map(cleanText).filter(Boolean));
  return [];
}

function normalizeManualLockedFields(value: unknown): ManualField[] {
  return normalizeStringArray(value).filter((field): field is ManualField => (MANUAL_FIELDS as readonly string[]).includes(field));
}

function normalizeSources(value: unknown, source: AnimeSource, sourceUrl: string, description = "", genres: string[] = []) {
  const sources = Array.isArray(value) ? value.filter((item) => typeof item === "object" && item !== null) : [];
  const current = { id: source.id, name: source.name, trustLevel: source.trustLevel, sourceUrl, ...(description ? { description } : {}), ...(genres.length > 0 ? { genres } : {}) };
  return uniqueBy(JSON.parse(JSON.stringify([...sources, current])), (item: { id?: string; name?: string; sourceUrl?: string }) => `${item.id ?? item.name ?? "unknown"}::${item.sourceUrl ?? ""}`);
}

function mergeSources(existingSources: unknown, incomingSources: unknown, incoming: ImportCandidate) {
  const existing = Array.isArray(existingSources) ? existingSources : [];
  const incomingList = Array.isArray(incomingSources) ? incomingSources : [];
  return uniqueBy([...existing, ...incomingList, { id: incoming.importSourceId, name: incoming.importSourceName, trustLevel: incoming.importTrustLevel, sourceUrl: incoming.sourceUrl }], (item: { id?: string; name?: string; sourceUrl?: string }) => `${item.id ?? item.name ?? "unknown"}::${item.sourceUrl ?? ""}`);
}

function sanitizeSourceUrl(value: string, source: AnimeSource, index: number, report: ImportReport) {
  if (!value) return "";

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported protocol");
    if (PLAYBACK_URL_PATTERN.test(url.pathname) || PLAYBACK_URL_PATTERN.test(url.search)) {
      report.warnings.push(`${source.id}[${index}]: sourceUrl looks like a playback/download URL and was removed.`);
      return "";
    }
    return url.toString();
  } catch {
    report.warnings.push(`${source.id}[${index}]: invalid sourceUrl removed.`);
    return "";
  }
}

function isExampleUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLocaleLowerCase();
    return hostname === "example.com" || hostname.endsWith(".example.com");
  } catch {
    return false;
  }
}

function getExistingTrustLevel(existing: Anime, sources: AnimeSource[]) {
  const source = sources.find((item) => item.name === existing.sourceName || item.id === existing.sourceName || existing.sources?.some((animeSource) => animeSource.id === item.id || animeSource.name === item.name));
  return source?.trustLevel ?? 50;
}

function createReport(mode: ImportReport["mode"], stagingPath: string, animePath: string, reportPath: string): ImportReport {
  return {
    generatedAt: new Date().toISOString(),
    mode,
    stagingPath,
    animePath,
    reportPath,
    counts: { stagingRows: 0, normalizedCandidates: 0, added: 0, updated: 0, skipped: 0, conflicts: 0, manualLocksPreserved: 0, acceptedExternalMetadata: 0, preservedLocalDisplayFields: 0, possibleDuplicates: 0, needsReview: 0 },
    added: [],
    updated: [],
    skipped: [],
    acceptedExternalMetadata: [],
    preservedLocalDisplayFields: [],
    conflicts: [],
    manualLocksPreserved: [],
    possibleDuplicates: [],
    needsReview: [],
    warnings: [],
  };
}

function updateCounts(report: ImportReport) {
  report.counts.added = report.added.length;
  report.counts.updated = report.updated.length;
  report.counts.skipped = report.skipped.length;
  report.counts.conflicts = report.conflicts.length;
  report.counts.manualLocksPreserved = report.manualLocksPreserved.length;
  report.counts.acceptedExternalMetadata = report.acceptedExternalMetadata.length;
  report.counts.preservedLocalDisplayFields = report.preservedLocalDisplayFields.length;
  report.counts.possibleDuplicates = report.possibleDuplicates.filter((item) => item.action === "needs-review").length;
  report.counts.needsReview = report.needsReview.length;
}

async function writeReport(reportPath: string, report: ImportReport) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function makeId(title: string, year: number) {
  return `${normalizeTitle(title) || "anime"}-${year}`;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown): number | undefined {
  const parsed = toNullableFiniteNumber(value);
  return parsed === null ? undefined : Math.round(parsed);
}

function toNullableFiniteNumber(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function clampConfidence(value: number | null) {
  return value === null ? undefined : Math.max(0, Math.min(1, value));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function uniqueBy<T>(values: T[], getKey: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = getKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isEmptyValue(value: unknown) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
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

async function confirmWrite(yes: boolean, changeCount: number, animePath: string) {
  if (changeCount === 0) {
    console.log("\nNo changes to write.");
    return;
  }

  if (yes) return;

  if (!process.stdin.isTTY) throw new Error("Write mode requires confirmation. Re-run with --write --yes in non-interactive environments.");

  const rl = createInterface({ input, output });
  const answer = await rl.question(`Write ${changeCount} changes to ${animePath}? Type YES to confirm: `);
  rl.close();

  if (answer !== "YES") throw new Error("Write cancelled; data/anime.json was not modified.");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf-8")) as T;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
