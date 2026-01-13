import { CryptoTradeType, StocksExchange, TradeSide } from "@prisma/client";
import {
  createZerodhaOrder,
  getZerodhaBalances,
  getZerodhaLoginUrl,
  getZerodhaPositions,
  handleZerodhaAuthCallback,
  loginZerodha,
} from "../exchange/zerodhaService";
import {
  createAngelOneOrder,
  getAngelOneBalances,
  getAngelOneLoginUrl,
  getAngelOnePositions,
  handleAngelOneCallback,
} from "./angeloneService";
import { CommonOrderPayload } from "../../../utils/stocks/exchange/tradeUtils";
import { mapToZerodhaOrder } from "../../../utils/stocks/exchange/zerodhaUtils";
import { mapToAngelOneOrder } from "../../../utils/stocks/exchange/angeloneUtils";
import {
  createKotakNeoOrder,
  getKotakNeoHoldings,
  getKotakNeoOrders,
  kotakNeoTotpLogin,
  kotakNeoValidateMpin,
} from "./kotakService";
import prisma from "../../../config/db.config";
import fs from "fs";
import { STOCKS_FILE_PATH } from "../../../constants/stocks";

/**
 * STEP 1: Get Login URL (only for Zerodha)
 */
export function getStockLoginUrl(exchange: StocksExchange, userId: string) {
  switch (exchange) {
    case StocksExchange.ZERODHA:
      return { loginUrl: getZerodhaLoginUrl() };

    case StocksExchange.ANGELONE:
      return {
        loginUrl: getAngelOneLoginUrl(userId),
      };

    default:
      throw {
        code: "UNSUPPORTED_BROKER",
        message: "Unsupported broker",
      };
  }
}

/**
 * STEP 2: Handle callback (Zerodha only)
 */
export function handleStockAuthCallback(exchange: StocksExchange, req: any) {
  switch (exchange) {
    case StocksExchange.ZERODHA:
      return handleZerodhaAuthCallback(req);
    case StocksExchange.ANGELONE:
      return handleAngelOneCallback(req);

    default:
      throw {
        code: "UNSUPPORTED_FLOW",
        message: "Callback not supported for this broker",
      };
  }
}

/**
 * STEP 3: Login / Generate Access Token
 */
export async function loginStockExchange(
  exchange: StocksExchange,
  params: any
) {
  switch (exchange) {
    case StocksExchange.ZERODHA:
      return loginZerodha(params);

    case StocksExchange.KOTAK: {
      console.log("[KOTAK] Login flow started", {
        userId: params.userId,
        ucc: params.clientCode,
      });

      const { viewToken, viewSid } = await kotakNeoTotpLogin({
        accessToken: params.accessToken,
        mobileNumber: params.mobileNumber,
        ucc: params.clientCode,
        totp: params.totp,
      });

      console.log("[KOTAK] TOTP login successful", {
        userId: params.userId,
        viewSidPresent: Boolean(viewSid),
      });

      const result = await kotakNeoValidateMpin({
        userId: params.userId,
        clientCode: params.clientCode,
        accessToken: params.accessToken,
        viewToken,
        viewSid,
        mpin: params.mpin,
      });

      console.log("[KOTAK] MPIN validation completed", {
        userId: params.userId,
      });

      return result;
    }

    case StocksExchange.ANGELONE:
      throw {
        code: "NOT_REQUIRED",
        message: "Unsupported broker",
      };

    default:
      throw {
        code: "UNSUPPORTED_BROKER",
        message: "Unsupported broker",
      };
  }
}

/**
 * Verify API keys by making a lightweight authenticated call
 */
export async function verifyStockCredentials(
  exchange: StocksExchange,
  credentials: any
) {
  switch (exchange) {
    case StocksExchange.ZERODHA:
      // balances is the safest validation
      await getZerodhaBalances(credentials);
      return { verified: true };

    case StocksExchange.ANGELONE:
      await getAngelOneBalances(credentials);
      return { verified: true };
    case StocksExchange.KOTAK:
      const data = await getKotakNeoHoldings({
        baseUrl: credentials.feedToken,
        tradingToken: credentials.accessToken,
        tradingSid: credentials.refreshToken,
      });
      console.log("DATA", data);
      return { verified: true };

    default:
      throw {
        code: "UNSUPPORTED_BROKER",
        message: "Unsupported broker",
      };
  }
}

/**
 * Fetch balances (money + holdings)
 */
