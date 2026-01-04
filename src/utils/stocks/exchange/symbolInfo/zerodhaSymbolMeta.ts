import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { ensureCacheFile } from "../../../ensureCacheFile";
import csv from "csvtojson";

const ZERODHA_INSTRUMENT_CACHE_PATH = path.join(
  process.cwd(),
  "/data/zerodha_symbol_meta.json"
);

export async function updateZerodhaSymbolMeta(params: {
  apiKey: string;
  accessToken: string;
  symbols: string[]; // e.g. ["NSE:INFY", "NFO:NIFTY24JANFUT"]
}) {
  await ensureCacheFile(ZERODHA_INSTRUMENT_CACHE_PATH);

  console.log(
    "[UPDATE_ZERODHA_META] Starting update for",
    params.symbols.length,
    "symbols"
  );

  const res = await axios.get("https://api.kite.trade/instruments", {
    headers: {
      "X-Kite-Version": "3",
      Authorization: `token ${params.apiKey}:${params.accessToken}`,
    },
    responseType: "text",
    timeout: 30000,
  });

  const rows = await csv().fromString(res.data);

  const result: Record<string, any> = {};
  let skippedNotRequested = 0;
  let skippedInvalid = 0;

  for (const row of rows) {
    const key = `${row.exchange}:${row.tradingsymbol}`;

    if (!params.symbols.includes(key)) {
      skippedNotRequested++;
      continue;
    }

    const tickSize = Number(row.tick_size);
    const lotSize = Number(row.lot_size);

    if (!tickSize || !lotSize) {
      skippedInvalid++;
      continue;
    }

    result[key] = {
      priceTick: tickSize,
      quantityStep: lotSize,
      instrumentToken: row.instrument_token,
      segment: row.segment,
      instrumentType: row.instrument_type,
      expiry: row.expiry || null,
    };
  }

  await fs.writeFile(
    ZERODHA_INSTRUMENT_CACHE_PATH,
    JSON.stringify(result, null, 2),
    "utf-8"
  );

  console.log(
    "[UPDATE_ZERODHA_META] Saved:",
    Object.keys(result).length,
    "| Skipped not requested:",
    skippedNotRequested,
    "| Skipped invalid:",
    skippedInvalid
  );

  return result;
}
