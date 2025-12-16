import path from "path";
import fs from "fs";
import { TradeSide } from "@prisma/client";
import { generateHeadersKucoin } from "../../../utils/crypto/exchange/kucoinUtils";
import axios from "axios";
import { fetchSymbolPairs } from "../../../services/crypto/exchange/exchangeService";

export interface KucoinConfig {
  apiKey: string;
  apiSecret: string;
  apiPassphrase: string;
  apiKeyVersion: string;
}

// export interface KucoinBrokerConfig {
//   partner: string; // Partner identifier provided by KuCoin
//   brokerKey: string; // Broker key provided by KuCoin
//   brokerName: string; // Broker name provided by KuCoin
//   enableBroker: boolean; // Flag to enable/disable broker mode
// }
export interface KucoinSpotOrderParams {
  symbol: string;
  orderType: "LIMIT" | "MARKET";
  side: TradeSide;
  price?: string;
  quantity?: string;
}

export interface KucoinFuturesOrderParams {
  symbol: string;
  side: TradeSide;
  quantity: number;
  orderType: "LIMIT" | "MARKET";
  leverage: number;
  price?: string;
  stopPrice?: string;
  positionMarginType?: "isolated" | "crossed";
}

// Cache object to store symbol data
let symbolDataCache: Record<string, any> = {};
const cacheFilePath = path.join(__dirname, "../data/symbol_data_cache.json");

// Rate limiting configuration
const BATCH_SIZE = 5; // Number of requests to make in each batch
const BATCH_DELAY_MS = 3000; // Delay between batches in milliseconds
const REQUEST_DELAY_MS = 200; // Delay between individual requests in milliseconds

/**
 * Extract KuCoin symbols from the symbol pairs data
 * @param {Array} symbolPairs The symbol pairs data
 * @returns {Array} Array of KuCoin symbols
 */
function extractKuCoinSymbols(symbolPairs: any): string[] {
  const kuCoinSymbols: string[] = [];

  // Process all entries in the symbol pairs array
  symbolPairs.forEach((typeGroup: any) => {
    if (typeGroup.type === "FUTURE") {
      typeGroup.data.forEach((exchangeGroup: any) => {
        if (exchangeGroup.exchange === "KUCOIN") {
          exchangeGroup.data.forEach((symbol: any) => {
            kuCoinSymbols.push(symbol.symbol);
          });
        }
      });
    }
  });

  // console.log("FOUND_KUCOIN_SYMBOLS", {
  //   symbolCount: kuCoinSymbols.length,
  // });
  return kuCoinSymbols;
}

/**
 * Helper function to wait for a specified time
 * @param {number} ms Time to wait in milliseconds
 * @returns {Promise<void>}
 */
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch symbol data from KuCoin API with retry logic
 * @param {string} symbol The symbol to fetch data for
 * @param {number} retries Number of retries (default: 3)
 * @returns {Promise<Object>} Symbol data object
 */
async function fetchSymbolData(symbol: string, retries = 3): Promise<any> {
  let attempt = 0;

  while (attempt <= retries) {
    try {
      const method = "GET";
      const endpoint = `/api/v1/contracts/${symbol}`;
      const config = {
        apiKey: process.env.KUCOIN_API_KEY || "",
        apiSecret: process.env.KUCOIN_API_SECRET || "",
        apiPassphrase: process.env.KUCOIN_API_PASSPHRASE || "",
        apiKeyVersion: process.env.KC_API_KEY_VERSION || "2", // default to version 2 if not set
      };
      // KuCoin's API endpoint for contract details
      const headers = await generateHeadersKucoin(config, method, endpoint);
      const url = `https://api-futures.kucoin.com${endpoint}`;
      const response = await axios.get(url, {
        params: { symbol },
        headers,
        timeout: 5000, // 5 second timeout
      });

      if (response.data && response.data.code === "200000") {
        return response.data.data;
      } else {
        console.log("ERROR_FETCHING_SYMBOL_DATA", {
          error: response?.data,
          symbol: symbol,
        });

        // If we receive a rate limit error (429) or server error (5xx), wait longer
        if (response.status === 429 || response.status >= 500) {
          await delay(2000 * (attempt + 1)); // Progressive backoff
        }
      }
    } catch (error: any) {
      console.log("FETCH_ATTEMPT_FAILED", {
        error:
          error?.response?.data?.msg || error?.response?.data || error.message,
        symbol: symbol,
        attempt: attempt + 1,
      });

      // Check if it's a 400 error (likely invalid symbol)
      if (error.response && error.response.status === 400) {
        console.log("INVALID_SYMBOL_SKIPPING_RETRIES", {
          symbol: symbol,
        });
        return null;
      }
    }

    attempt++;
    if (attempt <= retries) {
      const backoffTime = 1000 * Math.pow(2, attempt); // Exponential backoff
      console.log("RETRYING_SYMBOL_FETCH", {
        symbol: symbol,
        backoffTime: backoffTime,
        attempt: attempt + 1,
        maxAttempts: retries + 1,
      });
      await delay(backoffTime);
    }
  }

  console.log("FAILED_TO_FETCH_AFTER_RETRIES", {
    symbol: symbol,
    totalAttempts: retries + 1,
  });
  return null;
}