export async function getStockBalances(
  exchange: StocksExchange,
  credentials: any
) {
  switch (exchange) {
    case StocksExchange.ZERODHA:
      return getZerodhaBalances(credentials);

    case StocksExchange.ANGELONE:
      return getAngelOneBalances(credentials);

    case StocksExchange.KOTAK:
      return getKotakNeoHoldings({
        baseUrl: credentials.feedToken,
        tradingToken: credentials.accessToken,
        tradingSid: credentials.refreshToken,
      });

    default:
      throw {
        code: "UNSUPPORTED_BROKER",
        message: "Unsupported broker",
      };
  }
}

/**
 * Place order
 */
export async function placeStockOrder(
  exchange: StocksExchange,
  credentials: any,
  payload: CommonOrderPayload
) {
  switch (exchange) {
    case StocksExchange.ZERODHA:
      return createZerodhaOrder(credentials, mapToZerodhaOrder(payload));

    case StocksExchange.ANGELONE:
      return createAngelOneOrder(
        credentials,
        await mapToAngelOneOrder(payload)
      );

    case StocksExchange.KOTAK:
      return createKotakNeoOrder({
        baseUrl: credentials.feedToken,
        tradingToken: credentials.accessToken,
        tradingSid: credentials.refreshToken,
        symbol: payload.symbol,
        quantity: payload.quantity,
        side: payload.side === TradeSide.BUY ? "B" : "S",
        orderType:
          payload.orderType === "MARKET"
            ? "MKT"
            : payload.orderType === "LIMIT"
            ? "LMT"
            : payload.orderType === "SL"
            ? "SL"
            : "SL-M",
        price: payload.price,
      });

    default:
      throw {
        code: "UNSUPPORTED_BROKER",
        message: "Unsupported broker",
      };
  }
}

/**
 * Fetch positions
 */
export async function getStockPositions(
  exchange: StocksExchange,
  credentials: any
) {
  switch (exchange) {
    case StocksExchange.ZERODHA:
      return getZerodhaPositions(credentials);

    case StocksExchange.ANGELONE:
      return getAngelOnePositions(credentials);

    case StocksExchange.KOTAK:
      return getKotakNeoOrders({
        baseUrl: credentials.feedToken,
        tradingToken: credentials.accessToken,
        tradingSid: credentials.refreshToken,
      });

    default:
      throw {
        code: "UNSUPPORTED_BROKER",
        message: "Unsupported broker",
      };
  }
}

export async function disconnectStockExchange(
  userId: string,
  exchange: StocksExchange
) {
  try {
    // Check if credentials exist
    const credentials = await prisma.stocksCredentials.findUnique({
      where: {
        userId_exchange: { userId, exchange },
      },
    });

    if (!credentials) {
      throw new Error(`No credentials found for ${exchange}`);
    }

    // Delete the credentials
    await prisma.stocksCredentials.delete({
      where: {
        userId_exchange: { userId, exchange },
      },
    });

    // Pause all ACTIVE strategies for this exchange
    const pausedStrategies = await prisma.strategy.updateMany({
      where: {
        userId,
        exchange,
        assetType: "STOCK",
        status: "ACTIVE",
      },
      data: {
        status: "PAUSED",
      },
    });

    console.log("EXCHANGE_DISCONNECTED", {
      userId,
      exchange,
      strategiesPaused: pausedStrategies.count,
    });

    return {
      exchange,
      disconnectedAt: new Date(),
      strategiesPaused: pausedStrategies.count,
    };
  } catch (error) {
    console.error("ERROR_DISCONNECTING_EXCHANGE", error);
    throw error;
  }
}

