import { readFile } from "node:fs/promises";
import path from "node:path";
import anime from "../data/anime.json";
import stagingAnime from "../data/import/staging-anime.json";
import { AnimeRadar } from "./components/anime-radar";
import type { Anime, ImportReport, ReviewAnimeCandidate } from "./types";

export default async function Home() {
  const importReport = await readImportReport();

  return <AnimeRadar importReport={importReport} initialAnime={anime as Anime[]} reviewAnime={stagingAnime as ReviewAnimeCandidate[]} />;
}

async function readImportReport() {
  try {
    const file = await readFile(path.join(process.cwd(), "reports", "import-report.json"), "utf8");
    return JSON.parse(file) as ImportReport;
  } catch {
    return null;
  }
}
