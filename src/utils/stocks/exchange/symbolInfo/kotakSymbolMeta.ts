import axios from "axios";
import fs from "fs/promises";
import csv from "csvtojson";
import { ensureCacheFile } from "../../../ensureCacheFile";
import path from "path";

export const KOTAK_CACHE_PATH = path.join(
  process.cwd(),
  "/data/kotak_symbol_meta.json"
);
export async function updateKotakSymbolMeta(params: {
  baseUrl: string;
  authToken: string;
  symbols: string[]; // keys you care about: nse_cm|11536 OR index names
}) {
  await ensureCacheFile(KOTAK_CACHE_PATH);

  console.log(
    "[UPDATE_KOTAK_META] Starting update for",
    params.symbols.length,
    "symbols"
  );

  // 1. Get CSV download links
  const { data } = await axios.get(
    `${params.baseUrl}/script-details/1.0/masterscrip/file-paths`,
    {
      headers: {
        Authorization: params.authToken,
      },
      timeout: 15000,
    }
  );

  const filePaths: string[] = data?.data?.filesPaths ?? [];
  if (!filePaths.length) {
    throw new Error("Kotak scrip master paths not received");
  }

  const result: Record<string, any> = {};
  let skippedNotRequested = 0;

  // 2. Download and parse each CSV
  for (const fileUrl of filePaths) {
    const res = await axios.get(fileUrl, {
      responseType: "text",
      timeout: 30000,
    });

    const rows = await csv().fromString(res.data);

    for (const row of rows) {
      const exchange = row.pExchSeg;
      const pSymbol = row.pSymbol;

      if (!exchange || !pSymbol) continue;

      const key = `${exchange}|${pSymbol}`;

      if (!params.symbols.includes(key)) {
        skippedNotRequested++;
        continue;
      }

      result[key] = {
        exchangeSegment: exchange,
        pSymbol,
        tradingSymbol: row.pTrdSymbol,
        quantityStep: Number(row.lLotSize) || 1,
        expiryEpoch: row.lExpiryDate || null,
      };
    }
  }

  await fs.writeFile(
    KOTAK_CACHE_PATH,
    JSON.stringify(result, null, 2),
    "utf-8"
  );

  console.log(
    "[UPDATE_KOTAK_META] Saved:",
    Object.keys(result).length,
    "| Skipped not requested:",
    skippedNotRequested
  );

  return result;
}
