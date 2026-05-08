import anime from "../data/anime.json";
import { AnimeRadar } from "./components/anime-radar";
import type { Anime } from "./types";

export default function Home() {
  return <AnimeRadar initialAnime={anime as Anime[]} />;
}
