import type { Anime, ReviewAnimeCandidate } from "../app/types";

export const genreLocalizationMap: Record<string, string> = {
  Action: "动作",
  Adventure: "冒险",
  Comedy: "喜剧",
  Drama: "剧情",
  Fantasy: "奇幻",
  Mystery: "悬疑",
  Psychological: "心理",
  Romance: "恋爱",
  "Sci-Fi": "科幻",
  "Slice of Life": "日常",
  Supernatural: "超自然",
  Thriller: "惊悚",
  Mecha: "机甲",
  "Mahou Shoujo": "魔法少女",
  Horror: "恐怖",
  Sports: "运动",
  Music: "音乐",
};

export const tagLocalizationMap: Record<string, string> = {
  Philosophy: "哲学",
  "Coming of Age": "成长",
  Dystopian: "反乌托邦",
  "Post-Apocalyptic": "后启示录",
  "Super Robot": "超级机器人",
  "Primarily Teen Cast": "青少年群像",
  "Primarily Female Cast": "女性群像",
  "Urban Fantasy": "都市奇幻",
  Satire: "讽刺",
  Parody: "戏仿",
  "Anti-Hero": "反英雄",
  "Time Manipulation": "时间操作",
  "Alternate Universe": "平行世界",
  Tragedy: "悲剧",
  "Surreal Comedy": "超现实喜剧",
  Denpa: "电波系",
  "Female Protagonist": "女性主角",
  "Male Protagonist": "男性主角",
  Witch: "魔女",
  Magic: "魔法",
  Henshin: "变身",
  Angels: "天使",
  Psychosexual: "心理性",
  Cult: "邪典",
  Experimental: "实验性",
  "Nonlinear Narrative": "非线性叙事",
  Meta: "元叙事",
  "Found Family": "拟似家庭",
  War: "战争",
  Politics: "政治",
  Conspiracy: "阴谋",
  Cyberpunk: "赛博朋克",
  "Virtual World": "虚拟世界",
  Robots: "机器人",
  School: "校园",
  Urban: "都市",
  Mythology: "神话",
  Religion: "宗教",
};

export const externalLabelLocalizationMap: Record<string, string> = {
  ...genreLocalizationMap,
  ...tagLocalizationMap,
};

export const statusLocalizationMap: Record<string, string> = {
  FINISHED: "完结",
  RELEASING: "连载中",
  NOT_YET_RELEASED: "未播出",
  CANCELLED: "已取消",
  HIATUS: "暂停",
  UNKNOWN: "未知",
};

export const formatLocalizationMap: Record<string, string> = {
  TV: "TV 动画",
  TV_SHORT: "短篇 TV",
  MOVIE: "剧场版",
  SPECIAL: "特别篇",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "音乐",
  UNKNOWN: "未知格式",
};

type LocalizedLabels = {
  localized: string[];
  translated: string[];
  untranslated: string[];
};

export type LocalizedAnimeDisplay = {
  title: string;
  originalTitle: string;
  needsLocalization: boolean;
  titleNeedsLocalization: boolean;
  summary: string;
  summaryNeedsLocalization: boolean;
  summarySource: "local" | "external" | "empty";
  summaryNotice: string;
  genres: string[];
  tags: string[];
  externalGenres: string[];
  externalTags: string[];
  untranslatedGenres: string[];
  untranslatedTags: string[];
  untranslatedExternalLabels: string[];
  status: string;
  format: string;
};

export function getLocalizedAnimeDisplay(anime: Anime | ReviewAnimeCandidate): LocalizedAnimeDisplay {
  const title = pickDisplayTitle(anime);
  const summary = pickDisplaySummary(anime);
  const genres = localizeLabels(anime.genres ?? [], genreLocalizationMap);
  const tags = localizeLabels(anime.tags ?? [], externalLabelLocalizationMap);
  const externalGenres = localizeLabels(getExternalAnimeGenres(anime), genreLocalizationMap);
  const candidateFormat = getAnimeFormat(anime);

  return {
    title: title.value,
    originalTitle: anime.originalTitle || "",
    needsLocalization: title.needsLocalization,
    titleNeedsLocalization: title.needsLocalization,
    summary: summary.value,
    summaryNeedsLocalization: summary.needsLocalization,
    summarySource: summary.source,
    summaryNotice: summary.notice,
    genres: genres.localized,
    tags: tags.localized,
    externalGenres: externalGenres.localized,
    externalTags: tags.translated,
    untranslatedGenres: genres.untranslated,
    untranslatedTags: tags.untranslated,
    untranslatedExternalLabels: unique([...externalGenres.untranslated, ...tags.untranslated]),
    status: localizeValue(anime.status, statusLocalizationMap),
    format: candidateFormat ? localizeValue(candidateFormat, formatLocalizationMap) : "",
  };
}

export function getAnimeFormat(anime: Anime | ReviewAnimeCandidate) {
  if ("format" in anime || "anilistFormat" in anime) {
    return anime.format || anime.anilistFormat || "";
  }
  return "";
}

function pickDisplayTitle(anime: Anime | ReviewAnimeCandidate) {
  if (isChineseText(anime.title)) return { value: anime.title, needsLocalization: false };

  const chineseAlias = [anime.originalTitle, ...(anime.aliases ?? [])].find((value) => isChineseText(value));
  if (chineseAlias) return { value: chineseAlias, needsLocalization: false };

  return { value: anime.title, needsLocalization: true };
}

function pickDisplaySummary(anime: Anime | ReviewAnimeCandidate) {
  if (isChineseText(anime.summary)) {
    return { value: anime.summary, needsLocalization: false, source: "local" as const, notice: "" };
  }

  if (anime.externalSummary?.trim()) {
    return {
      value: anime.externalSummary.trim(),
      needsLocalization: true,
      source: "external" as const,
      notice: "外部简介，待汉化",
    };
  }

  if (anime.summary?.trim()) {
    return {
      value: anime.summary.trim(),
      needsLocalization: true,
      source: "local" as const,
      notice: "本地简介待汉化",
    };
  }

  return { value: "暂无简介", needsLocalization: true, source: "empty" as const, notice: "简介待补充" };
}

export function getExternalAnimeGenres(anime: Anime | ReviewAnimeCandidate) {
  const sourceGenres = anime.sourceGenres ?? [];
  return unique(sourceGenres.length > 0 ? sourceGenres : anime.genres ?? []);
}

function localizeLabels(values: string[], mapping: Record<string, string>): LocalizedLabels {
  return unique(values).reduce<LocalizedLabels>((groups, value) => {
    const localized = mapping[value];
    if (localized) {
      groups.localized.push(localized);
      groups.translated.push(localized);
    } else {
      groups.localized.push(value);
      if (!isChineseText(value)) groups.untranslated.push(value);
    }
    return groups;
  }, { localized: [], translated: [], untranslated: [] });
}

function localizeValue(value: string | undefined, mapping: Record<string, string>) {
  if (!value) return "";
  return mapping[value] ?? value;
}

function isChineseText(value: string | undefined) {
  return Boolean(value?.trim() && /[\u3400-\u9fff\uf900-\ufaff]/u.test(value));
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
