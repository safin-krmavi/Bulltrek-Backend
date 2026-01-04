import fs from "fs/promises";
import path from "path";

const ZERODHA_CACHE_PATH = path.join(
  process.cwd(),
  "/data/zerodha_symbol_meta.json"
);

let zerodhaCache: Record<string, any> = {};

export async function getZerodhaSymbolMeta(symbol?: string) {
  // Load cache if empty
  if (!Object.keys(zerodhaCache).length) {
    const raw = await fs.readFile(ZERODHA_CACHE_PATH, "utf-8");
    zerodhaCache = JSON.parse(raw);
  }

  // Return single symbol or full cache
  return symbol ? zerodhaCache[symbol] ?? null : zerodhaCache;
}
