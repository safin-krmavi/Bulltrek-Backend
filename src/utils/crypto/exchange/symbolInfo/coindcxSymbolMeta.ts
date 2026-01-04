import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { ensureCacheFile } from "../../../ensureCacheFile";

const COINDCX_SPOT_CACHE_PATH = path.join(
  process.cwd(),
  "/data/coindcx_spot_symbol_meta.json"
);

const COINDCX_FUTURES_CACHE_PATH = path.join(
  process.cwd(),
  "/data/coindcx_futures_symbol_meta.json"
);

/**
 * CoinDCX SPOT
 */
export async function updateCoinDCXSpotSymbolMeta(symbolPairs: string[]) {
  console.log(
    "[UPDATE_COINDCX_SPOT_META] Starting update for",
    symbolPairs.length,
    "symbols"
  );
  try {
    const { data } = await axios.get(
      "https://api.coindcx.com/exchange/v1/markets_details"
    );

    const result: Record<string, any> = {};

    for (const market of data) {
      if (!market.coindcx_name) continue;

      result[market.coindcx_name] = {
        priceTick:
          typeof market.base_currency_precision === "number"
            ? 10 ** -market.base_currency_precision
            : null,
        quantityStep: market.step,
        minNotional: market.min_notional,
      };
    }

    // Save to cache file
    await fs.writeFile(
      COINDCX_SPOT_CACHE_PATH,
      JSON.stringify(result, null, 2)
    );

    console.log(
      "[UPDATE_COINDCX_SPOT_META] Saved:",
      Object.keys(result).length
    );

    return result;
  } catch (error) {
    console.error("Error fetching CoinDCX spot market details:", error);
    throw error;
  }
}
export async function updateCoindcxFuturesSymbolMeta(
  symbolPairs: string[],
  marginCurrency: "USDT" | "INR" = "USDT"
) {
  console.log(
    "[UPDATE_COINDCX_FUTURES_META] Starting update for",
    symbolPairs.length,
    "symbols with margin currency:",
    marginCurrency
  );

  const result: Record<string, any> = {};
  let skippedNotTrading = 0;
  let skippedNotFound = 0;
  let errorCount = 0;

  for (const pair of symbolPairs) {
    try {
      const url = `https://api.coindcx.com/exchange/v1/derivatives/futures/data/instrument?pair=${pair}&margin_currency_short_name=${marginCurrency}`;

      const { data } = await axios.get(url);

      if (!data.instrument) {
        console.warn(
          `[UPDATE_COINDCX_FUTURES_META] No instrument data for ${pair}`
        );
        skippedNotFound++;
        continue;
      }

      const instrument = data.instrument;

      // Only include active instruments
      if (instrument.status !== "active") {
        skippedNotTrading++;
        continue;
      }

      result[pair] = {
        priceTick: instrument.price_increment,
        quantityStep: instrument.quantity_increment,
        minNotional: instrument.min_notional,
      };

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (err: any) {
      console.error(
        `[UPDATE_COINDCX_FUTURES_META] Error fetching ${pair}:`,
        err?.message
      );
      errorCount++;
    }
  }

  // Save to cache file
  await fs.writeFile(
    COINDCX_FUTURES_CACHE_PATH,
    JSON.stringify(result, null, 2),
    "utf-8"
  );

  console.log(
    "[UPDATE_COINDCX_FUTURES_META] Saved:",
    Object.keys(result).length,
    "| Skipped not trading:",
    skippedNotTrading,
    "| Not found:",
    skippedNotFound,
    "| Errors:",
    errorCount
  );

  return result;
}
