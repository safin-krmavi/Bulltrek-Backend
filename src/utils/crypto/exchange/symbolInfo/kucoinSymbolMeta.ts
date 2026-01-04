import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { ensureCacheFile } from "../../../ensureCacheFile";

const KUCOIN_SPOT_CACHE_PATH = path.join(
  process.cwd(),
  "/data/kucoin_spot_symbol_meta.json"
);

const KUCOIN_FUTURES_CACHE_PATH = path.join(
  process.cwd(),
  "/data/kucoin_futures_symbol_meta.json"
);

/**
 * KuCoin SPOT
 */
export async function updateKucoinSpotSymbolMeta(symbolPairs: string[]) {
  // await ensureCacheFile(KUCOIN_SPOT_CACHE_PATH);

  console.log(
    "[UPDATE_KUCOIN_SPOT_META] Starting update for",
    symbolPairs.length,
    "symbols"
  );

  const { data } = await axios.get("https://api.kucoin.com/api/v2/symbols");

  if (data.code !== "200000") {
    throw new Error(`KuCoin API error: ${data.code}`);
  }

  const result: Record<string, any> = {};
  let skippedNotTrading = 0;
  let skippedNotInPairs = 0;

  for (const symbol of data.data) {
    if (!symbol.enableTrading) {
      skippedNotTrading++;
      continue;
    }

    if (!symbolPairs.includes(symbol.symbol)) {
      skippedNotInPairs++;
      continue;
    }

    if (!symbol.priceIncrement || !symbol.baseIncrement) {
      continue;
    }

    result[symbol.symbol] = {
      priceTick: symbol.priceIncrement,
      quantityStep: symbol.baseIncrement,
      minNotional: symbol.minFunds ?? "0",
    };
  }

  await fs.writeFile(
    KUCOIN_SPOT_CACHE_PATH,
    JSON.stringify(result, null, 2),
    "utf-8"
  );

  console.log("[UPDATE_KUCOIN_SPOT_META] Saved:", Object.keys(result).length);

  return result;
}

export async function updateKucoinFuturesSymbolMeta(symbolPairs: string[]) {
  await ensureCacheFile(KUCOIN_FUTURES_CACHE_PATH);

  console.log(
    "[UPDATE_KUCOIN_FUTURES_META] Starting update for",
    symbolPairs.length,
    "symbols"
  );

  const result: Record<string, any> = {};
  let skippedNotTrading = 0;
  let skippedNotFound = 0;

  try {
    const { data } = await axios.get(
      "https://api-futures.kucoin.com/api/v1/contracts/active"
    );

    if (data.code !== "200000" || !Array.isArray(data.data)) {
      throw new Error("KuCoin API returned no data");
    }

    for (const c of data.data) {
      const symbol = c.symbol;
      // Only include requested symbols
      if (!symbolPairs.includes(symbol)) {
        skippedNotFound++;
        continue;
      }

      // Only include open contracts
      if (c.status !== "Open") {
        skippedNotTrading++;
        continue;
      }

      result[symbol] = {
        priceTick: c.tickSize,
        quantityStep: c.lotSize,
      };
    }
  } catch (err: any) {
    console.error("[UPDATE_KUCOIN_FUTURES_META] API error:", err?.message);
  }

  await fs.writeFile(
    KUCOIN_FUTURES_CACHE_PATH,
    JSON.stringify(result, null, 2),
    "utf-8"
  );

  console.log(
    "[UPDATE_KUCOIN_FUTURES_META] Saved:",
    Object.keys(result).length,
    "| Skipped not trading:",
    skippedNotTrading,
    "| Not in requested pairs:",
    skippedNotFound
  );

  return result;
}
