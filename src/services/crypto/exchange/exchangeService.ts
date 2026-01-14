import { CryptoExchange, CryptoTradeType } from "@prisma/client";
import fs from "fs/promises";
import {
  fetchBinanceSpotBalances,
  fetchBinanceFuturesBalances,
  verifyBinanceCredentials,
} from "./binanceService";
import {
  fetchKucoinFuturesBalances,
  fetchKucoinSpotBalances,
  verifyKucoinCredentials,
} from "./kucoinService";
import {
  getCoinDCXFuturesBalances,
  getCoinDCXSpotBalances,
  verifyCoinDCXCredentials,
} from "./coindcxService";
import { FILE_PATH } from "../../../constants/crypto";
import {
  updateBinanceFuturesSymbolMeta,
  updateBinanceSpotSymbolMeta,
} from "../../../utils/crypto/exchange/symbolInfo/binanceSymbolMeta";
import {
  updateKucoinFuturesSymbolMeta,
  updateKucoinSpotSymbolMeta,
} from "../../../utils/crypto/exchange/symbolInfo/kucoinSymbolMeta";
import {
  updateCoindcxFuturesSymbolMeta,
  updateCoinDCXSpotSymbolMeta,
} from "../../../utils/crypto/exchange/symbolInfo/coindcxSymbolMeta";

export const fetchSymbolPairs = async () => {
  //read the file from data/symbol_pairs.json
  try {
    const data = await fs.readFile(FILE_PATH, "utf-8");
    const parsedData = JSON.parse(data);
    return parsedData;
  } catch (error: any) {
    throw {
      code: "SERVER_ERROR",
      message: "Failed to read symbol pairs data",
    };
  }
};
export async function verifyExchangeCredentials(
  exchange: CryptoExchange,
  creds: any
) {
  switch (exchange) {
    case CryptoExchange.BINANCE:
      return verifyBinanceCredentials(creds);
    case CryptoExchange.KUCOIN:
      return verifyKucoinCredentials(creds);
    case CryptoExchange.COINDCX:
      return verifyCoinDCXCredentials(creds);
    default:
      throw {
        code: "UNSUPPORTED_EXCHANGE",
        message: "Unsupported exchange",
      };
  }
}

export async function getExchangeBalances(
  exchange: CryptoExchange,
  credentials: any,
  type: CryptoTradeType
) {
  switch (exchange) {
    case CryptoExchange.BINANCE:
      return type === CryptoTradeType.SPOT
        ? fetchBinanceSpotBalances(credentials)
        : fetchBinanceFuturesBalances(credentials);

    case CryptoExchange.KUCOIN:
      return type === CryptoTradeType.SPOT
        ? fetchKucoinSpotBalances(credentials)
        : fetchKucoinFuturesBalances(credentials);

    case CryptoExchange.COINDCX:
      return type === CryptoTradeType.SPOT
        ? getCoinDCXSpotBalances(credentials)
        : getCoinDCXFuturesBalances(credentials);

    default:
      throw { code: "UNSUPPORTED_EXCHANGE", message: "Unsupported exchange" };
  }
}
/**
 * Main service to refresh symbol meta
 */
export async function refreshSymbolMeta(formattedData: any) {
  const binanceSpotSymbols: string[] = (
    formattedData
      .find((item: any) => item.type === "CRYPTO_SPOT")
      ?.data.find((d: any) => d.exchange === "BINANCE")?.data ?? []
  ).map((s: any) => s.symbol);

  const binanceFuturesSymbols: string[] = (
    formattedData
      .find((item: any) => item.type === "CRYPTO_FUTURES")
      ?.data.find((d: any) => d.exchange === "BINANCE")?.data ?? []
  ).map((s: any) => s.symbol);

  const kucoinSpotSymbols: string[] = (
    formattedData
      .find((item: any) => item.type === "CRYPTO_SPOT")
      ?.data.find((d: any) => d.exchange === "KUCOIN")?.data ?? []
  ).map((s: any) => s.symbol);

  const kucoinFuturesSymbols: string[] = (
    formattedData
      .find((item: any) => item.type === "CRYPTO_FUTURES")
      ?.data.find((d: any) => d.exchange === "KUCOIN")?.data ?? []
  ).map((s: any) => s.symbol);

  console.log(
    "[REFRESH_SYMBOL_META] KUCOIN SPOT symbols count:",
    kucoinSpotSymbols.length
  );
  console.log(
    "[REFRESH_SYMBOL_META] KUCOIN FUTURES symbols count:",
    kucoinFuturesSymbols.length
  );

  const coindcxSpotSymbols: string[] = (
    formattedData
      .find((item: any) => item.type === "CRYPTO_SPOT")
      ?.data.find((d: any) => d.exchange === "COINDCX")?.data ?? []
  ).map((s: any) => s.symbol);

  const coindcxFuturesSymbols: string[] = (
    formattedData
      .find((item: any) => item.type === "CRYPTO_FUTURES")
      ?.data.find((d: any) => d.exchange === "COINDCX")?.data ?? []
  ).map((s: any) => s.symbol);

  console.log(
    "[REFRESH_SYMBOL_META] COINDCX SPOT symbols count:",
    coindcxSpotSymbols.length
  );
  console.log(
    "[REFRESH_SYMBOL_META] COINDCX FUTURES symbols count:",
    coindcxFuturesSymbols.length
  );

  // Run all updates and collect results
  const [binSpot, binFut,  coindcxSpot, coindcxFut] =
    await Promise.all([
      updateBinanceSpotSymbolMeta(binanceSpotSymbols),
      updateBinanceFuturesSymbolMeta(binanceFuturesSymbols),
      // updateKucoinSpotSymbolMeta(kucoinSpotSymbols),
      // updateKucoinFuturesSymbolMeta(kucoinFuturesSymbols),
      updateCoinDCXSpotSymbolMeta(coindcxSpotSymbols),
      updateCoindcxFuturesSymbolMeta(coindcxFuturesSymbols),
    ]);
  console.log("DONE");
  // Return all results
  return {
    binance: {
      spot: binSpot,
      futures: binFut,
    },
  
    coindcx: {
      spot: coindcxSpot,
      futures: coindcxFut,
    },
  };
}

