import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type AnimeSource = {
  name: string;
  enabled: boolean;
  type: "file" | "api";
  description: string;
  path?: string;
  baseUrl?: string;
};

async function main() {
  const root = process.cwd();
  const sourcesPath = path.join(root, "data", "sources.json");
  const animePath = path.join(root, "data", "anime.json");
  const sources = JSON.parse(await readFile(sourcesPath, "utf-8")) as AnimeSource[];
  const anime = JSON.parse(await readFile(animePath, "utf-8")) as unknown[];

  console.log("Anime Radar import scaffold");
  console.log(`Configured sources: ${sources.length}`);
  console.log(`Current local records: ${anime.length}`);
  console.log("No network import is performed in MVP v1. Enable and implement a source adapter when using compliant metadata only.");

  await writeFile(animePath, `${JSON.stringify(anime, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
