import { Request, Response } from "express";
import {
  sendSuccess,
  sendBadRequest,
  sendUnauthorized,
  sendServerError,
} from "../../../utils/response";
import { CryptoExchange, CryptoTradeType } from "@prisma/client";
import {
  fetchSymbolPairs,
  getExchangeBalances,
  refreshSymbolMeta,
  verifyExchangeCredentials,
  searchCryptoSymbols,
  getCryptoSymbolBySymbol,
} from "../../../services/crypto/exchange/exchangeService";
import { getCryptoCredentials } from "../../../services/crypto/credentialsService";
import { fetchBinanceSymbols } from "../../../services/crypto/exchange/binanceService";
import { fetchKucoinSymbols } from "../../../services/crypto/exchange/kucoinService";
import { getCoinDCXAllData } from "../../../services/crypto/exchange/coindcxService";
import fs from "fs/promises";
import { FILE_PATH, DATA_DIR } from "../../../constants/crypto";
import { getSymbolPrecision } from "../../../utils/crypto/exchange/precisionResolver";
// import { promises as fs } from "fs";

export const fetchSymbolPairsController = async (
  req: Request,
  res: Response
) => {
  //read the file from data/symbol_pairs.json
  try {
    const data = await fs.readFile(FILE_PATH, "utf-8");
    const parsedData = JSON.parse(data);
    return sendSuccess(res, "Symbol pairs fetched successfully", parsedData);
  } catch (error) {
    return sendServerError(res, "Failed to read symbol pairs data");
  }
};

export const updateSymbolPairsController = async (
  _: Request,
  res: Response
) => {
  try {
    const [binanceData, kucoinData, coinDCXData] = await Promise.all([
      fetchBinanceSymbols(),
      fetchKucoinSymbols(),
      getCoinDCXAllData(),
    ]);

    const formattedData = [
      {
        type: "CRYPTO_SPOT",
        data: [
          {
            exchange: "BINANCE",
            data: binanceData.spotSymbols,
          },

          {
            exchange: "KUCOIN",
            data: kucoinData.spotSymbols,
          },
          {
            exchange: "COINDCX",
            data: coinDCXData.spotSymbols,
          },
        ],
      },
      {
        type: "CRYPTO_FUTURES",
        data: [
          {
            exchange: "BINANCE",
            data: binanceData.futureSymbols,
          },

          {
            exchange: "KUCOIN",
            data: kucoinData.futureSymbols,
          },
          {
            exchange: "COINDCX",
            data: coinDCXData.futureSymbols,
          },
        ],
      },
    ];
    await fs.mkdir(DATA_DIR, { recursive: true });
    // Write data to file (overwrites if already exists)
    const response = await fs.writeFile(
      FILE_PATH,
      JSON.stringify(formattedData, null, 2),
      "utf-8"
    );

    console.log(response);
    return sendSuccess(res, "Symbol pairs updated successfully", formattedData);
  } catch (error: any) {
    switch (error.code) {
      case "BAD_REQUEST":
        return sendBadRequest(res, error.message);
      case "RATE_LIMITED":
        return sendBadRequest(res, error.message);
      case "EXCHANGE_UNAVAILABLE":
        return sendServerError(res, error.message);
      default:
        return sendServerError(
          res,
          error?.message || "Failed to update symbol pairs"
        );
    }
  }
};

export async function getExchangePrecisionController(
  req: Request,
  res: Response
) {
  const { exchange, tradeType, symbol } = req.query;

  // if (!exchange || !tradeType ) {
  //   return res.status(400).json({
  //     message: "exchange and tradeType are required",
  //   });
  // }

  const precision = await getSymbolPrecision({
    exchange: exchange as string,
    tradeType: tradeType as "SPOT" | "FUTURES",
    symbol: symbol as string,
  });

  if (!precision) {
    return res.status(404).json({
      message: "Precision data not found",
    });
  }

  return res.json(precision);
}
export const refreshSymbolMetaController = async (
  _: Request,
  res: Response
) => {
  try {
    // 🔹 Fetch all symbol pairs from your source
    const formattedData = await fetchSymbolPairs();
    // 🔹 Log a sample to verify input

    // 🔹 Refresh spot/futures meta based on fetched symbol pairs
    await refreshSymbolMeta(formattedData);

    return res.status(200).json({
      success: true,
      message: "Symbol meta refreshed successfully",
    });
  } catch (error: any) {
    console.error("[META_REFRESH_ERROR]", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to refresh symbol meta",
    });
  }
};

