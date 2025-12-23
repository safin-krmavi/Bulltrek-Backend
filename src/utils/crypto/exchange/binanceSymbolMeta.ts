import axios from "axios";
import fs from "fs/promises";
import path from "path";

const SPOT_CACHE_PATH = path.join(
  process.cwd(),
  "/data/binance_spot_symbol_meta.json"
);
const FUTURES_CACHE_PATH = path.join(
  process.cwd(),
  "/data/binance_futures_symbol_meta.json"
);

/**
 * Filters and stores Binance spot symbol metadata for only the instruments you care about
 */
export async function updateBinanceSpotSymbolMeta(symbolPairs: string[]) {
  console.log(
    "[UPDATE_SPOT_META] Starting update for",
    symbolPairs.length,
    "symbols"
  );

  const url = "https://api.binance.com/api/v3/exchangeInfo";
  const { data } = await axios.get(url);

  console.log(
    "[UPDATE_SPOT_META] Total symbols from Binance:",
    data.symbols.length
  );

  const result: Record<string, any> = {};
  let skippedNotTrading = 0;
  let skippedNotInPairs = 0;

  for (const symbol of data.symbols) {
    if (symbol.status !== "TRADING") {
      skippedNotTrading++;
      if (symbol.symbol === "DOGEUSDT") {
        console.log("[UPDATE_SPOT_META] DOGEUSDT skipped because not trading");
      }
      continue;
    }
    if (!symbolPairs.includes(symbol.symbol)) {
      skippedNotInPairs++;
      if (symbol.symbol === "DOGEUSDT") {
        console.log(
          "[UPDATE_SPOT_META] DOGEUSDT skipped because not in requested pairs"
        );
        console.log("Symbol object:", symbol);
        console.log("Requested pairs:", symbolPairs);
      }
      continue;
    }

    const lotSize = symbol.filters.find(
      (f: any) => f.filterType === "LOT_SIZE"
    );
    const priceFilter = symbol.filters.find(
      (f: any) => f.filterType === "PRICE_FILTER"
    );
    const minNotional = symbol.filters.find(
      (f: any) => f.filterType === "MIN_NOTIONAL"
    );

    if (!lotSize || !priceFilter) { if (symbol.symbol === "DOGEUSDT") {
      console.log("[UPDATE_SPOT_META] DOGEUSDT skipped because filters missing", {
        lotSize,
        priceFilter,
        minNotional,
      });
    }
      console.warn(
        "[UPDATE_SPOT_META] Skipping symbol, missing filters:",
        symbol.symbol
      );
      continue;
    }

    result[symbol.symbol] = {
      quantityStep: lotSize.stepSize,
      priceTick: priceFilter.tickSize,
      minNotional: minNotional?.minNotional ?? "0",
    };
  }

  await fs.writeFile(SPOT_CACHE_PATH, JSON.stringify(result, null, 2), "utf-8");
  console.log(
    "[UPDATE_SPOT_META] Update complete. Saved symbols:",
    Object.keys(result).length
  );
  console.log(
    "[UPDATE_SPOT_META] Skipped not trading:",
    skippedNotTrading,
    ", not in requested pairs:",
    skippedNotInPairs
  );

  return result;
}

/**
 * Filters and stores Binance futures symbol metadata for only the instruments you care about
 */
export async function updateBinanceFuturesSymbolMeta(symbolPairs: string[]) {
  console.log(
    "[UPDATE_FUTURES_META] Starting update for",
    symbolPairs.length,
    "symbols"
  );

  const url = "https://fapi.binance.com/fapi/v1/exchangeInfo";
  const { data } = await axios.get(url);

  console.log(
    "[UPDATE_FUTURES_META] Total symbols from Binance futures:",
    data.symbols.length
  );

  const result: Record<string, any> = {};
  let skippedNotTrading = 0;
  let skippedNotInPairs = 0;

  for (const symbol of data.symbols) {
    if (symbol.status !== "TRADING") {
      skippedNotTrading++;
      continue;
    }
    if (!symbolPairs.includes(symbol.symbol)) {
      skippedNotInPairs++;
      continue;
    }

    const lotSize = symbol.filters.find(
      (f: any) => f.filterType === "LOT_SIZE"
    );
    const priceFilter = symbol.filters.find(
      (f: any) => f.filterType === "PRICE_FILTER"
    );

    if (!lotSize || !priceFilter) {
      console.warn(
        "[UPDATE_FUTURES_META] Skipping symbol, missing filters:",
        symbol.symbol
      );
      continue;
    }

    result[symbol.symbol] = {
      quantityStep: lotSize.stepSize,
      priceTick: priceFilter.tickSize,
    };
  }

  await fs.writeFile(
    FUTURES_CACHE_PATH,
    JSON.stringify(result, null, 2),
    "utf-8"
  );
  console.log(
    "[UPDATE_FUTURES_META] Update complete. Saved symbols:",
    Object.keys(result).length
  );
  console.log(
    "[UPDATE_FUTURES_META] Skipped not trading:",
    skippedNotTrading,
    ", not in requested pairs:",
    skippedNotInPairs
  );

  return result;
}