/**
 * Process a batch of symbols with rate limiting
 * @param {string[]} symbols Array of symbols to process
 * @returns {Promise<Record<string, any>>} Processed symbol data
 */
async function processBatch(symbols: string[]): Promise<Record<string, any>> {
  const batchData: Record<string, any> = {};

  for (const symbol of symbols) {
    try {
      const data = await fetchSymbolData(symbol);
      if (data) {
        batchData[symbol] = data;
        console.log("SUCCESSFULLY_FETCHED_SYMBOL_DATA", {
          symbol: symbol,
        });
      }
      // Add delay between individual requests to avoid rate limits
      await delay(REQUEST_DELAY_MS);
    } catch (error: any) {
      console.log("FAILED_IN_BATCH_PROCESSING", {
        error: error?.data || error?.response?.data || error.message,
        symbol: symbol,
      });
    }
  }

  return batchData;
}

/**
 * Fetch data for all symbols with rate limiting
 * @param {string[]} symbols Array of symbols to fetch data for
 * @returns {Promise<Record<string, any>>} Object with symbol data keyed by symbol
 */
async function fetchAllSymbolData(
  symbols: string[]
): Promise<Record<string, any>> {
  const symbolData: Record<string, any> = {};

  // Process symbols in batches to respect rate limits
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    console.log("PROCESSING_BATCH", {
      batchNumber: Math.floor(i / BATCH_SIZE) + 1,
      totalBatches: Math.ceil(symbols.length / BATCH_SIZE),
    });
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const batchData = await processBatch(batch);

    // Merge batch results into the main result object
    Object.assign(symbolData, batchData);

    // Add delay between batches
    if (i + BATCH_SIZE < symbols.length) {
      console.log("BATCH_COMPLETE_WAITING", {
        delayMs: BATCH_DELAY_MS,
      });
      await delay(BATCH_DELAY_MS);
    }
  }

  return symbolData;
}

/**
 * Load cached data from file
 * @returns {Promise<Record<string, any>>} Cached symbol data
 */
async function loadCache(): Promise<Record<string, any>> {
  try {
    if (fs.existsSync(cacheFilePath)) {
      const data = await fs.promises.readFile(cacheFilePath, "utf8");
      return JSON.parse(data);
    }
    return {};
  } catch (error: any) {
    console.log("ERROR_LOADING_CACHE", {
      error: error?.data || error?.response?.data || error.message,
    });
    return {};
  }
}

/**
 * Save data to cache file
 * @param {Record<string, any>} data Symbol data to cache
 * @returns {Promise<void>}
 */
async function saveCache(data: Record<string, any>): Promise<void> {
  try {
    await fs.promises.writeFile(
      cacheFilePath,
      JSON.stringify(data, null, 2),
      "utf8"
    );
    console.log("CACHE_SAVED", {});
  } catch (error: any) {
    console.log("ERROR_SAVING_CACHE", {
      error: error?.data || error?.response?.data || error.message,
    });
    throw new Error("ERROR IS SAVE CACHE");
  }
}

/**
 * Update the symbol data cache
 * @returns {Promise<Record<string, any>>} Updated symbol data
 */
async function updateSymbolDataCache() {
  // Promise<Record<string, any>>
  console.log("UPDATING_SYMBOL_DATA_CACHE", {});
  try {
    // Read symbol pairs
    const symbolPairs = await fetchSymbolPairs();
    // Extract KuCoin symbols
    const kuCoinSymbols = extractKuCoinSymbols(symbolPairs);

    console.log("STARTING_SYMBOL_DATA_FETCH", {});

    // Fetch data for all symbols
    const symbolData = await fetchAllSymbolData(kuCoinSymbols);

    // Update global cache
    symbolDataCache = symbolData;

    // // Save to cache file
    await saveCache(symbolData);

    console.log("SYMBOL_DATA_UPDATED", {
      symbolCount: Object.keys(symbolData).length,
    });
    return symbolData;
  } catch (error: any) {
    console.log("ERROR_UPDATING_SYMBOL_DATA_CACHE", {
      error: error?.data || error?.response?.data || error.message,
    });
    throw new Error(`ERROR IS UPDATE SYMBOL ${error}`);
  }
}

export async function getSymbolData(
  symbols: string | string[] | null = null
): Promise<any> {
  // If cache is empty, try to load from file
  if (Object.keys(symbolDataCache).length === 0) {
    symbolDataCache = await loadCache();

    // If still empty (no cache file), update cache
    if (Object.keys(symbolDataCache).length === 0) {
      await updateSymbolDataCache();
    }
  }

  // Handle different input types
  if (symbols === null) {
    // Return all symbol data
    return symbolDataCache;
  } else if (typeof symbols === "string") {
    // Return data for a single symbol
    return symbolDataCache[symbols] || null;
  } else if (Array.isArray(symbols)) {
    // Return data for multiple symbols as an object
    const result: { [key: string]: any } = {};
    for (const symbol of symbols) {
      if (symbolDataCache[symbol]) {
        result[symbol] = symbolDataCache[symbol];
      }
    }
    return result;
  }

  return null;
}
