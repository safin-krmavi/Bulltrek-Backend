// instrumentTokenService.ts
import fs from "fs";
import path from "path";
import axios from "axios";
import csv from "csv-parser";
import { Readable } from "stream";

const ZERODHA_JSON_PATH = path.join(
  process.cwd(),
  "/data/zerodha_instruments.json"
);

/**
 * Fetch instruments from Zerodha API and store JSON
 */
export async function fetchAndStoreZerodhaInstruments(): Promise<
  Record<number, string>
> {
  console.log("HELLO");

  const res = await axios.get("https://api.kite.trade/instruments", {
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

  fs.writeFileSync(ZERODHA_JSON_PATH, JSON.stringify(tempMap, null, 2), {
    encoding: "utf-8",
  });
  console.log(
    `[Zerodha Instruments] Fetched & stored ${
      Object.keys(tempMap).length
    } tokens.`
  );
  return tempMap;
}

/**
 * Load instrument tokens from previously stored JSON
 */
export function loadZerodhaInstrumentTokensFromFile(): number[] {
  const ZERODHA_JSON_PATH = path.join(
    process.cwd(),
    "/data/zerodha_instruments.json"
  );
  if (!fs.existsSync(ZERODHA_JSON_PATH)) return [];

  const data = fs.readFileSync(ZERODHA_JSON_PATH, "utf-8");
  const tokenMap: Record<number, string> = JSON.parse(data);
  return Object.keys(tokenMap).map((t) => Number(t));
}
