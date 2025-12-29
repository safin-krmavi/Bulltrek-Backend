// kotakInstrumentService.ts
import fs from "fs";
import path from "path";
import axios from "axios";
import csv from "csv-parser";
import { Readable } from "stream";

const KOTAK_JSON_PATH = path.join(
  process.cwd(),
  "/data/kotak_instruments.json"
);

/**
 * Fetch instruments from Kotak API and store JSON
 */
export async function fetchAndStoreKotakInstruments(): Promise<
  Record<number, string>
> {
  // Replace with the actual Kotak API endpoint
  const res = await axios.get("https://api.kotaksecurities.com/instruments", {
    responseType: "text",
  });

  const tempMap: Record<number, string> = {};

  await new Promise<void>((resolve, reject) => {
    Readable.from(res.data)
      .pipe(csv())
      .on("data", (row) => {
        if (
          row.exchange === "NSE" &&
          row.instrument_token &&
          row.tradingsymbol
        ) {
          const token = Number(row.instrument_token);
          tempMap[token] = row.tradingsymbol;
        }
      })
      .on("end", resolve)
      .on("error", reject);
  });

  fs.writeFileSync(KOTAK_JSON_PATH, JSON.stringify(tempMap, null, 2), {
    encoding: "utf-8",
  });

  console.log(
    `[Kotak Instruments] Fetched & stored ${
      Object.keys(tempMap).length
    } tokens.`
  );
  return tempMap;
}

/**
 * Load Kotak instrument tokens from previously stored JSON
 */
export function loadKotakInstrumentTokensFromFile(): number[] {
  if (!fs.existsSync(KOTAK_JSON_PATH)) return [];

  const data = fs.readFileSync(KOTAK_JSON_PATH, "utf-8");
  const tokenMap: Record<number, string> = JSON.parse(data);
  return Object.keys(tokenMap).map((t) => Number(t));
}