/**
 * Search crypto symbols across all exchanges and segments
 */
export async function searchCryptoSymbols(query: string) {
  try {
    if (!query || query.trim().length < 1) {
      throw new Error("Search query is required");
    }

    const searchLower = query.toLowerCase();
    const results: Record<string, any[]> = {};

    // Read symbol pairs file
    const data = await fs.readFile(FILE_PATH, "utf-8");
    const parsed = JSON.parse(data);

    // Search in both SPOT and FUTURES segments
    parsed.forEach((segment: any) => {
      const segmentType = segment.type; // CRYPTO_SPOT or CRYPTO_FUTURES

      segment.data.forEach((exchange: any) => {
        const exchangeName = exchange.exchange; // BINANCE, KUCOIN, COINDCX

        // Filter symbols based on search query
        // EXACT MATCH first, then partial matches
        const matchedSymbols = exchange.data.filter((symbol: any) => {
          const symbolLower = symbol.symbol?.toLowerCase() || "";
          const baseLower = symbol.baseAsset?.toLowerCase() || symbol.base?.toLowerCase() || "";
          const quoteLower = symbol.quoteAsset?.toLowerCase() || symbol.quote?.toLowerCase() || "";
          
          // Exact match for symbol (highest priority)
          if (symbolLower === searchLower) return true;
          
          // Partial matches
          if (symbolLower.includes(searchLower)) return true;
          if (baseLower.includes(searchLower)) return true;
          if (quoteLower.includes(searchLower)) return true;
          
          return false;
        });

        if (matchedSymbols.length > 0) {
          const key = `${exchangeName}_${segmentType}`;
          results[key] = matchedSymbols.map((symbol: any) => ({
            symbol: symbol.symbol,
            baseAsset: symbol.baseAsset || symbol.base,
            quoteAsset: symbol.quoteAsset || symbol.quote,
            exchange: exchangeName,
            segment: segmentType,
          }));
        }
      });
    });

    return results;
  } catch (error) {
    console.error("ERROR_SEARCHING_CRYPTO_SYMBOLS", error);
    throw error;
  }
}

/**
 * Get crypto symbol by exact symbol name
 */
export async function getCryptoSymbolBySymbol(symbol: string) {
  try {
    if (!symbol || symbol.trim().length < 1) {
      throw new Error("Symbol is required");
    }

    const symbolUpper = symbol.toUpperCase();
    const result: any = {};

    // Read symbol pairs file
    const data = await fs.readFile(FILE_PATH, "utf-8");
    const parsed = JSON.parse(data);

    // Search in both SPOT and FUTURES segments
    parsed.forEach((segment: any) => {
      const segmentType = segment.type; // CRYPTO_SPOT or CRYPTO_FUTURES

      segment.data.forEach((exchange: any) => {
        const exchangeName = exchange.exchange; // BINANCE, KUCOIN, COINDCX

        // Find exact match
        const foundSymbol = exchange.data.find(
          (s: any) => s.symbol?.toUpperCase() === symbolUpper
        );

        if (foundSymbol) {
          const key = `${exchangeName}_${segmentType}`;
          if (!result[key]) {
            result[key] = [];
          }
          result[key].push({
            symbol: foundSymbol.symbol,
            baseAsset: foundSymbol.baseAsset || foundSymbol.base,
            quoteAsset: foundSymbol.quoteAsset || foundSymbol.quote,
            exchange: exchangeName,
            segment: segmentType,
          });
        }
      });
    });

    return result;
  } catch (error) {
    console.error("ERROR_GETTING_CRYPTO_SYMBOL", error);
    throw error;
  }
}
