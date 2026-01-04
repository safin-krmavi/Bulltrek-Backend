import fs from "fs/promises";
import path from "path";

export const KOTAK_CACHE_PATH = path.join(
  process.cwd(),
  "/data/kotak_symbol_meta.json"
);
let kotakCache: Record<string, any> = {};

export async function getKotakSymbolMeta(symbol?: string) {
  // Lazy load
  if (!Object.keys(kotakCache).length) {
    const raw = await fs.readFile(KOTAK_CACHE_PATH, "utf-8");
    kotakCache = JSON.parse(raw);
  }

  return symbol ? kotakCache[symbol] ?? null : kotakCache;
}
