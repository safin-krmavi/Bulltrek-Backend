import axios from "axios";
import crypto from "crypto";

import csv from "csv-parser";
import { Readable } from "stream";

import {
  ZERODHA_BASE_URL,
  ZERODHA_LOGIN_URL,
} from "../../../constants/stocks/externalUrls";
import {
  endOfDay,
  handleZerodhaError,
  ZerodhaOrderPayload,
} from "../../../utils/stocks/exchange/zerodhaUtils";
import { StocksExchange } from "@prisma/client";
import { addOrUpdateStocksCredentials } from "../credentialsService";
import path from "path";
import fs from "fs";
import { STOCKS_FILE_PATH } from "../../../constants/stocks";

export function loadZerodhaInstrumentTokenMapFromFile(): Record<
  number,
  string
> {
  if (!fs.existsSync(STOCKS_FILE_PATH)) return {};

  const raw = fs.readFileSync(STOCKS_FILE_PATH, "utf-8");
  const parsed = JSON.parse(raw);

  const stocksBlock = parsed.find((block: any) => block.type === "STOCKS");
  if (!stocksBlock) return {};

  const zerodhaBlock = stocksBlock.data.find(
    (ex: any) => ex.exchange === "ZERODHA"
  );
  if (!zerodhaBlock) return {};

  const map: Record<number, string> = {};
  zerodhaBlock.data.forEach((item: any) => {
    if (item.instrumentToken && item.tradingsymbol) {
      map[Number(item.instrumentToken)] = item.tradingsymbol;
    }
  });

  return map;
}

/**
 * Fetch instruments from Zerodha API and store JSON
 */
export async function fetchAndStoreZerodhaInstruments(): Promise<
  Record<number, string>
> {
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

  // fs.writeFileSync(ZERODHA_JSON_PATH, JSON.stringify(tempMap, null, 2), {
  //   encoding: "utf-8",
  // });
  console.log(
    `[Zerodha Instruments] Fetched & stored ${
      Object.keys(tempMap).length
    } tokens.`
  );
  return tempMap;
}

/**
 * STEP 1: Generate Zerodha Login URL
 */
export function getZerodhaLoginUrl() {
  const apiKey = process.env.ZERODHA_API_KEY;
  return `${ZERODHA_LOGIN_URL}?v=3&api_key=${apiKey}`;
}

export function handleZerodhaAuthCallback(req: any) {
  const { request_token, status } = req.query as {
    request_token?: string;
    status?: string;
  };

  if (status !== "success") {
    throw {
      code: "AUTH_FAILED",
      message: "Zerodha login was not successful",
    };
  }

  if (!request_token) {
    throw {
      code: "AUTH_FAILED",
      message: "Request token not found in callback",
    };
  }

  return {
    requestToken: request_token,
  };
}

/**
 * STEP 2: Exchange request_token → access_token
 * Store access token in DB (valid for the trading day)
 */
export async function loginZerodha(params: {
  userId: string;
  apiKey: string;
  apiSecret: string;
  requestToken: string;
}) {
  try {
    const apiKey = process.env.ZERODHA_API_KEY;
    const apiSecret = process.env.ZERODHA_API_SECRET;

    const checksum = crypto
      .createHash("sha256")
      .update(`${apiKey}${params.requestToken}${apiSecret}`)
      .digest("hex");

    const payload = new URLSearchParams({
      api_key: apiKey,
      request_token: params.requestToken,
      checksum,
    });

    const response = await axios.post(
      `${ZERODHA_BASE_URL}/session/token`,
      payload,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Kite-Version": "3",
        },
      }
    );

    const { access_token, user_id } = response.data.data;

    await addOrUpdateStocksCredentials({
      userId: params.userId,
      exchange: StocksExchange.ZERODHA,
      apiKey: apiKey,
      clientCode: user_id,
      accessToken: access_token,
      expiresAt: endOfDay(),
    });

    return { success: true };
  } catch (error: any) {
    handleZerodhaError(error);
  }
}
export async function getZerodhaBalances(credentials: { accessToken: string }) {
  try {
    const apiKey = process.env.ZERODHA_API_KEY!;

    const headers = {
      "X-Kite-Version": "3",
      Authorization: `token ${apiKey}:${credentials.accessToken}`,
    };

    const [marginsRes, holdingsRes] = await Promise.all([
      axios.get(`${ZERODHA_BASE_URL}/user/margins`, { headers }),
      axios.get(`${ZERODHA_BASE_URL}/portfolio/holdings`, { headers }),
    ]);

    return {
      money: marginsRes.data,
      stocks: holdingsRes.data,
    };
  } catch (error: any) {
    handleZerodhaError(error);
  }
}