export const verifyExchangeCredentialsController = async (
  req: Request,
  res: Response
) => {
  const { exchange, credentials } = req.body as {
    exchange: CryptoExchange;
    credentials: {
      apiKey: string;
      apiSecret: string;
      apiPassphrase?: string;
      apiKeyVersion?: string;
    };
  };

  if (!exchange || !credentials) {
    return sendBadRequest(res, "Exchange and credentials are required");
  }
  const { apiKey, apiSecret } = credentials;

  if (!apiKey || !apiSecret) {
    return sendBadRequest(res, "API key and secret are required");
  }

  try {
    const data = await verifyExchangeCredentials(exchange, credentials);

    return sendSuccess(res, "Credentials verified successfully", data);
  } catch (error: any) {
    switch (error.code) {
      case "AUTH_INVALID":
        return sendUnauthorized(res, error.message || "Invalid credentials");

      case "RATE_LIMITED":
        return sendBadRequest(
          res,
          error.message || "Too many requests to exchange"
        );

      case "EXCHANGE_UNAVAILABLE":
        return sendServerError(res, error.message || "Exchange unavailable");
      case "UNSUPPORTED_EXCHANGE":
        return sendBadRequest(res, error.message);

      default:
        return sendServerError(
          res,
          error?.message || "Error verifying credentials "
        );
    }
  }
};

export const getBalancesController = async (req: any, res: Response) => {
  const { exchange, type } = req.body as {
    exchange: CryptoExchange;
    type: CryptoTradeType;
  };

  if (!exchange || !type) {
    return sendBadRequest(res, "Exchange, credentials, and type are required");
  }
  try {
    const creds = await getCryptoCredentials(req.user.userId, exchange);

    if (!creds) {
      return sendBadRequest(res, "No credentials found for this exchange");
    }

    const balances = await getExchangeBalances(exchange, creds, type);

    return sendSuccess(res, "Balances fetched successfully", balances);
  } catch (error: any) {
    switch (error.code) {
      case "AUTH_INVALID":
        return sendUnauthorized(res, error.message || "Invalid credentials");
      case "RATE_LIMITED":
        return sendBadRequest(res, error.message || "Too many requests");
      case "EXCHANGE_UNAVAILABLE":
        return sendServerError(res, error.message || "Exchange unavailable");
      case "UNSUPPORTED_EXCHANGE":
        return sendBadRequest(res, error.message);
      default:
        return sendServerError(
          res,
          error?.message || "Error fetching balances "
        );
    }
  }
};

export const searchSymbolsController = async (
  req: Request,
  res: Response
) => {
  try {
    const { q } = req.query;

    if (!q) {
      return sendBadRequest(res, "Search query (q) is required");
    }

    if (typeof q !== "string") {
      return sendBadRequest(res, "Search query must be a string");
    }

    const trimmedQuery = q.trim();

    // Allow single character searches for dropdown
    if (trimmedQuery.length < 1) {
      return sendBadRequest(res, "Search query cannot be empty");
    }

    const results = await searchCryptoSymbols(trimmedQuery);

    // Flatten results for dropdown display
    const flatResults: any[] = [];
    Object.entries(results).forEach(([key, symbols]) => {
      (symbols as any[]).forEach((symbol) => {
        flatResults.push({
          ...symbol,
          exchangeSegment: key,
        });
      });
    });

    // Sort by relevance (exact match first, then prefix match, then contains)
    const sortedResults = flatResults.sort((a, b) => {
      const queryLower = trimmedQuery.toLowerCase();
      
      // Exact match (highest priority)
      if (a.symbol?.toLowerCase() === queryLower) return -1;
      if (b.symbol?.toLowerCase() === queryLower) return 1;
      
      // Prefix match
      if (a.symbol?.toLowerCase().startsWith(queryLower)) return -1;
      if (b.symbol?.toLowerCase().startsWith(queryLower)) return 1;
      
      return 0;
    });

    const totalResults = flatResults.length;

    return sendSuccess(res, "Crypto symbols searched successfully", {
      query: trimmedQuery,
      totalResults,
      results: sortedResults.slice(0, 50), // Limit to 50 results for dropdown
    });
  } catch (error: any) {
    console.error("ERROR_SEARCHING_CRYPTO_SYMBOLS", error);
    return sendServerError(
      res,
      error?.message || "Failed to search crypto symbols"
    );
  }
};

export const getSymbolByNameController = async (
  req: Request,
  res: Response
) => {
  try {
    const { symbol } = req.query;

    if (!symbol) {
      return sendBadRequest(res, "Symbol is required");
    }

    if (typeof symbol !== "string") {
      return sendBadRequest(res, "Symbol must be a string");
    }

    const trimmedSymbol = symbol.trim();

    if (trimmedSymbol.length < 1) {
      return sendBadRequest(res, "Symbol cannot be empty");
    }

    const result = await getCryptoSymbolBySymbol(trimmedSymbol);

const totalResults = Object.values(result).reduce<number>(
  (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
  0
);

    if (totalResults === 0) {
      return sendBadRequest(
        res,
        `Symbol "${trimmedSymbol}" not found in any exchange`
      );
    }

    return sendSuccess(res, "Symbol found successfully", {
      query: trimmedSymbol,
      totalResults,
      exchanges: result,
    });
  } catch (error: any) {
    console.error("ERROR_GETTING_CRYPTO_SYMBOL", error);
    return sendServerError(
      res,
      error?.message || "Failed to get symbol"
    );
  }
};