export async function searchStockSymbols(
  query: string,
  assetType: "CRYPTO" | "STOCK" = "STOCK"
) {
  try {
    if (!query || query.trim().length < 1) {
      throw new Error("Search query is required");
    }

    const searchLower = query.toLowerCase();
    const results: Record<string, any[]> = {};

    if (assetType === "STOCK") {
      // Search in stocks file
      const stocksData = fs.readFileSync(STOCKS_FILE_PATH, "utf-8");
      const parsed = JSON.parse(stocksData);
      const stocksBlock = parsed.find((block: any) => block.type === "STOCKS");

      if (stocksBlock) {
        stocksBlock.data.forEach((exchange: any) => {
          const matchedSymbols = exchange.data.filter((symbol: any) => {
            const tradingSymbolLower = symbol.tradingSymbol?.toLowerCase() || "";
            const companyNameLower = symbol.company_name?.toLowerCase() || "";
            const isинLower = symbol.isin?.toLowerCase() || "";

            // Exact match for symbol (highest priority)
            if (tradingSymbolLower === searchLower) return true;

            // Partial matches
            if (tradingSymbolLower.includes(searchLower)) return true;
            if (companyNameLower.includes(searchLower)) return true;
            if (isинLower.includes(searchLower)) return true;

            return false;
          });

          if (matchedSymbols.length > 0) {
            results[exchange.exchange] = matchedSymbols;
          }
        });
      }
    } else if (assetType === "CRYPTO") {
      // Search in crypto file
      const cryptoPath = require("../../../constants/crypto").FILE_PATH;
      const cryptoData = fs.readFileSync(cryptoPath, "utf-8");
      const parsed = JSON.parse(cryptoData);

      parsed.forEach((segment: any) => {
        segment.data.forEach((exchange: any) => {
          const matchedSymbols = exchange.data.filter((symbol: any) => {
            const symbolLower = symbol.symbol?.toLowerCase() || "";
            const baseAssetLower = symbol.baseAsset?.toLowerCase() || "";
            const quoteAssetLower = symbol.quoteAsset?.toLowerCase() || "";

            // Exact match for symbol (highest priority)
            if (symbolLower === searchLower) return true;

            // Partial matches
            if (symbolLower.includes(searchLower)) return true;
            if (baseAssetLower.includes(searchLower)) return true;
            if (quoteAssetLower.includes(searchLower)) return true;

            return false;
          });

          if (matchedSymbols.length > 0) {
            if (!results[exchange.exchange]) {
              results[exchange.exchange] = [];
            }
            results[exchange.exchange].push(...matchedSymbols);
          }
        });
      });
    }

    return results;
  } catch (error) {
    console.error("ERROR_SEARCHING_SYMBOLS", error);
    throw error;
  }
}

export async function searchCryptoSymbols(query: string) {
  try {
    if (!query || query.trim().length < 1) {
      throw new Error("Search query is required");
    }

    const searchLower = query.toLowerCase();
    const results: Record<string, any[]> = {};

    const { FILE_PATH } = require("../../../constants/crypto");
    const cryptoData = fs.readFileSync(FILE_PATH, "utf-8");
    const parsed = JSON.parse(cryptoData);

    // Search in both SPOT and FUTURES
    parsed.forEach((segment: any) => {
      segment.data.forEach((exchange: any) => {
        const matchedSymbols = exchange.data.filter((symbol: any) => {
          const symbolLower = symbol.symbol?.toLowerCase() || "";
          const baseAssetLower = symbol.baseAsset?.toLowerCase() || "";
          const quoteAssetLower = symbol.quoteAsset?.toLowerCase() || "";

          // Exact match for symbol (highest priority)
          if (symbolLower === searchLower) return true;

          // Partial matches
          if (symbolLower.includes(searchLower)) return true;
          if (baseAssetLower.includes(searchLower)) return true;
          if (quoteAssetLower.includes(searchLower)) return true;

          return false;
        });

        if (matchedSymbols.length > 0) {
          const key = `${exchange.exchange}_${segment.type}`;
          results[key] = matchedSymbols;
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
 * Get stock symbol by exact symbol name
 */
export async function getStockSymbolBySymbol(
  symbol: string,
  exchange?: StocksExchange
) {
  try {
    if (!symbol || symbol.trim().length < 1) {
      throw new Error("Symbol is required");
    }

    const symbolUpper = symbol.toUpperCase();
    const result: Record<string, any[]> = {};

    const stocksData = fs.readFileSync(STOCKS_FILE_PATH, "utf-8");
    const parsed = JSON.parse(stocksData);
    const stocksBlock = parsed.find((block: any) => block.type === "STOCKS");

    if (stocksBlock) {
      stocksBlock.data.forEach((ex: any) => {
        // If specific exchange is provided, filter by it
        if (exchange && ex.exchange !== exchange) {
          return;
        }

        const foundSymbol = ex.data.find(
          (s: any) => s.tradingSymbol?.toUpperCase() === symbolUpper
        );

        if (foundSymbol) {
          if (!result[ex.exchange]) {
            result[ex.exchange] = [];
          }
          result[ex.exchange].push(foundSymbol);
        }
      });
    }

    return result;
  } catch (error) {
    console.error("ERROR_GETTING_STOCK_SYMBOL", error);
    throw error;
  }
}