export async function createZerodhaOrder(
  credentials: { apiKey: string; accessToken: string },
  payload: ZerodhaOrderPayload
) {
  try {
    console.log("PAYLOAD:", payload);

    const variety = payload.variety ?? "regular";

    // Convert payload to form-urlencoded
    const formPayload = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined) formPayload.append(key, String(value));
    });

    const response = await axios.post(
      `${ZERODHA_BASE_URL}/orders/${variety}`,
      formPayload.toString(),
      {
        headers: {
          "X-Kite-Version": "3",
          Authorization: `token ${credentials.apiKey}:${credentials.accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return response.data;
  } catch (error: any) {
    handleZerodhaError(error);
  }
}

export async function getZerodhaPositions(credentials: {
  apiKey: string;
  accessToken: string;
}) {
  try {
    const response = await axios.get(
      `${ZERODHA_BASE_URL}/portfolio/positions`,
      {
        headers: {
          "X-Kite-Version": "3",
          Authorization: `token ${credentials.apiKey}:${credentials.accessToken}`,
        },
      }
    );

    return response.data;
  } catch (error: any) {
    handleZerodhaError(error);
  }
}

/**
 * Load Zerodha instruments from file
 */
function loadZerodhaInstrumentsFromFile(): Record<string, string> {
  if (!fs.existsSync(STOCKS_FILE_PATH)) return {};

  const raw = fs.readFileSync(STOCKS_FILE_PATH, "utf-8");
  const parsed = JSON.parse(raw);

  const stocksBlock = parsed.find((block: any) => block.type === "STOCKS");
  if (!stocksBlock) return {};

  const zerodhaBlock = stocksBlock.data.find(
    (ex: any) => ex.exchange === "ZERODHA"
  );
  if (!zerodhaBlock) return {};

  const map: Record<string, string> = {};
  zerodhaBlock.data.forEach((item: any) => {
    if (item.instrumentToken && item.tradingsymbol) {
      map[String(item.instrumentToken)] = item.tradingsymbol;
    }
  });

  return map;
}

/**
 * Get all Zerodha instruments, optionally filter by search string
 */
export function getZerodhaInstruments(search?: string) {
  try {
    const instruments = Object.entries(loadZerodhaInstrumentsFromFile()).map(
      ([instrumentToken, tradingSymbol]) => ({ instrumentToken, tradingSymbol })
    );

    if (search) {
      const searchLower = search.toLowerCase();
      return instruments.filter((instrument) =>
        instrument.tradingSymbol.toLowerCase().includes(searchLower)
      );
    }

    return instruments;
  } catch (error) {
    console.error("ERROR_GETTING_ZERODHA_INSTRUMENTS", error);
    throw error;
  }
}

/**
 * Get Zerodha instrument by token
 */
export function getZerodhaInstrumentByToken(instrumentToken: string) {
  try {
    const instruments = loadZerodhaInstrumentsFromFile();
    const tradingSymbol = instruments[instrumentToken];

    if (!tradingSymbol) {
      throw new Error(`Instrument token ${instrumentToken} not found`);
    }

    return { instrumentToken, tradingSymbol };
  } catch (error) {
    console.error("ERROR_GETTING_ZERODHA_INSTRUMENT", error);
    throw error;
  }
}

/**
 * Get Zerodha instrument by symbol
 */
export function getZerodhaInstrumentBySymbol(symbol: string) {
  try {
    const instruments = loadZerodhaInstrumentsFromFile();
    const entry = Object.entries(instruments).find(
      ([_, tradingSymbol]) => tradingSymbol === symbol.toUpperCase()
    );

    if (!entry) {
      throw new Error(`Symbol ${symbol} not found`);
    }

    return { instrumentToken: entry[0], tradingSymbol: entry[1] };
  } catch (error) {
    console.error("ERROR_GETTING_ZERODHA_INSTRUMENT_BY_SYMBOL", error);
    throw error;
  }
}
