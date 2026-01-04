import fs from "fs/promises";
import path from "path";

const SPOT_CACHE_PATH = path.join(
  process.cwd(),
  "/data/coindcx_spot_symbol_meta.json"
);

const FUTURES_CACHE_PATH = path.join(
  process.cwd(),
  "/data/coindcx_futures_symbol_meta.json"
);

let spotCache: Record<string, any> = {};
let futuresCache: Record<string, any> = {};

export async function getCoindcxSymbolMeta(
  symbol?: string,
  type?: "SPOT" | "FUTURES"
) {
  // Load caches if empty
  if (!Object.keys(spotCache).length) {
    const raw = await fs.readFile(SPOT_CACHE_PATH, "utf-8");
    spotCache = JSON.parse(raw);
  }

  if (!Object.keys(futuresCache).length) {
    const raw = await fs.readFile(FUTURES_CACHE_PATH, "utf-8");
    futuresCache = JSON.parse(raw);
  }

  // Return based on type
  if (type === "SPOT") {
    return symbol ? spotCache[symbol] ?? null : spotCache;
  }

  if (type === "FUTURES") {
    return symbol ? futuresCache[symbol] ?? null : futuresCache;
  }

  // If no type provided, return both
  return {
    SPOT: symbol ? spotCache[symbol] ?? null : spotCache,
    FUTURES: symbol ? futuresCache[symbol] ?? null : futuresCache,
  };
}
